# LAURA Security Audit — SF30 V1.0 Chrome Extension

**Auditor:** LAURA (independent 3rd-party)  
**Scope:** `C:\Users\Dexinox\Documents\GitHub\atoz - tg ready\SF30\` (source only, excluding `node_modules/`, `dist/`, `dist-debug/`, `Deploy/`)  
**Date:** 2026-04-23  
**Method:** Full source code review, no existing reports consulted.

---

## 1. Security Architecture (15% weight)
**Score: 35 / 100**

- **P0 — Cargo-cult HMAC key:** `build.js` enforces `SG_HMAC_KEY` but the key is **never injected or used** in runtime code. `service-worker.js` encrypts Telegram credentials with the device fingerprint, not an HMAC secret. The `crypto.js` HMAC functions are dead code.
- **P0 — Public key embedded in plaintext:** The RSA public JWK is baked into `constants.js` at build time. Anyone who unpacks the `.zip` can extract it for targeted cryptanalysis or key forgery attempts.
- **P1 — Weak AES key derivation:** Telegram credentials are encrypted with AES-GCM using PBKDF2 at only 100,000 iterations and a **hardcoded salt** (`"sg-salt-v1-fixed"`). The "passphrase" is the device fingerprint, which has extremely low entropy.
- **P1 — Shared per-build message secret:** `MSG_SECRET` is randomized once per build, not per install. One user extracting it from their extension can spoof inter-script messages for every other user of that build.
- **P1 — Client-side storage tampering:** License expiry (`sg_license_exp`), trial state (`sg_trial_start`), and clock-tamper guard (`sg_max_seen_time`) all live in `chrome.storage.local` and can be manually cleared or edited by any power user.
- **P2 — No runtime integrity checks:** `BUILD.md` claims "integrity hash is computed from the obfuscated service worker," but `build.js` does not implement this. The extension cannot detect if its own code has been tampered with.

**Verdict:** The RSA signature verification itself is technically correct, but everything surrounding it is either fake security (HMAC) or trivially bypassable via local storage tampering.

---

## 2. License & Commercial Model (12% weight)
**Score: 30 / 100**

- **P0 — Infinite trial bypass:** The 24-hour trial is gated solely by `sg_trial_start` in local storage. A user can delete this key and get a fresh trial indefinitely. There is no server-side enforcement.
- **P0 — No revocation mechanism:** The offline model has **no way to revoke a leaked key**. Once a valid signature is distributed, it works until `payload.exp`. The `REASONS.REVOKED` constant exists but is never checked.
- **P1 — Tier differentiation is fake:** The license payload carries `"basic"` or `"pro"` but the codebase does not gate a single feature behind tier. It's purely cosmetic UI.
- **P1 — Device binding is theater:** The fingerprint relies on `userAgent`, screen size, and a trivial canvas hash. Two identical laptops produce the same fingerprint. The `chrome.storage.sync` secondary check is bypassed simply by not signing into Chrome.
- **P2 — Clock tamper is weak:** `sg_max_seen_time` is also in local storage. A user can clear it alongside `sg_trial_start` in one shot.

**Verdict:** The commercial model is essentially an honor system with client-side checks that any moderately technical user can bypass in under 30 seconds.

---

## 3. Stealth / Anti-Detection (15% weight)
**Score: 25 / 100**

- **P0 — `web_accessible_resources` exposes extension ID:** `sounds/click.mp3` is declared as a web-accessible resource on `atoz.amazon.work`. The host page can probe for this asset to detect the extension with 100% reliability.
- **P0 — Highly detectable DOM injection:** The HUD injects elements with IDs (`sg-hud-styles`, `sg-toast-styles`) and class names (`sg-hud`, `sg-hud-brand`). The build-time "randomization" only prepends a 3-character prefix (e.g., `abc-hud`), leaving the suffix completely static and pattern-matchable.
- **P0 — MAIN world globals:** `api-layer.js` sets `window.__sg_api_v3` (or a lightly randomized variant). Page scripts can enumerate `window` for these sentinel properties.
- **P1 — Distinctive console signatures:** Logs like `[SG] API: X polls/30s`, `[ShiftGrabber] ...`, and `sgToastIn` animations are scattered throughout. Even with prefix randomization, the structural patterns remain trivial signatures for Amazon's bot detection.
- **P1 — Aggressive `tabs.reload()`:** The service worker mass-reloads AtoZ tabs on a predictable 5-minute burst cadence. This creates a trivially correlatable network and UI signature.
- **P1 — "Rotated" queries are cosmetic:** The GraphQL query variants only shuffle argument/field order. A WAF looking for `shiftOpportunities`, `addShift`, or `opportunityTypes` catches all three instantly. The operation name rotation (`PollShifts` / `GetShiftList` / `QueryOpportunities`) is a 3-value static set.
- **P1 — No request normalization:** The `fetch()` calls carry `Referer` and `credentials: "include"` but lack any effort to blend into normal page traffic patterns.

**Verdict:** The stealth features are superficial. Amazon could detect and ban users of this extension within a single day using basic DOM or network heuristics.

---

## 4. UX / UI / Accessibility (10% weight)
**Score: 65 / 100**

- **P1 — Good ARIA coverage:** Tabs use `role="tablist"`, `aria-selected`, `aria-controls`, and `aria-label`. The popup has polite live regions for status updates.
- **P1 — Keyboard navigation:** Escape closes, arrow keys switch tabs, Enter submits license. Focus-visible styles are present.
- **P2 — Missing accessibility:** No `prefers-reduced-motion` support. Toast notifications are visual-only with no screen-reader announcement. The HUD is not keyboard-accessible.
- **P2 — Dark theme is polished:** CSS variables are well-organized, contrast is decent, and the UI feels premium.
- **P2 — Confusing consent text:** The modal says "communicate with our servers" in an offline extension. This is misleading UX even if not strictly a UI bug.

**Verdict:** The visual design is polished and ARIA basics are covered, but accessibility is shallow and the consent copy is deceptive.

---

## 5. Code Quality & Maintainability (10% weight)
**Score: 40 / 100**

- **P0 — Extensive `var` usage:** `service-worker.js`, `api-layer.js`, and `popup.js` are full of `var` declarations, creating hoisting hazards and obscuring scope. The `.eslintrc.json` explicitly disables `no-var` and `prefer-const`.
- **P0 — Fragile build-time string replacement:** `build.js` injects secrets using `code.split(...).join(...)`. A single quote change in source code breaks injection silently.
- **P1 — Tightly coupled monoliths:** `popup.js` (902 lines) and `service-worker.js` (783 lines) mix UI, business logic, networking, and scheduling with no module boundaries.
- **P1 — Implicit script load ordering:** `manifest.json` depends on exact content script execution order (`constants.js` → `crypto.js` → ...). There is no module system or dependency graph.
- **P1 — `eval()` in tests:** `license-validator.test.js` uses `eval(code)` to load the module, indicating poor test architecture.
- **P2 — Dead code:** `circuit-breaker.js` is implemented but **never instantiated** in production. Billing button handlers are empty. `javascript-obfuscator` is in `package.json` but unused.

**Verdict:** Functional but brittle. The codebase is spaghetti with global state, mixed async patterns, and a fragile string-based build pipeline.

---

## 6. Performance & Efficiency (8% weight)
**Score: 55 / 100**

- **P1 — Excessive storage reads:** `service-worker.js` calls `getState()` (which reads all defaults from `chrome.storage.local`) multiple times per alarm handler instead of caching state for the duration of the handler.
- **P1 — Aggressive DOM polling:** `main.js` runs `findAddShiftButtons()` every 600–1000ms via `querySelectorAll("button,[role='button']")`, which is expensive on React-heavy pages.
- **P1 — HUD updates every 500ms:** `updateHUD()` reads storage and rebuilds innerHTML twice per second. The `visibilitychange` mitigation helps but 500ms is still wasteful when visible.
- **P2 — No request deduplication:** If multiple AtoZ tabs are open, `api-layer.js` in each tab fires independent GraphQL polls. No shared polling or coordination.
- **P2 — Unbounded growth mitigated:** `claimedIds` and `apiClaimNotified` have periodic cleanup, which is good.

**Verdict:** Acceptable for a small extension, but storage and DOM access patterns are wasteful and unbatched.

---

## 7. Architecture & Design Patterns (10% weight)
**Score: 45 / 100**

- **P1 — No state management layer:** State is scattered across `chrome.storage.local`, module-level globals, and closure variables. The "state machine" (`computeState`) is just a single function.
- **P1 — Service worker violates SRP:** It handles alarm scheduling, license validation, Telegram sending, state migration, and token refresh all in one file.
- **P1 — Unused circuit breaker:** `SG_CIRCUIT_BREAKER` is defined but never used. The alarm mutex (`withAlarmLock`) is a primitive replacement, not a pattern.
- **P2 — Content script layering is correct:** Using ISOLATED world for UI and MAIN world for API access is the right MV3 approach, though the `postMessage` bridge is weakly secured.

**Verdict:** Some logical layering exists, but the architecture is ad-hoc and several "patterns" are implemented but never wired up.

---

## 8. Build, Deploy & Distribution (7% weight)
**Score: 40 / 100**

- **P0 — Obfuscation is a lie:** The `package.json` includes `javascript-obfuscator`, and `BUILD.md` / `CHANGELOG.md` claim "aggressive obfuscation," but `build.js` only runs **Terser** (minification). `validate-build.js` then checks for "high entropy" as if obfuscation ran, creating false confidence.
- **P1 — Incomplete debug build:** `build-debug.js` references `circuit-breaker.js` in its file list, but `build.js` does not. The two build scripts have divergent file lists.
- **P1 — Build artifacts are confusing:** `Deploy/` is in `.gitignore`, yet `build.js` syncs `dist/` into `Deploy/extension/`. This creates a dirty working tree on every build.
- **P2 — No source maps:** Debug builds don't generate source maps, making diagnostics harder.
- **P2 — Zip packaging is basic:** `zip.js` uses `Compress-Archive` which may include hidden system files.

**Verdict:** The build pipeline is incomplete and misrepresents its own security properties. Terser-only is trivially reversible.

---

## 9. Documentation & Support (5% weight)
**Score: 55 / 100**

- **P1 — `HANDOVER.md` is excellent:** Clear customer-facing install guide with screenshots and troubleshooting.
- **P2 — Internal docs are inconsistent:** `CHANGELOG.md` refers to "V9" and version "2.1.0" while `manifest.json` says "1.0.0" and the product is branded "SF30 V1.0."
- **P2 — `SECURITY-RUNBOOK.md` is dangerously outdated:** It references server endpoints (`/admin/revoke`, `/verify`, `/config`) that do not exist in the offline model. Following this runbook during an incident would mislead the response team.
- **P2 — `BUILD.md` makes false claims:** It states "Global names are randomized per build" and "integrity hash is computed" — neither is implemented in `build.js`.

**Verdict:** Customer docs are good, but internal documentation is inconsistent, outdated, and in some cases actively misleading.

---

## 10. Compliance, Privacy & Resilience (8% weight)
**Score: 30 / 100**

- **P0 — False privacy claims in consent modal:** The modal states "Shift Grabber needs to ... communicate with our servers" and lists collected data. In the offline model, **there are no servers**. This is deceptive and creates liability under consumer protection and privacy laws (GDPR/CCPA).
- **P1 — GDPR export leaks secrets:** `exportUserData()` dumps the entire `chrome.storage.local` contents, including the plaintext license key (`sg_userKey`) and encrypted Telegram credentials, into an unprotected JSON file.
- **P1 — No data retention or auto-deletion:** Error logs and Telegram queues persist indefinitely until manually cleared.
- **P2 — No resilience against storage quota:** The code does not handle `chrome.storage.local` write failures or quota exceeded errors.
- **P2 — Binary consent:** Users must accept or decline; there is no granular control.

**Verdict:** The consent modal alone is a legal liability. Data handling is naive and the GDPR export feature actually harms user privacy by dumping credentials.

---

## Overall Weighted Score

| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| 1. Security Architecture | 35 | 15% | 5.25 |
| 2. License & Commercial Model | 30 | 12% | 3.60 |
| 3. Stealth / Anti-Detection | 25 | 15% | 3.75 |
| 4. UX / UI / Accessibility | 65 | 10% | 6.50 |
| 5. Code Quality & Maintainability | 40 | 10% | 4.00 |
| 6. Performance & Efficiency | 55 | 8% | 4.40 |
| 7. Architecture & Design Patterns | 45 | 10% | 4.50 |
| 8. Build, Deploy & Distribution | 40 | 7% | 2.80 |
| 9. Documentation & Support | 55 | 5% | 2.75 |
| 10. Compliance, Privacy & Resilience | 30 | 8% | 2.40 |

### **Overall Score: 40 / 100**

---

## Top 5 P0 Issues That Must Be Fixed Before Shipping

1. **Infinite Trial Bypass**  
   `sg_trial_start` is stored in `chrome.storage.local`. Any user can clear it to receive a fresh 24-hour trial repeatedly. The commercial model is completely broken.

2. **Trivial Amazon Detection**  
   `web_accessible_resources` exposes the extension ID to the host page. The HUD injects predictable DOM signatures. Console logs and MAIN-world globals provide multiple trivial detection vectors. Users **will** be banned.

3. **False Privacy Claims (Legal Liability)**  
   The consent modal explicitly states "communicate with our servers" and lists data collection practices. SF30 is offline and has no servers. This is deceptive and exposes the distributor to consumer protection and privacy regulation liability.

4. **Weak Device Binding = License Sharing**  
   The fingerprint has extremely low entropy (userAgent + screen size + basic canvas). Identical hardware produces identical fingerprints. The `chrome.storage.sync` secondary check is bypassed by using a guest Chrome profile. Keys can be shared with minimal effort.

5. **Build Pipeline Lies About Obfuscation**  
   `javascript-obfuscator` is in dependencies and documentation claims "aggressive obfuscation," but `build.js` only runs Terser (minification). The validation script then falsely confirms obfuscation quality. This creates a dangerous false sense of security.

---

## Final Verdict

### 🔴 **DO NOT SHIP**

This extension cannot be shipped in its current state. The commercial model is trivially bypassable, the stealth measures would get users banned from Amazon, and the consent modal contains legally dangerous false claims. The codebase is functional but built on a foundation of client-side checks that are easily defeated, a build pipeline that misrepresents its security properties, and documentation that is internally inconsistent. Fix the P0 issues, implement real server-side trial enforcement (or remove trials), redesign the stealth layer, and rewrite the consent copy before any distribution.
