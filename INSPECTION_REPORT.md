# Shift Grabber V9 — Deep Inspection Report (Primary Inspector)

**Date:** 2026-04-22
**Inspector:** Primary Code Agent
**Scope:** Full platform — Chrome extension MV3, build pipeline, deployment package
**Methodology:** Static code analysis, architecture review, security audit, UX heuristic evaluation

---

## Overall Score: 70 / 100
**Verdict:** Solid foundation with critical gaps in security theater, compliance, and documentation. Ready for limited beta with fixes; not production-hardened for scale.

---

## 1. Security Architecture — 72 / 100

### Strengths
- HMAC-SHA256 validation with **constant-time comparison** (`verifyHmac`) — prevents timing attacks
- AES-GCM-256 encryption with PBKDF2 (100,000 iterations) for token at-rest storage
- Device fingerprinting binds tokens to hardware (canvas + screen + UA + timezone + concurrency + platform)
- Circuit breaker pattern: 3 failures → 5-min degraded mode with cached token fallback
- Service worker validates message sender (`sender.id !== chrome.runtime.id`)
- Build-time anti-debug (`debugProtection`, `debugProtectionInterval`) and self-defending obfuscation
- Token plaintext cache for scheduling performance, with encrypted primary storage

### Weaknesses
- **Integrity check is security theater** (`checkIntegrity` compares hash of hardcoded string `"SG_INTEGRITY_CHECK_v2_1_0"` instead of actual code hash). This provides zero protection against tampering.
- `_hk` placeholder uses trivial string-array join pattern: `["sg","_","hmac","_","v1","_","key"].join("-")`. Even after obfuscation, this is a searchable pattern.
- Telegram bot token stored in **plaintext** in `chrome.storage.local` — no encryption
- No certificate pinning for license server communication
- No rate limiting on popup "Verify" button — allows server spam
- `crypto.randomUUID()` token fallback if server omits one could allow bypass if server is compromised
- `sendResponse` pattern is inconsistent across message handlers

---

## 2. Commercial Model — 65 / 100

### Strengths
- Server-side HMAC-signed responses prevent client-side forgery
- Token expiry with proactive background refresh (120s threshold)
- Subscription status tracking: active / past_due / cancelled / expired
- Tier differentiation (basic / pro) with UI badges
- Billing portal and upgrade links integrated
- Graceful degradation when server is unreachable (circuit breaker + cached token)

### Weaknesses
- **No license key format validation** — accepts any non-empty string
- **No device limit enforcement** — fingerprint is sent to server but not validated in client code
- No revocation list check (cannot remotely kill a stolen key)
- No trial mode or freemium onboarding funnel
- `sg_subscription_status` can be stale if server changes status mid-session
- No upgrade/downgrade proration logic visible
- Server-side `/verify`, `/config`, Stripe webhooks are out of scope and unverified

---

## 3. Stealth Engine — 78 / 100

### Strengths
- **Poisson-distributed polling intervals** — excellent statistical mimicry of human behavior
- **Human reaction delay** (80–300ms) before claiming shifts
- **Decoy interactions**: 8% scroll events, 4% mousemove events
- **Query rotation**: 3 syntactically varied poll query shapes
- **Client ID sniffing** from real page scripts instead of hardcoding
- **CSRF token caching** (60s TTL) reduces cookie parsing overhead
- **Single-claim policy** — no retries, the #1 bot detection signal
- **Exponential backoff** on rate limits (5s → 10s → 20s → 40s cap)
- Terminal error detection (capacity, expired, ineligible)

### Weaknesses
- **CLAIM_Q_SET contains 3 identical mutation strings** — zero actual rotation for claims
- Decoy events are **synthetic and unrealistic** (`new Event('scroll')` has no `target`, `bubbles`, scroll position, etc.) — sophisticated anti-bot could fingerprint these
- `window.__SG_API_LOADED` global flag is trivially detectable by page scripts or anti-cheat
- `window.postMessage` uses predictable `sg: 1` or `sg: true` discriminator — easily pattern-matched
- `claimedIds` object **never cleaned** — unbounded memory growth over long sessions
- Stats `console.log` every 30s is visible in DevTools
- `credentials: "include"` on fetch calls is correct but adds a detectable signal

---

## 4. UX / UI — 82 / 100

### Strengths
- **Simple Mode** delivers on zero-friction promise: key input → big toggle → done
- Glassmorphism design system is consistent and premium
- Spring-physics toggle animation (`cubic-bezier(0.34, 1.56, 0.64, 1)`)
- Pulsing status badges, staggered card animations
- JetBrains Mono for data readability
- Toast notifications with slide-in animation and colored left border
- HUD overlay is comprehensive (status, timer, clock, burst bars, warnings)
- `prefers-reduced-motion` media query support
- Keyboard shortcuts: P (pause), Shift+O (override), Shift+H (HUD), R (reload), Shift+T (turbo)
- Focus-visible outline for accessibility

### Weaknesses
- **No "show password" toggle** on license key input — long keys are hard to verify
- No visual feedback on paste action
- Advanced panel still has inline `style="margin-top:8px"` etc. in HTML (not CSS-class-driven)
- HUD is not draggable or repositionable
- No light/dark mode toggle (always dark)
- "Clear" buttons on dates/blacklist have **no confirmation** — destructive action, one-click wipe
- Toast injection uses inline styles (acceptable since it's dynamic)
- No `aria-live` region for screen reader status updates
- Master toggle has no visual loading state during verification (spinner on text only)

---

## 5. Code Quality — 71 / 100

### Strengths
- Consistent `sg_` prefix naming convention
- Centralized shared constants module (`SG_CONSTS`)
- Defensive programming in api-layer (`validateGraphQLResponse` with null-check chain)
- Fallback chains: eid extraction (4 methods), token storage (encrypted → plaintext)
- `WeakSet` deduplication for clicked DOM buttons
- Async/await used consistently in popup and SW
- Most operations wrapped in try/catch

### Weaknesses
- `main.js` defines inline `const K = {...}` that partially duplicates `SG_CONSTS.KEYS`
- `api-layer.js` duplicates some constants inline instead of using shared module
- `service-worker.js` mixes `var` and `let/const` inconsistently
- Multiple `nowSec` declarations in same scope (SW alarm handler) — shadowing risk
- `handleMessage` has no default/unknown case — silent message dropping
- `chrome.runtime.lastError` unchecked in several `sendMessage` calls (main.js keyboard handlers, popup broadcasts)
- `api-layer.js` uses IIFE; `main.js` uses top-level script — inconsistent module patterns
- No JSDoc or type annotations anywhere
- Magic numbers scattered: some in `TIMING` constants, some inline (800ms, 120s, etc.)

---

## 6. Performance — 74 / 100

### Strengths
- `chrome.alarms` instead of `setInterval` in SW — survives MV3 service worker termination
- CSRF cache eliminates redundant cookie parsing
- Sequential polling (not parallel) — controlled load on AtoZ servers
- Poisson delay prevents synchronized request storms
- Burst reload system batches tab refreshes
- `WeakSet` for DOM button deduplication (auto-GC when nodes removed)

### Weaknesses
- `updateHUD()` fires every **500ms via setInterval** — wasteful when tab is backgrounded or hidden
- `flushTelegramQueue` is **serial** — large queues block the service worker
- `getState()` fetches **all defaults** from storage every call — over-fetching
- `chrome.tabs.query` executed on every reload instead of caching tab IDs
- No request batching across multiple date tabs
- `claimedIds` and `apiClaimNotified` objects grow **unbounded** — memory leaks over multi-hour sessions
- No `requestIdleCallback` or `visibilitychange` awareness for background tabs

---

## 7. Architecture — 70 / 100

### Strengths
- Clean context separation: popup (UI), SW (scheduler), main.js (HUD/DOM), api-layer (API)
- Message bus (`chrome.runtime.sendMessage`, `window.postMessage`) connects contexts
- Constants shared via manifest injection + `importScripts`
- Crypto and fingerprint as reusable shared modules
- State centralized in `chrome.storage.local`

### Weaknesses
- **No state machine** — boolean flags (`enabled`, `paused`, `override`) can create logically invalid combinations
- `api-layer.js` ↔ `main.js` communication via `window.postMessage` is **global and interceptable** by page scripts
- `SG_START_POLLING` has **no authentication** — any script on the AtoZ page could trigger polling
- Popup directly manipulates SW state instead of using a state manager or reducer
- No event sourcing or transition logging
- `main.js` keyboard handler calls `chrome.runtime.sendMessage` without checking if extension context is valid (could throw if extension reloaded)

---

## 8. Deployment & Build — 68 / 100

### Strengths
- Comprehensive obfuscation config (control flow flattening, dead code injection, string encoding)
- HMAC key build-time injection via regex replacement
- Clear separation of obfuscated JS vs copied static assets
- Customer package with install/activate docs and PowerShell packaging script

### Weaknesses
- **`renameGlobals: false`** exposes `window.SG_CONSTS`, `window.SG_CRYPTO`, `window.SG_FINGERPRINT` even in obfuscated builds — attacker can call these directly
- `stringArrayEncoding: ["base64"]` is trivially reversible
- No CI/CD pipeline, linting, or automated tests in build
- No source maps (good for security, bad for debugging production issues)
- `package.json` build:zip script uses Unix `zip` command — fails on Windows without WSL
- `dist/` and `Deploy/` versioning not tied to git tags or semantic release
- Obfuscation increases file size significantly but does not deter a motivated reverse engineer

---

## 9. Documentation — 62 / 100

### Strengths
- Knowledge graph (33 notes, 35 wikilinks)
- Customer-facing docs: install, activate, troubleshoot
- Internal code comments in critical sections
- Build instructions for seller

### Weaknesses
- No API documentation for server endpoints (`/verify`, `/config`, `/claim-report`, webhooks)
- No Architecture Decision Records (ADRs)
- Knowledge graph may be stale — not auto-updated with recent Simple Mode changes
- Zero inline JSDoc / function documentation
- No changelog or release notes
- No security runbook (key leak response, incident response)
- No developer onboarding guide

---

## 10. Compliance & Resilience — 58 / 100

### Strengths
- Fail-closed: no valid key = no functionality
- Graceful degradation via circuit breaker
- Token expiry guard automatically suspends API polling
- Offline handling uses cached encrypted token
- No third-party analytics or tracking libraries

### Weaknesses
- **No privacy policy or terms of service** — required for commercial software
- Employee ID and shift data sent to **Telegram without explicit user consent** — GDPR/CCPA risk
- No data retention policy
- No GDPR mechanisms (right to erasure, data portability, consent withdrawal)
- Telegram logging is mandatory if credentials are configured — no opt-out toggle
- No error reporting service (Sentry, etc.) — production failures are invisible
- No health check or status page
- `fetchServerConfig` has no timeout — can hang the SW

---

## Critical Gaps (Fix Before Scale)
1. **Integrity check is fake** — remove or implement real code hashing
2. **No privacy policy** — legal liability for commercial product
3. **Telegram data sharing without consent** — compliance risk
4. **Unbounded memory leaks** (`claimedIds`, `apiClaimNotified`)
5. **`renameGlobals: false`** exposes crypto and fingerprint APIs
6. **No license revocation** — stolen keys cannot be killed
7. **No device limit enforcement** — key sharing is trivial

## Nice-to-Have Improvements
1. Add `aria-live` region for screen readers
2. Draggable HUD
3. Confirmation dialog on Clear buttons
4. JSDoc across all public functions
5. CI/CD with automated build + lint
6. Error reporting service integration
7. Real code integrity hashing at build time
