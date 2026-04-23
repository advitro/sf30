# LAURA Deep Inspection Report V6
## Date: 2026-04-23
## Overall Score: 54/100

> **Mandate:** Brutal, honest, unbiased forensic re-audit of Shift Grabber V9 Chrome Extension (MV3) after the V5→V6 fix sprint.
>
> **Verdict:** The V6 sprint correctly implemented 5 of 7 claimed source-code fixes. However, **2 claimed fixes are broken** — Fix 2 (`SG_SET_ENABLED` handler is unreachable dead code) and Fix 7 (circuit breaker persistence functions exist but are never invoked and contain a storage key bug). These are process failures that undercut the sprint. Score edges up modestly: **52 → 54**.

---

### Fix Verification (V5 → V6)

| # | Claimed Fix | Verified | Notes |
|---|-------------|----------|-------|
| 1 | `Deploy/extension/` stale artifacts deleted | **Yes** | Directory now contains only `README.txt`. Caveat: line 1 has a typo (`pm run build` instead of `npm run build`). |
| 2 | `main.js` `SG_SET_ENABLED` handler stops/resumes polling | **No — BROKEN** | `stopMainLoop()` (`main.js:608-610`) and the `SG_SET_ENABLED` handler (`main.js:616-627`) exist in source. **However, no code path delivers this message to content scripts.** The popup sends `SG_SET_ENABLED` to the service worker only (`popup.js:466`, `popup.js:606`). The SW handles it but never forwards to tabs (`service-worker.js:549-563`). `sendToAllAtoZ` in `popup.js` is not used for this message. Open tabs continue DOM and API polling after the user disables the extension. |
| 3 | `build.js` uses `crypto.randomBytes` for MSG_SECRET | **Yes** | `build.js:156-157` uses `crypto.randomBytes(16).toString("hex")`. Caveat: `build.js:219` still uses `Math.random()` for global name randomization. |
| 4 | `SECURITY-RUNBOOK.md` updated | **Yes** | Integrity hash references removed. Tamper response updated to reflect obfuscation + global name randomization + encrypted tokens. Pre-release checklist cleaned up. |
| 5 | Heartbeat config allowlist | **Yes** | `service-worker.js:114` defines `ALLOWED_CONFIG_KEYS = ["sg_base_ms", "sg_jitter_ms", "sg_burst_count", "sg_turbo"]` and filters at lines 116-118. Caveat: `sg_turbo` is allowed but never read by the service worker. |
| 6 | `fetchServerConfig` HMAC validation | **Yes** | `service-worker.js:677-684` reads response body as text, validates `X-Response-Hmac` with `validateResponseHmac()`, and only parses JSON after HMAC passes. |
| 7 | Circuit breaker persistence across SW restarts | **No — BROKEN** | `persistCircuitBreaker()` (`service-worker.js:28-30`) and `restoreCircuitBreaker()` (`service-worker.js:31-36`) exist. **However:** (a) `persistCircuitBreaker()` writes key `cbLastFailure` (no `sg_` prefix) but `restoreCircuitBreaker()` expects `sg_cb_last`, so `cbLastFailure` is never restored; (b) more critically, `persistCircuitBreaker()` is **never called** — `recordCircuitBreaker()` (`service-worker.js:658-670`) and `circuitBreakerOpen()` (`service-worker.js:643-652`) do not invoke it. The circuit breaker remains in-memory only and resets on every SW restart. |

---

### 1. Security Architecture — 63/100

**What works**
- Heartbeat config is now filtered through an allowlist; arbitrary storage writes from a compromised server are blocked (`service-worker.js:114-123`).
- `fetchServerConfig` now validates HMAC before trusting JSON, closing the MITM config-injection vector (`service-worker.js:677-684`).
- MSG_SECRET is generated with `crypto.randomBytes(16)` instead of `Math.random()` (`build.js:156-157`).
- Stale `Deploy/extension/` artifacts are removed; supply-chain contamination risk is closed.
- Inter-script `postMessage` boundary remains protected by randomized `MSG_SECRET` (`api-layer.js:352` ↔ `main.js:699`).
- AES-GCM-256 + PBKDF2 token encryption at rest remains sound.
- Constant-time HMAC comparison prevents timing attacks (`crypto.js:66-75`).
- Sender ID validation rejects cross-extension messages (`service-worker.js:483-486`).
- Alarm mutex prevents alarm creation races (`service-worker.js:366-378`).

**What is broken or dangerous**
- **P0 — Fix 2 is broken: disabling the extension does not stop content scripts.** The `SG_SET_ENABLED` handler in `main.js:616-627` is unreachable dead code. No sender (popup or SW) broadcasts this message to open AtoZ tabs. When the user flips the master toggle OFF, `main.js` continues its DOM polling loop and `api-layer.js` continues GraphQL polling on every open tab until the tab is reloaded. This is a functional security failure identical to V5.
- **P1 — Fix 7 is broken: circuit breaker does not persist.** `persistCircuitBreaker()` exists but is never invoked by `recordCircuitBreaker()` or `circuitBreakerOpen()`. Additionally, the storage key is mismatched (`cbLastFailure` vs `sg_cb_last`). After an MV3 service worker restart, the circuit breaker resets to closed, allowing immediate retries against a failing server.
- **P1 — License key (`sg_userKey`) is still stored in plaintext** (`popup.js:448`, `service-worker.js:833`).
- **P1 — No certificate pinning** for the license server.
- **P1 — Weak device fingerprint in service worker.** `fingerprint.js:24` uses `document.createElement("canvas")` inside a `try-catch`. In the service worker, `document` is undefined, so the canvas and screen components are silently dropped. The resulting fingerprint is based only on `userAgent + language + timezone + hardwareConcurrency + platform`, which is highly collision-prone. This weakens the encryption key for token storage.
- **P1 — `validateResponseSignature` still hashes a custom concatenation instead of the full response body** (`service-worker.js:749-757`), diverging from the documented server contract (`Deploy/docs/SERVER-CONTRACT.md:112-113`).
- **P1 — Build-time global name replacement still uses `Math.random()`** (`build.js:219`). For a security boundary, this is weak.
- **P1 — Build global name replacement is dangerously naive.** `build.js:225-228` uses `code.split(oldName).join(newName)` with no word-boundary protection, risking corruption of unrelated identifiers, strings, or comments.
- **P1 — `popup.js` stores the license key before verifying it** (`popup.js:448`). If verification fails, the key is still persisted.
- **P1 — `ALLOWED_CONFIG_KEYS` includes `sg_turbo` which the service worker never reads.** Dead config key adds noise without value.

---

### 2. Code Quality & Maintainability — 48/100

**What works**
- Shared constants module reduces magic strings.
- Periodic cleanup of `claimedIds` and `apiClaimNotified` prevents unbounded growth.
- WeakSet deduplication for DOM buttons.

**What is broken or dangerous**
- **P1 — Fix 2 added dead code.** `main.js:607-627` defines `stopMainLoop()` and an `SG_SET_ENABLED` handler that can never fire because no code path sends that message to content scripts. This is architectural debt masquerading as a fix.
- **P1 — Fix 7 added broken dead code.** `persistCircuitBreaker()` (`service-worker.js:28-30`) has a storage key mismatch (`cbLastFailure` vs `sg_cb_last`) and is never invoked. The function is pure technical debt.
- **P1 — Mixed `var`/`let`/`const` across the codebase.** `api-layer.js` is entirely `var`-based while `popup.js` uses modern syntax. Inconsistency suggests copy-paste development without review.
- **P1 — `popup.js` registers two separate `chrome.runtime.onMessage` listeners** (lines 484 and 714) instead of one unified handler.
- **P1 — `popup.js` event handlers do not guard against missing DOM elements.** If the HTML changes, `document.getElementById` returns `null` and subsequent property access throws.
- **P1 — `main.js:613` async `onMessage` listener returns `undefined`.** In Chrome MV3, async listeners should return `true` to keep the message channel open. While most messages are fire-and-forget, this is an anti-pattern that can cause `chrome.runtime.lastError` races.
- **P1 — `config/environments.js` contains orphaned `INTEGRITY_CHECK` and stale circuit-breaker thresholds** (`CIRCUIT_BREAKER_THRESHOLD: 5`, `CIRCUIT_BREAKER_COOLDOWN_MIN: 15`) that diverge from the actual service worker values (`3` failures, `300000` ms = 5 min).
- No linting, no TypeScript, no enforced code style.

---

### 3. MV3 Compliance & Reliability — 55/100

**What works**
- `chrome.alarms` used correctly for scheduling instead of `setInterval`.
- Alarm mutex prevents duplicate alarm creation races.
- `chrome.storage.local` is the single state store.
- `onInstalled` and `onStartup` listeners call `restoreCircuitBreaker()` (even though the restored data is incomplete due to the key bug).
- `visibilitychange` pauses HUD updates (`main.js:815-822`).

**What is broken or dangerous**
- **P1 — Fix 2 broken: disabling the extension does not stop content scripts.** As noted in Security, open tabs continue DOM scanning and API polling after the user toggles OFF.
- **P1 — Fix 7 broken: circuit breaker resets on SW restart.** `persistCircuitBreaker()` is never called, so the circuit breaker state is still in-memory only.
- **P1 — `main.js` DOM polling loop runs even when the tab is hidden.** `startMainLoop` (`main.js:599-606`) never pauses on `visibilitychange`, wasting CPU and battery.
- **P1 — `api-layer.js` poll loop runs even when the tab is hidden.** `startLoop` (`api-layer.js:324-341`) has no `visibilitychange` pause.
- **P1 — `importScripts` with relative path traversal (`../src/shared/`) is non-standard** (`background/service-worker.js:3-5`). While it works in Chrome today, it is fragile and not guaranteed in all packaging scenarios.
- **P1 — Floating promise risk in `onInstalled`.** `flushTelegramQueue()` at `:940` is awaited, but if the service worker sleeps during the flush, queued messages could be lost.

---

### 4. UX & Popup Design — 54/100

**What works**
- Simple / Advanced panel split reduces cognitive load.
- Device limit UI with cooldown messaging.
- GDPR data export button exists.
- Telegram opt-out toggle exists.
- Kill-switch UI feedback.
- Draggable HUD with position memory.

**What is broken or dangerous**
- **P1 — Disabling the extension does not stop grabbing on open tabs.** The user flips the master toggle OFF and sees "OFF" in the popup, but every open AtoZ tab continues DOM scanning and API polling. This is a catastrophic UX lie.
- **P1 — Popup re-verifies license on open if expiry is within 5 minutes.** `popup.js:524` triggers `verifyWithServer` when `st[KEYS.TOKEN_EXP] - nowSec < 300`. While better than V4's every-open re-verify, it still causes unexpected network spinners and server load.
- **P1 — No keyboard navigation or ARIA labels.** Toggle switches in `popup/index.html` lack `tabindex`, `aria-pressed`, and `aria-label`. Screen-reader users are abandoned.
- **P1 — No "show password" toggle on license input.** The input is `type="text"` but the key is sensitive. Users cannot verify long keys easily.
- **P1 — Popup has no responsive layout.** Fixed `310px` min-width (`popup/styles.css:34`) will clip on high-DPI or narrow viewports.
- **P1 — Master toggle has no visual loading state beyond text.** During the 1-2s verification call, the switch moves instantly and can be clicked again.
- **P1 — Toast and HUD styles are injected unconditionally** (`main.js:123-132`, `:207-333`), even when the extension is disabled.
- **P1 — `Deploy/extension/README.txt:1` typo.** Reads `Run pm run build` instead of `npm run build`. Minor but unprofessional in a customer-facing artifact.

---

### 5. Build & DevOps Pipeline — 58/100

**What works**
- `Deploy/extension/` stale artifacts removed; only `README.txt` remains.
- MSG_SECRET now uses cryptographically secure randomness (`build.js:156-157`).
- URL injection search string is correct (`build.js:165`).
- Obfuscation config is aggressive.
- Multi-environment config injection exists.
- CI/CD workflow exists with CodeQL and `npm audit`.
- Cross-platform zip script works.
- Root `build.js` syncs `dist/` → `Deploy/extension/`.

**What is broken or dangerous**
- **P1 — Stale `Deploy/build.js` still exists.** This 207-line legacy script (`Deploy/build.js:173-179`) still contains integrity hash logic and the old broken URL search string. A developer running `node Deploy/build.js` by mistake will produce a broken build with integrity hashes reinjected.
- **P1 — Naive global name replacement can corrupt code.** `build.js:225-228` uses `.split(oldName).join(newName)` with no word-boundary protection.
- **P1 — Build-time global name randomization still uses `Math.random()`** (`build.js:219`), not `crypto.randomBytes`.
- **P1 — No `package-lock.json`.** CI uses `npm install` (`.github/workflows/ci.yml:22`), which is non-reproducible.
- **P1 — `lint` and `test` scripts are still placeholders** (`package.json:8-9`).
- No build verification step. No smoke test of the obfuscated output.
- **P1 — `config/environments.js` references orphaned `INTEGRITY_CHECK` flag** that no longer maps to any code path, and stale circuit-breaker constants that diverge from runtime values.

---

### 6. Documentation Completeness — 55/100

**What works**
- `SECURITY-RUNBOOK.md` no longer documents integrity hash injection.
- Customer-facing docs (`README-Install.md`, `README-Activate.md`, `TROUBLESHOOTING.md`) are clear.
- Privacy Policy and Terms of Service exist.
- Some JSDoc in `service-worker.js`.

**What is broken or dangerous**
- **P1 — `CHANGELOG.md` does not mention V5 or V6 fixes.** The most recent entry is `2.1.0 — 2026-04-22`, which predates both fix sprints. None of the 14 claimed fixes across V5 and V6 are documented.
- **P1 — `SERVER-CONTRACT.md` contradicts the code.** The contract states all responses must include HMAC and the extension must verify it. The `verifyLicense` handler uses `validateResponseSignature` which hashes a custom concatenation, not the full response body. The contract also documents `/refresh` endpoint which the extension does not appear to call directly (it uses `/verify` for refreshes via `refreshTokenInBackground`).
- **P1 — No inline JSDoc** in `main.js`, `api-layer.js`, or `popup.js`.
- No Architecture Decision Records (ADRs).
- No developer onboarding guide.
- No API spec beyond the server contract.
- **P1 — `Deploy/extension/README.txt` typo** (`pm run build`) undermines customer-facing documentation quality.

---

### 7. Testing & Verification — 38/100

**What works**
- E2E smoke test scaffold exists.
- Crypto unit test exists.
- `npm audit` runs in CI.
- CodeQL runs in CI.

**What is broken or dangerous**
- **P1 — E2E test does not exercise core functionality.** It tests popup rendering, panel toggle, license input, and storage API — but never license verification, alarm scheduling, token refresh, or the encrypted token lifecycle. Critically, it does not test that disabling the extension stops content script polling.
- **P1 — CI does not run the E2E test.** The workflow has no step for `npm run test:e2e`.
- **P1 — `lint` and `test` scripts are placeholders.** `package.json:8-9` echoes strings. The CI lint step always passes trivially.
- **P1 — Crypto unit test is not wired into CI.** `test/crypto.test.js` exists but `npm test` does not run it.
- No unit tests for `loadEncryptedToken`, `scheduleNextBurstAnchor`, alarm mutex behavior, `validateMessage`, or `poissonDelay` edge cases.
- No coverage reporting.
- No build verification step to confirm the obfuscated extension loads without syntax errors.
- **P1 — No test asserts that `Deploy/extension/` only contains the README after build.** A basic CI assertion would catch stale artifact regressions.
- **P1 — No test asserts that `SG_SET_ENABLED` reaches content scripts and stops polling.** This would have caught Fix 2.
- **P1 — No test asserts that `recordCircuitBreaker()` persists state.** This would have caught Fix 7.

---

### 8. Compliance & Legal — 54/100

**What works**
- Privacy Policy and Terms of Service exist.
- GDPR data export feature exists.
- Telegram opt-out toggle exists.
- Data retention is mentioned in the privacy policy.
- No third-party analytics or tracking libraries.
- Server config push is now allowlisted, reducing arbitrary data modification risk.

**What is broken or dangerous**
- **P1 — Telegram is opt-out, not opt-in.** The privacy policy claims Telegram is "opt-in" (`Deploy/docs/PRIVACY-POLICY.md:22`), but `sg_tg_opt_out` defaults to `false` and the toggle defaults to checked (`popup.js:513`). Users are enrolled by default if credentials are configured.
- **P1 — No explicit user consent before transmitting PII to the license server.** `verifyLicense` sends `deviceId`, `fingerprint`, and `key` to the server without a first-run consent dialog.
- **P1 — Popup re-verifies on open** (when token nears expiry), causing unnecessary PII transmission without user knowledge.
- **P1 — No "Delete My Data" / right to erasure.** Uninstalling leaves data in `chrome.storage.local`.
- **P1 — Data retention statements are vague.** No concrete retention period is specified.
- **P1 — Terms of Service lack jurisdiction / governing law clause.**
- **P1 — Export includes encrypted tokens and sensitive metadata without a warning.** The user downloads a JSON blob containing `sg_enc_token`, `sg_userKey`, `sg_device_id`, etc.

---

## Weighted Final Score: 54/100

| Dimension | Raw | Weight | Weighted |
|-----------|-----|--------|----------|
| 1. Security Architecture | 63 | 20% | 12.60 |
| 2. Code Quality & Maintainability | 48 | 15% | 7.20 |
| 3. MV3 Compliance & Reliability | 55 | 15% | 8.25 |
| 4. UX & Popup Design | 54 | 10% | 5.40 |
| 5. Build & DevOps Pipeline | 58 | 10% | 5.80 |
| 6. Documentation Completeness | 55 | 10% | 5.50 |
| 7. Testing & Verification | 38 | 10% | 3.80 |
| 8. Compliance & Legal | 54 | 10% | 5.40 |
| **TOTAL** | — | — | **53.95** |

*(Rounded to 54/100 for headline score.)*

---

## Critical Issues (P0)

1. **Fix 2 is broken — `SG_SET_ENABLED` handler in `main.js` is unreachable dead code.** The handler at `main.js:616-627` correctly stops `startMainLoop()` and calls `stopApiPolling()`, but **no sender delivers `SG_SET_ENABLED` to content scripts.** The popup sends it to the service worker only (`popup.js:466`, `popup.js:606`). The service worker handles it but never forwards to tabs (`service-worker.js:549-563`). The `sendToAllAtoZ` helper in `popup.js` exists but is not used for this message type. The result is identical to V5: when the user disables the extension, every open AtoZ tab continues DOM scanning and GraphQL polling indefinitely.

2. **Fix 7 is broken — circuit breaker persistence is non-functional.** `persistCircuitBreaker()` (`service-worker.js:28-30`) contains a storage key mismatch: it writes `cbLastFailure` (no `sg_` prefix) but `restoreCircuitBreaker()` (`service-worker.js:35`) expects `sg_cb_last`. More critically, `persistCircuitBreaker()` is **never invoked** — neither `recordCircuitBreaker()` (`service-worker.js:658-670`) nor `circuitBreakerOpen()` (`service-worker.js:643-652`) call it. The circuit breaker remains purely in-memory and resets to closed on every MV3 service worker restart.

---

## Warnings (P1)

1. **`Deploy/build.js` is a stale trap.** It still contains integrity hash logic and the old broken URL search string. Any developer running it will produce a broken build.
2. **`CHANGELOG.md` is silent on V5 and V6.** None of the 14 fixes across both sprints are documented.
3. **`SERVER-CONTRACT.md` contradicts the code.** `validateResponseSignature` hashes a custom concatenation, not the full response body.
4. **License key stored in plaintext** (`popup.js:448`, `service-worker.js:833`).
5. **Weak service-worker fingerprint** drops canvas and screen components, producing collision-prone encryption keys.
6. **`validateResponseSignature` hashes custom concatenation** instead of full response body (`service-worker.js:749-757`).
7. **Build-time global name replacement uses `Math.random()`** (`build.js:219`).
8. **Naive `.split().join()` global name replacement** can corrupt code (`build.js:225-228`).
9. **DOM and API polling loops run when tab is hidden.** Wastes CPU and battery.
10. **`popup.js` has two `onMessage` listeners.**
11. **`popup.js` event handlers unguarded** against missing DOM elements.
12. **Mixed `var`/`let`/`const`** across codebase.
13. **No `package-lock.json`.**
14. **`lint` and `test` scripts are placeholders.**
15. **CI does not run E2E tests.**
16. **No build verification step.**
17. **Telegram is opt-out by default.**
18. **No explicit consent for server data transmission.**
19. **No "Delete My Data" button.**
20. **Vague data retention statements.**
21. **Terms lack jurisdiction clause.**
22. **Export includes sensitive data without warning.**
23. **Popup lacks responsive layout, ARIA, and show-password toggle.**
24. **Toast and HUD styles injected unconditionally.**
25. **`Deploy/extension/README.txt` typo** (`pm run build`).
26. **`config/environments.js` orphaned keys** (`INTEGRITY_CHECK`, stale circuit-breaker thresholds).
27. **`ALLOWED_CONFIG_KEYS` includes unused `sg_turbo` key.**
28. **`main.js:613` async `onMessage` listener returns `undefined`.**

---

## Recommendations for 100/100

**Immediate (fix before any release)**
1. **Fix Fix 2 properly.** The popup must broadcast `SG_SET_ENABLED` to all open AtoZ tabs via `chrome.tabs.sendMessage`, or the service worker must relay it. The `sendToAllAtoZ` helper in `popup.js` should be used for `SG_SET_ENABLED` in both `handleMasterToggle` and the `enableToggle` listener.
2. **Fix Fix 7 properly.** Wire `persistCircuitBreaker()` into `recordCircuitBreaker()` and `circuitBreakerOpen()`. Correct the storage key from `cbLastFailure` to `sg_cb_last` in `persistCircuitBreaker()`.
3. **Delete or archive `Deploy/build.js`.** Having two build scripts where one is broken is a trap.
4. **Update `CHANGELOG.md`.** Document all V5 and V6 fixes, the stale artifact issue, and any known remaining issues.
5. **Fix `Deploy/extension/README.txt` typo.** Change `pm run build` to `npm run build`.

**Short-term**
6. Store license key encrypted at rest, not plaintext.
7. Replace `Math.random()` in `build.js:219` with `crypto.randomBytes` for global name randomization.
8. Replace naive `.split().join()` global name replacement with AST-aware replacement or regex word boundaries (`\b`).
9. Add `package-lock.json` and change CI to `npm ci`.
10. Replace placeholder `lint` / `test` scripts with real ESLint and Vitest/Jest suites.
11. Add unit tests for `loadEncryptedToken`, `scheduleNextBurstAnchor`, alarm mutex behavior, `validateMessage`, `poissonDelay`, and the query rotation logic.
12. Update E2E test to assert license verification, alarm scheduling, token refresh flows, and that disabling stops content script polling.
13. Fix `validateResponseSignature` to hash the full JSON response body, matching the server contract.
14. Implement a true first-run consent flow and a "Delete My Data" button that calls `chrome.storage.local.clear()`.
15. Pause `main.js` and `api-layer.js` polling loops when `document.hidden` is true.
16. Return `true` from async `chrome.runtime.onMessage` listeners to keep channels open correctly.

**Long-term**
17. Migrate from IIFE globals to ES modules for MV3 compliance and encapsulation.
18. Add TypeScript and strict null checks.
19. Implement a state machine reducer instead of scattered boolean flags.
20. Add Sentry or similar error reporting for production visibility.
21. Implement certificate pinning or public-key pinning for the license server.

---

*Report generated by LAURA — Independent Security & Code Quality Analysis*
*Methodology: Static code analysis, architecture review, security audit, build pipeline verification, compliance heuristic evaluation*
