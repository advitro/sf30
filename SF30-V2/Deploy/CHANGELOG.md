# SF30 Changelog

## v2.0.0 — 2026-04-25

### Added
- **Full Manifest V3 compliance** — Service worker architecture, chrome.alarms, dynamic content script injection
- **Per-install secret generation** — Device-bound security using `crypto.randomUUID()` (replaces vulnerable per-build secrets)
- **License server integration** — Online license activation, validation, and revocation checking
- **Trial mode** — 24-hour free trial bound to device fingerprint
- **Consent flow** — Granular privacy consent with focus trap, age verification (16+), and GDPR-compliant disclosures
- **Privacy Policy & Terms of Service** — Comprehensive legal documents
- **Telegram notifications** — Encrypted credential storage (AES-GCM-256 + PBKDF2 600k iterations)
- **Turbo mode** — 500ms polling interval for high-speed shift detection
- **Burst mode** — Automated 10-second high-frequency claiming windows
- **Smart blacklist** — Skip specific dates or shift types
- **Keyboard shortcuts** — P (pause), Shift+O (override), Shift+H (HUD), R (reload)
- **HUD (Heads-Up Display)** — Closed Shadow DOM overlay showing real-time status
- **Data export** — JSON export with sensitive field redaction
- **Two-tier deletion** — "Delete Settings" (functional reset) and "Erase Everything" (GDPR-compliant factory reset)
- **CI/CD pipeline** — GitHub Actions running lint → test → build → validate
- **Build verification** — Post-build integrity checks, CSP validation, source map absence verification

### Security
- Constant-time string comparison for cryptographic secrets
- Three-layer sender validation on cross-context messages
- Comprehensive CSP with no `unsafe-eval`
- No `web_accessible_resources` (minimal detection surface)
- Kill-switch on integrity check failure
- HTML escaping in all dynamic content (Telegram messages, popup tags)

### Improved
- TypeScript strict mode with comprehensive ESLint rules
- Redux-like immutable store with debounced persistence
- Modular background architecture (alarms.ts, license-handler.ts)
- 155 tests across 12 test suites
- E2E build smoke tests
- Alarm timing precision tests

---

## v1.0.0 — Earlier Release

- Initial standalone offline license extension
- RSA-signed keys with 30-day expiry
- Basic shift polling and claiming
