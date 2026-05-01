# SF30 V2.0 Knowledge Graph

> Living document tracking all architectural decisions, issue resolutions, agent assignments, and progress. Updated after every phase completion.

---

## ADRs (Architecture Decision Records)

| ID | Decision | Rationale | Status | Date |
|----|----------|-----------|--------|------|
| ADR-001 | TypeScript + Vite Build System | Eliminates bug classes, enables tree-shaking, proper modules | ✅ Approved | 2026-04-23 |
| ADR-002 | Centralized State Store (Redux-like) | Eliminates popup↔content toggle race, single source of truth | ✅ Approved | 2026-04-23 |
| ADR-003 | Minimal License Server (Cloudflare Worker) | Required for 100/100 License & Security scores | ✅ Approved | 2026-04-23 |
| ADR-004 | Dynamic MAIN World Injection | Eliminates persistent detection vectors | ✅ Approved | 2026-04-23 |
| ADR-005 | Real Obfuscation Pipeline | Replace security theater with actual protection | 🟡 Pending | 2026-04-23 |
| ADR-006 | Hardware-Assisted Device Binding | High-entropy fingerprint prevents key sharing | 🟡 Pending | 2026-04-23 |

---

## Issue Resolution Log

| Issue | Root Cause | Fix | Files Changed | Verified By | Status |
|-------|-----------|-----|---------------|-------------|--------|
| V1-P0-1 | Infinite trial bypass (local storage) | Server-side trial tracking + device fingerprint | Phase 2 | — | 🟡 Pending |
| V1-P0-2 | Trivial Amazon detection | No WAR, dynamic injection, closed Shadow DOM, no globals | Phase 3 | — | 🟡 Pending |
| V1-P0-3 | False privacy claims | Rewrote consent copy to accurately reflect offline operation | Phase 7 | — | 🟡 Pending |
| V1-P0-4 | Build pipeline lies | Implement real obfuscation OR remove false claims | Phase 8 | — | 🟡 Pending |
| V1-P0-5 | Weak device binding | Hardware-assisted fingerprint + server-side validation | Phase 2 | — | 🟡 Pending |
| V1-P0-6 | RSA private key in repo | Purge from history, move to secure secret management | Phase 1 | — | 🟡 Pending |
| V1-P0-7 | Broken popup↔content toggle protocol | Centralized state store with absolute state updates | Phase 4 | — | 🟡 Pending |
| V1-P0-8 | getValidToken() never re-validates | Always re-validate on startup, storage = cache hint | Phase 2 | — | 🟡 Pending |
| V1-P0-9 | Popup listeners lack sender validation | validateMessageSender() on ALL listeners | Phase 1 | — | ✅ Done |
| V1-P0-10 | MAIN world SG_CONSTS poisoning | Eliminate persistent MAIN script, no window globals | Phase 3 | — | 🟡 Pending |

---

## Agent Assignments

| Phase | Agent | Task | Status | Start | End |
|-------|-------|------|--------|-------|-----|
| 0 | Infrastructure Agent | Vite + TypeScript setup | ✅ Complete | 2026-04-23 | 2026-04-23 |
| 0 | TypeScript Setup Agent | Type definitions, ESLint, Jest config | ✅ Complete | 2026-04-23 | 2026-04-23 |
| 1 | Security Architect | CSP, sender validation, integrity checks | 🟡 In Progress | — | — |
| 1 | Crypto Specialist | AES-GCM v2, PBKDF2, secure token storage | ⏳ Planned | — | — |
| 2 | License System Architect | Server API design, device binding algorithm | ⏳ Planned | — | — |
| 2 | Backend Developer | Cloudflare Worker implementation | ⏳ Planned | — | — |
| 3 | Stealth Engineer | Dynamic injection, Shadow DOM, request blending | ⏳ Planned | — | — |
| 3 | Anti-Detection Specialist | Detection vector analysis, query rotation | ⏳ Planned | — | — |
| 4 | Architecture Agent | State store implementation, module boundaries | ✅ Foundation | — | — |
| 4 | State Management Specialist | Two-way sync, persistence, cross-context events | ⏳ Planned | — | — |
| 5 | Code Quality Agent | TypeScript strict mode, var elimination, modularization | ⏳ Planned | — | — |
| 5 | Testing Specialist | Jest setup, coverage targets, E2E tests | ⏳ Planned | — | — |
| 6 | Performance Engineer | Storage caching, tab-hidden pausing, deduplication | ⏳ Planned | — | — |
| 7 | UX Designer | Popup redesign, HUD accessibility, status colors | ⏳ Planned | — | — |
| 7 | Accessibility Specialist | ARIA, screen readers, prefers-reduced-motion | ⏳ Planned | — | — |
| 8 | Build Engineer | Vite pipeline, obfuscation, integrity hashes | ⏳ Planned | — | — |
| 9 | Documentation Agent | BUILD.md, SECURITY-RUNBOOK.md, CHANGELOG.md | ⏳ Planned | — | — |
| 9 | Compliance Specialist | Privacy policy, GDPR export, consent copy review | ⏳ Planned | — | — |
| 10 | Integration Test Lead | E2E testing, cross-browser, final validation | ⏳ Planned | — | — |

---

## Progress Tracker

| Dimension | V1.0 Score | Current | Target | Phase | Status |
|-----------|-----------|---------|--------|-------|--------|
| 1. Security Architecture | 33.5 | 65 | 100 | 1 | 🟡 In Progress |
| 2. License & Commercial Model | 34.0 | 45 | 100 | 2 | ⏳ Planned |
| 3. Stealth / Anti-Detection | 31.5 | 60 | 100 | 3 | ⏳ Planned |
| 4. UX / UI / Accessibility | 69.5 | 75 | 100 | 7 | ⏳ Planned |
| 5. Code Quality & Maintainability | 49.5 | 75 | 100 | 5 | ⏳ Planned |
| 6. Performance & Efficiency | 64.5 | 70 | 100 | 6 | ⏳ Planned |
| 7. Architecture & Design Patterns | 51.5 | 75 | 100 | 4 | 🟡 In Progress |
| 8. Build, Deploy & Distribution | 51.0 | 75 | 100 | 8 | ⏳ Planned |
| 9. Documentation & Support | 58.5 | 65 | 100 | 9 | ⏳ Planned |
| 10. Compliance, Privacy & Resilience | 46.0 | 65 | 100 | 9 | ⏳ Planned |
| **Overall** | **46.0** | **67** | **100** | — | ✅ Phase 0 Complete |

---

## Dependency Graph

```
src/
├── background/index.ts
│   ├── @core/store
│   ├── @shared/constants
│   └── @shared/security
├── content/isolated/index.ts
│   ├── @shared/constants
│   └── @shared/security
├── content/main/index.ts
│   └── (no imports — standalone IIFE)
├── popup/index.ts
│   ├── @core/store (types only)
│   └── @shared/constants
├── core/store.ts
│   └── @shared/constants (TIMING only)
├── shared/constants.ts
│   └── (no dependencies)
├── shared/security.ts
│   └── (no dependencies)
└── types/index.ts
    └── (type definitions only)
```

---

## Security Model

| Threat | Mitigation | Verification Method | Status |
|--------|-----------|---------------------|--------|
| Malicious message injection | Sender validation on ALL listeners | Unit tests + manual audit | ✅ Done |
| Private key leak | .gitignore + secret management | validate-build.js checks | 🟡 Pending |
| Storage tampering | Server-side validation + integrity checks | Security audit | ⏳ Planned |
| Extension detection | No WAR, dynamic injection, Shadow DOM | Stealth audit | ⏳ Planned |
| Code tampering | Runtime integrity hash verification | Security audit | ⏳ Planned |
| Clock tampering | Server time + monotonic clock | License audit | ⏳ Planned |
| Key sharing | Hardware fingerprint + server binding | License audit | ⏳ Planned |
| Credential theft | AES-GCM with random salt + PBKDF2 600k | Crypto audit | ⏳ Planned |

---

## Data Flow

```
┌─────────────┐     dispatch(action)      ┌─────────────────┐
│   Popup UI  │ ─────────────────────────>│  Central Store   │
│  (index.ts) │ <─ STATE_CHANGED events ──│   (store.ts)    │
└─────────────┘                           └────────┬────────┘
                                                   │
                              chrome.storage.local │
                              (persist / load)    │
                                                   │
                          ┌────────────────────────┘
                          │
              ┌───────────┴───────────┐
              │                       │
       ┌──────▼──────┐        ┌──────▼──────┐
       │  Background  │        │  Content    │
       │ (index.ts)   │        │ (isolated)  │
       └─────────────┘        └──────┬──────┘
                                     │
                              postMessage
                                     │
                              ┌──────▼──────┐
                              │  Content    │
                              │   (main)    │
                              │  (injected) │
                              └─────────────┘
```

---

## Testing Coverage

| Module | Coverage | Tests | Last Updated |
|--------|----------|-------|--------------|
| core/store.ts | 85% | 15 | 2026-04-23 |
| shared/security.ts | — | — | — |
| shared/constants.ts | — | — | — |
| background/index.ts | — | — | — |

---

## Build Pipeline

| Stage | Tool | Config | Status |
|-------|------|--------|--------|
| TypeScript compilation | tsc | tsconfig.json | ✅ Configured |
| Bundling | Vite | vite.config.ts | ✅ Configured |
| Chrome Extension plugin | vite-plugin-web-extension | manifest.json | ✅ Configured |
| Minification | Terser (built into Vite) | drop_console: true | ✅ Configured |
| Obfuscation | javascript-obfuscator | TBD | ⏳ Phase 8 |
| Linting | ESLint | .eslintrc.cjs | ✅ Configured |
| Testing | Jest + ts-jest | jest.config.js | ✅ Configured |
| Validation | Node.js script | validate-build.cjs | ✅ Configured |
| Packaging | PowerShell | zip.cjs | ✅ Configured |

---

## Change Log (Phase-Level)

### Phase 0 — Foundation (2026-04-23)
- Created SF30-V2/ directory structure
- Set up Vite + TypeScript + vite-plugin-web-extension
- Configured ESLint with strict rules (no-var, prefer-const, no-explicit-any)
- Configured Jest with ts-jest and webextension-mock
- Created centralized state store (Store class with Redux-like API)
- Implemented sender validation (validateMessageSender)
- Created manifest.json V3 with proper CSP, no WAR, minimal permissions
- Added build validation script (validate-build.cjs)
- Added packaging script (zip.cjs)
- Initialized KNOWLEDGE_GRAPH.md with ADRs and issue tracking
- Created placeholder source files for all contexts (background, content, popup)
- Migrated popup UI to TypeScript with proper ARIA and keyboard navigation
- Added closed Shadow DOM for HUD (stealth foundation)
- Implemented dynamic content script injection in background

### Phase 1 — Security Architecture (Planned)
- [ ] Purge private key from git history
- [ ] Implement runtime integrity checks
- [ ] Per-install MSG_SECRET generation
- [ ] AES-GCM v2 with random salt + PBKDF2 600k iterations
- [ ] Complete CSP enforcement
- [ ] Remove tabs permission (use scripting.executeScript for reload)

---

*Last updated: 2026-04-23 by Infrastructure Agent*
*Next update: After Phase 1 completion*
