# Module Analysis

> Vault node: [[Shift Grabber V9 Index]]  
> Related: [[Architecture Map]], [[Dependency Graph]], [[Data Flow]], [[Security Audit]], [[License & Token Lifecycle]]

## Classification by Dependency Category

Each file is classified into the four-category taxonomy derived from `improve-codebase-architecture` (adapted to this extension's domain):

| Category | Definition | Files |
|----------|------------|-------|
| **Stable** | Unlikely to change; changes are high-impact and rare. | [[manifest.json]], configuration shape |
| **Volatile** | Changes frequently — query strings, server URLs, selectors. | [[api-layer.js]] |
| **Abstract** | Hides implementation behind a small, stable interface. | [[service-worker.js]] (scheduling core), [[api-layer.js]] (postMessage facade) |
| **Concrete** | Directly interacts with external systems; hard to mock. | [[api-layer.js]] (fetch), [[service-worker.js]] (Telegram fetch), [[popup.js]] (license fetch), [[main.js]] (DOM) |

### Per-File Classification

#### [[manifest.json]] — Stable
- **Evidence**: Host permissions (lines 7-12), content script matches (lines 33, 39), and world assignment (line 42) are structural. They change only when the extension needs new permissions or new injection targets.
- **Why it matters**: A single line change (e.g., adding a new host permission) triggers a full extension re-install and review.

#### [[main.js]] — Concrete (with shallow abstraction leaks)
- **Evidence**: Direct `document.querySelectorAll` for button scraping (lines 334, 348), direct `document.body.appendChild` for HUD/toast injection (lines 100, 123, 193), direct `chrome.storage.local.get/set` calls (lines 74, 82, 200, 439, etc.), and raw `fetch`-less HTTP logic (it delegates HTTP to [[api-layer.js]] but still directly queues Telegram messages via storage).
- **Why it matters**: This file is the primary integration surface with the live Amazon page DOM. It cannot be unit-tested without a real or simulated DOM environment.

#### [[api-layer.js]] — Volatile + Concrete + Abstract
- **Volatile evidence**: Hardcoded GraphQL query strings `POLL_Q` and `CLAIM_Q` (lines 11-13), hardcoded endpoint `GQL` (line 9), and terminal error string matching (lines 86-93). If Amazon changes field names or error messages, this file changes.
- **Concrete evidence**: Raw `fetch` with `credentials: "include"` (lines 116, 181), direct `document.cookie` reads (line 37), direct `localStorage` key scraping (line 49).
- **Abstract evidence**: Despite the volatility, the IIFE hides all of this from [[main.js]]. The interface is only 4 postMessage commands.

#### [[service-worker.js]] — Abstract + Concrete
- **Abstract evidence**: `scheduleNextBurstAnchor` (lines 112-122) and `startOverrideTick` (lines 124-133) hide 5-minute anchor math, jitter, and alarm naming from callers. The alarm router (lines 136-189) is a state machine hidden behind `chrome.alarms`.
- **Concrete evidence**: Direct `fetch` to Telegram (line 37) and license server (line 302), direct `chrome.alarms` manipulation, and hardcoded `TG_BOT_TOKEN` / `TG_CHAT_ID` (lines 4-5).

#### [[popup.js]] — Concrete + Volatile
- **Concrete evidence**: Direct `fetch` to license server (line 57), direct DOM element bindings (`els` object, lines 16-37), direct `chrome.tabs.sendMessage` (lines 167-169), and `chrome.tabs.create` (line 238).
- **Volatile evidence**: Hardcoded `SERVER` URL (line 39), hardcoded `CONTACT_URL` (line 3), and inline HTML class names (`"date-pill"`, line 131).

#### [[Popup UI|index.html]] — Stable
- **Evidence**: Markup structure (lines 8-84) changes only when new UI sections are added. It is purely declarative.

## Deepening Opportunities

A **deepening opportunity** is a shallow module that could be refactored into a deep module by extracting a smaller interface and hiding implementation.

### Opportunity 1: Storage Key Constants Module
**Cluster**: [[main.js]], [[service-worker.js]], [[popup.js]]  
**Problem**: Each file independently defines string constants for `chrome.storage.local` keys. Main.js `K` (line 10), Service-Worker.js `KEYS` (line 51), and Popup.js `KEYS` (line 5) overlap heavily but are not shared.  
**Coupling mechanism**: Silent consensus on string values.  
**Deepening action**: Extract a single `storage-keys.js` module imported by all three. Interface: `StorageKeys.ENABLED`, `StorageKeys.ACCESS_TOKEN`, etc.  
**Test impact**: One unit test on the constants module replaces zero tests today (there are none).

### Opportunity 2: Token Lifecycle Port
**Cluster**: [[popup.js]] `verifyWithServer` (lines 54-82) + [[service-worker.js]] `refreshTokenInBackground` (lines 293-320)  
**Problem**: The license verification protocol is duplicated. Both functions POST to `/verify`, parse the same JSON shape, and write the same storage keys.  
**Coupling mechanism**: Copy-paste ownership of the server contract.  
**Deepening action**: Define a `TokenService` port with two adapters: `PopupTokenAdapter` (for user-initiated verification) and `BackgroundTokenAdapter` (for SW auto-refresh). Both adapters share the same HTTP logic internally but expose only `verify(key, deviceId) → { token, exp }`.  
**Test impact**: Boundary tests on `TokenService` replace the need to test popup and SW separately for token expiry logic.

### Opportunity 3: HUD Renderer
**Cluster**: [[main.js]] lines 182-313  
**Problem**: `updateHUD` is a 130-line function that constructs raw HTML strings, computes color values, and reads storage all at once. It mixes view logic, state interpretation, and DOM mutation.  
**Coupling mechanism**: Direct DOM mutation + inline CSS.  
**Deepening action**: Extract a `HUDRenderer` module with interface `render(state: HUDState) → HTMLElement`. The module hides HTML template strings and color mapping. [[main.js]] only calls `render(state)` and appends the result.  
**Test impact**: Tests can assert on `HUDState → HTMLElement` mapping in a headless DOM without touching the rest of the extension.

### Opportunity 4: Message Router
**Cluster**: [[main.js]] `chrome.runtime.onMessage` (lines 421-455) + `window.addEventListener('message')` (lines 491-541) + keyboard handler (lines 459-486)  
**Problem**: Event handlers are large switch-statements that mutate global variables, call storage, and post messages. There is no central dispatch or command pattern.  
**Coupling mechanism**: Every handler knows about every side effect (storage, postMessage, HUD update).  
**Deepening action**: A `CommandBus` that maps message types to pure command objects. The bus handles the plumbing (storage read/write, cross-world forwarding) while commands contain only business logic.  
**Test impact**: Commands become unit-testable in isolation; the bus is tested with mock adapters.

### Opportunity 5: GraphQL Client
**Cluster**: [[api-layer.js]] lines 9-231  
**Problem**: Query construction, CSRF management, retry logic, rate-limit handling, and response parsing are all inlined. The IIFE hides them, but the internal module is still a shallow stack of functions that all know about `fetch`.  
**Coupling mechanism**: Every helper (`getCsrf`, `makeHeaders`, `fireClaim`, `pollOnce`) depends on the global `GQL` URL and raw `fetch`.  
**Deepening action**: A `GraphQLClient` module with interface `query(op, vars) → Promise` and `mutate(op, vars) → Promise`. The client internally manages CSRF caching and retries. Rate-limit backoff becomes an internal policy, not exposed.  
**Test impact**: Tests inject a `fetch` adapter and assert on request/response shape without touching real Amazon endpoints.

## Cohesion & Coupling Ratings

Scale: **Cohesion** — 5 = single, focused responsibility; 1 = kitchen-sink.  
**Coupling** — 5 = tightly bound to many external modules/systems; 1 = independent.

### [[manifest.json]]

| Metric | Score | Explanation |
|--------|-------|-------------|
| Cohesion | 5 | Pure declarative configuration. Every key serves the single purpose of describing the extension package. |
| Coupling | 2 | Only coupled to the browser's extension loader and the file paths it references. No runtime coupling to logic. |

### [[main.js]]

| Metric | Score | Explanation |
|--------|-------|-------------|
| Cohesion | 2 | Mixes HUD rendering, DOM scraping, keyboard handling, audio playback, toast notifications, Telegram queueing, token expiry guards, and cross-world message relay in one file. |
| Coupling | 5 | Depends on `document` (DOM), `chrome.storage.local`, `chrome.runtime.sendMessage`, `window.postMessage` (to Api-Layer.js), `window.addEventListener` (keyboard + messages), `chrome.runtime.getURL`, and indirectly on Amazon page structure via selectors (`button,[role='button']` at lines 319, 334, 348). |

### [[api-layer.js]]

| Metric | Score | Explanation |
|--------|-------|-------------|
| Cohesion | 4 | Nearly all logic serves the single purpose of "poll GraphQL and claim shifts." The 30-second stats logger (lines 281-289) is a minor distraction. |
| Coupling | 4 | Bound to Amazon's GraphQL endpoint, `document.cookie`, `localStorage` key naming (`aza-user-features-*-prod` at line 50), `window.postMessage`, and raw `fetch`. The only reason it is not a 5 is that the IIFE prevents direct coupling to other extension files. |

### [[service-worker.js]]

| Metric | Score | Explanation |
|--------|-------|-------------|
| Cohesion | 3 | Combines three distinct responsibilities: (1) alarm scheduling / burst logic, (2) token refresh / license verification, and (3) Telegram queue flush. These three subsystems share only `chrome.storage.local`. |
| Coupling | 4 | Depends on `chrome.alarms`, `chrome.tabs`, `chrome.storage.local`, `chrome.runtime.onMessage`, Telegram API, and license server API. It is the central hub of the extension, so high coupling is somewhat inevitable, but the lack of adapter boundaries amplifies it. |

### [[popup.js]]

| Metric | Score | Explanation |
|--------|-------|-------------|
| Cohesion | 2 | Modes of operation: license verification, date list management, blacklist management, status badge rendering, DOM event wiring, and tab creation. Each could be a separate module. |
| Coupling | 4 | Depends on `chrome.storage.local`, `chrome.runtime.sendMessage`, `chrome.tabs.query/sendMessage/create`, the license server fetch, and the specific DOM structure in [[Popup UI|index.html]]. Changes to HTML element IDs require matching changes in the `els` mapping (lines 16-37). |

### [[Popup UI|index.html]]

| Metric | Score | Explanation |
|--------|-------|-------------|
| Cohesion | 5 | Pure presentation markup. |
| Coupling | 3 | Coupled to `popup.js` via element IDs and to `styles.css` via class names. Any rename requires coordinated changes. |

## Summary Table

| Module | Category | Depth | Cohesion | Coupling | Priority to Deepen |
|--------|----------|-------|----------|----------|-------------------|
| [[manifest.json]] | Stable | Deep (trivial) | 5 | 2 | Low |
| [[main.js]] | Concrete | Shallow | 2 | 5 | High |
| [[api-layer.js]] | Volatile / Concrete / Abstract | Deep | 4 | 4 | Medium |
| [[service-worker.js]] | Abstract / Concrete | Mixed | 3 | 4 | Medium |
| [[popup.js]] | Concrete / Volatile | Shallow | 2 | 4 | High |
| [[Popup UI|index.html]] | Stable | Deep (trivial) | 5 | 3 | Low |

**Recommendation**: The highest-yield deepening targets are [[main.js]] (HUD renderer extraction + command bus) and [[popup.js]] (UI state separation from storage/network logic). These two files contain the most shallow, tightly-coupled code and the greatest testability gaps.

## Related Notes

- [[Shift Grabber V9 Index]]
- [[Architecture Map]]
- [[Dependency Graph]]
- [[Data Flow]]
- [[Security Audit]]
- [[main.js]]
- [[api-layer.js]]
- [[service-worker.js]]
- [[popup.js]]
- [[Popup UI]]
- [[license.js]]
- [[manifest.json]]
- [[Configuration Reference]]
- [[Technical Debt Register]]
- [[External API Contracts]]
- [[Project Evolution]]
- [[Master Document]]
