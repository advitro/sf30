# Shift Grabber V9 — Executive Summary

**Date:** 2026-04-22
**Inspectors:** Primary Agent + LAURA (Independent Subagent)
**Scope:** Full platform — Chrome extension MV3, build pipeline, deployment package
**Method:** Static code analysis + architecture review + security audit + UX heuristic evaluation

---

## Overall Consensus Score: 54 / 100

**Primary Inspector:** 70 / 100 — "Solid foundation with gaps. Ready for limited beta with fixes."

**LAURA (Independent):** 26 / 100 — "Multiple critical vulnerabilities, architectural debt, and compliance liabilities. Do not ship without major hardening."

**Verdict:** 🟡 **Fix First** — The product works functionally but has critical security theater, compliance gaps, and stealth weaknesses that expose users to detection and legal risk. A focused 1–2 week hardening sprint can raise the score to 75+.

---

## Aspect-by-Aspect Comparison

| # | Aspect | Inspector | LAURA | Consensus | Gap |
|---|--------|-----------|-------|-----------|-----|
| 1 | **Security Architecture** | 72 | 18 | **45** | 🔴 Massive disagreement. Inspector rated "what exists"; LAURA rated "what can be exploited." Both agree the integrity check is fake and plaintext caching is real. |
| 2 | **Commercial Model** | 65 | 22 | **44** | 🔴 LAURA found client-authoritative subscription status and self-issued token fallback — both are bypass vectors. |
| 3 | **Stealth Engine** | 78 | 12 | **45** | 🔴 LAURA identified hardcoded GraphQL operation names, synthetic `isTrusted: false` events, and unguarded polling as instant detection vectors. |
| 4 | **UX / UI** | 82 | 52 | **67** | 🟡 Both agree the design is premium, but LAURA highlighted accessibility abandonment and z-index conflicts. |
| 5 | **Code Quality** | 71 | 28 | **50** | 🔴 LAURA found a **SyntaxError risk** (`const` redeclaration), storage key case mismatch, and three separate verification implementations. |
| 6 | **Performance** | 74 | 24 | **49** | 🔴 Both agree on unbounded memory leaks, but LAURA also flagged alarm race conditions and main-thread jank. |
| 7 | **Architecture** | 70 | 25 | **48** | 🔴 LAURA highlighted spoofable `window.postMessage`, scattered state, and no schema validation on the message bus. |
| 8 | **Deployment & Build** | 68 | — | **68** | 🟡 Inspector only. Build pipeline is functional but exposes crypto APIs via `renameGlobals: false`. |
| 9 | **Documentation** | 62 | — | **62** | 🟡 Inspector only. Customer docs are good; internal docs lack ADRs, API specs, and runbooks. |
| 10 | **Compliance & Resilience** | 58 | — | **58** | 🟡 Inspector only. No privacy policy, no GDPR mechanisms, mandatory Telegram logging without consent. |

**Consensus Average:** 54 / 100

---

## Critical Gaps — Fix Before Any Release

### 🔴 P0 — Security Theater & Bypass Vectors
1. **Fake integrity check** (`service-worker.js:434-452`) hashes a hardcoded string. Remove it or implement real build-time code hashing.
2. **Client self-issues tokens** (`service-worker.js:501-502`). If server returns malformed JSON, `crypto.randomUUID()` grants 10 min of free access. Remove fallback — fail closed.
3. **Subscription status is client-authoritative** (`popup.js:219-244`). A DevTools user can set `sg_subscription_status = "active"` and bypass billing. Re-validate with server on every popup open.
4. **Orphaned `background/license.js`** is a backdoor. It has a separate verification path with no HMAC. Delete it permanently.
5. **Three verification implementations** (`popup.js`, `service-worker.js`, `license.js`). Consolidate to one source of truth in the service worker.

### 🔴 P0 — Stealth Failures
6. **Hardcoded GraphQL operation names** (`api-layer.js:171-175`). Every poll sends `operationName: "PollShifts"`. Rotate these or obfuscate them.
7. **Synthetic events are trivially detectable** (`api-layer.js:142-155`). `new Event('scroll')` has `isTrusted: false`. Use realistic event properties or remove decoys.
8. **MAIN world footprints** (`api-layer.js:6-7`, `main.js`). `window.__SG_API_LOADED` and `window.__SG_EID` are global beacons. Remove or randomize names at build time.
9. **No URL guard on polling** (`api-layer.js:248-313`). Polls run on login pages, 404s, etc. Check `location.pathname` before firing.

### 🔴 P0 — Code Defects
10. **`const` redeclaration SyntaxError** (`main.js:358-359` vs `377-378`). `nowSec` and `hasToken` are declared twice in the same block scope with `const`. This will throw in strict mode.
11. **Storage key case mismatch** (`popup.js:13` uses `"SG_userKey"`, `constants.js:33` uses `"sg_userKey"`). Causes silent state desync between popup and service worker.

### 🟡 P1 — Compliance & Legal
12. **No privacy policy or terms of service.** Required for commercial software handling employee data.
13. **Telegram logging without explicit consent.** Employee IDs and shift data are exfiltrated to Telegram with no opt-out. GDPR/CCPA violation risk.
14. **No Content Security Policy** in `manifest.json`. Missing CSP allows script injection if content scripts are compromised.

### 🟡 P1 — Performance & Reliability
15. **Unbounded memory leaks** (`api-layer.js:28` `claimedIds`, `main.js:39` `apiClaimNotified`). Objects grow forever on long-lived tabs. Implement periodic cleanup.
16. **Alarm creation races** (`service-worker.js`). Multiple message handlers call `clearAllAlarms` then immediately create new alarms. No atomicity — duplicate alarms can fire.
17. **HUD thrashes at 500ms** (`main.js:738`) even when hidden or backgrounded. Use `visibilitychange` or `requestAnimationFrame` to throttle.

---

## Nice-to-Have Improvements
1. Add `aria-live` region and `tabindex` for screen reader support
2. Draggable HUD with position memory
3. Confirmation dialog on destructive "Clear" buttons
4. JSDoc across all public functions
5. CI/CD pipeline with lint, test, and automated obfuscated build
6. Real code integrity hashing at build time (SHA-256 of bundled source)
7. License revocation list / heartbeat from server
8. Device limit enforcement (e.g., max 2 devices per key)
9. Error reporting service (Sentry) for production visibility
10. Dark/light mode toggle

---

## Final Verdict

**🟡 Fix First — Do Not Ship to Strangers Yet**

The extension is **functionally impressive** — it grabs shifts, has stealth features, a premium UI, and a working commercial flow. But LAURA's analysis revealed that the security model has **theater-level checks** that don't hold up to scrutiny, the stealth engine has **obvious bot signatures**, and the codebase has **defects that could crash the extension** (`const` redeclaration).

**Recommended path:**
1. **Week 1:** Fix P0 code defects (redeclaration, key mismatch, delete `license.js`, consolidate verification)
2. **Week 1:** Fix P0 stealth failures (operation name rotation, remove footprints, URL guard, synthetic events)
3. **Week 2:** Fix P0 security theater (real integrity check, remove token self-issue, server-side subscription re-validation)
4. **Week 2:** Add privacy policy, terms, and Telegram opt-out
5. **Week 2:** Re-run LAURA for a follow-up audit

Target post-hardening score: **75–80 / 100**.
