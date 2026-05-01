# SF30 V1.0 — Inspection Report (Final)

**Date:** 2026-04-23  
**Scope:** Full source audit of `SF30/` Chrome Extension (MV3)  
**Auditors:** 8 Specialized Agents + 1 Independent (LAURA)  
**Audit Phases:**
1. Phase 1 — Parallel Agent Inspection (8 dimension specialists)
2. Phase 2 — LAURA Independent 3rd-Party Audit
3. Phase 3 — Synthesis, Consensus Scoring & Final Deliverables *(this report)*

---

## Executive Summary

### 🔴 VERDICT: DO NOT SHIP

| Metric | Score |
|--------|-------|
| **Phase 1 Consensus (8 specialists, weighted)** | 51 / 100 |
| **LAURA Independent (weighted)** | 40 / 100 |
| **Combined Consensus (Phase 1 + LAURA, weighted)** | **46 / 100** |

No dimension scored above 70. The three highest-risk dimensions (Security, License, Stealth) all scored below 35. The extension is functional but built on a foundation of easily bypassed client-side checks, misleading build claims, and legally dangerous consent copy.

**Distribution package `Deploy/SF30-V1.0.zip` must NOT be released.**

---

## Consensus Scores by Dimension

| # | Dimension | Weight | Phase 1 | LAURA | **Consensus** | Weighted |
|---|-----------|--------|---------|-------|---------------|----------|
| 1 | Security Architecture | 15% | 32 | 35 | **33.5** | 5.03 |
| 2 | License & Commercial Model | 12% | 38 | 30 | **34.0** | 4.08 |
| 3 | Stealth / Anti-Detection | 15% | 38 | 25 | **31.5** | 4.73 |
| 4 | UX / UI / Accessibility | 10% | 74 | 65 | **69.5** | 6.95 |
| 5 | Code Quality & Maintainability | 10% | 59 | 40 | **49.5** | 4.95 |
| 6 | Performance & Efficiency | 8% | 74 | 55 | **64.5** | 5.16 |
| 7 | Architecture & Design Patterns | 10% | 58 | 45 | **51.5** | 5.15 |
| 8 | Build, Deploy & Distribution | 7% | 62 | 40 | **51.0** | 3.57 |
| 9 | Documentation & Support | 5% | 62 | 55 | **58.5** | 2.93 |
| 10 | Compliance, Privacy & Resilience | 8% | 62 | 30 | **46.0** | 3.68 |

### Overall Consensus Score: **46 / 100**

**Score Distribution:**
- 🔴 Critical (< 40): 3 dimensions (Security, License, Stealth)
- 🟡 Needs Improvement (40–59): 4 dimensions (Code Quality, Architecture, Build, Compliance)
- 🟢 Acceptable (60–79): 3 dimensions (UX, Performance, Docs)
- No dimension scored ≥ 80

---

## Top 10 Priority Issues (All P0)

Cross-referenced across all 9 auditors. Issues are listed in combined risk order (impact × exploitability × number of auditors flagging).

### 1. Infinite Trial Bypass
- **Risk:** Complete commercial model collapse. Any user can get unlimited free trials.
- **Root cause:** `sg_trial_start` stored in `chrome.storage.local`. No server enforcement.
- **Fix:** Server-side trial tracking or remove trials entirely.
- **Auditors flagging:** All 9

### 2. Trivial Amazon Detection
- **Risk:** Users will be banned from Amazon AtoZ.
- **Root cause:** `web_accessible_resources` probe, predictable DOM signatures, MAIN-world globals, console logs.
- **Fix:** Remove WAR probe; randomize DOM structure per install; strip console logging; eliminate MAIN-world globals.
- **Auditors flagging:** All 9

### 3. False Privacy Claims (Legal Liability)
- **Risk:** Consumer protection / GDPR / CCPA liability.
- **Root cause:** Consent modal says "communicate with our servers" — extension is fully offline.
- **Fix:** Rewrite consent copy to accurately reflect offline-only operation.
- **Auditors flagging:** All 9

### 4. Build Pipeline Misrepresents Security
- **Risk:** False sense of security; code trivially reversible.
- **Root cause:** `BUILD.md` / `CHANGELOG.md` claim "aggressive obfuscation" and "integrity hash." Only Terser runs. `javascript-obfuscator` is installed but never invoked.
- **Fix:** Either implement real obfuscation or remove claims. Add actual integrity checks if desired.
- **Auditors flagging:** All 9

### 5. Weak Device Binding
- **Risk:** License sharing; one key works on many devices.
- **Root cause:** Fingerprint = userAgent + screen + basic canvas. `chrome.storage.sync` defense skipped in guest/incognito.
- **Fix:** Use hardware-bound identifiers or server-side activation tracking.
- **Auditors flagging:** 8/9

### 6. RSA Private Key Committed to Repo
- **Risk:** Anyone with repo access can forge license signatures.
- **Root cause:** `keys/private.key` is in version control.
- **Fix:** Remove from history (BFG), add to `.gitignore`, store in secure secret manager.
- **Auditors flagging:** 7/9

### 7. Popup↔Content Toggle Protocol Broken
- **Risk:** Pause/Override state oscillates; users cannot reliably control the extension.
- **Root cause:** Popup writes absolute state to storage AND sends `SG_TOGGLE_PAUSE` toggle. Content script reads updated storage, flips again.
- **Fix:** Use a single source of truth. Either storage-driven with events OR message-driven with storage as cache.
- **Auditors flagging:** 7/9

### 8. `getValidToken()` Never Re-Validates
- **Risk:** Tampered/expired keys continue to work until storage is cleared.
- **Root cause:** Only checks `sg_license_exp > now`. Does not verify RSA signature, fingerprint, or key validity.
- **Fix:** Re-run full `validateLicense()` on every token check, or at least on startup.
- **Auditors flagging:** 7/9

### 9. Popup Message Listeners Lack Sender Validation
- **Risk:** Malicious web pages or other extensions can trigger token refresh or kill switch.
- **Root cause:** `chrome.runtime.onMessage.addListener` for `SG_REQUEST_TOKEN_REFRESH` and `SG_KILL` has no `isTrustedSender()` check.
- **Fix:** Add sender validation to all message listeners.
- **Auditors flagging:** 6/9

### 10. MAIN World `window.SG_CONSTS` Can Be Poisoned
- **Risk:** Host page can pre-poison `window.SG_CONSTS` before the content script loads, breaking postMessage secret validation.
- **Root cause:** `api-layer.js` reads `window.SG_CONSTS` from page context.
- **Fix:** Validate consts against a hardcoded checksum, or avoid relying on page globals entirely.
- **Auditors flagging:** 5/9

---

## Additional P1 & P2 Issues (High Volume)

### P1 Issues (Selected — full list in individual agent reports)
| # | Issue | Dimension |
|---|-------|-----------|
| P1-1 | Hardcoded AES salt (`"sg-salt-v1-fixed"`) in `crypto.js` | Security |
| P1-2 | Per-build `MSG_SECRET` instead of per-install | Security |
| P1-3 | `tabs.reload()` every 5 minutes creates detectable burst signature | Stealth |
| P1-4 | GraphQL "rotation" only shuffles argument order — still trivially matchable | Stealth |
| P1-5 | Keyboard shortcuts fire globally without `activeElement` or `preventDefault()` | UX / Code |
| P1-6 | HUD `updateHUD()` reads 7 storage keys every 500ms | Performance |
| P1-7 | Clock tamper (`sg_max_seen_time`) is in local storage, clearable | License |
| P1-8 | `sg_max_seen_time` 1-hour threshold is too lenient | License |
| P1-9 | Hidden tabs continue full-speed polling | Performance |
| P1-10 | `tabs` permission is overly broad | Security |
| P1-11 | CSP is incomplete (missing `default-src`, `style-src`, `img-src`) | Security |
| P1-12 | `web_accessible_resources` exposes sound file | Stealth |
| P1-13 | `exportUserData()` dumps plaintext license key | Compliance |
| P1-14 | `.sg-hud-enter` class not randomized by stealth prefix | Stealth |
| P1-15 | `"ShiftGrabber"` canvas string not randomized | Stealth |

### P2 Issues (Selected)
| # | Issue | Dimension |
|---|-------|-----------|
| P2-1 | `javascript-obfuscator` in deps but never invoked | Build |
| P2-2 | `circuit-breaker.js` implemented but never instantiated | Architecture |
| P2-3 | Billing button handlers are empty stubs | UX |
| P2-4 | `CHANGELOG.md` references V9/2.1.0 while manifest is 1.0.0 | Docs |
| P2-5 | `SECURITY-RUNBOOK.md` references non-existent server endpoints | Docs |
| P2-6 | `eval()` used in test harness | Code Quality |
| P2-7 | `.eslintrc.json` disables `no-var` and `prefer-const` | Code Quality |
| P2-8 | Broken Jest runner (`license-validator.test.js` expects wrong return value) | Code Quality |
| P2-9 | No `prefers-reduced-motion` support | UX |
| P2-10 | No source maps in debug build | Build |
| P2-11 | No storage quota handling | Compliance |
| P2-12 | `license-validator.js` header comment contradicts code ("reject" vs "trial") | Code Quality |

---

## Agent-Specific Scores

| Auditor | Dimensions Covered | Score | Weighted Score |
|---------|-------------------|-------|----------------|
| Agent-Security | 1 | 32 | 5.03 |
| Agent-License | 2 | 38 | 4.08 |
| Agent-Stealth | 3 | 38 | 4.73 |
| Agent-UX | 4 | 74 | 6.95 |
| Agent-CodeQuality | 5 | 59 | 4.95 |
| Agent-Performance | 6 | 74 | 5.16 |
| Agent-Architecture | 7 | 58 | 5.15 |
| Agent-BuildDocs | 8, 9, 10 | 62 | — |
| **LAURA** | All 10 | **40** | **40.00** |

### Phase 1 Average (8 specialists, weighted): **51 / 100**
### LAURA Independent (weighted): **40 / 100**
### Combined Consensus (Phase 1 + LAURA): **46 / 100**

---

## Next Steps

### Immediate (Block Shipping)
1. Fix all 10 P0 issues listed above.
2. Remove `Deploy/SF30-V1.0.zip` and do not recreate until all P0s are resolved.
3. Purge `keys/private.key` from git history (use BFG or `git-filter-repo`).
4. Rewrite consent modal to remove false server-communication claims.
5. Either implement real obfuscation or remove all obfuscation claims from documentation.

### Short Term (Before Any Beta)
6. Fix all P1 issues in the table above.
7. Server-side trial enforcement OR remove trial feature entirely.
8. Real device binding (hardware-backed or server activation).
9. Complete CSP (`default-src`, `style-src`, `img-src`, etc.).
10. Fix broken popup↔content state protocol.

### Medium Term (Before Public Release)
11. Fix P2 issues (code quality, docs consistency, test runner).
12. Add runtime integrity / anti-tampering checks.
13. Implement actual circuit breaker usage or remove dead code.
14. Add server-side telemetry (with explicit consent) for anomaly detection.

---

## Appendix: Audit Artifacts

| File | Description |
|------|-------------|
| `INSPECTION_REPORT_FINAL.md` | This report — consensus scoring and prioritized issues |
| `LAURA_REPORT_V8.md` | Independent 3rd-party audit with full dimension-by-dimension analysis |
| `*report*.md` (8 files) | Individual agent reports from Phase 1 |

---

*Report generated by Inspection Director Agent — Phase 3 Synthesis*  
*All scores are consensus averages across 9 independent auditors.*
