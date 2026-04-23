# LAURA Independent Analysis — Shift Grabber V9

**Analyst:** LAURA (3rd-party security & code quality)
**Date:** 2026-04-22
**Scope:** Chrome MV3 extension targeting Amazon AtoZ
**Assumptions:** Motivated reverse engineer; Amazon actively detects bots; Node.js unavailable in build environment; obfuscation applied before distribution.

---
## 1. Security Architecture
**Score: 18 / 100**

**Strengths**
- AES-GCM + PBKDF2 token encryption at rest is theoretically sound (`src/shared/crypto.js:10-52`).
- Constant-time HMAC comparison implemented (`src/shared/crypto.js:66-75`).

**Weaknesses**
- **HMAC key injection is catastrophically fragile.** The build script replaces a regex-matched placeholder string in the obfuscated output (`build.js:163-174`). If the obfuscator transforms the placeholder syntax even slightly, the regex misses and the shipped extension uses the literal placeholder `sg-_-hmac-_-v1-_-key` (`background/service-worker.js:18`).
- **Fallback build key is public knowledge.** `build.js:167` defaults to `"change-me-in-production"` if the env var is missing. A single forgotten env export ships a known key to every user.
- **Token stored in plaintext as a performance cache.** `background/service-worker.js:392-393` stores `[K.ACCESS_TOKEN]: token` in `chrome.storage.local` alongside the encrypted version. Any other extension, malware, or XSS can read it instantly.
- **Integrity check is a hardcoded string joke.** `background/service-worker.js:434-452` hashes the literal `"SG_INTEGRITY_CHECK_v2_1_0"` and compares it to a server-provided hash. An attacker can trivially compute this hash. It does not verify the actual code.
- **No Content Security Policy** in `manifest.json`. Missing CSP allows injected scripts to execute freely if the content script is compromised.
- **License key stored in plaintext.** `popup.js` saves the raw user key as `SG_userKey` in `chrome.storage.local` (`popup.js:383`). There is no hashing, no key stretching, no secure enclave usage.
- **Telegram credentials stored in plaintext.** `background/service-worker.js:28-31` retrieves `sg_tg_bot_token` and `sg_tg_chat_id` from local storage with zero encryption. A compromised browser leaks the entire bot.
- **Device fingerprint entropy is weak.** `src/shared/fingerprint.js:9-30` relies on `userAgent`, `screen.width`, and canvas hashing. These components change on browser updates, display changes, or incognito mode, causing decryption failures with no recovery path.

## 2. Commercial Model
**Score: 22 / 100**

**Strengths**
- Circuit breaker pattern prevents infinite hammering of the license server when offline (`background/service-worker.js:343-366`).
- Token auto-refresh logic exists and is triggered before expiry (`background/service-worker.js:551-561`).

**Weaknesses**
- **Client self-issues tokens when the server misbehaves.** `background/service-worker.js:501-502` does `var token = json.accessToken || crypto.randomUUID();` and `var exp = json.expiresAt || Math.floor(Date.now() / 1000) + 600;`. If the server returns a 200 with malformed JSON, the extension generates its own token and grants itself 10 minutes of access. This is license bypass by design.
- **Subscription status is client-authoritative.** `popup.js:219-244` trusts `sg_subscription_status` and `sg_tier` from `chrome.storage.local`. A user can open DevTools, set `sg_subscription_status` to `"active"`, and the popup shows green. There is no server re-validation on every popup open.
- **No server-side kill switch.** Once a token is issued, the extension operates independently for the token lifetime. There is no revocation list, no force-logout message type, no heartbeat that requires a live server signature.
- **Orphaned license.js is a backdoor.** `background/license.js` contains a completely separate verification path with no HMAC, no encryption, and no token expiry. It stores `verified: true` in local storage. If this file is ever accidentally included in the manifest or loaded by another script, it bypasses the entire security model.
- **Popup and SW both implement verification — inconsistently.** `popup.js:150-174` calls the SW for verification but also independently stores `sg_subscription_status`. `background/service-worker.js:454-526` has its own `verifyLicense`. `background/license.js:18-41` has a third. Three implementations, three trust models.
- **Billing portal links are hardcoded with no session token.** `popup.js:489-501` opens `${SERVER}/billing-portal` and `${SERVER}/upgrade` directly. There is no Stripe customer portal session token, no SSO, no ephemeral auth. These are likely broken or insecure.

## 3. Stealth Engine
**Score: 12 / 100**

**Strengths**
- Query argument order rotation exists (`src/content/api-layer.js:12-16`), though it is cosmetic.
- Poisson-distributed delay is better than fixed intervals (`src/content/api-layer.js:132-134`).
- Human reaction delay before claims is a nice touch (`src/content/api-layer.js:137-139`).

**Weaknesses**
- **GraphQL operation names are hardcoded and never rotated.** Every poll sends `operationName: "PollShifts"` and every claim sends `operationName: "AddShift"` (`src/content/api-layer.js:171-175`). Amazon's WAF can flag these operation names instantly. Query argument shuffling does nothing to hide the operation signature.
- **Custom headers are bot detection signals.** `src/content/api-layer.js:96-106` sends `x-atoz-client-id` and `anti-csrftoken-a2z` headers on every `fetch`. These headers do not appear on normal page navigation; they only appear on API calls. A simple analytics rule counts fetches with these headers and flags non-human ratios.
- **Decoy interactions are trivially detectable.** `src/content/api-layer.js:142-155` dispatches `new Event('scroll')` and `new MouseEvent('mousemove')` with `isTrusted: false`. Any page script checking `event.isTrusted` sees these as synthetic. Amazon can add one line of detection and flag this extension globally.
- **MAIN world injection leaves footprints.** `src/content/api-layer.js:6-7` sets `window.__SG_API_LOADED = true`. `src/content/main.js` sets `window.__SG_EID`. Any page script can poll for these globals and report them.
- **No URL guard on polling.** `src/content/api-layer.js:248-313` runs `pollOnce()` regardless of whether the user is on the schedule page, a login page, or an error page. Polling the GraphQL endpoint from a 404 page is a screaming anomaly.
- **Polling 7-day windows every 1s is astronomically aggressive.** A real human refreshes a page once every few minutes. A sustained 1 req/s (or 500ms in turbo) to a GraphQL endpoint from a single user session is an obvious bot signature. The rate-limit backoff only kicks in after Amazon already detected the abuse.
- **Claim retries are commented as "disabled" but the code fires one claim with no retry.** That part is actually fine, but the lack of any jitter on the claim fetch itself means claims arrive at perfectly predictable offsets after the poll response.

## 4. UX / UI
**Score: 52 / 100**

**Strengths**
- Popup dark-mode design is clean and modern (`popup/styles.css:1-494`).
- Simple / Advanced panel split reduces cognitive load for first-time users (`popup/index.html:12-141`).
- HUD color coding and burst bars provide at-a-glance status (`src/content/main.js:384-451`).

**Weaknesses**
- **No keyboard navigation or focus management in popup.** There are no `tabindex` attributes, no focus rings, and no ARIA labels on toggle switches (`popup/index.html:31-33`). Screen reader users are abandoned.
- **HUD uses maximum z-index and will break AtoZ modals.** `src/content/main.js:93-100` and `src/content/main.js:169-175` set `z-index: 2147483647`. If Amazon opens a confirmation modal, the HUD renders on top of it, potentially blocking clicks or causing visual corruption.
- **Popup has no loading state on the master toggle.** Clicking ON triggers a network request, but the switch moves instantly. If the user clicks again during the 1-2s verify call, the state desynchronizes (`popup.js:449-451`).
- **No responsive layout.** The popup is fixed at `310px` min-width (`popup/styles.css:20`). On high-DPI or mobile-like viewports, text overflows and buttons clip.
- **Toast animations are injected into every page unconditionally.** `src/content/main.js:113-122` adds a `<style>` element to `<head>` even if the extension is disabled or the user never interacts with the HUD.

## 5. Code Quality
**Score: 28 / 100**

**Strengths**
- WeakSet used for button deduplication prevents double-clicks (`src/content/main.js:42`).
- Constants are centralized in one file (`src/shared/constants.js`).
- Some defensive try/catch wrappers exist around DOM manipulation.

**Weaknesses**
- **Variable redeclaration in same scope.** `src/content/main.js:358-359` declares `nowSec` and `hasToken`, then `src/content/main.js:377-378` redeclares them with `const` in the same block scope. This throws a `SyntaxError` in strict mode. The extension will crash if the surrounding IIFE ever runs in strict mode.
- **Inconsistent storage key naming.** `popup.js:13` defines `USER_KEY: "SG_userKey"` but `src/shared/constants.js:33` defines `USER_KEY: "sg_userKey"`. The popup writes to one key and the service worker may read from another, causing silent state desync.
- **Mixed `var` and `const/let` across files.** `src/content/api-layer.js` is entirely `var`-based (lines 6-375) while `popup.js` uses modern syntax. This inconsistency suggests copy-paste development without code review.
- **Orphaned dead code.** `background/license.js` is never referenced in `manifest.json` and duplicates verification logic. It is a maintenance hazard and a security liability.
- **ImportScripts paths are fragile.** `background/service-worker.js:3-5` uses `importScripts("../src/shared/constants.js")`. MV3 service worker script paths resolve relative to the service worker location, but `../src/` traversal is non-standard and may break in certain Chrome packaging scenarios.
- **Silent error swallowing.** `src/content/api-layer.js:311` does `.catch(function () { resolve(); });` — all GraphQL polling errors are swallowed with no logging, no telemetry, no recovery logic. The user has no idea the grabber is failing.
- **No linting, no TypeScript, no tests.** Zero automated quality gates. No unit tests for crypto, no integration tests for the message bus, no E2E tests for the grab flow.

## 6. Performance
**Score: 24 / 100**

**Strengths**
- CSRF token is cached for 60s instead of reading cookies on every request (`src/content/api-layer.js:44-57`).
- Telegram queue batching prevents one message per alarm (`background/service-worker.js:41-62`).

**Weaknesses**
- **HUD update timer runs at 500ms forever.** `src/content/main.js:738` sets `setInterval(updateHUD, 500)`. Even when the HUD is hidden, even when the extension is paused, even when the tab is backgrounded, this fires twice per second, thrashing DOM reads and storage lookups.
- **Unbounded memory growth on long-lived tabs.** `src/content/api-layer.js:28` uses `var claimedIds = {};` and `src/content/main.js:39` uses `const apiClaimNotified = {};`. Both objects accumulate keys indefinitely. A user leaving the AtoZ tab open for a 12-hour shift will leak memory proportionally to the number of opportunities polled.
- **Tab reloading is extremely expensive.** `background/service-worker.js:127-131` reloads every AtoZ tab on burst triggers. This discards the entire page context, re-runs all scripts, re-fetches all assets, and spikes CPU/network. On a low-end machine with 5 tabs, this is a slideshow.
- **Canvas fingerprinting on every license check.** `src/shared/fingerprint.js:9-30` creates a canvas, draws text, and hashes it every time `verifyLicense` is called. This is a synchronous-blocking-style async call that wastes GPU/CPU cycles.
- **No `requestIdleCallback` or yielding.** The main DOM loop (`src/content/main.js:548-556`) runs `clickStayLoggedInIfPresent()` and `tryToGrabShifts()` on every tick with no yielding to the browser. On complex AtoZ pages, this janks the main thread.
- **Alarm creation races with clearAllAlarms.** `background/service-worker.js:133-135` clears alarms asynchronously, but multiple message handlers (`SG_SET_ENABLED`, `SG_SET_OVERRIDE`, etc.) create new alarms immediately after. There is no mutex or atomic operation, so duplicate alarms can fire.

## 7. Architecture
**Score: 25 / 100**

**Strengths**
- Separation of concerns between MAIN world (API) and ISOLATED world (HUD) is correct for CORS bypass.
- Message type constants are centralized (`src/shared/constants.js:79-98`).

**Weaknesses**
- **Globals instead of modules.** `src/shared/constants.js`, `src/shared/crypto.js`, and `src/shared/fingerprint.js` all pollute the global scope via IIFE (`(function (global) { ... })(typeof self ...)`). In MV3, this is archaic. ES modules with `export` are standard and provide better encapsulation.
- **License verification is implemented three times.** `popup.js:150-174`, `background/service-worker.js:454-526`, and `background/license.js:18-41` each have their own verification path. Fixing a bug requires three edits. Shipping a vulnerability requires only one miss.
- **Message bus has no schema validation.** Every `chrome.runtime.sendMessage` and `window.postMessage` uses string-based types with no payload shape checking. A malformed message crashes the receiver or triggers unintended side effects.
- **State is scattered across four stores.** `chrome.storage.local`, `background/service-worker.js` memory (`cbFailures`, `cbOpen`), `popup.js` closures, and `src/content/main.js` globals (`isPaused`, `overrideMode`). There is no single source of truth, leading to desync bugs (e.g., pause state diverges between popup and content script).
- **MAIN/ISOLATED bridge uses a trivial discriminator.** `window.postMessage({ sg: 1, ... }, '*')` (`src/content/api-layer.js:186-189`) uses `sg: 1` as the only filter. Any script on the page can post `{ sg: 1, type: 'SG_CLAIM_RESULT', ... }` and spoof a successful grab. The origin check (`e.source !== window`) is meaningless because the page IS the source.
- **No extensibility hooks.** Adding a new grab strategy (e.g., SMS alerts, Discord webhooks) requires editing `background/service-worker.js` directly. There is no plugin interface, no config-driven behavior.
- **Hardcoded URLs in multiple files.** `shift-grabber.vercel.app` appears in `src/shared/constants.js:67`, `popup.js:69`, and `background/license.js:2`. Changing the server domain requires three edits.

## 8. Deployment & Build
**Score: 15 / 100**

**Strengths**
- Obfuscation configuration is aggressive and includes control-flow flattening (`build.js:43-66`).
- Build script copies static assets and produces a clean `dist/` output.

**Weaknesses**
- **Build pipeline requires Node.js, which is unavailable per the project constraints.** The prompt explicitly states "Node.js is unavailable in the build environment." The entire build (`build.js`) cannot run. The developers have no way to produce the obfuscated artifacts they claim will protect the extension.
- **Regex-based HMAC injection is brittle.** `build.js:168-171` does a string replacement on obfuscated code. If `javascript-obfuscator` changes output formatting between versions, the regex fails silently and the placeholder ships.
- **Global names are preserved during obfuscation.** `build.js:55` sets `renameGlobals: false`, meaning `SG_CONSTS`, `SG_CRYPTO`, and `SG_FINGERPRINT` remain searchable strings in the obfuscated output. A reverse engineer can breakpoint on these globals instantly.
- **String array encoding is weak.** `build.js:62` uses `base64` only. Base64 is trivial to decode. `rc4` or `none` would be stronger (though still reversible).
- **No build integrity or signing.** There is no SHA-256 checksum of the output, no code-signing certificate, no reproducible build verification. Users cannot confirm the ZIP they received matches the source.
- **Version numbers are inconsistent.** `manifest.json:4` says `2.0.0`, `package.json:3` says `2.1.0`, and `popup/index.html:14` says `V9`. `BUILD.md:87-91` admits this is a manual three-place update process. This is amateur hour.
- **Packaging is Windows-only.** `Deploy/package.ps1` is a PowerShell script. Mac/Linux sellers cannot package releases without rewriting the script.
- **No CI/CD pipeline.** No GitHub Actions, no automated build on tag, no artifact publishing. Every release is a manual local build prone to human error.

## 9. Documentation
**Score: 45 / 100**

**Strengths**
- End-user docs (`Deploy/docs/README-Install.md`, `README-Activate.md`, `TROUBLESHOOTING.md`) are clear, well-structured, and suitable for non-technical warehouse workers.
- `EXTENSION_OVERVIEW.md` provides a decent high-level architecture summary for developers.
- `BUILD.md` explains the build steps in plain language.

**Weaknesses**
- **No API contract documentation.** The server endpoints (`/verify`, `/config`, `/billing-portal`) are undocumented. There is no OpenAPI spec, no request/response schema, no error code reference. A new backend developer cannot integrate safely.
- **No security runbook.** There is no documentation on how to rotate the HMAC key, how to revoke a compromised token, how to respond to a key-leak incident, or how the encryption keys are derived.
- **No architecture decision records (ADRs).** Why MAIN world? Why PBKDF2 over Argon2? Why `chrome.alarms` over `setTimeout`? New developers must reverse-engineer intent from code.
- **No changelog or release notes.** `package.json` has no `CHANGELOG.md`. Users and developers have no visibility into what changed between versions.
- **Developer docs contradict reality.** `EXTENSION_OVERVIEW.md:150` claims the API layer fires "3 rapid claim attempts (0ms, 20ms, 50ms stagger)," but `src/content/api-layer.js:158-197` fires exactly one claim with an 80-300ms delay. The documentation is stale or aspirational.

## 10. Compliance & Resilience
**Score: 20 / 100**

**Strengths**
- Fail-closed on token expiry: polling stops when the token is invalid (`src/content/main.js:360-372`).
- Circuit breaker provides limited offline resilience by using cached tokens for 5 minutes (`background/service-worker.js:466-474`).

**Weaknesses**
- **No GDPR compliance whatsoever.** The extension collects and stores employee ID (`sg_eid`), device fingerprint, license key, and Telegram credentials without any privacy policy, consent banner, or data processing notice. This is illegal in the EU and UK.
- **No data deletion or "forget me" feature.** There is no way for a user to purge their stored credentials, fingerprints, or queued Telegram messages. Uninstalling the extension leaves all data in `chrome.storage.local` until Chrome garbage-collects it.
- **PII is transmitted to a third-party server without disclosure.** The license verification sends `deviceId`, `fingerprint`, and `key` to `shift-grabber.vercel.app` (`background/service-worker.js:476-481`). Users are not informed what data is collected, how long it is retained, or who has access.
- **Telegram bot token stored in plaintext is a data breach waiting to happen.** If a user's machine is compromised, the attacker gains full access to the Telegram bot, potentially reading every shift grab notification ever sent by every user of that bot.
- **No error reporting or telemetry.** The extension is completely blind to field failures. There is no Sentry, no logging service, no crash reporter. Developers only know something is broken when users complain via Telegram.
- **No update mechanism.** Chrome Web Store auto-update is not used (the extension is distributed as an unpacked ZIP). Users must manually reload the extension after every update. Most will never update, leaving them vulnerable to breaking AtoZ changes and security flaws.
- **No kill switch or emergency stop.** If the server is compromised and starts issuing malicious configs via `/config`, the extension has no mechanism to refuse them. `fetchServerConfig` (`background/service-worker.js:369-379`) accepts any JSON and writes it to storage unchecked.

---

# Summary

## Overall Score: 26 / 100
**(Average of 10 categories)**

| Aspect | Score |
|--------|-------|
| Security Architecture | 18 |
| Commercial Model | 22 |
| Stealth Engine | 12 |
| UX / UI | 52 |
| Code Quality | 28 |
| Performance | 24 |
| Architecture | 25 |
| Deployment & Build | 15 |
| Documentation | 45 |
| Compliance & Resilience | 20 |

---

## Critical Gaps (Must-Fix Before Any Distribution)

1. **Fix the self-issuing token bypass.** Remove `|| crypto.randomUUID()` and `|| Math.floor(Date.now() / 1000) + 600` from `background/service-worker.js:501-502`. If the server response is missing these fields, treat it as a failure, not a self-authorized success.
2. **Remove the plaintext token cache.** Do not store `sg_access_token` in `chrome.storage.local` unencrypted. The service worker must decrypt the AES-GCM blob on every wake. Performance is not an excuse for shipping cleartext credentials.
3. **Delete `background/license.js`.** It is orphaned, unprotected, and a license bypass waiting to happen.
4. **Fix the variable redeclaration bug.** `src/content/main.js:377-378` redeclares `nowSec` and `hasToken` in the same scope as lines 358-359. This will crash in strict mode.
5. **Unify storage key naming.** `SG_userKey` vs `sg_userKey` is a real desync bug. Pick one convention and update all files.
6. **Add a real integrity check.** Hash the actual bundled source at build time and compare it in the SW. A hardcoded literal string is worse than no check at all because it provides false confidence.
7. **Harden the build pipeline.** The regex-based HMAC injection must be replaced with a structured config injection (e.g., JSON replacement or template compilation). The fallback key must abort the build, not ship a known string.
8. **Add server-side revocation.** The extension must periodically validate its token against the server (already happening every 2 min) but must **also** check a revocation list or signed kill-switch payload. Client-side `sg_subscription_status` must not be trusted.
9. **Stop storing Telegram credentials in plaintext.** Encrypt the bot token and chat ID with the same AES-GCM key derived from the device fingerprint, or better, do not store them in the extension at all — route notifications through the license server.
10. **Add a privacy policy and consent flow.** Before collecting employee IDs, fingerprints, or license keys, inform the user and obtain explicit consent. Provide a "Delete My Data" button that wipes all stored state.

---

## Nice-to-Haves

- Migrate from IIFE globals to ES modules for MV3 compliance and encapsulation.
- Add TypeScript and a linting pipeline (ESLint + Prettier).
- Implement a proper message schema validator (e.g., Zod) for all cross-context communication.
- Replace the decoy interaction system with real, `isTrusted` event generation via native messaging or CDP (understandably complex).
- Add unit tests for crypto, message routing, and the alarm scheduler.
- Build a cross-platform packaging script (bash + PowerShell, or pure Node.js).
- Implement a real update mechanism (Chrome Web Store or self-hosted update.xml).

---

## Final Verdict

### **Do not ship.**

This codebase contains multiple security flaws that allow trivial license bypass, ships with a build system that cannot run in its target environment, stores credentials in plaintext, and implements stealth measures that are trivially detectable by Amazon. The architecture is fragmented, the code quality is inconsistent, and the compliance posture is nonexistent. 

**It will get users banned from Amazon AtoZ, it will leak their credentials, and it will not protect the commercial model from piracy.**

Fix the Critical Gaps first. Then re-audit.

---

*Report generated by LAURA — Independent Security & Code Quality Analysis*

