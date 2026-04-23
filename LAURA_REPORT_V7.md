# LAURA Deep Inspection Report V7
## Date: 2026-04-23
## Overall Score: 55/100

> **Mandate:** Brutal, honest, unbiased forensic re-audit of Shift Grabber V9 Chrome Extension (MV3) after the V6→V7 fix sprint.
>
> **Verdict:** The V7 sprint correctly implemented 2 of 3 claimed fixes. **Fix 3 (README typo) is still broken.** Additionally, inspection discovered a **new P0 bug**: `manifest.json` CSP and `host_permissions` hardcode `shift-grabber.vercel.app` and are **never updated by the build pipeline** for production/staging environments, guaranteeing a broken build for any non-Vercel deployment. Score edges up modestly: **54 → 55**.

---

### Fix Verification (V6 → V7)

| # | Claimed Fix | Verified | Notes |
|---|-------------|----------|-------|
| 1 | `SG_SET_ENABLED` Routing [Functional] | **Yes** | `service-worker.js:552-556` now queries AtoZ tabs and broadcasts `SG_SET_ENABLED` via `chrome.tabs.sendMessage`. Content scripts in `main.js:616-627` receive it and correctly call `stopMainLoop()` / `stopApiPolling()` (disable) or `startMainLoop()` / `startApiPolling()` (enable). The unreachable dead code from V6 is now reachable. |
| 2 | Circuit Breaker Persistence [MV3 Reliability] | **Yes** | `circuitBreakerOpen()` (`service-worker.js:648-658`) now calls `persistCircuitBreaker()` when transitioning to half-open. `recordCircuitBreaker()` (`service-worker.js:664-677`) now calls `persistCircuitBreaker()` after every state change. The storage keys in `persistCircuitBreaker()` (`service-worker.js:28-30`) now correctly use the `sg_cb_` prefix (`sg_cb_failures`, `sg_cb_open`, `sg_cb_last`), matching `restoreCircuitBreaker()` (`service-worker.js:31-36`). |
| 3 | README Typo (`npm run build`) | **No — BROKEN** | `Deploy/extension/README.txt` line 1 still reads `Run ` and line 2 reads `pm run build...`. Concatenated, it still says `Run pm run build`. The claimed fix was not applied. |

---

### 1. Security Architecture — 65/100

**What works**
- Disabling the extension now **actually stops** DOM scanning and API polling on all open AtoZ tabs (`service-worker.js:552-556` → `main.js:616-627`). This closes the V5/V6 P0 functional security failure.
- Circuit breaker state now survives MV3 service worker restarts (`persistCircuitBreaker()` correctly wired and keyed).
- Heartbeat config allowlist, HMAC validation on `/config`, AES-GCM-256 token encryption, constant-time HMAC comparison, sender ID validation, and alarm mutex all remain sound.
- Inter-script `postMessage` boundary remains protected by randomized `MSG_SECRET` (`api-layer.js:352` ↔ `main.js:699`).

**What is broken or dangerous**
- **P0 — `manifest.json` CSP and `host_permissions` hardcode `shift-grabber.vercel.app` and are never updated during build.** `build.js` injects `ENV_CONFIG.SERVER_URL` into `constants.js` (line 165), but `manifest.json` is copied as-is (line 200). For production builds (`SERVER_URL: "https://shiftgrabber.net"`) or staging builds, the extension will attempt to connect to a domain not listed in `connect-src` or `host_permissions`, causing CSP violations and blocked network requests. This is a broken build pipeline that guarantees a non-functional extension in production unless manual manifest edits are made. (`manifest.json:8`, `manifest.json:13`; `build.js:200`).
- **P1 — License key (`sg_userKey`) is still stored in plaintext** (`popup.js:448`, `service-worker.js:840`).
- **P1 — No certificate pinning** for the license server.
- **P1 — Weak device fingerprint in service worker.** `fingerprint.js:24` uses `document.createElement("canvas")` inside a `try-catch`. In the service worker, `document` is undefined, so the canvas and screen components are silently dropped. The resulting fingerprint is based only on `userAgent + language + timezone + hardwareConcurrency + platform`, which is highly collision-prone. This weakens the encryption key for token storage.
- **P1 — `validateResponseSignature` still hashes a custom concatenation instead of the full response body** (`service-worker.js:756-764`), diverging from the documented server contract (`Deploy/docs/SERVER-CONTRACT.md:112-113`).
- **P1 — Build-time global name replacement still uses `Math.random()`** (`build.js:219`). For a security boundary, this is weak.
- **P1 — Build global name replacement is dangerously naive.** `build.js:225-228` uses `code.split(oldName).join(newName)` with no word-boundary protection, risking corruption of unrelated identifiers, strings, or comments.
- **P1 — `popup.js` stores the license key before verifying it** (`popup.js:448`). If verification fails, the key is still persisted.
- **P1 — `ALLOWED_CONFIG_KEYS` includes `sg_turbo` which the service worker never reads.** Dead config key adds noise without value (`service-worker.js:114`).

---

### 2. Code Quality & Maintainability — 50/100

**What works**
- Shared constants module reduces magic strings.
- Periodic cleanup of `claimedIds` and `apiClaimNotified` prevents unbounded growth.
- WeakSet deduplication for DOM buttons.
- The previously dead `SG_SET_ENABLED` handler and circuit breaker persistence functions are now live, correct code.

**What is broken or dangerous**
- **P1 — `main.js` DOM polling loop (`startMainLoop`) continues running when the API token expires.** `updateHUD()` (`main.js:408-423`) calls `stopApiPolling()` on token expiry but does **not** call `stopMainLoop()`. The DOM scanner keeps clicking "Add Shift" buttons even when the popup/badge shows "NO KEY". This is inconsistent with the state machine and wastes CPU. (`main.js:412-415`).
- **P1 — Mixed `var`/`let`/`const` across the codebase.** `api-layer.js` is entirely `var`-based while `popup.js` uses modern syntax. Inconsistency suggests copy-paste development without review.
- **P1 — `popup.js` registers two separate `chrome.runtime.onMessage` listeners** (lines 484 and 714) instead of one unified handler.
- **P1 — `popup.js` event handlers do not guard against missing DOM elements.** If the HTML changes, `document.getElementById` returns `null` and subsequent property access throws.
- **P1 — `main.js:613` async `onMessage` listener returns `undefined`.** In Chrome MV3, async listeners should return `true` to keep the message channel open. While most messages are fire-and-forget, this is an anti-pattern that can cause `chrome.runtime.lastError` races.
- **P1 — `config/environments.js` contains orphaned `INTEGRITY_CHECK` and stale circuit-breaker thresholds** (`CIRCUIT_BREAKER_THRESHOLD: 5`, `CIRCUIT_BREAKER_COOLDOWN_MIN: 15`) that diverge from the actual service worker values (`3` failures, `300000` ms = 5 min).
- `.eslintrc.json` exists but the `lint` script is still a placeholder — no enforced code style.

---

### 3. MV3 Compliance & Reliability — 62/100

**What works**
- `chrome.alarms` used correctly for scheduling instead of `setInterval`.
- Alarm mutex prevents duplicate alarm creation races.
- `chrome.storage.local` is the single state store.
- `onInstalled` and `onStartup` listeners call `restoreCircuitBreaker()` with correct keys.
- `visibilitychange` pauses HUD updates (`main.js:815-822`).
- Disabling the extension now reliably stops all content script activity across tabs.
- Circuit breaker now reliably persists across SW restarts.

**What is broken or dangerous**
- **P1 — `main.js` DOM polling loop runs even when the tab is hidden.** `startMainLoop` (`main.js:599-606`) never pauses on `visibilitychange`, wasting CPU and battery.
- **P1 — `api-layer.js` poll loop runs even when the tab is hidden.** `startLoop` (`api-layer.js:324-341`) has no `visibilitychange` pause.
- **P1 — `importScripts` with relative path traversal (`../src/shared/`) is non-standard** (`background/service-worker.js:3-5`). While it works in Chrome today, it is fragile and not guaranteed in all packaging scenarios.
- **P1 — Floating promise risk in `onInstalled`.** `flushTelegramQueue()` at `:947` is awaited, but if the service worker sleeps during the flush, queued messages could be lost.
- **P1 — `main.js` DOM loop continues when token expires** (as noted in Code Quality), creating inconsistent runtime behavior.

---

### 4. UX & Popup Design — 60/100

**What works**
- Simple / Advanced panel split reduces cognitive load.
- Device limit UI with cooldown messaging.
- GDPR data export button exists.
- Telegram opt-out toggle exists.
- Kill-switch UI feedback.
- Draggable HUD with position memory.
- **Disabling the extension now actually stops grabbing on open tabs** — the catastrophic UX lie from V5/V6 is finally closed.

**What is broken or dangerous**
- **P1 — `Deploy/extension/README.txt` typo still present.** Reads `Run pm run build` instead of `npm run build`. This was claimed as fixed in V7 but was not. A broken customer-facing artifact undermines trust.
- **P1 — Popup re-verifies license on open if expiry is within 5 minutes.** `popup.js:524` triggers `verifyWithServer` when `st[KEYS.TOKEN_EXP] - nowSec < 300`. While better than V4's every-open re-verify, it still causes unexpected network spinners and server load.
- **P1 — No keyboard navigation or ARIA labels.** Toggle switches in `popup/index.html` lack `tabindex`, `aria-pressed`, and `aria-label`. Screen-reader users are abandoned.
- **P1 — No "show password" toggle on license input.** The input is `type="text"` but the key is sensitive. Users cannot verify long keys easily.
- **P1 — Popup has no responsive layout.** Fixed `310px` min-width (`popup/styles.css:34`) will clip on high-DPI or narrow viewports.
- **P1 — Master toggle has no visual loading state beyond text.** During the 1-2s verification call, the switch moves instantly and can be clicked again.
- **P1 — Toast and HUD styles are injected unconditionally** (`main.js:123-132`), even when the extension is disabled.

---

### 5. Build & DevOps Pipeline — 50/100

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
- **P0 — `manifest.json` CSP and `host_permissions` are not environment-aware.** The build pipeline updates `constants.js` with the environment server URL but leaves the manifest hardcoded to `shift-grabber.vercel.app`. Production and staging builds will fail with CSP violations unless the manifest is manually edited. (`build.js:200`, `manifest.json:8,13`).
- **P1 — Stale `Deploy/build.js` still exists.** This 207-line legacy script (`Deploy/build.js:167-168`) still contains integrity hash logic, the old broken URL search string, and a fallback HMAC key of `"change-me-in-production"`. A developer running `node Deploy/build.js` by mistake will produce a broken build with integrity hashes reinjected and the wrong HMAC placeholder regex.
- **P1 — Naive global name replacement can corrupt code.** `build.js:225-228` uses `.split(oldName).join(newName)` with no word-boundary protection.
- **P1 — Build-time global name randomization still uses `Math.random()`** (`build.js:219`), not `crypto.randomBytes`.
- **P1 — No `package-lock.json`.** CI uses `npm install` (`.github/workflows/ci.yml:22`), which is non-reproducible.
- **P1 — `lint` and `test` scripts are still placeholders** (`package.json:8-9`).
- No build verification step. No smoke test of the obfuscated output.
- **P1 — `config/environments.js` references orphaned `INTEGRITY_CHECK` flag** that no longer maps to any code path, and stale circuit-breaker constants that diverge from runtime values.
- **P1 — Claimed README typo fix was not applied.**

---

### 6. Documentation Completeness — 52/100

**What works**
- `SECURITY-RUNBOOK.md` no longer documents integrity hash injection.
- Customer-facing docs (`README-Install.md`, `README-Activate.md`, `TROUBLESHOOTING.md`) are clear.
- Privacy Policy and Terms of Service exist.
- Some JSDoc in `service-worker.js`.

**What is broken or dangerous**
- **P1 — `CHANGELOG.md` does not mention V5, V6, or V7 fixes.** The most recent entry is `2.1.0 — 2026-04-22`, which predates all three fix sprints. None of the claimed fixes are documented.
- **P1 — `SERVER-CONTRACT.md` contradicts the code.** The contract states all responses must include HMAC of the full response body. The `verifyLicense` handler uses `validateResponseSignature` which hashes a custom concatenation, not the full response body. The contract also documents `/refresh` endpoint which the extension does not appear to call directly (it uses `/verify` for refreshes via `refreshTokenInBackground`).
- **P1 — No inline JSDoc** in `main.js`, `api-layer.js`, or `popup.js`.
- No Architecture Decision Records (ADRs).
- No developer onboarding guide.
- No API spec beyond the server contract.
- **P1 — `Deploy/extension/README.txt` typo** (`pm run build`) undermines customer-facing documentation quality and was claimed fixed but wasn't.

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
- **P1 — No test asserts that `SG_SET_ENABLED` reaches content scripts and stops polling.** This would have caught the V5/V6 bug.
- **P1 — No test asserts that `recordCircuitBreaker()` persists state.** This would have caught the V6 bug.

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

## Weighted Final Score: 55/100

| Dimension | Raw | Weight | Weighted |
|-----------|-----|--------|----------|
| 1. Security Architecture | 65 | 20% | 13.00 |
| 2. Code Quality & Maintainability | 50 | 15% | 7.50 |
| 3. MV3 Compliance & Reliability | 62 | 15% | 9.30 |
| 4. UX & Popup Design | 60 | 10% | 6.00 |
| 5. Build & DevOps Pipeline | 50 | 10% | 5.00 |
| 6. Documentation Completeness | 52 | 10% | 5.20 |
| 7. Testing & Verification | 38 | 10% | 3.80 |
| 8. Compliance & Legal | 54 | 10% | 5.40 |
| **TOTAL** | — | — | **55.20** |

*(Rounded to 55/100 for headline score.)*

---

## Critical Issues (P0)

1. **New — `manifest.json` CSP and `host_permissions` hardcode `shift-grabber.vercel.app` and are never updated by the build pipeline.** `build.js` injects the environment-specific `SERVER_URL` into `constants.js` but copies `manifest.json` unchanged. For production (`shiftgrabber.net`) or staging builds, the extension will violate its own CSP and fail to connect to the license server. This guarantees a broken production build unless manual manifest edits are performed outside the build script. (`manifest.json:8,10-14`; `build.js:165,200`).

2. **Fix 3 claimed but not delivered — `Deploy/extension/README.txt` typo persists.** The V7 changelog claims this was fixed, but the file still reads `Run pm run build` (line 1 concatenated with line 2). This is a process failure: the team marked a task complete without verifying the file content.

---

## Warnings (P1)

1. **`Deploy/build.js` is a stale trap.** It still contains integrity hash logic, the old broken URL search string, and a weak HMAC fallback. Any developer running it will produce a broken build.
2. **`main.js` DOM loop continues when token expires.** `updateHUD()` suspends API polling but leaves `startMainLoop()` running, so DOM button scanning continues indefinitely even with an expired token.
3. **`CHANGELOG.md` is silent on V5, V6, and V7.** None of the fixes across all three sprints are documented.
4. **`SERVER-CONTRACT.md` contradicts the code.** `validateResponseSignature` hashes a custom concatenation, not the full response body.
5. **License key stored in plaintext** (`popup.js:448`, `service-worker.js:840`).
6. **Weak service-worker fingerprint** drops canvas and screen components, producing collision-prone encryption keys.
7. **`validateResponseSignature` hashes custom concatenation** instead of full response body (`service-worker.js:756-764`).
8. **Build-time global name replacement uses `Math.random()`** (`build.js:219`).
9. **Naive `.split().join()` global name replacement** can corrupt code (`build.js:225-228`).
10. **DOM and API polling loops run when tab is hidden.** Wastes CPU and battery.
11. **`popup.js` has two `onMessage` listeners.**
12. **`popup.js` event handlers unguarded** against missing DOM elements.
13. **Mixed `var`/`let`/`const`** across codebase.
14. **No `package-lock.json`.**
15. **`lint` and `test` scripts are placeholders.**
16. **CI does not run E2E tests.**
17. **No build verification step.**
18. **Telegram is opt-out by default.**
19. **No explicit consent for server data transmission.**
20. **No "Delete My Data" button.**
21. **Vague data retention statements.**
22. **Terms lack jurisdiction clause.**
23. **Export includes sensitive data without warning.**
24. **Popup lacks responsive layout, ARIA, and show-password toggle.**
25. **Toast and HUD styles injected unconditionally.**
26. **`config/environments.js` orphaned keys** (`INTEGRITY_CHECK`, stale circuit-breaker thresholds).
27. **`ALLOWED_CONFIG_KEYS` includes unused `sg_turbo` key.**
28. **`main.js:613` async `onMessage` listener returns `undefined`.**

---

## Recommendations for 100/100

**Immediate (fix before any release)**
1. **Fix the manifest.json environment injection.** `build.js` must rewrite `manifest.json` CSP `connect-src` and `host_permissions` to match `ENV_CONFIG.SERVER_URL` before copying to `dist/`.
2. **Actually fix the README typo.** Change `Deploy/extension/README.txt` to read `Run npm run build` on a single line.
3. **Delete or archive `Deploy/build.js`.** Having two build scripts where one is broken is a trap.
4. **Update `CHANGELOG.md`.** Document all V5, V6, and V7 fixes, the stale artifact issue, and any known remaining issues.
5. **Pause `main.js` DOM loop when token expires.** Call `stopMainLoop()` inside the `!hasToken` branch of `updateHUD()` (line 412-415).

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
