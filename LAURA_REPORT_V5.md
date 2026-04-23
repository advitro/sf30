# LAURA Deep Inspection Report V5
## Date: 2026-04-23
## Overall Score: 52/100

> **Mandate:** Brutal, honest, unbiased forensic re-audit of Shift Grabber V9 Chrome Extension (MV3) after the V4→V5 fix sprint.
>
> **Verdict:** The V5 sprint correctly implemented 6 of 8 claimed source-code fixes. However, the build artifacts in `Deploy/extension/` were **never rebuilt** and still contain every pre-V5 bug. Additionally, `SECURITY-RUNBOOK.md` documents security features that no longer exist, and a new functional bug means disabling the extension does not stop grabbing on open tabs. Score edges up modestly: **50 → 52**.

---

### Fix Verification (V4 → V5)

| # | Claimed Fix | Verified | Notes |
|---|-------------|----------|-------|
| 1 | Popup token blindness | **Yes (source)** | `popup.js:225` now checks `exp && exp > now`. `popup.js:524` now checks `!st[KEYS.TOKEN_EXP]`. `updateStatusBadge()` (`popup.js:348`) now reads `KEYS.TOKEN_EXP` and shows `NO KEY`. **Caveat:** `Deploy/extension/popup/popup.js` is stale and still checks `!st[KEYS.ACCESS_TOKEN]`, showing the old bug. |
| 2 | Build.js URL injection | **Yes** | `build.js:165` now searches for `"https://shift-grabber.vercel.app"`, matching the actual string in `src/shared/constants.js:68`. Production builds will correctly inject the environment URL. |
| 3 | api-layer.js operation name desync | **Yes** | `api-layer.js:268-271` now snapshots `idx = currentQueryIndex % POLL_Q_SET.length` and uses it for both `pollQ` and `pollOpName` before incrementing. The off-by-one-sequence bug is closed. |
| 4 | sendTelegram timeout | **Yes** | `background/service-worker.js:258` now includes `signal: AbortSignal.timeout(10000)`. The indefinite hang vector is closed. |
| 5 | Integrity hash removed | **Partial** | `checkIntegrity()` is gone from source `service-worker.js`. `verifyLicense()` no longer stores `sg_integrity_hash`. Root `build.js` no longer computes or injects integrity hashes. `Deploy/docs/SERVER-CONTRACT.md` no longer documents `integrityHash`. **However:** `Deploy/build.js` (stale secondary build script at `Deploy/build.js:173-179`) still contains integrity hash logic. `SECURITY-RUNBOOK.md:17-20` and `:31-32` still describe integrity checks as active. This is documentation rot and a process trap. |
| 6 | onStartup alarm race | **Yes** | `service-worker.js:927-932` now wraps `startOverrideTick` / `scheduleNextBurstAnchor` inside the same `withAlarmLock()` block used for alarm initialization. The narrow race is closed. |
| 7 | main.js + api-layer.js MSG_SECRET | **Yes** | `api-layer.js:192, :239, :247, :261` all include `secret: SG_CONSTS.MSG_SECRET` in outbound `postMessage` calls. `main.js:682-686` validates `e.data.secret === SG_CONSTS.MSG_SECRET` before processing `SG_EID`, `SG_RATE_LIMITED`, and `SG_CLAIM_RESULT`. The spoofing vector from V4 is closed. |
| 8 | fetchServerConfig version hardcode | **Yes** | `background/service-worker.js:656` now uses `${chrome.runtime.getManifest().version}` instead of hardcoded `"2.0.0"`. |

---

### 1. Security Architecture — 60/100

**What works**
- Inter-script `postMessage` boundary is now protected by a randomized `MSG_SECRET` verified in both directions (`api-layer.js:352` ↔ `main.js:682`). Page scripts can no longer trivially spoof claim results.
- Telegram fetch timeout prevents indefinite SW hangs (`service-worker.js:258`).
- Token blindness is resolved in source code; HUD, popup badge, and token expiry guard now derive state from `sg_token_exp`.
- AES-GCM-256 + PBKDF2 token encryption at rest remains sound.
- Constant-time HMAC comparison prevents timing attacks.
- Heartbeat HMAC validation closes the MITM kill-switch vector.
- Alarm mutex prevents alarm creation races.
- Sender ID validation rejects cross-extension messages.

**What is broken or dangerous**
- **P0 — `Deploy/extension/` contains stale, pre-V5 build artifacts.** The files in this directory still contain all V4 bugs: integrity hash logic, no `MSG_SECRET`, token-blind popup, operation-name desync, no Telegram timeout, and no alarm lock in `onStartup`. If a user or CI installs from `Deploy/extension/`, they receive the broken V4 build. This is a supply-chain contamination risk.
- **P1 — License key (`sg_userKey`) is still stored in plaintext** (`popup.js:448`, `service-worker.js:807`).
- **P1 — No certificate pinning** for the license server.
- **P1 — Weak device fingerprint in service worker.** `fingerprint.js:24` uses `document.createElement("canvas")` inside a `try-catch`. In the service worker, `document` is undefined, so the canvas and screen components are silently dropped. The resulting fingerprint is based only on `userAgent + language + timezone + hardwareConcurrency + platform`, which is highly collision-prone. This weakens the encryption key for token storage.
- **P1 — Heartbeat config push has no key allowlist.** A compromised server can push arbitrary config objects (`json.config`) into `chrome.storage.local` after passing HMAC validation (`service-worker.js:102-104`).
- **P1 — `/config` fetch (`fetchServerConfig`) has no HMAC validation at all.** Unlike `/verify` and `/heartbeat`, the remote config endpoint is fetched without signature verification (`service-worker.js:654-664`). A MITM or compromised DNS can inject stealth parameters.
- **P1 — `validateResponseSignature` still hashes a custom concatenation instead of the full response body** (`service-worker.js:723-730`), diverging from the documented server contract.
- **P1 — Build-time message secret uses `Math.random()`** (`build.js:156`). This is not cryptographically secure. An attacker with knowledge of the build timestamp and Node version could narrow the secret space significantly.
- **P1 — Disabling the extension does not stop content script activity.** `main.js` has no handler for `SG_SET_ENABLED`. When the user turns the master toggle OFF, the service worker stops alarms, but `main.js` continues its DOM polling loop (`startMainLoop`) and `api-layer.js` continues GraphQL polling on every open AtoZ tab until the tab is reloaded. This is a functional security failure.

---

### 2. Code Quality & Maintainability — 50/100

**What works**
- Operation name / query shape desync is fixed (`api-layer.js:268-271`).
- Shared constants module reduces magic strings.
- Alarm mutex prevents races.
- Periodic cleanup of `claimedIds` and `apiClaimNotified` prevents unbounded growth.
- WeakSet deduplication for DOM buttons.

**What is broken or dangerous**
- **P1 — `main.js` missing `SG_SET_ENABLED` handler.** The content script never stops its polling loops when the extension is disabled. This is a clear architectural oversight.
- **P1 — Mixed `var`/`let`/`const` across the codebase.** `api-layer.js` is entirely `var`-based while `popup.js` uses modern syntax. Inconsistency suggests copy-paste development without review.
- **P1 — `popup.js` registers two separate `chrome.runtime.onMessage` listeners** (lines 484 and 714) instead of one unified handler.
- **P1 — `popup.js` event handlers do not guard against missing DOM elements.** If the HTML changes, `document.getElementById` returns `null` and subsequent property access throws.
- **P1 — `build.js` global name replacement is dangerously naive.** `build.js:225-226` uses `code.split(oldName).join(newName)`. This will replace substrings inside unrelated identifiers, strings, or comments.
- **P1 — `popup.js` simple-mode `handleMasterToggle` stores the license key before verifying it.** (`popup.js:448`). If verification fails, the key is still persisted.
- **P1 — `config/environments.js` contains orphaned `INTEGRITY_CHECK` keys** that no longer map to any runtime behavior.
- No linting, no TypeScript, no enforced code style.

---

### 3. MV3 Compliance & Reliability — 58/100

**What works**
- `chrome.alarms` used correctly for scheduling instead of `setInterval`.
- Alarm mutex prevents duplicate alarm creation races.
- `chrome.storage.local` is the single state store.
- `onInstalled` and `onStartup` listeners handle initialization and now correctly use the mutex for burst scheduling.
- `visibilitychange` pauses HUD updates (`main.js:799-806`).

**What is broken or dangerous**
- **P1 — Disabling the extension does not stop content scripts.** As noted in Security, `main.js` lacks a handler for `SG_SET_ENABLED`. Open tabs continue grabbing indefinitely after the user toggles OFF.
- **P1 — `main.js` DOM polling loop runs even when the tab is hidden.** `startMainLoop` (`main.js:599-606`) never pauses on `visibilitychange`, wasting CPU and battery.
- **P1 — `api-layer.js` poll loop runs even when the tab is hidden.** `startLoop` (`api-layer.js:324-341`) has no `visibilitychange` pause.
- **P1 — `importScripts` with relative path traversal (`../src/shared/`) is non-standard** (`background/service-worker.js:3-5`). While it works in Chrome today, it is fragile and not guaranteed in all packaging scenarios.
- **P1 — Circuit breaker state is in-memory only.** `cbFailures`, `cbOpen`, and `cbLastFailure` are module-level `let`s. If the service worker restarts (common in MV3), the circuit breaker resets to closed, allowing immediate retries against a failing server.
- **P1 — Floating promise risk in `onInstalled`.** `flushTelegramQueue()` at `:913` is awaited, but if the service worker sleeps during the flush, queued messages could be lost.

---

### 4. UX & Popup Design — 56/100

**What works**
- Token blindness is fixed in source; popup now correctly reflects token status.
- `NO KEY` badge state added (`popup.js:356-358`).
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

---

### 5. Build & DevOps Pipeline — 42/100

**What works**
- URL injection search string is now correct (`build.js:165`).
- Integrity hash injection is removed from the primary build script.
- Obfuscation config is aggressive.
- Multi-environment config injection exists.
- CI/CD workflow exists with CodeQL and `npm audit`.
- Cross-platform zip script works.
- Root `build.js` syncs `dist/` → `Deploy/extension/`.

**What is broken or dangerous**
- **P0 — `Deploy/extension/` contains stale, pre-V5 artifacts.** The build output directory in the repo has **not** been rebuilt after the V5 source fixes. It contains integrity hashes, no `MSG_SECRET`, operation-name desync, and all other V4 bugs. Any release cut from this directory ships broken code.
- **P1 — Stale `Deploy/build.js` still exists.** This 207-line legacy script (`Deploy/build.js`) contains the old integrity-hash logic and the old broken URL search string. A developer running `node Deploy/build.js` by mistake will produce a broken build.
- **P1 — Naive global name replacement can corrupt code.** `build.js:225-226` uses `.split(oldName).join(newName)` with no word-boundary protection.
- **P1 — Build-time message secret uses `Math.random()`** (`build.js:156`), not `crypto.randomBytes`. For a security boundary, this is weak.
- **P1 — No `package-lock.json`.** CI uses `npm install` (`.github/workflows/ci.yml:22`), which is non-reproducible.
- **P1 — `lint` and `test` scripts are still placeholders** (`package.json:8-9`).
- No build verification step. No smoke test of the obfuscated output.
- **P1 — `config/environments.js` references orphaned `INTEGRITY_CHECK` flag** that no longer maps to any code path.

---

### 6. Documentation Completeness — 50/100

**What works**
- `Deploy/docs/SERVER-CONTRACT.md` no longer documents `integrityHash`.
- Customer-facing docs (`README-Install.md`, `README-Activate.md`, `TROUBLESHOOTING.md`) are clear.
- Privacy Policy and Terms of Service exist.
- Some JSDoc in `service-worker.js`.

**What is broken or dangerous**
- **P1 — `SECURITY-RUNBOOK.md` documents features that no longer exist.** Lines 17-20 describe build-time integrity hash injection and runtime tamper detection. Lines 31-32 list "Integrity hash was injected" as a pre-release checklist item. These were removed in V5 but the runbook was not updated. This actively misleads release engineers.
- **P1 — `CHANGELOG.md` does not mention V5 fixes.** The most recent entry is `2.1.0 — 2026-04-22`, which predates the V5 sprint. None of the 8 claimed fixes are documented.
- **P1 — `SERVER-CONTRACT.md` contradicts the code.** The contract states all responses must include HMAC and the extension must verify it. The `verifyLicense` handler uses `validateResponseSignature` which hashes a custom concatenation, not the full response body. The contract does not mention the lack of a config key allowlist.
- **P1 — No inline JSDoc** in `main.js`, `api-layer.js`, or `popup.js`.
- No Architecture Decision Records (ADRs).
- No developer onboarding guide.
- No API spec beyond the server contract.

---

### 7. Testing & Verification — 36/100

**What works**
- E2E smoke test scaffold exists.
- Crypto unit test exists.
- `npm audit` runs in CI.
- CodeQL runs in CI.

**What is broken or dangerous**
- **P1 — E2E test does not exercise core functionality.** It tests popup rendering, panel toggle, license input, and storage API — but never license verification, alarm scheduling, token refresh, or the encrypted token lifecycle.
- **P1 — CI does not run the E2E test.** The workflow has no step for `npm run test:e2e`.
- **P1 — `lint` and `test` scripts are placeholders.** `package.json:8-9` echoes strings. The CI lint step always passes trivially.
- **P1 — Crypto unit test is not wired into CI.** `test/crypto.test.js` exists but `npm test` does not run it.
- No unit tests for `loadEncryptedToken`, `scheduleNextBurstAnchor`, alarm mutex behavior, `validateMessage`, or `poissonDelay` edge cases.
- No coverage reporting.
- No build verification step to confirm the obfuscated extension loads without syntax errors.
- **P1 — No test asserts that `Deploy/extension/` matches `dist/` after build.** The stale artifact issue would be caught by even a basic diff check.

---

### 8. Compliance & Legal — 52/100

**What works**
- Privacy Policy and Terms of Service exist.
- GDPR data export feature exists.
- Telegram opt-out toggle exists.
- Data retention is mentioned in the privacy policy.
- No third-party analytics or tracking libraries.

**What is broken or dangerous**
- **P1 — Telegram is opt-out, not opt-in.** The privacy policy claims Telegram is "opt-in" (`Deploy/docs/PRIVACY-POLICY.md:22`), but `sg_tg_opt_out` defaults to `false` and the toggle defaults to checked (`popup.js:513`). Users are enrolled by default if credentials are configured.
- **P1 — No explicit user consent before transmitting PII to the license server.** `verifyLicense` sends `deviceId`, `fingerprint`, and `key` to the server without a first-run consent dialog.
- **P1 — Popup re-verifies on open** (when token nears expiry), causing unnecessary PII transmission without user knowledge.
- **P1 — No "Delete My Data" / right to erasure.** Uninstalling leaves data in `chrome.storage.local`.
- **P1 — Data retention statements are vague.** No concrete retention period is specified.
- **P1 — Terms of Service lack jurisdiction / governing law clause.**
- **P1 — Export includes encrypted tokens and sensitive metadata without a warning.** The user downloads a JSON blob containing `sg_enc_token`, `sg_userKey`, `sg_device_id`, etc.

---

## Weighted Final Score: 52/100

| Dimension | Raw | Weight | Weighted |
|-----------|-----|--------|----------|
| 1. Security Architecture | 60 | 20% | 12.00 |
| 2. Code Quality & Maintainability | 50 | 15% | 7.50 |
| 3. MV3 Compliance & Reliability | 58 | 15% | 8.70 |
| 4. UX & Popup Design | 56 | 10% | 5.60 |
| 5. Build & DevOps Pipeline | 42 | 10% | 4.20 |
| 6. Documentation Completeness | 50 | 10% | 5.00 |
| 7. Testing & Verification | 36 | 10% | 3.60 |
| 8. Compliance & Legal | 52 | 10% | 5.20 |
| **TOTAL** | — | — | **51.80** |

*(Rounded to 52/100 for headline score.)*

---

## Critical Issues (P0)

1. **`Deploy/extension/` contains stale, pre-V5 build artifacts.** Every file in this directory predates the fix sprint. It contains integrity hash logic, no `MSG_SECRET`, the operation-name desync, token-blind popup, missing Telegram timeout, and missing alarm locks. If shipped, users receive the V4 broken build. The root `build.js` syncs `dist/` to `Deploy/extension/`, but **the team never ran the build** after applying source fixes. This is a process failure that undermines the entire sprint.

---

## Warnings (P1)

1. **Stale `Deploy/build.js` still exists.** This legacy script contains old integrity-hash logic and the broken URL search string. It is a trap for any developer who runs it.
2. **`SECURITY-RUNBOOK.md` documents removed security features.** Integrity hash checks are described as active and are on the pre-release checklist. This misleads release engineers.
3. **`CHANGELOG.md` is silent on V5.** None of the 8 fixes are documented.
4. **Disabling the extension does not stop content scripts.** `main.js` has no `SG_SET_ENABLED` handler. Open tabs continue DOM and API polling after the user toggles OFF.
5. **License key stored in plaintext** (`popup.js:448`).
6. **Weak service-worker fingerprint** drops canvas and screen components, producing collision-prone encryption keys.
7. **Heartbeat config push has no key allowlist.** Compromised server can write arbitrary keys to storage.
8. **`/config` fetch has no HMAC validation.** Remote stealth parameters can be injected by MITM.
9. **`validateResponseSignature` hashes custom concatenation** instead of full response body.
10. **Build-time `MSG_SECRET` uses `Math.random()`** instead of `crypto.randomBytes`.
11. **DOM and API polling loops run when tab is hidden.** Wastes CPU and battery.
12. **`popup.js` has two `onMessage` listeners.**
13. **`popup.js` event handlers unguarded** against missing DOM elements.
14. **Mixed `var`/`let`/`const`** across codebase.
15. **No `package-lock.json`.**
16. **`lint` and `test` scripts are placeholders.**
17. **CI does not run E2E tests.**
18. **No build verification step.**
19. **Telegram is opt-out by default.**
20. **No explicit consent for server data transmission.**
21. **No "Delete My Data" button.**
22. **Vague data retention statements.**
23. **Terms lack jurisdiction clause.**
24. **Export includes sensitive data without warning.**
25. **Popup lacks responsive layout, ARIA, and show-password toggle.**
26. **Toast and HUD styles injected unconditionally.**
27. **Circuit breaker state is in-memory only** and resets on SW restart.

---

## Recommendations for 100/100

**Immediate (fix before any release)**
1. **Rebuild `Deploy/extension/` from source.** Run `npm run build` and commit the updated `dist/` and `Deploy/extension/` so the build artifacts match the source fixes.
2. **Delete or archive `Deploy/build.js`.** Having two build scripts where one is broken is a trap.
3. **Fix `main.js` to handle `SG_SET_ENABLED`.** Add an `onMessage` handler that stops `startMainLoop` and calls `stopApiPolling()` when the extension is disabled.
4. **Update `SECURITY-RUNBOOK.md`.** Remove all references to integrity hash injection and tamper detection. Update the pre-release checklist to reflect the actual V5 build pipeline.
5. **Update `CHANGELOG.md`.** Document all 8 V5 fixes, the stale artifact issue, and any known remaining issues.

**Short-term**
6. Store license key encrypted at rest, not plaintext.
7. Replace `Math.random()` secret generation with `crypto.randomBytes(16).toString('hex')`.
8. Replace naive `.split().join()` global name replacement with AST-aware replacement or regex word boundaries (`\b`).
9. Add `package-lock.json` and change CI to `npm ci`.
10. Replace placeholder `lint` / `test` scripts with real ESLint and Vitest/Jest suites.
11. Add unit tests for `loadEncryptedToken`, `scheduleNextBurstAnchor`, alarm mutex behavior, `validateMessage`, `poissonDelay`, and the query rotation logic.
12. Update E2E test to assert license verification, alarm scheduling, and token refresh flows.
13. Fix `validateResponseSignature` to hash the full JSON response body, matching the server contract.
14. Implement a true first-run consent flow and a "Delete My Data" button that calls `chrome.storage.local.clear()`.
15. Pause `main.js` and `api-layer.js` polling loops when `document.hidden` is true.
16. Add HMAC validation to `fetchServerConfig` or remove the endpoint if it cannot be secured.

**Long-term**
17. Migrate from IIFE globals to ES modules for MV3 compliance and encapsulation.
18. Add TypeScript and strict null checks.
19. Implement a state machine reducer instead of scattered boolean flags.
20. Add Sentry or similar error reporting for production visibility.
21. Implement certificate pinning or public-key pinning for the license server.

---

*Report generated by LAURA — Independent Security & Code Quality Analysis*
*Methodology: Static code analysis, architecture review, security audit, build pipeline verification, compliance heuristic evaluation*
