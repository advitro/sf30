# Shift Grabber V9 — Changelog

## [2.1.0] — 2026-04-22

### Security
- Removed orphaned `background/license.js` backdoor verification path
- Removed token self-issue fallback — extension now fails closed on incomplete server responses
- Replaced fake integrity check with build-time SHA-256 hash injection
- Added Content Security Policy (CSP) to manifest
- Added alarm mutex to prevent race conditions
- Added message schema validation in service worker
- Added sender ID validation for all runtime messages
- Added rate limiter on popup verify button (3s cooldown)
- Added build-time global name randomization (`SG_CONSTS`, `SG_CRYPTO`, `SG_FINGERPRINT`)
- Added URL guard on api-layer polling (only runs on `/shifts/schedule/find`)

### Stealth
- Rotated GraphQL operation names (`PollShifts`/`GetShiftList`/`QueryOpportunities`)
- Removed synthetic decoy interactions (`isTrusted: false` was a detection vector)
- Randomized MAIN world global footprint names (`__sg_api_v3`, `__sg_eid_v3`)

### Commercial
- Popup now re-validates license with server on open if token expires within 5 minutes
- Consolidated verification to single service worker implementation

### Performance
- HUD updates pause when tab is hidden (`visibilitychange` handler)
- Added tab ID caching (10s TTL) in service worker
- Added canvas fingerprint caching (avoids recomputation)
- Added periodic cleanup for unbounded `claimedIds` and `apiClaimNotified` objects

### UX
- Added confirmation dialogs on destructive "Clear" actions
- Master toggle now disables during verification to prevent double-clicks
- Added draggable HUD with position memory
- Added Telegram notification opt-out toggle in Advanced settings

### Compliance
- Added Privacy Policy (`Deploy/docs/PRIVACY-POLICY.md`)
- Added Terms of Service (`Deploy/docs/TERMS-OF-SERVICE.md`)
- Telegram logging now respects user opt-out preference

### Architecture
- Added state machine (`computeState`) in service worker
- Added message schema validation (`validateMessage`)
- Fixed `const` redeclaration SyntaxError in `main.js`
- Fixed storage key case mismatch (`SG_userKey` → `sg_userKey`)

## [2.0.0] — 2026-04-20

### Added
- Zero-friction Simple Mode popup (default view)
- Advanced Mode panel for power users
- Subscription UI with tier badges, billing portal, upgrade links
- Server-side config push (`/config` endpoint)
- Circuit breaker pattern for license server
- AES-GCM token encryption at rest
- Device fingerprinting for key sharing detection
- Build-time obfuscation pipeline (`build.js`)
- Customer deployment package (`Deploy/`)
