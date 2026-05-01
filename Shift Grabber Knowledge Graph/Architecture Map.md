# Architecture Map

> Vault node: [[Shift Grabber V9 Index]]  
> Related: [[Dependency Graph]], [[Module Analysis]], [[Data Flow]], [[Security Audit]], [[License & Token Lifecycle]]

## High-Level System Diagram

```mermaid
graph TD
    subgraph Tier_1 ["Tier 1 — Content Scripts (atoz.amazon.work)"]
        MAIN[[main.js|Main.js&lt;br/&gt;ISOLATED World]]
        API[[api-layer.js|Api-Layer.js&lt;br/&gt;MAIN World]]
    end

    subgraph Tier_2 ["Tier 2 — Background"]
        SW[[Service-Worker.js]]
    end

    subgraph Tier_3 ["Tier 3 — Popup UI"]
        POP[[Popup.js]]
        HTML[[Popup UI|Index.html]]
    end

    subgraph Ext ["External Systems"]
        AMZN[Amazon GraphQL API]
        LIC[License Server<br/>shift-grabber.vercel.app]
        TG[Telegram API]
    end

    subgraph Browser ["Browser APIs"]
        STORE[(chrome.storage.local)]
        ALARMS[chrome.alarms]
        TABS[chrome.tabs]
        MSG[chrome.runtime<br/>.sendMessage]
    end

    API -->|fetch POST| AMZN
    API <-->|window.postMessage| MAIN
    MAIN -->|chrome.runtime.sendMessage| SW
    POP -->|chrome.runtime.sendMessage| SW
    POP -->|chrome.tabs.sendMessage| MAIN
    SW -->|chrome.tabs.reload| MAIN
    SW -->|fetch POST| LIC
    SW -->|fetch POST| TG
    MAIN <-->|read/write keys| STORE
    SW <-->|read/write keys| STORE
    POP <-->|read/write keys| STORE
    SW -->|create/clear| ALARMS
    POP -->|chrome.tabs.create| TABS
    HTML -->|script src| POP
```

## Tier Breakdown

### Tier 1 — Content Scripts
Both scripts inject at `document_end` on `https://atoz.amazon.work/*` per [[manifest.json]] lines 31-44.

| Script | World | Responsibility | Lines |
|--------|-------|----------------|-------|
| [[main.js]] | ISOLATED | HUD rendering, DOM backup grabber, keyboard shortcuts, notification relay, token-expiry guard | 624 |
| [[api-layer.js]] | MAIN | GraphQL polling, CSRF caching, instant claim mutation, rate-limit backoff, 7-day window logic | 292 |

The split between ISOLATED and MAIN is architectural, not modular — [[main.js]] cannot read `document.cookie` or make credentialed cross-origin requests, while [[api-layer.js]] can because it runs in the page's MAIN world (Manifest.json line 42). They communicate exclusively through `window.postMessage`.

### Tier 2 — Service Worker
[[service-worker.js]] runs as a Manifest V3 `service_worker` (Manifest.json line 13-15). It is the only tier that survives tab closure. Responsibilities:
- Alarm-based burst scheduling (`SG_BURST_START`, `SG_BURST_STEP`, `SG_OVERRIDE_TICK`, `SG_TOKEN_CHECK`) — Service-Worker.js lines 136-189
- Token background refresh — lines 293-335
- Telegram queue flush — lines 7-28
- Tab reload orchestration — lines 101-105

### Tier 3 — Popup UI
[[popup.js]] + [[Popup UI|index.html]] form the user-facing control panel. It is ephemeral (only runs while the popup is open) and acts as a command broker:
- License verification — Popup.js lines 54-82
- Date/blacklist management — lines 120-164
- State toggles (enable, pause, override) — lines 209-292

## Communication Patterns

### 1. postMessage Bridge (MAIN ↔ ISOLATED)
[[api-layer.js]] and [[main.js]] live in different JavaScript worlds. The browser extension boundary between them is `window.postMessage`.

**[[main.js]] → [[api-layer.js]]** (outbound):
- `SG_START_POLLING` — Main.js line 563
- `SG_STOP_POLLING` — Main.js line 567
- `SG_SET_SPEED` — Main.js line 571
- `SG_SET_BLACKLIST_DATES` — Main.js line 428

**[[api-layer.js]] → [[main.js]]** (inbound):
- `SG_EID` — Api-Layer.js line 175
- `SG_RATE_LIMITED` — Api-Layer.js lines 154, 161
- `SG_CLAIM_RESULT` — Api-Layer.js lines 131-135

Assumption: The protocol is ad-hoc JSON with a `sg` truthy flag. There is no schema validation on either side.

### 2. chrome.runtime.sendMessage (Content ↔ Background)
- [[main.js]] sends `SG_SET_PAUSED`, `SG_SET_OVERRIDE`, `SG_RELOAD_ALL_NOW`, `SG_POKE_SCHEDULE`, `SG_EID` to [[service-worker.js]] — Main.js lines 440, 451, 480, 595, 497
- [[popup.js]] sends `SG_LICENSE_VERIFIED`, `SG_SET_ENABLED`, `SG_SET_OVERRIDE`, `SG_SET_PAUSED`, `SG_RELOAD_ALL_NOW` to [[service-worker.js]] — Popup.js lines 65, 71, 76, 212, 289, 280, 299
- [[service-worker.js]] sends `SG_REQUEST_TOKEN_REFRESH` to [[popup.js]] — Service-Worker.js line 333

### 3. chrome.storage.local (Shared Database)
All three JavaScript tiers read and write the same key namespace directly. There is no abstraction layer over `chrome.storage.local`. See [[Dependency Graph]] for the full key matrix.

## Module Depth Analysis

A **deep module** has a small interface relative to its implementation; a **shallow module** exposes nearly as much surface as it contains logic.

| Module | Depth | Rationale |
|--------|-------|-----------|
| [[api-layer.js]] | **Deep** | Public interface is 4 postMessage handlers (Api-Layer.js lines 258-277). Implementation is ~230 lines of GraphQL construction, CSRF caching, retry logic, rate-limit state machines, and terminal-error detection. Callers do not see `fireClaim`, `pollOnce`, or `getCsrf`. |
| [[service-worker.js]] | **Mixed** | The alarm scheduler (`scheduleNextBurstAnchor`, `startOverrideTick`, alarm router) is moderately deep — callers send a single message and the SW hides 5-minute anchor math and jitter logic. However, `handleMessage` (lines 198-288) is a shallow, wide switch-statement that leaks every operation directly. |
| [[main.js]] | **Shallow** | Exports ~20 top-level functions into the global namespace and mixes HUD DOM construction, DOM backup grabbing, keyboard handling, message relay, token expiry guards, and Telegram queuing. Any change to HUD HTML (line 286) or keyboard shortcuts (line 459) ripples across unrelated subsystems. |
| [[popup.js]] | **Shallow** | Large `els` DOM binding surface (lines 16-37), inline event handlers, inline `verifyWithServer` fetch logic, and direct storage manipulation all coexist in one flat file with no internal boundaries. |
| [[manifest.json]] | **Deep (trivial)** | Small declarative interface (46 lines) with large runtime implications (permissions, world separation, host matching). Unlikely to change, but changes are high-impact. |

## Coupling Analysis

### Tightly-Coupled Hotspots

1. **Token refresh duplication** — [[popup.js]] lines 54-82 and [[service-worker.js]] lines 293-320 both contain nearly identical `fetch` logic to `https://shift-grabber.vercel.app/verify`. If the server response shape changes, two modules must change in sync.

2. **Key-name consensus** — `sg_enabled`, `sg_paused`, `sg_access_token`, etc. are string literals repeated across all three JS files. There is no shared constants module. Main.js defines `K` (line 10), Service-Worker.js defines `KEYS` (line 51), and Popup.js defines `KEYS` (line 5). A typo in any one file creates a silent runtime failure.

3. **Blacklist 3-hop chain** — Popup → Main → Api-Layer for a single data update:
   - Popup.js sends `SG_SET_BLACKLIST_DATES` via `chrome.tabs.sendMessage` — Popup.js lines 263-266
   - Main.js receives, writes to storage, then forwards via `window.postMessage` — Main.js lines 424-428
   - Api-Layer.js receives and mutates internal `blacklistDates` — Api-Layer.js lines 274-276
   This means [[popup.js]] is transitively coupled to the postMessage protocol of [[api-layer.js]] through [[main.js]].

4. **HUD state mirroring** — [[main.js]] maintains local copies of `isPaused`, `overrideMode`, `hudHidden`, `turboMode`, and `rateLimited` (lines 27-35) while also persisting them to `chrome.storage.local`. The two sources of truth can drift if storage events are missed.

### Seams (Good Boundaries)

1. **MAIN / ISOLATED world boundary** — The `window.postMessage` seam between [[api-layer.js]] and [[main.js]] is a strong boundary. Because the worlds have different CORS and CSP contexts, this seam is enforced by the browser and cannot be accidentally bypassed.

2. **Alarm API boundary** — `chrome.alarms` in [[service-worker.js]] provides a natural seam. The alarm names (`SG_BURST_START`, `SG_BURST_STEP`, etc.) act as a narrow command interface that survives service-worker termination.

3. **chrome.storage.local** — Despite the string-literal problem, the storage API itself is a decent seam. Any tier can be replaced or tested with a mock storage backend without rewriting callers, provided the key names are stable.

## Testability Gaps

| Gap | Location | Why It Is Hard to Test |
|-----|----------|------------------------|
| **No test suite exists** | Entire project | There are zero `*.test.js`, `*.spec.js`, or test directories. |
| **IIFE encapsulation** | Api-Layer.js line 5 | The entire module is wrapped in an IIFE. `claimedIds`, `pollTimer`, `getCsrf`, `fireClaim`, etc. are inaccessible from tests. The only observable surface is `window.postMessage` output. |
| **Direct DOM mutation** | Main.js lines 89-103, 182-313 | `showToast`, `ensureHUD`, and `updateHUD` create and inject elements directly into `document.body`. There is no virtual DOM or render function to assert against. |
| **Inline fetch calls** | Api-Layer.js line 116, Service-Worker.js line 37, Popup.js line 57 | External HTTP dependencies (Amazon GraphQL, Telegram, license server) are called with raw `fetch`. There is no injection point for a mock transport. |
| **Global mutable state** | Main.js lines 25-35 | `hudEl`, `isPaused`, `overrideMode`, `rateLimited`, etc. are module-level globals. Parallel tests would clobber each other. |
| **Direct Chrome API usage** | Main.js lines 74, 200, 440; Service-Worker.js lines 8, 102; Popup.js lines 41, 46 | `chrome.storage.local`, `chrome.runtime.sendMessage`, `chrome.tabs.query`, and `chrome.alarms` are used directly rather than behind an adapter or port. |
| **Time-dependent logic** | Service-Worker.js lines 90-99, 112-133 | `nextFiveMinuteAnchorMinus800ms` and the alarm scheduler depend on the real system clock. There is no `Date` or `setTimeout` injection. |
| **WeakSet tracking** | Main.js line 41 | `clickedButtons` is a `WeakSet`. By design it cannot be enumerated, so verifying "this button was already clicked" is impossible from test code. |

## Related Notes

- [[Shift Grabber V9 Index]]
- [[Dependency Graph]]
- [[Module Analysis]]
- [[Data Flow]]
- [[Security Audit]]
- [[License & Token Lifecycle]]
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
