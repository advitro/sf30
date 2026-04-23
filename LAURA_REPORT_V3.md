# LAURA Deep Inspection Report V3
## Date: 2026-04-23
## Overall Score: 47/100

> **Mandate:** Brutal, honest, unbiased forensic re-audit of Shift Grabber V9 Chrome Extension (MV3) after the comprehensive fix sprint.
>
> **Verdict:** The fix sprint closed 5 genuine P0 holes and improved the build pipeline, but introduced a catastrophic content-script regression that renders the HUD permanently broken and API claiming permanently disabled. The score edges up by a single point: **46 → 47**.

---

### Fix Verification

| # | Claimed Fix | Verified | Notes |
|---|-------------|----------|-------|
| 1 | Encrypted token wired into scheduling hot path | **Partial** | `getValidToken()` exists (`background/service-worker.js:35-49`) and is called in all scheduling functions (`:374`, `:386`, `:412`, `:435`, `:452`, `:575`, `:597`, `:139`). **BUT** this fix introduced a regression: `storeEncryptedToken` sets `sg_access_token: null` (`:683`), and `src/content/main.js` still reads `sg_access_token` to determine token presence (`main.js:410`). The content script is now permanently blind — HUD always shows "NO KEY", token guard permanently stops API polling, and popup re-verifies on every open. |
| 2 | `const` reassignment crash fixed | **Yes** | `main.js:408-409` now declares `let nowSec` and `let hasToken`; reassignment at `:428-429` is legal. |
| 3 | Build pipeline HMAC injection fixed | **Yes** | `build.js:150` disables `stringArray` for the service worker. `build.js:176-181` aborts if `SG_HMAC_KEY` is missing. `build.js:189-192` replaces `"__SG_HMAC_KEY_PLACEHOLDER__"` after obfuscation. Regex matches the literal string correctly. |
| 4 | Integrity hash computed after all modifications | **Yes** | `build.js:229-243` computes SHA-256 of the final service-worker.js (after obfuscation + global rename + URL injection) and replaces `"__SG_INTEGRITY_HASH_PLACEHOLDER__"`. |
| 5 | Simple mode CSS fixed | **Yes** | `popup/styles.css:12-25` adds all missing custom properties (`--text-primary`, `--accent-500`, etc.) as aliases to the existing palette. |
| 6 | `chrome.tabs.query` removed from content script | **Yes** | `getAtoZTabs()` and related cache variables are gone from `main.js`. |
| 7 | Heartbeat HMAC validation added | **Yes** | `sendHeartbeat` (`background/service-worker.js:77-83`) reads `X-Response-Hmac` and validates with `validateResponseHmac()`. |
| 8 | Heartbeat config push implemented | **Yes** | `sendHeartbeat:102-104` applies `json.config` with `await setState(json.config)`. **No key allowlist** — a compromised server can push arbitrary storage keys. |
| 9 | `SG_LICENSE_VERIFIED` alarm mutex fixed | **Yes** | `handleMessage` for `SG_LICENSE_VERIFIED` (`background/service-worker.js:509-525`) wraps `clearAllAlarms()` inside `withAlarmLock()`. |
| 10 | Fetch timeouts added | **Partial** | `sendHeartbeat` (`:73`), `verifyLicense` (`:800`), and `fetchServerConfig` (`:655`) all use `AbortSignal.timeout(10000)`. **BUT** `sendTelegram` (`background/service-worker.js:254`) still has **no timeout**. The claim "All fetch calls in service worker" is false. |
| 11 | api-layer.js postMessage source validation | **Partial** | `api-layer.js:352` validates `e.data.secret !== SG_CONSTS.MSG_SECRET`. `main.js` includes `secret: SG_CONSTS.MSG_SECRET` in all `postMessage` calls (`main.js:617`, `:754`, `:758`, `:762`, `:808`). **BUT** `build.js:222` attempts to randomize `MSG_SECRET`, yet because `constants.js` is obfuscated with `stringArray: true` and `stringArrayEncoding: ["base64"]`, the literal `"__SG_MSG_SECRET__"` is base64-encoded in the string array and the naive `.split('"__SG_MSG_SECRET__"')` **fails to match**. Both sides fall back to the hardcoded placeholder, so the secret is **not actually randomized** — it remains the known string `__SG_MSG_SECRET__`. Any page script that reads the source can spoof messages. Security theater. |
| 12 | `onInstalled` settings reset fixed | **Yes** | `background/service-worker.js:936-939` merges `DEFAULTS` with existing state instead of overwriting. |
| 13 | Popup server URL no longer hardcoded | **Yes** | `popup/popup.js:95` uses `SG_CONSTS.URLS.SERVER` with a fallback. |
| 14 | Version numbers unified | **Partial** | `manifest.json:4` and `package.json:3` both read `2.1.0`. **BUT** `popup/index.html:14` still says `V9`, `src/shared/constants.js:12` says `VERSION: "V9"`, `src/content/main.js:22` says `const VERSION = "V9"`, and the stale `Deploy/extension/manifest.json:4` still says `2.0.0`. |
| 15 | CI artifact paths fixed | **Yes** | `.github/workflows/ci.yml:32-36` uploads `dist/**` and uses `npm install` (`:22`). |
| 16 | `CLAIM_Q_SET` rotation | **Yes** | `src/content/api-layer.js:18-22` contains three genuinely distinct mutation shapes (different return field selections). |
| 17 | HUD drag position restore | **Yes** | `main.js:341-347` reads `sg_hud_pos` and applies saved `left`/`top` inside `ensureHUD()`. |
| 18 | `build:zip` cross-platform | **Yes** | `zip.js:21-28` uses `Compress-Archive` on Windows and `zip` on Unix. |
| 19 | Stale comment removed | **Yes** | The misleading "plaintext token is kept as cache" comment is gone. `background/service-worker.js:671` now accurately says "No plaintext cache — fail-closed." |
| 20 | `integrityHash` stored from verify response | **Yes** | `verifyLicense:841` stores `sg_integrity_hash: json.integrityHash || null`. |

---

### 1. Security Architecture — 54/100 (10.8 pts)

**What works**
- AES-GCM-256 + PBKDF2 encryption at rest remains sound (`src/shared/crypto.js:10-52`).
- Constant-time HMAC comparison prevents timing attacks (`src/shared/crypto.js:66-75`).
- Build-time HMAC key injection now works correctly (`build.js:189-192`).
- Build-time integrity hash injection now works correctly (`build.js:237-243`).
- Heartbeat HMAC validation closes the MITM kill-switch vector (`background/service-worker.js:77-83`).
- Alarm mutex prevents alarm creation races (`background/service-worker.js:346-358`).
- Sender ID validation rejects cross-extension messages (`background/service-worker.js:463`).
- Kill-switch via `/heartbeat` is implemented and now validated.

**What is broken or dangerous**
- **P0 — Content script is permanently blind to token status.** `storeEncryptedToken` (`background/service-worker.js:683`) sets `sg_access_token: null`. `src/content/main.js:410` checks `st[K.ACCESS_TOKEN]` to derive `hasToken`, which is now **always false**. This causes: (a) HUD permanently shows "NO KEY" (`main.js:444`), (b) the token expiry guard permanently suspends API polling (`main.js:412-416`), (c) the dot indicator always shows yellow (`main.js:197-198`), (d) the popup re-verifies the license on **every** open because `!st[KEYS.ACCESS_TOKEN]` is always true (`popup/popup.js:519`). **This regression was introduced by the encrypted-token fix.**
- **P0 — API-layer ready signal is permanently broken.** `main.js:815` polls `window.__SG_API_LOADED`, but `api-layer.js:7` sets `window.__sg_api_v3`. The names do not match, and because `main.js` runs in the isolated world while `api-layer.js` runs in the MAIN world, the isolated-world `window` never sees the MAIN-world property. `waitForApiLayer` (`main.js:814-825`) always times out after 1.5s, sets `apiLayerFailed = true`, and disables direct API claiming permanently. The extension falls back to slow DOM clicking only. **This bug predates the fix sprint but was never caught.**
- **P1 — `MSG_SECRET` randomization is security theater.** `build.js:222` attempts a naive string replacement of `"__SG_MSG_SECRET__"` in obfuscated files. Because `constants.js` is obfuscated with `stringArray: true` and `stringArrayEncoding: ["base64"]`, the literal is encoded in the string array and the replacement **misses**. The runtime secret remains the hardcoded placeholder `__SG_MSG_SECRET__`. Any page script can send `postMessage({ sg: true, type: 'SG_STOP_POLLING', secret: '__SG_MSG_SECRET__' })` and control the api-layer.
- **P1 — `validateResponseSignature` still hashes a custom concatenation instead of the full response body** (`background/service-worker.js:722-730`), diverging from the documented server contract (`Deploy/docs/SERVER-CONTRACT.md:113`).
- **P1 — License key (`sg_userKey`) is still stored in plaintext** (`popup/popup.js:443`, `background/service-worker.js:838`).
- **P1 — No certificate pinning** for the license server.
- **P1 — Weak device fingerprint in service worker.** `fingerprint.js:24` uses `document.createElement("canvas")` inside a `try-catch`. In the service worker, `document` is undefined, so the canvas and screen components are silently dropped. The resulting fingerprint is based only on `userAgent + language + timezone + hardwareConcurrency + platform`, which is highly collision-prone. This weakens the encryption key for token storage.
- **P1 — Heartbeat config push has no key allowlist.** A compromised server can push arbitrary config objects (`json.config`) into `chrome.storage.local` after passing HMAC validation. This is a privilege-escalation risk.

---

### 2. Code Quality & Maintainability — 49/100 (7.35 pts)

**What works**
- Shared constants module reduces magic strings (`src/shared/constants.js`).
- Alarm mutex prevents races (`background/service-worker.js:346-358`).
- Periodic cleanup of `claimedIds` and `apiClaimNotified` prevents unbounded growth (`src/content/api-layer.js:153-159`, `src/content/main.js:42-47`).
- WeakSet deduplication for DOM buttons (`src/content/main.js:50`).
- Some JSDoc in the service worker.

**What is broken or dangerous**
- **P0 — `main.js` polls a non-existent global for api-layer readiness.** `window.__SG_API_LOADED` (`main.js:815`) vs `window.__sg_api_v3` (`api-layer.js:7`). The ready-check logic is completely dead code.
- **P1 — `poissonDelay` in `api-layer.js` can return `Infinity` or multi-minute delays.** `api-layer.js:137`: `Math.max(50, -meanMs * Math.log(1 - Math.random()))`. When `Math.random()` returns a value extremely close to `1`, `1 - Math.random()` approaches `0`, `Math.log` approaches `-Infinity`, and the product approaches `+Infinity`. `Math.max(50, Infinity)` returns `Infinity`. In practice, `setTimeout` with very large values can delay polling for minutes or hours. There is **no upper bound**.
- **P1 — Mixed `var`/`let`/`const` across the codebase.** `api-layer.js` is entirely `var`-based while `popup.js` uses modern syntax. This inconsistency suggests copy-paste development without review.
- **P1 — `popup.js` registers two separate `chrome.runtime.onMessage` listeners** (lines 479 and 709) instead of one unified handler.
- **P1 — `popup.js` simple-mode event handlers do not guard against missing DOM elements.** If the HTML changes, `document.getElementById` returns `null` and subsequent property access throws.
- **P1 — `main.js` keyboard handlers do not check `chrome.runtime.lastError`.** `main.js:654`, `:662`, `:669`. If the extension context is invalidated (update/reload), these calls throw uncaught errors.
- **P1 — `build.js` global name replacement is dangerously naive.** `build.js:219` uses `code.split(oldName).join(newName)`. This will replace substrings inside unrelated identifiers, strings, or comments. For example, a variable named `my_SG_CONSTS_var` becomes `my__abc123_var`.
- No linting, no TypeScript, no enforced code style.

---

### 3. MV3 Compliance & Reliability — 46/100 (6.9 pts)

**What works**
- `chrome.alarms` used correctly for scheduling instead of `setInterval`.
- Alarm mutex prevents duplicate alarm creation races.
- `chrome.storage.local` is the single state store.
- `onInstalled` and `onStartup` listeners handle initialization.
- `visibilitychange` pauses HUD updates (`src/content/main.js:794-801`).
- `onInstalled` now preserves user settings on update (`background/service-worker.js:936-939`).

**What is broken or dangerous**
- **P0 — Content script token blindness breaks the token expiry guard.** Because `sg_access_token` is always `null`, `main.js:412-416` permanently stops API polling after the first `updateHUD()` call, and `main.js:417-422` can never resume it because `hasToken` is always false. The API layer is dead on arrival even if the ready signal were fixed.
- **P0 — API-layer claiming is permanently disabled** due to the `__SG_API_LOADED` / `__sg_api_v3` mismatch. The primary claiming mechanism (direct GraphQL API) does not work. The extension relies solely on slow DOM button clicking.
- **P1 — `chrome.runtime.onStartup` clears alarms outside the mutex.** `background/service-worker.js:947` calls `await clearAllAlarms()` without `withAlarmLock()`, racing with concurrent alarm operations.
- **P1 — `chrome.runtime.onInstalled` creates alarms outside the mutex.** `background/service-worker.js:940-941` calls `ensureTokenCheckAlarm()` and `ensureHeartbeatAlarm()` without `withAlarmLock()`.
- **P1 — Floating promise in `onInstalled`.** `flushTelegramQueue()` at `:942` is awaited, but if the service worker sleeps during the flush, queued messages could be lost. (Note: this is less severe than V2 because it is now `await`ed, but MV3 SW termination mid-flush is still possible.)
- **P1 — `main.js` DOM polling loop runs even when the tab is hidden.** `startMainLoop` (`src/content/main.js:599-606`) never pauses on `visibilitychange`, wasting CPU and battery.
- **P1 — `api-layer.js` poll loop runs even when the tab is hidden.** `startLoop` (`api-layer.js:324-341`) has no `visibilitychange` pause.
- **P1 — `importScripts` with relative path traversal (`../src/shared/`) is non-standard** (`background/service-worker.js:3-5`). While it works in Chrome today, it is fragile and not guaranteed in all packaging scenarios.
- **P1 — `sendTelegram` fetch lacks timeout.** `background/service-worker.js:254` has no `AbortSignal`. A hung Telegram API call can block the service worker indefinitely.

---

### 4. UX & Popup Design — 43/100 (4.3 pts)

**What works**
- Simple / Advanced panel split reduces cognitive load.
- Device limit UI with cooldown messaging (`popup/popup.js:259-265`, `:304-310`).
- GDPR data export button exists (`popup/popup.js:19-41`).
- Telegram opt-out toggle exists.
- Kill-switch UI feedback (`popup/popup.js:709-718`).
- Draggable HUD with position memory (partial — see P0).
- Simple mode CSS now renders correctly (`popup/styles.css:12-25`).

**What is broken or dangerous**
- **P0 — HUD permanently shows "NO KEY"** because the content script reads `sg_access_token` which is always `null` (`main.js:410`, `:444`). The user cannot tell if the license is actually valid.
- **P0 — Popup re-verifies license on every open** because `popup/popup.js:519` checks `!st[KEYS.ACCESS_TOKEN]` which is always true. This wastes server resources and creates a poor user experience (1-2s spinner every time).
- **P1 — Status badge missing `NO_KEY` state.** `updateStatusBadge` (`popup/popup.js:343-367`) only handles OFF, PAUSED, FAST, LIVE. When `sg_access_token` is null (always), the badge shows OFF even if enabled.
- **P1 — No keyboard navigation or ARIA labels.** Toggle switches in `popup/index.html` lack `tabindex`, `aria-pressed`, and `aria-label`. Screen-reader users are abandoned.
- **P1 — No "show password" toggle on license input.** The input is `type="text"` but the key is sensitive. Users cannot verify long keys easily.
- **P1 — Popup has no responsive layout.** Fixed `310px` min-width (`popup/styles.css:20`) will clip on high-DPI or narrow viewports.
- **P1 — Master toggle has no visual loading state beyond text.** During the 1-2s verification call, the switch moves instantly and can be clicked again.
- **P1 — Toast and HUD styles are injected unconditionally** (`src/content/main.js:123-132`, `:207-333`), even when the extension is disabled.

---

### 5. Build & DevOps Pipeline — 44/100 (4.4 pts)

**What works**
- Obfuscation config is aggressive (`controlFlowFlattening`, `deadCodeInjection`, `selfDefending`).
- Multi-environment config injection exists (`config/environments.js`).
- CI/CD workflow exists with CodeQL and `npm audit` (`.github/workflows/ci.yml`).
- Artifact upload steps exist and now point to the correct `dist/**` path.
- HMAC key injection works correctly.
- Integrity hash injection works correctly.
- Cross-platform zip script works.

**What is broken or dangerous**
- **P1 — Build.js URL injection for the service worker is dead code.** `build.js:195-198` searches for `https://shiftgrabber\.net` in the service worker and replaces it with `ENV_CONFIG.SERVER_URL`. But the service worker never contains a hardcoded `shiftgrabber.net` URL — it uses `URLS.SERVER` which is imported from `constants.js`. The replacement never matches. **Production builds still use `shift-grabber.vercel.app`** in the service worker, popup, and content scripts because `constants.js` is never modified for URL injection.
- **P1 — `MSG_SECRET` randomization is broken.** As detailed in Security, the naive string replacement fails on obfuscated `constants.js`, leaving the hardcoded placeholder in production builds.
- **P1 — Naive global name randomization can corrupt code.** `build.js:219` uses `.split(oldName).join(newName)` with no word-boundary protection. This can break identifiers, strings, or comments that happen to contain the global name as a substring.
- **P1 — `Deploy/extension/` contains stale V2 files.** `Deploy/extension/manifest.json:4` still says `2.0.0`. The service worker there still uses the old code (direct `sg_access_token` check, no `getValidToken()`). This is a landmine — anyone packaging from `Deploy/extension/` instead of `dist/` ships the old, broken build.
- **P1 — E2E test loads stale code.** `tests/e2e/smoke.test.js:15` points to `Deploy/extension`, not `dist/`. The E2E test never exercises the actual obfuscated build output.
- **P1 — No `package-lock.json`.** CI uses `npm install`, which is non-reproducible.
- **P1 — `lint` and `test` scripts are still placeholders** (`package.json:8-9`).
- No build verification step. No smoke test of the obfuscated output.

---

### 6. Documentation Completeness — 53/100 (5.3 pts)

**What works**
- `Deploy/docs/SERVER-CONTRACT.md` documents endpoints, request/response schemas, device-transfer logic, and rate limits.
- `BUILD.md`, `SECURITY-RUNBOOK.md`, `CHANGELOG.md` exist.
- Customer-facing docs (`README-Install.md`, `README-Activate.md`, `TROUBLESHOOTING.md`) are clear and well-structured.
- Privacy Policy and Terms of Service exist.
- Some JSDoc in `service-worker.js`.

**What is broken or dangerous**
- **P1 — `SERVER-CONTRACT.md` contradicts the code.** The contract states all responses must include HMAC and the extension must verify it. The `verifyLicense` handler (`background/service-worker.js:821-825`) uses `validateResponseSignature` which hashes a custom concatenation, not the full response body. The contract says `/heartbeat` pushes `config`, which is now implemented, but the contract does not mention the lack of a config key allowlist.
- **P1 — `CHANGELOG.md` claims `const` redeclaration is fixed** (`CHANGELOG.md:46`). It is fixed, but the changelog does not mention the new content-script blindness regression introduced by the same fix sprint.
- **P1 — No inline JSDoc** in `main.js`, `api-layer.js`, or `popup.js`.
- No Architecture Decision Records (ADRs).
- No developer onboarding guide.
- No API spec beyond the server contract.
- No documentation of the `__SG_API_LOADED` / `__sg_api_v3` mismatch or the `MSG_SECRET` randomization failure.

---

### 7. Testing & Verification — 32/100 (3.2 pts)

**What works**
- E2E smoke test scaffold exists (`tests/e2e/smoke.test.js`).
- Crypto unit test exists (`test/crypto.test.js`).
- `npm audit` runs in CI.
- CodeQL runs in CI.

**What is broken or dangerous**
- **P1 — E2E test does not exercise core functionality.** It tests popup rendering, panel toggle, license input, and storage API — but never license verification, alarm scheduling, token refresh, or the encrypted token lifecycle. It would pass even though the product is completely non-functional.
- **P1 — E2E test loads stale / unbuilt code.** `tests/e2e/smoke.test.js:15` points to `Deploy/extension/`, which contains the pre-fix V2 source. The test never validates the actual `dist/` build.
- **P1 — CI does not run the E2E test.** The workflow has no step for `npm run test:e2e`.
- **P1 — `lint` and `test` scripts are placeholders.** `package.json:8-9` echoes strings. The CI lint step always passes trivially.
- **P1 — Crypto unit test is not wired into CI.** `test/crypto.test.js` exists but `npm test` does not run it.
- No unit tests for `loadEncryptedToken`, `scheduleNextBurstAnchor`, alarm mutex behavior, `validateMessage`, or `poissonDelay` edge cases.
- No coverage reporting.
- No build verification step to confirm the obfuscated extension loads without syntax errors.

---

### 8. Compliance & Legal — 51/100 (5.1 pts)

**What works**
- Privacy Policy and Terms of Service exist (`Deploy/docs/PRIVACY-POLICY.md`, `TERMS-OF-SERVICE.md`).
- GDPR data export feature exists (`popup/popup.js:19-41`).
- Telegram opt-out toggle exists.
- Data retention is mentioned in the privacy policy.
- No third-party analytics or tracking libraries.

**What is broken or dangerous**
- **P1 — Telegram is opt-out, not opt-in.** The privacy policy claims Telegram is "opt-in" (`Deploy/docs/PRIVACY-POLICY.md:22`), but `sg_tg_opt_out` defaults to `false` and the toggle defaults to checked (`popup/popup.js:508`). Users are enrolled by default if credentials are configured.
- **P1 — No explicit user consent before transmitting PII to the license server.** `verifyLicense` sends `deviceId`, `fingerprint`, and `key` to the server (`background/service-worker.js:796-800`) without a first-run consent dialog. GDPR Article 6 lawful basis is not established in the UI.
- **P1 — Popup re-verifies on every open** (`popup/popup.js:519`), causing unnecessary PII transmission to the license server without user knowledge or consent.
- **P1 — No "Delete My Data" / right to erasure.** The export button provides data portability, but there is no way for a user to purge their stored credentials, fingerprints, or queued Telegram messages. Uninstalling leaves data in `chrome.storage.local`.
- **P1 — Data retention statements are vague.** "Shift grab logs are retained until you clear them or uninstall the extension" does not specify a concrete retention period.
- **P1 — Terms of Service lack jurisdiction / governing law clause.**
- **P1 — Export includes encrypted tokens and sensitive metadata without a warning.** The user downloads a JSON blob containing `sg_enc_token`, `sg_userKey`, `sg_device_id`, etc. without being informed of the sensitivity.

---

## Weighted Final Score: 47/100

| Dimension | Raw | Weight | Weighted |
|-----------|-----|--------|----------|
| 1. Security Architecture | 54 | 20% | 10.80 |
| 2. Code Quality & Maintainability | 49 | 15% | 7.35 |
| 3. MV3 Compliance & Reliability | 46 | 15% | 6.90 |
| 4. UX & Popup Design | 43 | 10% | 4.30 |
| 5. Build & DevOps Pipeline | 44 | 10% | 4.40 |
| 6. Documentation Completeness | 53 | 10% | 5.30 |
| 7. Testing & Verification | 32 | 10% | 3.20 |
| 8. Compliance & Legal | 51 | 10% | 5.10 |
| **TOTAL** | — | — | **47.35** |

---

## Critical Issues (P0)

1. **Content script is permanently blind to token status.** `storeEncryptedToken` (`background/service-worker.js:683`) sets `sg_access_token: null`. Every scheduling function in the service worker now correctly uses `getValidToken()`, but `src/content/main.js:410` still checks `st[K.ACCESS_TOKEN]` to derive `hasToken`, which is permanently false. The HUD shows "NO KEY" forever, the token expiry guard permanently stops API polling, and the popup re-verifies on every open. **Introduced by the encrypted-token wiring fix.**
2. **API-layer ready signal is completely broken.** `main.js:815` polls `window.__SG_API_LOADED`, but `api-layer.js:7` sets `window.__sg_api_v3`. The names have never matched, and because the scripts run in different worlds, the check can never succeed. `waitForApiLayer` always times out, sets `apiLayerFailed = true`, and disables direct API claiming. The extension relies solely on slow DOM button clicking. **Pre-existing bug, uncaught in V2.**
3. **`onStartup` clears alarms outside the alarm mutex.** `background/service-worker.js:947` calls `await clearAllAlarms()` without `withAlarmLock()`, creating a race with concurrent message handlers.
4. **`onInstalled` creates alarms outside the alarm mutex.** `background/service-worker.js:940-941` calls `ensureTokenCheckAlarm()` and `ensureHeartbeatAlarm()` without `withAlarmLock()`, creating a race with concurrent alarm operations.

---

## Warnings (P1)

5. **`MSG_SECRET` randomization is security theater.** `build.js:222` fails to replace the placeholder in obfuscated `constants.js` due to base64 string array encoding. The runtime secret remains the hardcoded `__SG_MSG_SECRET__`, allowing any page script to spoof api-layer messages.
6. **`sendTelegram` fetch lacks timeout.** `background/service-worker.js:254` has no `AbortSignal.timeout()`, contradicting the claim that "all fetch calls in service worker use timeout."
7. **`poissonDelay` can return unbounded / Infinity-level delays.** `api-layer.js:137` has no upper bound. A single unlucky `Math.random()` draw can stall the poll loop for minutes or hours.
8. **Build.js URL injection is dead code.** `build.js:195-198` searches for a hardcoded URL that does not exist in the service worker source. Production builds still use `shift-grabber.vercel.app`.
9. **Naive global name replacement can corrupt code.** `build.js:219` uses unbounded `.split(oldName).join(newName)` without word-boundary checks.
10. **`Deploy/extension/` contains stale V2 files.** The manifest there is `2.0.0`, and the service worker uses the old pre-fix logic. Risk of shipping the wrong build.
11. **E2E test loads stale `Deploy/extension/` code.** `tests/e2e/smoke.test.js:15` never validates the actual `dist/` build.
12. **`validateResponseSignature` still hashes custom concatenation** instead of the full response body, diverging from the server contract.
13. **License key stored in plaintext.** `popup/popup.js:443` and `background/service-worker.js:838` store the raw license key.
14. **No certificate pinning** for license server.
15. **Weak service-worker fingerprint** drops canvas and screen components, producing collision-prone encryption keys.
16. **Heartbeat config push has no key allowlist.** A compromised server can write arbitrary keys to `chrome.storage.local`.
17. **Popup always shows "Invalid or expired"** due to null `sg_access_token` (`popup/popup.js:225-230`).
18. **Status badge missing `NO_KEY` state.** `popup/popup.js:343-367`.
19. **DOM polling loops run when tab is hidden.** `main.js:599-606` and `api-layer.js:324-341`.
20. **`main.js` `sendMessage` calls lack `lastError` checks.** Lines 654, 662, 669.
21. **`importScripts` relative path traversal** in service worker (`background/service-worker.js:3-5`).
22. **`popup.js` has two `onMessage` listeners.** Lines 479 and 709.
23. **`popup.js` event handlers unguarded** against missing DOM elements.
24. **Mixed `var`/`let`/`const`** across codebase.
25. **No `package-lock.json`.** CI uses `npm install`.
26. **`lint` and `test` scripts are placeholders.**
27. **CI does not run E2E tests.**
28. **No build verification step.**
29. **Telegram is opt-out by default.**
30. **No explicit consent for server data transmission.**
31. **No "Delete My Data" button.**
32. **Vague data retention statements.**
33. **Terms lack jurisdiction clause.**
34. **Export includes sensitive data without warning.**
35. **Popup lacks responsive layout, ARIA, and show-password toggle.**
36. **Toast and HUD styles injected unconditionally.**
37. **`fetchServerConfig` hardcodes version `2.0.0` in URL.** `background/service-worker.js:655`.

---

## Recommendations for 100/100

**Immediate (fix before any release)**
1. **Fix content-script token blindness.** Either store a `sg_token_present` boolean in storage (set by `storeEncryptedToken`), or have `main.js` message the service worker to query token status instead of reading `sg_access_token` directly.
2. **Fix the API-layer ready signal.** Replace `main.js:814-825` with a `postMessage`-based handshake: `api-layer.js` should send `{ type: 'SG_API_READY' }` after initialization, and `main.js` should listen for it.
3. **Fix `onStartup` and `onInstalled` alarm races.** Wrap `clearAllAlarms`, `ensureTokenCheckAlarm`, and `ensureHeartbeatAlarm` calls inside `withAlarmLock()`.
4. **Fix `poissonDelay` unbounded output.** Cap the maximum: `Math.min(MAX_DELAY_MS, Math.max(50, ...))`.
5. **Fix `sendTelegram` timeout.** Add `signal: AbortSignal.timeout(10000)` to the Telegram fetch.

**Short-term**
6. Fix `MSG_SECRET` randomization by injecting the secret into a JSON config file or by replacing it **before** obfuscation in the source, not after.
7. Fix build.js URL injection by replacing `SG_CONSTS.URLS.SERVER` in `constants.js` (or all files), not searching for a hardcoded URL that doesn't exist in the service worker.
8. Replace naive `.split().join()` global name replacement with AST-aware replacement or regex word boundaries (`\b`).
9. Delete or auto-sync `Deploy/extension/` so it cannot be mistaken for the current build.
10. Update E2E test to load from `dist/` and add assertions for license verification, alarm scheduling, and token refresh.
11. Add `package-lock.json` and change CI back to `npm ci`.
12. Replace placeholder `lint` / `test` scripts with real ESLint and Vitest/Jest suites.
13. Add unit tests for `loadEncryptedToken`, `scheduleNextBurstAnchor`, alarm mutex behavior, `validateMessage`, and `poissonDelay`.
14. Fix `validateResponseSignature` to hash the full JSON response body, matching the server contract.
15. Store license key encrypted at rest, not plaintext.
16. Implement a true first-run consent flow and a "Delete My Data" button that calls `chrome.storage.local.clear()`.

**Long-term**
17. Migrate from IIFE globals to ES modules for MV3 compliance and encapsulation.
18. Add TypeScript and strict null checks.
19. Implement a state machine reducer instead of scattered boolean flags.
20. Add Sentry or similar error reporting for production visibility.
21. Implement certificate pinning or public-key pinning for the license server.

---

*Report generated by LAURA — Independent Security & Code Quality Analysis*
*Methodology: Static code analysis, architecture review, security audit, build pipeline verification, compliance heuristic evaluation*
