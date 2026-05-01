# Technical Debt Register

Canonical list of known issues, code smells, architectural weaknesses, and missing capabilities in [[Shift Grabber V9 Index|Shift Grabber V9]].

---

## 🔴 Critical

### 1. Hardcoded Telegram Credentials — PARTIALLY RESOLVED
**Location:** `background/service-worker.js`  
**Risk:** Bot token and chat ID are visible in plain text. Anyone with extension source can impersonate the bot or read queued messages.  
**Status:** Credentials now read from `chrome.storage.local` (keys `sg_tg_bot_token`, `sg_tg_chat_id`). Hardcoded values remain as fallback defaults in `getTelegramCreds()`. Full removal requires server-side config or user input flow.  
**Remediation:** Populate storage from server config or user input; remove fallback defaults.

### 2. No Input Validation on GraphQL Responses — RESOLVED
**Location:** `src/content/api-layer.js`  
**Risk:** Assumes Amazon response shape is stable. A schema change could cause `undefined` dereferences in `parseShiftInfo` or `fireClaim`.  
**Status:** Added `validateGraphQLResponse(data)` helper that guards every path (`data.data.shiftOpportunities.opportunities`) before indexing. Logs shape errors and returns safe empty array on mismatch. Applied in `pollOnce()`.

### 3. Shared Storage Key Names Across Modules — PARTIALLY RESOLVED
**Location:** All modules  
**Risk:** `main.js`, `popup.js`, and `service-worker.js` each define their own `KEYS` / `K` objects with overlapping but not identical names. A typo in one module silently breaks another.  
**Status:** `src/shared/constants.js` created. Used by popup.js and service-worker.js. `main.js` and `api-layer.js` still use inline `K`/`CFG` objects due to MV3 content-script plain-script constraints (no ES module imports).  
**Remediation:** Inject shared script via manifest `content_scripts` array if manifest supports multiple scripts per world.

---

## 🟡 Medium

### 4. License Verification Duplication — RESOLVED (Won't Fix — Architecture Correct)
**Location:** `popup/popup.js` + `background/license.js`  
**Risk:** Two implementations of the same HTTP POST to `/verify`. Divergence is likely over time.  
**Status:** `license.js` is dead code (ES module export, never imported by service worker or popup). `popup.js` `verifyWithServer()` is a thin message-passing wrapper that delegates to `service-worker.js` `verifyLicense()`. The actual verification lives only in the SW.  
**Remediation:** Remove or deprecate `license.js`; single source of truth is `service-worker.js` `verifyLicense()`.

### 5. No Exponential Backoff on Rate Limits — RESOLVED
**Location:** `src/content/api-layer.js`  
**Risk:** Fixed 5 s polls for 30 s on HTTP 429. If Amazon applies stricter limits, this may still be too aggressive.  
**Status:** Replaced fixed `handleRateLimit()` with exponential backoff. Base 5 s, factor 2, cap 40 s. Resets to base on successful poll.

### 6. Employee ID Scraping Fragility — RESOLVED
**Location:** `src/content/api-layer.js` → `eid()`  
**Risk:** Parses `localStorage` key pattern `aza-user-features-*-prod`. Amazon can rename this key at any time, breaking all claims.  
**Status:** `eid()` now has fallback chain: (1) localStorage pattern, (2) sessionStorage pattern, (3) `window.__SG_EID`, (4) DOM meta tag `meta[name="employee-id"]`.

### 7. Missing Sender Validation in Service Worker — RESOLVED
**Location:** `background/service-worker.js`  
**Risk:** `chrome.runtime.onMessage` does not check `sender.id` or `sender.origin`. Malicious content scripts or other extensions could trigger scheduling.  
**Status:** `chrome.runtime.onMessage` listener now rejects messages where `sender.id !== chrome.runtime.id`.

### 8. Token Refresh Race Condition
**Location:** `popup/popup.js` + `background/service-worker.js`  
**Risk:** Both can refresh the token simultaneously. `popup.js` writes to storage; `service-worker.js` reads and acts. No atomic compare-and-swap.  
**Remediation:** Single-writer pattern — only the service worker should refresh; popup should request refresh via message.

---

## 🟢 Low

### 9. No Test Suite
**Location:** Entire project  
**Risk:** Zero unit, integration, or E2E tests. Refactoring is dangerous.  
**Remediation:** Add Jest + Puppeteer tests covering: token lifecycle, alarm scheduling, claim deduplication, rate-limit recovery.

### 10. Inline Styles in HTML
**Location:** `popup/index.html` lines 62, 80  
**Risk:** Minor maintainability issue.  
**Remediation:** Move to `styles.css` utility classes.

### 11. Magic Numbers Everywhere
**Location:** All JS files  
**Risk:** `800`, `4000`, `250`, `1000`, `500`, `120`, `100`, `200` — scattered constants with no single source of truth.  
**Remediation:** See [[Configuration Reference]] for proposed centralisation.

### 12. No Structured Logging
**Location:** All JS files  
**Risk:** `console.log` used sporadically. No log levels, no remote aggregation, no rotation.  
**Remediation:** Replace with minimal logger supporting `debug/info/warn/error` + optional telemetry.

### 13. WeakSet DOM Backup Has No Eviction
**Location:** `src/content/main.js`  
**Risk:** Buttons clicked once are tracked forever in a `WeakSet`. Memory impact is negligible, but logic clarity suffers.  
**Remediation:** Time-bound tracking or explicit cleanup on page unload.

### 14. Accessibility Gap
**Location:** `popup/index.html`  
**Risk:** No ARIA labels, no focus rings defined, colour-only state indicators.  
**Remediation:** Add `aria-pressed`, `aria-label`, and visible text alternatives.

### 15. Version String Drift
**Location:** `manifest.json`, `popup/index.html`, `src/content/main.js`  
**Risk:** "V9" appears in HTML and JS constants; manifest says `2.0.0`. Git history says "V7". No automated sync.  
**Remediation:** Single source of truth injected at build time.

### 16. Device ID Divergence (BUG) — RESOLVED
**Location:** `popup.js` + `license.js` + `service-worker.js`  
**Risk:** `popup.js` stores device ID under `SG_deviceId`; `license.js` stores under `deviceId`. They generate independent UUIDs. Background refresh (`service-worker.js` line 299) reads `SG_deviceId`, but `license.js` verification reads/writes `deviceId`. Server sees two different device IDs for the same browser.  
**Status:** Unified on `sg_device_id` via `src/shared/constants.js`. Popup `getDeviceId()` migrated. SW `refreshTokenInBackground()` uses unified key with defensive fallback to legacy keys. `onInstalled` listener migrates legacy IDs on first run.

### 17. Api-Layer Load Failure Has No Fallback — RESOLVED
**Location:** `main.js` init  
**Risk:** If `api-layer.js` fails to inject or set `window.__SG_API_LOADED`, `main.js` polls 15 times and gives up. Extension falls back to DOM-only grabbing silently. No user notification that API polling is unavailable.  
**Status:** `waitForApiLayer()` now sets `apiLayerFailed = true`, shows a toast warning, and renders a persistent red banner in the HUD: "API layer failed — claiming disabled".

### 18. Contact URL Hardcoded — RESOLVED
**Location:** `popup.js` line 2  
**Risk:** `CONTACT_URL = "https://t.me/shift_grabber"` cannot be changed without modifying source. If the Telegram handle changes, all installed extensions have a broken contact link.  
**Status:** Now reads from `SG_CONSTS.URLS.CONTACT_URL` with hardcoded fallback. Default value also stored in `sg_contact_url` via `DEFAULTS`.

---

## Historical Notes

- **V7 → V9 evolution:** Git shows a single commit (`9f6d328`). The jump from V7 to V9 and manifest `2.0.0` suggests major refactoring (MV2 → MV3 migration, new license system, service worker rewrite) but history was likely squashed or rewritten.
- **Turbo mode added post-V7:** Not mentioned in any commit message; inferred from `Shift+T` handler in `main.js`.

---

## Related

- [[Security Audit]] — Detailed security risk analysis
- [[Configuration Reference]] — Centralising magic numbers
- [[Module Analysis]] — Coupling hotspots that amplify debt
- [[Project Evolution]] — How debt accumulated across versions
