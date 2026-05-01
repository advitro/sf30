# Project Evolution

Version history, commit archaeology, and architectural migration notes for [[Shift Grabber V9 Index|Shift Grabber V9]].

---

## Git History

```
9f6d328 Initial commit — Shift Grabber V7 Chrome extension
```

Only one commit is visible in the repository. This indicates either:
- A **force-push / history rewrite** after major refactoring
- Development occurred in a private branch or separate repo before open-sourcing
- Intentional squash to hide intermediate work

---

## Version Timeline

| Version | Marker | Evidence | Likely Changes |
|---------|--------|----------|----------------|
| V7 | Git commit message | `9f6d328` | Original DOM-only grabber; likely Manifest V2 |
| V8 | — | No direct evidence | MV3 migration, service worker introduction |
| V9 | Popup HTML, `main.js` constant `VERSION = "V9"` | `popup/index.html` line 12, `main.js` | License system, GraphQL polling, turbo mode |
| 2.0.0 | `manifest.json` | `"version": "2.0.0"` | Major rewrite — possibly MV2→MV3 + new architecture |
| 2.1.0 | Code changes | `api-layer.js`, `service-worker.js`, `popup.js` | Commercial SaaS: Stripe subscriptions, stealth engine, circuit breaker, subscription UI |

### Version String Divergence

Three different version identifiers exist simultaneously:

1. **Marketing name:** "V9" (visible in popup UI and `main.js`)
2. **Manifest version:** "2.0.0" (Chrome Web Store / MV3 versioning)
3. **Git history:** "V7" (original codebase name)

> **Debt:** No automated sync between marketing name and manifest version. See [[Technical Debt Register]] #15.

---

## Architectural Migrations

### MV2 → MV3

The presence of `background/service-worker.js` (not `background.js`) and `"manifest_version": 3` confirms a Manifest V3 migration.

**MV3 constraints that shaped the architecture:**
- Service workers are **ephemeral** — cannot keep long-running connections
- `chrome.alarms` API required for background scheduling (replaces `setInterval` in persistent background pages)
- `world: "MAIN"` content script introduced to bypass CORS (MV3 blocks cross-origin fetch from content scripts in some contexts)

**Impact on design:**
- Alarm-based burst scheduling instead of constant polling from background
- Content script split into ISOLATED (`main.js`) + MAIN (`api-layer.js`) worlds
- Token refresh moved to alarms rather than interval timers

### License System Introduction

V9 added a **server-gated license layer** not present in V7:

| Component | V7 (inferred) | V9 |
|-----------|---------------|-----|
| Access control | None / client-side only | Server-verified token with expiry |
| Background scheduling | Always on | Gated by valid token |
| Revenue model | Possibly free / donation | License keys sold per device |

**License server:** `shift-grabber.vercel.app` (Vercel-hosted, serverless)

---

## Feature Addition Timeline (Inferred)

| Feature | Likely Introduced | Evidence |
|---------|-------------------|----------|
| DOM backup grabbing | V7 | Core legacy behaviour |
| API polling | V8/V9 | `api-layer.js`, GraphQL constants |
| 7-day window | V9 | Documented as a major optimization vs competitors (see [[main.js]] and [[api-layer.js]] for implementation) |
| Turbo mode (`Shift+T`) | V9 | Handler in `main.js`; not in any commit message |
| HUD | V8/V9 | Complex DOM manipulation, version badge shows "V9" |
| Telegram notifications | V9 | Hardcoded credentials suggest rapid implementation |
| Blacklist dates | V9 | UI section in popup |
| Burst scheduling | V8/V9 | Alarm-based, requires MV3 |
| Rate limit recovery | V9 | Specific to API polling layer |

---

## File Growth Estimates

Based on current line counts:

| File | Lines | Complexity |
|------|-------|------------|
| `src/content/main.js` | ~650 | High (HUD, keyboard, DOM backup, bridge) |
| `src/content/api-layer.js` | ~220 | Medium (polling, claiming, rate limit) |
| `background/service-worker.js` | ~380 | Medium (alarms, token, Telegram) |
| `popup/popup.js` | ~420 | Medium (UI state, license, dates) |
| `popup/styles.css` | 269 | Low |
| `popup/index.html` | 87 | Low |
| `background/license.js` | 41 | Low |
| `manifest.json` | 29 | Low |

**Total:** ~2,096 lines of production code. No tests.

---

## Related

- [[Technical Debt Register]] — Issues accumulated across versions
- [[Architecture Map]] — Current structural layout
- [[Shift Grabber V9 Index]] — Project overview
- [[Configuration Reference]] — Constants that changed across versions
