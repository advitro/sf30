# LAURA Deep Inspection Report V2
## Date: 2026-04-23
## Overall Score: 46/100

> **Mandate:** Brutal, honest, unbiased forensic audit of Shift Grabber V9 Chrome Extension (MV3) after the "88/100 hardening sprint."
>
> **Verdict:** The 16 fixes closed some holes, but introduced catastrophic regressions that render the extension completely non-functional and broke the build pipeline. Previous score: **88 → 46**.

---

### 1. Security Architecture — 45/100 (9.0 pts)

**What works**
- AES-GCM-256 + PBKDF2 (100k iterations) token encryption at rest is theoretically sound (`src/shared/crypto.js:10-52`).
- Constant-time HMAC comparison prevents timing attacks (`src/shared/crypto.js:66-75`).
- Circuit breaker pattern isolates license-server failures (`background/service-worker.js:567-598`).
- Sender ID validation rejects cross-extension messages (`background/service-worker.js:416`).
- Kill-switch via `/heartbeat` is implemented (`background/service-worker.js:34-71`).
- No plaintext token cache — the code finally removed the `sg_access_token` cleartext storage (`background/service-worker.js:631`).
- CSP is present in `manifest.json:7-9`.

**What is broken or dangerous**
- **P0 — Extension is completely non-functional because the encrypted token loader was never wired into the scheduling hot path.** `storeEncryptedToken` (`background/service-worker.js:624-638`) sets `sg_access_token` to `null`. Every scheduling function (`scheduleNextBurstAnchor:332`, `startOverrideTick:343`, alarm handlers `:368`, `:390`, `:406`, and `SG_RELOAD_ALL_NOW:526`) checks `st[K.ACCESS_TOKEN]` and returns early because it is permanently `null`. The `loadEncryptedToken()` helper exists but is only called in `tryAutoRefreshTokenIfNeeded`, `refreshTokenInBackground`, and `onStartup` — never in the scheduling loop. **The product does not schedule bursts.**
- **P0 — Build-time HMAC key injection is broken by design.** `build.js:176` falls back to `"change-me-in-production"` if the env var is missing. Worse, the regex at `build.js:177-180` searches for `var _hk = ...` in the *obfuscated* output. With `identifierNamesGenerator: "mangled"`, the local variable `_hk` is renamed, and `compact: true` strips the `// placeholder` comment. The regex will almost never match, shipping the literal placeholder string as the HMAC key. Server responses will fail validation universally.
- **P0 — Build-time integrity hash injection is equally broken.** `build.js:193-196` searches for `var computedHash = typeof __SG_INTEGRITY_HASH ...` in obfuscated code. `computedHash` is a local variable and will be mangled. The regex is guaranteed to fail, leaving the fallback code in place. Even if it matched, the hash is computed **before** global-name randomization (`build.js:209-218`) rewrites the file, so the injected hash is immediately invalidated.
- **P1 — Heartbeat response is not HMAC-validated.** `/heartbeat` can return `kill: true`, which immediately disables the extension (`background/service-worker.js:53-62`). An attacker MITMing this endpoint can globally kill every installation. The server contract (`Deploy/docs/SERVER-CONTRACT.md:113`) mandates HMAC on all responses, but the heartbeat handler ignores it.
- **P1 — `validateResponseSignature` hashes a custom concatenation instead of the full response body** (`background/service-worker.js:667-675`), diverging from the documented server contract and creating a mismatch risk.
- **P1 — License key (`sg_userKey`) is stored in plaintext** (`popup/popup.js:443`, `background/service-worker.js:772`).
- **P1 — No certificate pinning** for `shiftgrabber.net` or `shift-grabber.vercel.app`.

**Score justification:** The primitives are solid, but the integration is shattered. A security model that fails closed is correct; a security model that cannot open is a self-denial-of-service. The build pipeline’s HMAC/integrity injection is security theater — it provides zero protection and breaks functionality.

---

### 2. Code Quality & Maintainability — 48/100 (7.2 pts)

**What works**
- Shared constants module reduces magic strings (`src/shared/constants.js`).
- Alarm mutex (`withAlarmLock`) prevents races (`background/service-worker.js:304-316`).
- Periodic cleanup of `claimedIds` and `apiClaimNotified` prevents unbounded growth (`src/content/api-layer.js:153-159`, `src/content/main.js:42-47`).
- WeakSet deduplication for DOM buttons (`src/content/main.js:50`).
- Some JSDoc in the service worker.

**What is broken or dangerous**
- **P0 — `const` reassignment crash in `main.js`.** `updateHUD()` declares `const nowSec` and `const hasToken` at lines 402-403, then reassigns them at lines 421-422 without a declaration keyword. Assigning to a `const`-bound variable throws a `TypeError` in strict mode and will crash the HUD update loop.
- **P0 — `main.js` calls `chrome.tabs.query` from a content script** (`src/content/main.js:509`). The `tabs` API is **not exposed to content scripts** in MV3. This throws `TypeError: Cannot read properties of undefined (reading 'query')`, breaking `getAtoZTabs()` and any feature relying on it.
- **P1 — `api-layer.js` message listener has zero source validation.** `window.addEventListener('message', ...)` at `src/content/api-layer.js:349-371` only checks `e.data.sg`. Any script on the AtoZ page can `postMessage({ sg: true, type: 'SG_STOP_POLLING' })` to disable the grabber, or spoof claim results. The `e.source !== window` check is meaningless because the page **is** the source.
- **P1 — `CLAIM_Q_SET` contains three identical mutation strings** (`src/content/api-layer.js:18-22`). Only the `operationName` rotates; the GraphQL body does not, providing zero claim-side query rotation.
- **P1 — Mixed `var`/`let`/`const` across the codebase.** `api-layer.js` is entirely `var`-based while `popup.js` uses modern syntax. This inconsistency suggests copy-paste development without review.
- **P1 — `popup.js` registers two separate `chrome.runtime.onMessage` listeners** (lines 479 and 709) instead of one unified handler.
- **P1 — `popup.js` hardcodes the server URL** (`popup/popup.js:95`) instead of using `SG_CONSTS.URLS.SERVER`, bypassing the multi-environment config.
- **P1 — Stale comment contradicts code.** `background/service-worker.js:776-777` says "plaintext token is kept as cache", but `storeEncryptedToken` explicitly sets `sg_access_token: null`. Misleading maintainers is a maintenance hazard.
- **P1 — `popup.js` simple-mode event handlers do not guard against missing DOM elements.** If the HTML changes, `document.getElementById` returns `null` and subsequent property access throws.
- No linting, no TypeScript, no unit tests.

---

### 3. MV3 Compliance & Reliability — 52/100 (7.8 pts)

**What works**
- `chrome.alarms` used correctly for scheduling instead of `setInterval` (`background/service-worker.js`).
- Alarm mutex prevents duplicate alarm creation races.
- `chrome.storage.local` is the single state store.
- `onInstalled` and `onStartup` listeners handle initialization.
- `visibilitychange` pauses HUD updates (`src/content/main.js:806-813`).

**What is broken or dangerous**
- **P0 — Content script uses unavailable `chrome.tabs` API** (`src/content/main.js:509`). This is an MV3 API misuse that will throw at runtime.
- **P1 — `chrome.runtime.onInstalled` resets all user settings on every update.** `background/service-worker.js:871` calls `await setState(DEFAULTS)`, which overwrites `sg_enabled`, `sg_paused`, `sg_override`, etc. Users will find the extension disabled after every update.
- **P1 — Floating promise in alarm handler.** `flushTelegramQueue()` is called without `await` at `background/service-worker.js:370`. The service worker may sleep before the flush completes, losing Telegram notifications.
- **P1 — All `fetch` calls in the service worker lack timeout / `AbortSignal`.** `verifyLicense`, `sendHeartbeat`, `fetchServerConfig`, and `refreshTokenInBackground` can hang for the TCP default (minutes), blocking alarms and token refresh.
- **P1 — `main.js` DOM polling loop runs even when the tab is hidden.** `startMainLoop` (`src/content/main.js:611-619`) never pauses on `visibilitychange`, wasting CPU and battery.
- **P1 — `importScripts` with relative path traversal (`../src/shared/`) is non-standard** (`background/service-worker.js:3-5`). While it works in Chrome today, it is fragile and not guaranteed in all packaging scenarios.
- **P1 — `chrome.runtime.sendMessage` in `main.js` keyboard handlers** (`src/content/main.js:660-687`) does not check `chrome.runtime.lastError`. If the extension context is invalidated (update/reload), these calls throw uncaught errors.

---

### 4. UX & Popup Design — 42/100 (4.2 pts)

**What works**
- Simple / Advanced panel split reduces cognitive load.
- Device limit UI with cooldown messaging (`popup/popup.js:259-265`, `:304-310`).
- GDPR data export button exists (`popup/popup.js:19-41`).
- Telegram opt-out toggle exists.
- Kill-switch UI feedback (`popup/popup.js:709-718`).
- Draggable HUD with position memory (partial — see P1).

**What is broken or dangerous**
- **P0 — Simple mode is completely unstyled.** `popup/styles.css` defines `:root` variables `--bg`, `--card`, `--fg`, etc., but the simple-panel section references an entirely different set: `--text-primary`, `--text-secondary`, `--border-default`, `--bg-deep`, `--radius-md`, `--radius-lg`, `--glass-border`, `--accent-500`, `--accent-400`, `--accent-300`, `--font-mono`, `--font-sans` (lines 299, 322, 330, 338, 351, 361, 384, 391, 454, 469). None of these are defined. The simple panel renders with invalid styles, looking broken or unreadable.
- **P1 — HUD position is saved but never restored.** `makeHUDDraggable` writes `sg_hud_pos` to storage (`src/content/main.js:373`), but `init()` never reads it back, making drag persistence useless.
- **P1 — No keyboard navigation or ARIA labels.** Toggle switches in `popup/index.html` lack `tabindex`, `aria-pressed`, and `aria-label`. Screen-reader users are abandoned.
- **P1 — No "show password" toggle on license input.** The input is `type="text"` but the key is sensitive. Users cannot verify long keys easily.
- **P1 — Popup has no responsive layout.** Fixed `310px` min-width (`popup/styles.css:20`) will clip on high-DPI or narrow viewports.
- **P1 — Master toggle has no visual loading state beyond text.** During the 1-2s verification call, the switch moves instantly and can be clicked again.
- **P1 — Status badge missing `NO_KEY` state.** `updateStatusBadge` (`popup/popup.js:343-367`) only handles OFF, PAUSED, FAST, LIVE. When `sg_access_token` is null (always), the badge shows OFF even if enabled.
- **P1 — Toast and HUD styles are injected unconditionally** (`src/content/main.js:123-132`, `:207-333`), even when the extension is disabled.

---

### 5. Build & DevOps Pipeline — 30/100 (3.0 pts)

**What works**
- Obfuscation config is aggressive (`controlFlowFlattening`, `deadCodeInjection`, `selfDefending`).
- Multi-environment config injection exists (`config/environments.js`).
- CI/CD workflow exists with CodeQL and `npm audit` (`.github/workflows/ci.yml`).
- Artifact upload steps exist.

**What is broken or dangerous**
- **P0 — HMAC key injection regex is guaranteed to fail on obfuscated output.** `build.js:177-180` searches for the literal variable name `_hk` and a `// placeholder` comment. The obfuscator renames local variables and strips comments. The real HMAC key is never injected; the placeholder ships to production.
- **P0 — Integrity hash injection regex is equally fragile.** `build.js:193-196` searches for `var computedHash` in obfuscated code. `computedHash` is mangled. The regex fails, leaving the fallback path in place.
- **P0 — Integrity hash is computed before global name randomization invalidates it.** `build.js:189-196` computes and injects the hash, then `build.js:209-218` rewrites the file to randomize global names, changing the file content and making the hash wrong.
- **P1 — CI pipeline uploads stale / empty artifacts.** `.github/workflows/ci.yml:32-42` uploads `Deploy/extension/**`, but `build.js` outputs to `dist/`. The `Deploy/extension/` directory is never populated by the build script.
- **P1 — `npm ci` will fail.** There is no `package-lock.json` in the repository. The CI workflow (`ci.yml:22`) will exit with an error on every run.
- **P1 — `build:zip` uses Unix `zip` command.** `package.json:7` runs `cd dist && zip -r ../shift-grabber-v9.zip .`. On Windows (the stated build environment), this fails without WSL.
- **P1 — HMAC key fallback ships a known string.** `build.js:176` defaults to `"change-me-in-production"` instead of aborting the build.
- **P1 — Version numbers are inconsistent.** `manifest.json:4` = `2.0.0`, `package.json:3` = `2.1.0`, `popup/index.html:14` = `V9`.
- No build verification step. No smoke test of the obfuscated output.
- `lint` and `test` scripts are placeholders (`package.json:8-9`).

---

### 6. Documentation Completeness — 58/100 (5.8 pts)

**What works**
- `Deploy/docs/SERVER-CONTRACT.md` documents endpoints, request/response schemas, device-transfer logic, and rate limits.
- `BUILD.md`, `SECURITY-RUNBOOK.md`, `CHANGELOG.md` exist.
- Customer-facing docs (`README-Install.md`, `README-Activate.md`, `TROUBLESHOOTING.md`) are clear and well-structured.
- Privacy Policy and Terms of Service exist.
- Some JSDoc in `service-worker.js`.

**What is broken or dangerous**
- **P1 — `SERVER-CONTRACT.md` contradicts the code.** The contract states all responses must include HMAC and the extension must verify it. The heartbeat handler (`background/service-worker.js:34-71`) does not verify HMAC. The contract says `/heartbeat` can push `config`, but the code ignores `json.config`.
- **P1 — `EXTENSION_OVERVIEW.md` is stale.** It claims the API layer fires "3 rapid claim attempts" (`EXTENSION_OVERVIEW.md:18`), but `api-layer.js:162-202` fires exactly one claim with an 80-300ms delay.
- **P1 — `CHANGELOG.md` falsely claims the `const` redeclaration bug is fixed** (`CHANGELOG.md:46`). The bug was mutated into an illegal `const` reassignment (`main.js:402-403` → `:421-422`) and still crashes.
- **P1 — No inline JSDoc** in `main.js`, `api-layer.js`, or `popup.js`.
- No Architecture Decision Records (ADRs).
- No developer onboarding guide.
- No API spec beyond the server contract.

---

### 7. Testing & Verification — 35/100 (3.5 pts)

**What works**
- E2E smoke test scaffold exists (`tests/e2e/smoke.test.js`).
- `npm audit` runs in CI.
- CodeQL runs in CI.

**What is broken or dangerous**
- **P1 — E2E test does not exercise core functionality.** It tests popup rendering, panel toggle, license input, and storage API — but never license verification, alarm scheduling, token refresh, or the encrypted token lifecycle. It would pass even though the product is completely non-functional.
- **P1 — CI does not run the E2E test.** The workflow has no step for `npm run test:e2e`.
- **P1 — `lint` and `test` scripts are placeholders.** `package.json:8-9` echoes strings. The CI lint step always passes trivially.
- No unit tests for crypto, circuit breaker, alarm mutex, or message validation.
- No coverage reporting.
- No build verification step to confirm the obfuscated extension loads without syntax errors.

---

### 8. Compliance & Legal — 55/100 (5.5 pts)

**What works**
- Privacy Policy and Terms of Service exist (`Deploy/docs/PRIVACY-POLICY.md`, `TERMS-OF-SERVICE.md`).
- GDPR data export feature exists (`popup/popup.js:19-41`).
- Telegram opt-out toggle exists.
- Data retention is mentioned in the privacy policy.
- No third-party analytics or tracking libraries.

**What is broken or dangerous**
- **P1 — Telegram is opt-out, not opt-in.** The privacy policy claims Telegram is "opt-in" (`Deploy/docs/PRIVACY-POLICY.md:22`), but `sg_tg_opt_out` defaults to `false` and the toggle defaults to checked (`popup/popup.js:508`). Users are enrolled by default if credentials are configured.
- **P1 — No explicit user consent before transmitting PII to the license server.** `verifyLicense` sends `deviceId`, `fingerprint`, and `key` to `shiftgrabber.net` (`background/service-worker.js:730-734`) without a first-run consent dialog. GDPR Article 6 lawful basis is not established in the UI.
- **P1 — No "Delete My Data" / right to erasure.** The export button provides data portability, but there is no way for a user to purge their stored credentials, fingerprints, or queued Telegram messages. Uninstalling leaves data in `chrome.storage.local`.
- **P1 — Data retention statements are vague.** "Shift grab logs are retained until you clear them or uninstall the extension" does not specify a concrete retention period.
- **P1 — Terms of Service lack jurisdiction / governing law clause.**
- **P1 — Export includes encrypted tokens and sensitive metadata without a warning.** The user downloads a JSON blob containing `sg_enc_token`, `sg_userKey`, `sg_device_id`, etc. without being informed of the sensitivity.

---

## Weighted Final Score: 46/100

| Dimension | Raw | Weight | Weighted |
|-----------|-----|--------|----------|
| 1. Security Architecture | 45 | 20% | 9.0 |
| 2. Code Quality & Maintainability | 48 | 15% | 7.2 |
| 3. MV3 Compliance & Reliability | 52 | 15% | 7.8 |
| 4. UX & Popup Design | 42 | 10% | 4.2 |
| 5. Build & DevOps Pipeline | 30 | 10% | 3.0 |
| 6. Documentation Completeness | 58 | 10% | 5.8 |
| 7. Testing & Verification | 35 | 10% | 3.5 |
| 8. Compliance & Legal | 55 | 10% | 5.5 |
| **TOTAL** | — | — | **46.0** |

---

## Critical Issues (P0)

1. **Product is completely non-functional due to encrypted-token / scheduling disconnect.** `storeEncryptedToken` (`background/service-worker.js:631`) sets `sg_access_token` to `null`. Every scheduling function (`scheduleNextBurstAnchor:332`, `startOverrideTick:343`, alarm handlers `:368`, `:390`, `:406`, `SG_RELOAD_ALL_NOW:526`) checks `st[K.ACCESS_TOKEN]` and returns early. `loadEncryptedToken()` is never called in the scheduling hot path. **The extension cannot schedule bursts, override ticks, or reloads.** Introduced by the plaintext-cache removal fix.
2. **`const` reassignment crash in content script.** `src/content/main.js:402-403` declares `const nowSec` and `const hasToken`, then lines 421-422 reassign them without a declaration keyword. This throws a `TypeError` and crashes the HUD update loop.
3. **Build pipeline HMAC injection is broken by obfuscation.** `build.js:177-180` searches for the literal local variable `_hk` and a `// placeholder` comment in obfuscated output. `identifierNamesGenerator: "mangled"` renames `_hk`, and `compact: true` strips comments. The regex fails, shipping the literal placeholder `sg-_-hmac-_-v1-_-key` as the HMAC key. Server responses will fail validation for all users.
4. **Build pipeline integrity hash is invalidated by its own pipeline.** `build.js:189-196` computes a SHA-256 hash and injects it into the service worker. The subsequent loop at `build.js:209-218` randomizes global names by rewriting the same file, altering its contents and making the injected hash permanently wrong. Even if the injection regex matched, the runtime check would fail on every legitimate build.
5. **Simple mode popup is completely unstyled.** `popup/styles.css` defines `:root` variables (`--bg`, `--card`, etc.) but the simple-panel section references an entirely different undefined set (`--text-primary`, `--accent-500`, `--radius-md`, etc.) on lines 299, 322, 330, 338, 351, 361, 384, 391, 454, 469. The simple UI renders broken.
6. **Content script calls unavailable `chrome.tabs` API.** `src/content/main.js:509` invokes `chrome.tabs.query`. The `tabs` API is not exposed to MV3 content scripts. This throws `TypeError` at runtime.

---

## Warnings (P1)

7. **HMAC key fallback ships a known string.** `build.js:176` uses `process.env.SG_HMAC_KEY || "change-me-in-production"`. A missing env var should abort the build, not ship a public key.
8. **Heartbeat lacks HMAC validation.** `background/service-worker.js:34-71` trusts the `/heartbeat` response blindly. MITM can send `{ kill: true }` and globally disable all installations.
9. **Integrity check is dead code.** `background/service-worker.js:683-700` compares a build-time hash against `sg_integrity_hash` from storage. The server contract says `/verify` returns `integrityHash`, but `verifyLicense` never stores it. Even if stored, the hash is wrong due to P0 #4.
10. **`api-layer.js` postMessage lacks source validation.** `src/content/api-layer.js:349-371` accepts any `postMessage` with `e.data.sg === true`. Any page script can stop polling or spoof claims.
11. **`SG_LICENSE_VERIFIED` clears alarms outside the mutex.** `background/service-worker.js:461-476` calls `clearAllAlarms()` without `withAlarmLock()`, racing with concurrent alarm operations.
12. **`CLAIM_Q_SET` has zero rotation.** `src/content/api-layer.js:18-22` contains three identical mutation strings. Only the operation name rotates.
13. **CI uploads empty / stale artifacts.** `.github/workflows/ci.yml:32-42` uploads `Deploy/extension/**`, but `build.js` outputs to `dist/`. The artifact will be empty.
14. **`npm ci` fails in CI.** No `package-lock.json` exists. The CI workflow (`ci.yml:22`) will error on every run.
15. **`build:zip` is Unix-only.** `package.json:7` uses the `zip` CLI, which fails on Windows without WSL.
16. **Version numbers are inconsistent.** `manifest.json:4` = `2.0.0`, `package.json:3` = `2.1.0`, `popup/index.html:14` = `V9`.
17. **Telegram is opt-out, not opt-in.** The privacy policy claims opt-in, but `sg_tg_opt_out` defaults to `false` and the toggle defaults to checked (`popup/popup.js:508`).
18. **No explicit consent for server data transmission.** `verifyLicense` sends fingerprint + deviceId + key to the server without a first-run consent dialog.
19. **Floating promise in alarm handler.** `flushTelegramQueue()` is called without `await` at `background/service-worker.js:370`, risking lost notifications if the SW sleeps.
20. **All SW `fetch` calls lack timeout.** No `AbortSignal` on `verifyLicense`, `sendHeartbeat`, `fetchServerConfig`, or `refreshTokenInBackground`.
21. **Popup hardcodes server URL.** `popup/popup.js:95` uses `shift-grabber.vercel.app`, ignoring multi-environment config.
22. **`onInstalled` resets all user settings on every update.** `background/service-worker.js:871` calls `setState(DEFAULTS)`, overwriting `sg_enabled`, `sg_paused`, etc. Users will find the extension disabled after updates.
23. **E2E test does not test core logic.** `tests/e2e/smoke.test.js` verifies UI rendering but never exercises license verification, alarms, or token refresh.
24. **Server contract contradicts code.** `Deploy/docs/SERVER-CONTRACT.md:113` mandates HMAC on all responses, but heartbeat ignores it. Contract says `/heartbeat` pushes `config`, but code ignores `json.config`.
25. **Stale comments mislead maintainers.** `background/service-worker.js:776-777` claims plaintext cache is kept, but code sets it to `null`.
26. **HUD drag position saved but never restored.** `src/content/main.js:373` writes `sg_hud_pos`, but `init()` never reads it.
27. **No keyboard navigation or ARIA in popup.** Toggle switches lack `tabindex` and `aria-label`.

---

## Recommendations for 100/100

**Immediate (fix before any release)**
1. **Fix the scheduling / encrypted token disconnect.** Either update `scheduleNextBurstAnchor`, `startOverrideTick`, and all alarm handlers to call `loadEncryptedToken()` and use the decrypted token, or cache the decrypted token in-memory inside the service worker (refreshed on every storage change / alarm wake) while keeping storage encrypted.
2. **Fix the `const` reassignment in `main.js`.** Change `const nowSec / hasToken` at lines 402-403 to `let`, or rename the second pair.
3. **Fix the build pipeline injection.** Inject the HMAC key and integrity hash **before** obfuscation (e.g., using a unique marker string like `__SG_HMAC_KEY_PLACEHOLDER__` that survives as a literal), or use a JSON config file that is imported without obfuscation. Compute the integrity hash **after** all file modifications (including global name randomization) are complete.
4. **Fix simple mode CSS.** Define the missing custom properties in `:root` or replace them with the existing ones (`--fg`, `--muted`, `--blue`, etc.).
5. **Remove `chrome.tabs.query` from `main.js`.** Move tab enumeration to the service worker and message the result to the content script if needed.

**Short-term**
6. Add `package-lock.json` or change CI to `npm install`.
7. Update CI artifact upload path to `dist/**` or copy `dist/` to `Deploy/extension/` in `build.js`.
8. Replace the HMAC key fallback with `process.exit(1)` and a clear error message.
9. Add HMAC validation to `sendHeartbeat`.
10. Store `json.integrityHash` from `/verify` so the runtime check can function once the build hash is correct.
11. Add source validation to `api-layer.js` postMessage (e.g., a shared secret token negotiated at load time).
12. Rotate `CLAIM_Q_SET` to contain genuinely distinct mutation shapes.
13. Fix `onInstalled` to only set defaults for missing keys, or gate `setState(DEFAULTS)` behind `details.reason === "install"`.
14. Add `AbortSignal.timeout(10000)` to all `fetch` calls.
15. Unify version numbers across manifest, package, and HTML.
16. Implement a true first-run consent flow and a "Delete My Data" button that calls `chrome.storage.local.clear()`.
17. Replace placeholder `lint` / `test` scripts with real ESLint and Vitest/Jest suites.
18. Add unit tests for `loadEncryptedToken`, `scheduleNextBurstAnchor`, alarm mutex behavior, and `validateMessage`.

**Long-term**
19. Migrate from IIFE globals to ES modules for MV3 compliance and encapsulation.
20. Add TypeScript and strict null checks.
21. Implement a state machine reducer instead of scattered boolean flags.
22. Add Sentry or similar error reporting for production visibility.
23. Implement certificate pinning or public-key pinning for the license server.

---

*Report generated by LAURA — Independent Security & Code Quality Analysis*
*Methodology: Static code analysis, architecture review, security audit, build pipeline verification, compliance heuristic evaluation*
