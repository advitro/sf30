# Flows Index

This note aggregates all execution-flow, security, and lifecycle documentation. It is the starting point for auditors, DevOps reviewers, and anyone tracing how data moves through Shift Grabber V9.

## Flow Summaries

### [[Data Flow]]
- **Entry Point**: User keyboard shortcut in [[main.js]] or alarm tick in [[service-worker.js]]
- **Path**: Trigger → message bus → [[api-layer.js]] GraphQL poll → claim attempt → DOM update or Telegram dispatch
- **Exit Point**: Shift claimed (DOM restored, HUD updated) or error logged to storage

### [[Security Audit]]
- **Entry Point**: Extension installation and manifest permission grant
- **Path**: Static manifest review → runtime secret handling → CSRF/rate-limit checks → transport validation
- **Exit Point**: Hardened runtime posture with documented residual risks

### [[License & Token Lifecycle]]
- **Entry Point**: User login or license activation handshake
- **Path**: Token issuance → `chrome.storage` persistence → alarm-driven refresh → injection into [[api-layer.js]]
- **Exit Point**: Valid access token available for GraphQL requests, or graceful degradation to unlicensed state

### [[Technical Debt Register]]
- **Entry Point**: Static code review and runtime observation
- **Path**: Categorise by severity → map to file and line → propose remediation
- **Exit Point**: Prioritised backlog of critical, medium, and low issues

### [[External API Contracts]]
- **Entry Point**: Network tab inspection or source code grep for `fetch`
- **Path**: Document request/response shape → auth mechanism → error handling → retry policy
- **Exit Point**: Consumable contract specs for Amazon GraphQL, license server, and Telegram Bot API

### [[Configuration Reference]]
- **Entry Point**: Grepping for magic numbers across all JS files
- **Path**: Collate constants by file → explain purpose → suggest centralisation
- **Exit Point**: Single registry of every tunable timing value, storage key, and manifest field

### [[Project Evolution]]
- **Entry Point**: Git history and version string archaeology
- **Path**: Trace V7 → V9 → 2.0.0 migration → infer feature additions
- **Exit Point**: Understanding of how MV3 constraints shaped the current architecture

### [[Development & Deployment]]
- **Entry Point**: Need to load, debug, or ship the extension
- **Path**: Unpacked loading → hot-reload rules → debugging each context → packaging → CWS submission
- **Exit Point**: Working development environment and release-ready ZIP

### [[Assets & Resources]]
- **Entry Point**: Need to update icons, sounds, or web-accessible resources
- **Path**: Inventory assets → document usage and risks → explain update procedure
- **Exit Point**: Maintained non-code artifacts with documented change process

### [[Message Router & State Bus]]
- **Entry Point**: Need to understand how modules communicate
- **Path**: Map all three buses (runtime, tabs, postMessage) → document every message type → list payloads and handlers
- **Exit Point**: Complete communication topology with no unknown message types

### [[State & Storage Model]]
- **Entry Point**: Need to understand how state persists and flows
- **Path**: Inventory all storage keys → map writers and readers → document state machine → identify atomicity risks
- **Exit Point**: Complete model of extension state with known divergence and race conditions documented

### [[MV3 Platform Constraints]]
- **Entry Point**: Need to understand why the architecture looks the way it does
- **Path**: Map each MV3 constraint → identify the design adaptation → evaluate trade-offs
- **Exit Point**: Understanding of how ephemeral SWs, cookie partitioning, and storage quotas shaped the system

### [[Performance Characteristics]]
- **Entry Point**: Need to know resource usage and competitive positioning
- **Path**: Measure detect-to-claim latency → calculate polling load → estimate bandwidth → compare with alternatives
- **Exit Point**: Quantified performance profile with scaling limits

## Security Checklist — Top 5 Risks

| # | Risk | Detailed In |
|---|------|-------------|
| 1 | **Hardcoded Telegram bot token** — Full Bot API access exposed in shipped extension. | [[Security Audit]], [[service-worker.js]] |
| 2 | **Token refresh duplication** — License verification logic copy-pasted between popup and service worker. | [[Security Audit]], [[License & Token Lifecycle]] |
| 3 | **CSRF on shift-claim mutations** — State-changing requests reuse page CSRF but lack custom validation. | [[Security Audit]], [[api-layer.js]] |
| 4 | **Alarm jitter bypass** — Fixed 5s/30s backoff may not evade sustained rate limiting. | [[Security Audit]], [[service-worker.js]] |
| 5 | **Overly broad host permissions** — `scripting` + Amazon hosts creates large blast radius. | [[Security Audit]], [[manifest.json]] |

## Reference Quick Links

| Document | Use When |
|----------|----------|
| [[Configuration Reference]] | You need to know a constant value or storage key |
| [[External API Contracts]] | You need request/response schemas or auth details |
| [[Technical Debt Register]] | You want to know what's broken before you fix it |
| [[Project Evolution]] | You need historical context on why something exists |
| [[Master Document]] | You want a compressed single-page overview |

## Quick Reference Tables

### Keyboard Shortcuts
| Shortcut | Action | Defined In |
|----------|--------|------------|
| `P` | Toggle pause/resume | [[main.js]] |
| `Shift+O` | Toggle override (fast) mode | [[main.js]] |
| `Shift+H` | Toggle HUD visibility | [[main.js]] |
| `R` | Reload all AtoZ tabs now | [[main.js]] |
| `Shift+T` | Toggle turbo mode (500ms vs 1000ms polling) | [[main.js]] |

### `chrome.storage.local` Keys
| Key | Scope | Owner | Purpose |
|-----|-------|-------|---------|
| `sg_enabled` | `local` | [[popup.js]] / [[service-worker.js]] | Master on/off switch |
| `sg_paused` | `local` | [[main.js]] / [[popup.js]] | Pause state |
| `sg_override` | `local` | [[main.js]] / [[popup.js]] | Fast-reload mode |
| `sg_access_token` | `local` | [[popup.js]] / [[service-worker.js]] | License token |
| `sg_token_exp` | `local` | [[popup.js]] / [[service-worker.js]] | Token expiry (unix seconds) |
| `sg_next_due` | `local` | [[service-worker.js]] | Next alarm timestamp |
| `sg_burst_left` | `local` | [[service-worker.js]] | Remaining burst reloads |
| `sg_blacklist_dates` | `local` | [[popup.js]] / [[main.js]] | Dates to skip claiming |
| `sg_dates` | `local` | [[popup.js]] | User-selected dates to open in tabs |
| `sg_tg_queue` | `local` | [[main.js]] / [[service-worker.js]] | Pending Telegram messages |
| `sg_eid` | `local` | [[main.js]] | Employee ID cache |
| `sg_hud_hidden` | `local` | [[main.js]] | HUD visibility preference |
| `SG_userKey` | `local` | [[popup.js]] | License key string |
| `SG_deviceId` | `local` | [[popup.js]] | Unique device ID |

### Alarm Names
| Alarm Name | Interval | Owner | Purpose |
|------------|----------|-------|---------|
| `SG_TOKEN_CHECK` | 2 min | [[service-worker.js]] | Token expiry check + Telegram flush |
| `SG_BURST_START` | 5-min anchor | [[service-worker.js]] | Start burst reload cycle |
| `SG_BURST_STEP` | ~4s jitter | [[service-worker.js]] | Subsequent burst reloads |
| `SG_OVERRIDE_TICK` | ~4s jitter | [[service-worker.js]] | Override mode continuous reloads |

### Message Types
| Type | Direction | Purpose |
|------|-----------|---------|
| `SG_START_POLLING` | [[main.js]] → [[api-layer.js]] | Begin GraphQL polling |
| `SG_STOP_POLLING` | [[main.js]] → [[api-layer.js]] | Halt polling loop |
| `SG_SET_SPEED` | [[main.js]] → [[api-layer.js]] | Change poll interval |
| `SG_SET_BLACKLIST_DATES` | [[main.js]] → [[api-layer.js]] | Propagate blacklist |
| `SG_EID` | [[api-layer.js]] → [[main.js]] | Relay employee ID |
| `SG_CLAIM_RESULT` | [[api-layer.js]] → [[main.js]] | Claim success/failure |
| `SG_RATE_LIMITED` | [[api-layer.js]] → [[main.js]] | 429 backoff state |
| `SG_SET_ENABLED` | [[popup.js]] → [[service-worker.js]] | Toggle on/off |
| `SG_SET_PAUSED` | [[popup.js]] → [[service-worker.js]] | Toggle pause |
| `SG_SET_OVERRIDE` | [[popup.js]] → [[service-worker.js]] | Toggle override |
| `SG_RELOAD_ALL_NOW` | [[popup.js]] → [[service-worker.js]] | Immediate reload |
| `SG_LICENSE_VERIFIED` | [[popup.js]] → [[service-worker.js]] | License result |
| `SG_POKE_SCHEDULE` | [[main.js]] → [[service-worker.js]] | Reschedule request |
| `SG_REQUEST_TOKEN_REFRESH` | [[service-worker.js]] → [[popup.js]] | Fallback refresh |
| `SG_TOGGLE_HUD` | [[popup.js]] → [[main.js]] | Toggle HUD |
| `SG_TOGGLE_PAUSE` | [[popup.js]] → [[main.js]] | Toggle pause relay |
| `SG_TOGGLE_OVERRIDE` | [[popup.js]] → [[main.js]] | Toggle override relay |

## Related Notes

- [[Shift Grabber V9 Index]]
- [[Components Index]]
- [[Graph View]]
- [[Data Flow]]
- [[Security Audit]]
- [[License & Token Lifecycle]]
- [[Technical Debt Register]]
- [[External API Contracts]]
- [[Configuration Reference]]
- [[Project Evolution]]
- [[Master Document]]
