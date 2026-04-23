# LAURA Deep Inspection Report V4
## Date: 2026-04-23
## Overall Score: 50/100

> **Mandate:** Brutal, honest, unbiased forensic re-audit of Shift Grabber V9 Chrome Extension (MV3) after the V3→V4 fix sprint.
>
> **Verdict:** The fix sprint successfully closed all four V3 P0s and two additional P1s, making the extension functional for the first time since V2. However, one claimed fix is security theater (URL injection still does not work), the popup remains broken due to an incomplete token-blindness fix, and a new logic bug in `api-layer.js` desynchronizes query shapes from operation names. Score edges up modestly: **47 → 50**.

---

### Fix Verification (V3 → V4)

| # | Claimed Fix | Verified | Notes |
|---|-------------|----------|-------|
| 1 | Content script token blindness fixed | **Yes** | `main.js:191`, `:410`, `:429`, and `updateDot()` all now derive `hasToken` from `st[K.TOKEN_EXP] > nowSec` instead of the permanently-null `st[K.ACCESS_TOKEN]`. The HUD will now correctly reflect token status. |
| 2 | API-layer ready signal fixed | **Yes** | `main.js:815` now polls `window.__sg_api_v3`, matching `api-layer.js:7` (`window["__sg_" + "api_v3"] = true`). Names are now consistent. **Caveat:** This relies on isolated-world `window` proxy visibility to MAIN-world properties, which is Chrome-specific behavior and architecturally fragile. |
| 3 | onStartup/onInstalled alarm races fixed | **Yes** | `service-worker.js:940-944` and `:950-954` both wrap `clearAllAlarms()` + `ensureTokenCheckAlarm()` + `ensureHeartbeatAlarm()` inside `await withAlarmLock(...)`. The race is closed. |
| 4 | MSG_SECRET randomization fixed | **Yes** | `build.js:155-156` generates a random secret. `build.js:158-168` `preprocessSource()` replaces `"__SG_MSG_SECRET__"` **before** obfuscation by writing a temp file, obfuscating it, then deleting the temp. The secret survives `stringArray` encoding and global name randomization. |
| 5 | Build.js URL injection fixed | **No** | `build.js:164-166` searches for `"https://shiftgrabber.net"` inside `constants.js` source. **The actual string in `src/shared/constants.js:68` is `"https://shift-grabber.vercel.app"`** (hyphenated subdomain, `.vercel.app` TLD). The search string never matches. Production builds still ship with the stale Vercel URL. The fix was moved to the right file but with the wrong needle. **Security theater.** |
| 6 | Deploy/extension/ stale files fixed | **Yes** | `build.js:250-268` recursively wipes `Deploy/extension/` and copies `dist/` into it via `copyRecursive`. Stale V2 files are eliminated. |
| 7 | E2E test path fixed | **Yes** | `tests/e2e/smoke.test.js:15` now loads from `../../dist` instead of the stale `Deploy/extension/`. |
| 8 | poissonDelay capped | **Yes** | `api-layer.js:137` now clamps to `Math.min(5000, ...)` and floors at `Math.max(50, ...)`. Infinite delays are impossible. |

---

### 1. Security Architecture — 58/100

**What works**
- Content script token blindness is fully resolved (`main.js:191`, `:410`, `:429`). The HUD, dot indicator, and token expiry guard now function correctly.
- API-layer ready signal names now match (`main.js:815` ↔ `api-layer.js:7`), enabling direct GraphQL claiming instead of falling back to slow DOM clicking.
- `MSG_SECRET` is genuinely randomized at build time and survives obfuscation (`build.js:155-192`). The inter-script `postMessage` boundary is no longer trivially spoofable by page scripts.
- AES-GCM-256 + PBKDF2 token encryption at rest remains sound (`src/shared/crypto.js:10-52`).
- Constant-time HMAC comparison prevents timing attacks (`src/shared/crypto.js:66-75`).
- Build-time HMAC key injection works correctly (`build.js:203-213`) because the service worker is obfuscated with `stringArray: false`.
- Heartbeat HMAC validation closes the MITM kill-switch vector (`background/service-worker.js:77-83`).
- Alarm mutex prevents alarm creation races (`background/service-worker.js:346-358`).
- Sender ID validation rejects cross-extension messages (`background/service-worker.js:463`).

**What is broken or dangerous**
- **P1 — Build.js URL injection is a claimed fix that does not work.** As verified above, `build.js:164-166` searches for the wrong string. The `config/environments.js:39` production config specifies `SERVER_URL: "https://shiftgrabber.net"`, but the built extension still points to `shift-grabber.vercel.app`. If these are different servers, production builds are misconfigured. If they are the same server with a DNS discrepancy, the build pipeline is still broken and misleading.
- **P1 — `validateResponseSignature` still hashes a custom concatenation instead of the full response body** (`background/service-worker.js:722-730`), diverging from the documented server contract (`Deploy/docs/SERVER-CONTRACT.md:113`).
- **P1 — License key (`sg_userKey`) is still stored in plaintext** (`popup/popup.js:443`, `background/service-worker.js:838`).
- **P1 — No certificate pinning** for the license server.
- **P1 — Weak device fingerprint in service worker.** `fingerprint.js:24` uses `document.createElement("canvas")` inside a `try-catch`. In the service worker, `document` is undefined, so the canvas and screen components are silently dropped. The resulting fingerprint is based only on `userAgent + language + timezone + hardwareConcurrency + platform`, which is highly collision-prone. This weakens the encryption key for token storage.
- **P1 — Heartbeat config push has no key allowlist.** A compromised server can push arbitrary config objects (`json.config`) into `chrome.storage.local` after passing HMAC validation (`background/service-worker.js:102-104`). This is a privilege-escalation risk.
- **P1 — `sendTelegram` fetch still lacks timeout** (`background/service-worker.js:254`). Despite appearing in V3 recommendations, no `AbortSignal.timeout()` was added. A hung Telegram API call can block the service worker indefinitely.
- **P1 — `api-layer.js` poll operation name is desynchronized from query shape.** `api-layer.js:268-271` increments `currentQueryIndex` **between** computing `pollQ` and `pollOpName`. For a single-operation GraphQL document with operation name `PollShifts`, the `operationName` parameter becomes `GetShiftList` or `QueryOpportunities` 2/3 of the time. If Amazon's GraphQL gateway validates `operationName` against the document, **2 out of every 3 polls will be rejected** with an "Unknown operation" error. Even if ignored by the server, the mismatch is a bot-detection signal.
- **P1 — `main.js` message listener accepts spoofed claim results without secret validation.** `main.js:680-730` processes `SG_EID`, `SG_RATE_LIMITED`, and `SG_CLAIM_RESULT` from `window.postMessage` with only `e.source !== window` and `e.data?.sg` checks. Any page script can send `{ sg: true, type: 'SG_CLAIM_RESULT', oppId: 'x' }` and trigger toast + Telegram notifications. The secret is only validated on messages sent **to** `api-layer.js`, not on messages received **from** it.

---

### 2. Code Quality & Maintainability — 46/100

**What works**
- Shared constants module reduces magic strings (`src/shared/constants.js`).
- Alarm mutex prevents races (`background/service-worker.js:346-358`).
- Periodic cleanup of `claimedIds` and `apiClaimNotified` prevents unbounded growth (`api-layer.js:153-159`, `main.js:42-47`).
- WeakSet deduplication for DOM buttons (`main.js:50`).
- Some JSDoc in the service worker.

**What is broken or dangerous**
- **P1 — `api-layer.js` poll operation name / query shape desync is a clear logic error.** (`api-layer.js:268-271`). The `currentQueryIndex` is consumed for the query string, then incremented, then consumed again for the operation name. This is a straightforward off-by-one-sequence bug.
- **P1 — Mixed `var`/`let`/`const` across the codebase.** `api-layer.js` is entirely `var`-based while `popup.js` uses modern syntax. This inconsistency suggests copy-paste development without review.
- **P1 — `popup.js` registers two separate `chrome.runtime.onMessage` listeners** (lines 479 and 709) instead of one unified handler.
- **P1 — `popup.js` event handlers do not guard against missing DOM elements.** If the HTML changes, `document.getElementById` returns `null` and subsequent property access throws.
- **P1 — `build.js` global name replacement is dangerously naive.** `build.js:226` uses `code.split(oldName).join(newName)`. This will replace substrings inside unrelated identifiers, strings, or comments. For example, a variable named `my_SG_CONSTS_var` becomes `my__abc123_var`.
- **P1 — `popup.js` simple-mode `handleMasterToggle` stores the license key before verifying it.** (`popup.js:443`). If verification fails, the key is still persisted. A typo or malicious key is retained in storage.
- No linting, no TypeScript, no enforced code style.

---

### 3. MV3 Compliance & Reliability — 54/100

**What works**
- `chrome.alarms` used correctly for scheduling instead of `setInterval`.
- Alarm mutex prevents duplicate alarm creation races.
- `chrome.storage.local` is the single state store.
- `onInstalled` and `onStartup` listeners handle initialization and now correctly use the mutex.
- `visibilitychange` pauses HUD updates (`main.js:794-801`).
- `onInstalled` now preserves user settings on update (`background/service-worker.js:936-939`).

**What is broken or dangerous**
- **P1 — Narrow alarm race in `onStartup`.** `service-worker.js:949-962` releases the alarm lock after `ensureHeartbeatAlarm()`, then calls `startOverrideTick()` or `scheduleNextBurstAnchor()` outside the lock. Both of those functions call `chrome.alarms.create()`. If a concurrent message handler acquires the lock and clears alarms in the gap, the burst alarm can be created and then immediately cleared, leaving the extension in a silent zombie state until the next user interaction.
- **P1 — `main.js` DOM polling loop runs even when the tab is hidden.** `startMainLoop` (`main.js:599-606`) never pauses on `visibilitychange`, wasting CPU and battery.
- **P1 — `api-layer.js` poll loop runs even when the tab is hidden.** `startLoop` (`api-layer.js:324-341`) has no `visibilitychange` pause.
- **P1 — `importScripts` with relative path traversal (`../src/shared/`) is non-standard** (`background/service-worker.js:3-5`). While it works in Chrome today, it is fragile and not guaranteed in all packaging scenarios.
- **P1 — `sendTelegram` fetch lacks timeout.** `background/service-worker.js:254` has no `AbortSignal`. A hung Telegram API call can block the service worker indefinitely.
- **P1 — Floating promise risk in `onInstalled`.** `flushTelegramQueue()` at `:945` is awaited, but if the service worker sleeps during the flush, queued messages could be lost. (Less severe than V2 because it is now `await`ed, but MV3 SW termination mid-flush is still possible.)

---

### 4. UX & Popup Design — 48/100

**What works**
- Simple / Advanced panel split reduces cognitive load.
- Device limit UI with cooldown messaging (`popup/popup.js:259-265`, `:304-310`).
- GDPR data export button exists (`popup/popup.js:19-41`).
- Telegram opt-out toggle exists.
- Kill-switch UI feedback (`popup/popup.js:709-718`).
- Draggable HUD with position memory (`main.js:341-347`).
- Simple mode CSS now renders correctly (`popup/styles.css:12-25`).
- HUD now correctly reflects token status (fixed in this sprint).

**What is broken or dangerous**
- **P1 — Popup re-verifies license on every open.** `popup.js:519` checks `!st[KEYS.ACCESS_TOKEN]` which is **always true** because `storeEncryptedToken` (`background/service-worker.js:681`) sets `sg_access_token: null`. This wastes server resources and creates a poor user experience (1-2s network spinner every time the popup opens). It was a side-effect of the encrypted-token fix that the V4 sprint failed to address in the popup.
- **P1 — Popup always shows "Invalid or expired" after initial verify.** `refreshLicenseStatusUI` (`popup.js:225-230`) checks `token && exp && exp > now`. Since `token` (`sg_access_token`) is always null, the popup permanently displays the error state even when the license is fully active. Users will think the extension is broken.
- **P1 — Status badge missing `NO_KEY` state.** `updateStatusBadge` (`popup/popup.js:343-367`) only handles OFF, PAUSED, FAST, LIVE. When the token is not yet loaded, the badge shows OFF even if enabled.
- **P1 — No keyboard navigation or ARIA labels.** Toggle switches in `popup/index.html` lack `tabindex`, `aria-pressed`, and `aria-label`. Screen-reader users are abandoned.
- **P1 — No "show password" toggle on license input.** The input is `type="text"` but the key is sensitive. Users cannot verify long keys easily.
- **P1 — Popup has no responsive layout.** Fixed `310px` min-width (`popup/styles.css:20`) will clip on high-DPI or narrow viewports.
- **P1 — Master toggle has no visual loading state beyond text.** During the 1-2s verification call, the switch moves instantly and can be clicked again.
- **P1 — Toast and HUD styles are injected unconditionally** (`main.js:123-132`, `:207-333`), even when the extension is disabled.

---

### 5. Build & DevOps Pipeline — 40/100

**What works**
- Obfuscation config is aggressive (`controlFlowFlattening`, `deadCodeInjection`, `selfDefending`).
- Multi-environment config injection exists (`config/environments.js`).
- CI/CD workflow exists with CodeQL and `npm audit` (`.github/workflows/ci.yml`).
- Artifact upload steps exist and now point to the correct `dist/**` path.
- HMAC key injection works correctly.
- Integrity hash injection is now computed after global name randomization (`build.js:236-248`), fixing the V3 ordering bug.
- Cross-platform zip script works (`zip.js:20-28`).
- `Deploy/extension/` is now auto-synced from `dist/` (`build.js:250-268`).

**What is broken or dangerous**
- **P1 — Claimed fix #5 (URL injection) is still broken.** As detailed in Fix Verification, `build.js:164-166` searches for `"https://shiftgrabber.net"` but `constants.js` contains `"https://shift-grabber.vercel.app"`. The replacement is dead code. This is a **process failure**: the team claimed a fix, moved it to the right location in the pipeline, but never verified the search string matched the source.
- **P1 — Integrity hash is still fundamentally broken by design.** `build.js:238-240` computes `swHash` from `finalSwCode` which still contains `"__SG_INTEGRITY_HASH_PLACEHOLDER__"`. Then `:241-246` replaces the placeholder with the hash and writes the file. The final file's SHA-256 is different from the injected hash because the injected hash is longer than the placeholder string, altering the file contents. The runtime `checkIntegrity()` (`service-worker.js:748-765`) will therefore compare a stale hash against the server-provided expected hash. Even if the server uses the same flawed logic, this is cryptographic theater.
- **P1 — Naive global name replacement can corrupt code.** `build.js:226` uses `.split(oldName).join(newName)` with no word-boundary protection. This can break identifiers, strings, or comments that happen to contain the global name as a substring.
- **P1 — No `package-lock.json`.** CI uses `npm install` (`.github/workflows/ci.yml:22`), which is non-reproducible.
- **P1 — `lint` and `test` scripts are still placeholders** (`package.json:8-9`).
- No build verification step. No smoke test of the obfuscated output.
- **P1 — `fetchServerConfig` hardcodes version `2.0.0` in URL** (`background/service-worker.js:655`), while `manifest.json:4` says `2.1.0`.

---

### 6. Documentation Completeness — 54/100

**What works**
- `Deploy/docs/SERVER-CONTRACT.md` documents endpoints, request/response schemas, device-transfer logic, and rate limits.
- `BUILD.md`, `SECURITY-RUNBOOK.md`, `CHANGELOG.md` exist.
- Customer-facing docs (`README-Install.md`, `README-Activate.md`, `TROUBLESHOOTING.md`) are clear and well-structured.
- Privacy Policy and Terms of Service exist.
- Some JSDoc in `service-worker.js`.

**What is broken or dangerous**
- **P1 — `SERVER-CONTRACT.md` contradicts the code.** The contract states all responses must include HMAC and the extension must verify it. The `verifyLicense` handler (`background/service-worker.js:821-825`) uses `validateResponseSignature` which hashes a custom concatenation, not the full response body. The contract says `/heartbeat` pushes `config`, which is now implemented, but the contract does not mention the lack of a config key allowlist.
- **P1 — `CHANGELOG.md` is incomplete.** It does not mention the V3 content-script token blindness regression or its resolution. It also does not document the `api-layer.js` operation-name rotation or the URL injection fix attempt.
- **P1 — No inline JSDoc** in `main.js`, `api-layer.js`, or `popup.js`.
- No Architecture Decision Records (ADRs).
- No developer onboarding guide.
- No API spec beyond the server contract.
- No documentation of the `operationName` / query shape desync bug or the URL injection failure.

---

### 7. Testing & Verification — 36/100

**What works**
- E2E smoke test scaffold exists (`tests/e2e/smoke.test.js`).
- Crypto unit test exists (`test/crypto.test.js`).
- `npm audit` runs in CI.
- CodeQL runs in CI.
- E2E test now loads from `dist/` (fixed in this sprint).

**What is broken or dangerous**
- **P1 — E2E test does not exercise core functionality.** It tests popup rendering, panel toggle, license input, and storage API — but never license verification, alarm scheduling, token refresh, or the encrypted token lifecycle. It would pass even if `operationName` desync broke all API polling.
- **P1 — CI does not run the E2E test.** The workflow has no step for `npm run test:e2e`.
- **P1 — `lint` and `test` scripts are placeholders.** `package.json:8-9` echoes strings. The CI lint step always passes trivially.
- **P1 — Crypto unit test is not wired into CI.** `test/crypto.test.js` exists but `npm test` does not run it.
- No unit tests for `loadEncryptedToken`, `scheduleNextBurstAnchor`, alarm mutex behavior, `validateMessage`, or `poissonDelay` edge cases.
- No coverage reporting.
- No build verification step to confirm the obfuscated extension loads without syntax errors.

---

### 8. Compliance & Legal — 52/100

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

## Weighted Final Score: 50/100

| Dimension | Raw | Weight | Weighted |
|-----------|-----|--------|----------|
| 1. Security Architecture | 58 | 20% | 11.60 |
| 2. Code Quality & Maintainability | 46 | 15% | 6.90 |
| 3. MV3 Compliance & Reliability | 54 | 15% | 8.10 |
| 4. UX & Popup Design | 48 | 10% | 4.80 |
| 5. Build & DevOps Pipeline | 40 | 10% | 4.00 |
| 6. Documentation Completeness | 54 | 10% | 5.40 |
| 7. Testing & Verification | 36 | 10% | 3.60 |
| 8. Compliance & Legal | 52 | 10% | 5.20 |
| **TOTAL** | — | — | **49.60** |

*(Rounded to 50/100 for headline score.)*

---

## Critical Issues (P0)

**None.** All V3 P0s have been resolved. The extension is now functional. This is genuine progress.

---

## Warnings (P1)

1. **Build.js URL injection claimed fix is broken.** `build.js:164-166` searches for `"https://shiftgrabber.net"` but `src/shared/constants.js:68` contains `"https://shift-grabber.vercel.app"`. The replacement never executes. Claimed fixes must be verified before they are claimed.
2. **Popup is still blind to token status.** `popup.js:519` checks `!st[KEYS.ACCESS_TOKEN]` (always null), causing re-verification on every popup open. `popup.js:225-230` always shows "Invalid or expired" because it requires a non-null `sg_access_token`. The popup was overlooked in the token-blindness fix sprint.
3. **`api-layer.js` poll operation name is desynchronized from query shape.** `api-layer.js:268-271` increments `currentQueryIndex` between selecting the query string and selecting the operation name. This causes `operationName: "GetShiftList"` to be sent with a `query PollShifts {...}` document 2/3 of the time. If Amazon validates `operationName`, polling breaks.
4. **`sendTelegram` fetch still lacks timeout.** `background/service-worker.js:254`. Recommended in V3, ignored in V4.
5. **Integrity hash injection is still broken by design.** `build.js:238-246` computes the hash over a file containing a placeholder string, then replaces the placeholder with the hash. The final file has a different SHA-256 than the injected value.
6. **Narrow alarm race in `onStartup`.** `startOverrideTick` / `scheduleNextBurstAnchor` create alarms outside `withAlarmLock` after the lock is released (`service-worker.js:960-962`).
7. **`validateResponseSignature` hashes custom concatenation** instead of full response body (`background/service-worker.js:722-730`).
8. **License key stored in plaintext** (`popup/popup.js:443`, `background/service-worker.js:838`).
9. **No certificate pinning** for license server.
10. **Weak service-worker fingerprint** drops canvas and screen components, producing collision-prone encryption keys.
11. **Heartbeat config push has no key allowlist.** A compromised server can write arbitrary keys to `chrome.storage.local`.
12. **DOM polling loops run when tab is hidden.** `main.js:599-606` and `api-layer.js:324-341`.
13. **`main.js` accepts spoofed `SG_CLAIM_RESULT` without secret validation.** Any page script can trigger false grab notifications.
14. **`popup.js` has two `onMessage` listeners.** Lines 479 and 709.
15. **`popup.js` event handlers unguarded** against missing DOM elements.
16. **Mixed `var`/`let`/`const`** across codebase.
17. **No `package-lock.json`.** CI uses `npm install`.
18. **`lint` and `test` scripts are placeholders.**
19. **CI does not run E2E tests.**
20. **No build verification step.**
21. **Telegram is opt-out by default.**
22. **No explicit consent for server data transmission.**
23. **No "Delete My Data" button.**
24. **Vague data retention statements.**
25. **Terms lack jurisdiction clause.**
26. **Export includes sensitive data without warning.**
27. **Popup lacks responsive layout, ARIA, and show-password toggle.**
28. **Toast and HUD styles injected unconditionally.**
29. **`fetchServerConfig` hardcodes version `2.0.0`** in URL (`background/service-worker.js:655`).
30. **`build.js` naive global name replacement** can corrupt unrelated identifiers.

---

## Recommendations for 100/100

**Immediate (fix before any release)**
1. **Fix the popup token blindness.** Update `popup.js:519` to check `sg_token_exp` instead of `sg_access_token`. Update `refreshLicenseStatusUI` (`popup.js:225-230`) to check expiry without requiring a plaintext token.
2. **Fix the URL injection search string.** `build.js:165` must search for the actual string present in `constants.js`: `"https://shift-grabber.vercel.app"` (or better, externalize the URL into a dedicated `config.js` that is not obfuscated).
3. **Fix the `api-layer.js` operation name desync.** Move `currentQueryIndex` increment after both `pollQ` and `pollOpName` are computed, or use a temporary index variable.
4. **Fix `sendTelegram` timeout.** Add `signal: AbortSignal.timeout(10000)` to the Telegram fetch.
5. **Fix the narrow `onStartup` alarm race.** Wrap `startOverrideTick` / `scheduleNextBurstAnchor` calls inside the same `withAlarmLock` block, or acquire the lock again before creating burst alarms.

**Short-term**
6. Fix integrity hash injection by computing the hash of the final file and storing it in a separate manifest file, rather than self-injecting into the hashed file.
7. Replace naive `.split().join()` global name replacement with AST-aware replacement or regex word boundaries (`\b`).
8. Add `package-lock.json` and change CI to `npm ci`.
9. Replace placeholder `lint` / `test` scripts with real ESLint and Vitest/Jest suites.
10. Add unit tests for `loadEncryptedToken`, `scheduleNextBurstAnchor`, alarm mutex behavior, `validateMessage`, `poissonDelay`, and the query rotation logic.
11. Update E2E test to assert license verification, alarm scheduling, and token refresh flows.
12. Fix `validateResponseSignature` to hash the full JSON response body, matching the server contract.
13. Store license key encrypted at rest, not plaintext.
14. Implement a true first-run consent flow and a "Delete My Data" button that calls `chrome.storage.local.clear()`.
15. Add `lastError` checks or empty callbacks to all `chrome.runtime.sendMessage` calls in `main.js` and `popup.js` to suppress console errors.
16. Pause `main.js` and `api-layer.js` polling loops when `document.hidden` is true.

**Long-term**
17. Migrate from IIFE globals to ES modules for MV3 compliance and encapsulation.
18. Add TypeScript and strict null checks.
19. Implement a state machine reducer instead of scattered boolean flags.
20. Add Sentry or similar error reporting for production visibility.
21. Implement certificate pinning or public-key pinning for the license server.

---

*Report generated by LAURA — Independent Security & Code Quality Analysis*
*Methodology: Static code analysis, architecture review, security audit, build pipeline verification, compliance heuristic evaluation*
