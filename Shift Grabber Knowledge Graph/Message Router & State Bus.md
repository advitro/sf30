# Message Router & State Bus

Exhaustive catalog of every communication channel in [[Shift Grabber V9 Index|Shift Grabber V9]]. This note documents the extension's nervous system: how modules talk to each other, what they say, and what happens when messages arrive.

---

## Communication Topology

```
┌─────────────┐     runtime.sendMessage      ┌─────────────────┐
│   POPUP     │ ◄──────────────────────────► │ SERVICE WORKER  │
│  popup.js   │                            │ service-worker  │
└──────┬──────┘                            └────────┬────────┘
       │ tabs.sendMessage                           │
       ▼                                            │ alarms
┌─────────────┐     postMessage             ┌───────▼────────┐
│  main.js    │ ◄─────────────────────────► │  api-layer.js  │
│ ISOLATED    │                             │    MAIN        │
└─────────────┘                             └────────────────┘
```

Three distinct buses:
1. **`chrome.runtime.sendMessage`** — popup ↔ service worker, main.js ↔ service worker
2. **`chrome.tabs.sendMessage`** — popup → main.js (targets specific tabs)
3. **`window.postMessage`** — main.js ↔ api-layer.js (cross-world bridge)

---

## chrome.runtime Messages

### Popup → Service Worker

| Type | Payload | Purpose | Handler Location |
|------|---------|---------|------------------|
| `SG_SET_ENABLED` | `{ value: boolean }` | Master on/off switch | `service-worker.js` |
| `SG_SET_PAUSED` | `{ value: boolean }` | Pause/resume polling | `service-worker.js`, `main.js` (relay) |
| `SG_SET_OVERRIDE` | `{ value: boolean }` | Fast reload mode | `service-worker.js`, `main.js` (relay) |
| `SG_RELOAD_ALL_NOW` | — | Immediate tab reload | `service-worker.js` |
| `SG_LICENSE_VERIFIED` | `{ value: boolean }` | License check result | `service-worker.js` |

### Service Worker → Popup

| Type | Payload | Purpose | Handler Location |
|------|---------|---------|------------------|
| `SG_REQUEST_TOKEN_REFRESH` | — | SW needs popup to refresh token (popup must be open) | `popup.js` |

### Main.js → Service Worker

| Type | Payload | Purpose | Handler Location |
|------|---------|---------|------------------|
| `SG_POKE_SCHEDULE` | — | Request immediate schedule recalculation | `service-worker.js` |
| `SG_EID` | `{ eid: string }` | Relay employee ID to SW for backup use | `service-worker.js` |

### Service Worker → Main.js

Service worker does not directly message `main.js`. It uses `tabs.reload()` as its primary effect on content scripts.

---

## chrome.tabs Messages

### Popup → Main.js (via `tabs.sendMessage`)

Popup broadcasts to **all AtoZ tabs** using `chrome.tabs.query({ url: "https://atoz.amazon.work/*" })` followed by `chrome.tabs.sendMessage(tab.id, message)`.

| Type | Payload | Purpose |
|------|---------|---------|
| `SG_TOGGLE_HUD` | — | Toggle HUD visibility |
| `SG_TOGGLE_PAUSE` | — | Toggle pause state |
| `SG_TOGGLE_OVERRIDE` | — | Toggle override state |
| `SG_SET_ENABLED` | `{ value: boolean }` | Update enabled state |

### Popup → Main.js (date/blacklist propagation)

Popup also sends date/blacklist arrays to all AtoZ tabs so `main.js` can forward them to `api-layer.js`.

---

## window.postMessage Bridge

The **only** channel between ISOLATED (`main.js`) and MAIN (`api-layer.js`) worlds. Both directions use `window.postMessage` with `{ sg: true, ... }` envelope.

### Main.js → Api-Layer.js

| Type | Payload | Purpose |
|------|---------|---------|
| `SG_START_POLLING` | `{ interval, start, end }` | Begin GraphQL polling with 7-day window |
| `SG_STOP_POLLING` | — | Halt polling loop |
| `SG_SET_SPEED` | `{ interval }` | Change poll interval (turbo/normal) |
| `SG_SET_BLACKLIST_DATES` | `{ dates: string[] }` | Update blacklist |

### Api-Layer.js → Main.js

| Type | Payload | Purpose |
|------|---------|---------|
| `SG_EID` | `{ eid: string }` | Employee ID extracted from localStorage |
| `SG_CLAIM_RESULT` | `{ data, oppId, attempt, shift }` | Claim success/failure details |
| `SG_RATE_LIMITED` | `{ limited: boolean }` | Rate-limit state change |

### Security of postMessage Bridge

- Both scripts filter `e.source !== window` to ignore cross-origin messages
- `api-layer.js` uses `window.__SG_EID_SENT` guard to prevent duplicate employee ID broadcasts
- **Risk:** Page JavaScript can observe and potentially spoof postMessage traffic since `api-layer.js` runs in MAIN world. See [[Security Audit]].

---

## Storage-as-Message-Pass (Async Bus)

Several modules communicate indirectly via `chrome.storage.local` rather than explicit messages:

| Key | Writer | Reader | Purpose |
|-----|--------|--------|---------|
| `sg_enabled` | popup.js | main.js, SW | Global on/off |
| `sg_paused` | popup.js, main.js | main.js, SW, popup.js | Pause state |
| `sg_override` | popup.js, main.js | main.js, SW, popup.js | Override state |
| `sg_access_token` | popup.js | main.js, SW, license.js | License token |
| `sg_token_exp` | popup.js | main.js, SW | Token expiry |
| `sg_tg_queue` | main.js | SW | Pending Telegram notifications |
| `sg_blacklist_dates` | popup.js | main.js, api-layer.js | Skip dates |
| `sg_dates` | popup.js | popup.js | User-selected open-tab dates |
| `sg_hud_hidden` | main.js | main.js | HUD visibility preference |

> **Debt:** Storage writes are not atomic. Race conditions possible when popup and content script write simultaneously. See [[Technical Debt Register]] #8.

---

## Alarm Events (Implicit Bus)

`chrome.alarms.onAlarm` acts as a time-delayed message bus:

| Alarm Name | Fires | Receiver | Action |
|------------|-------|----------|--------|
| `SG_TOKEN_CHECK` | Every 2 min | SW | `tryAutoRefreshTokenIfNeeded()` + `flushTelegramQueue()` |
| `SG_BURST_START` | 5-min anchor − 800 ms | SW | Begin burst reload cycle |
| `SG_BURST_STEP` | ~4 s after previous | SW | Subsequent burst reload |
| `SG_OVERRIDE_TICK` | ~4 s jitter | SW | Override mode continuous reload |

Alarms survive browser restarts and service worker termination, making them the most reliable message bus in MV3.

---

## Contact Button

The popup's **Contact Us** button (line ~300 in `popup.js`) opens:

```javascript
const CONTACT_URL = "https://t.me/shift_grabber";
```

This is a Telegram channel/deep link. Not documented in any UI text — the button label simply says "Contact Us".

---

## Message Type Registry (Alphabetical)

| Type | Direction | Transport | Payload Shape |
|------|-----------|-----------|---------------|
| `SG_CLAIM_RESULT` | api-layer → main.js | postMessage | `{ data, oppId, attempt, shift }` |
| `SG_EID` | api-layer → main.js | postMessage | `{ eid: string }` |
| `SG_LICENSE_VERIFIED` | popup → SW | runtime | `{ value: boolean }` |
| `SG_POKE_SCHEDULE` | main.js → SW | runtime | — |
| `SG_RATE_LIMITED` | api-layer → main.js | postMessage | `{ limited: boolean }` |
| `SG_RELOAD_ALL_NOW` | popup → SW | runtime | — |
| `SG_REQUEST_TOKEN_REFRESH` | SW → popup | runtime | — |
| `SG_SET_BLACKLIST_DATES` | main.js → api-layer | postMessage | `{ dates: string[] }` |
| `SG_SET_ENABLED` | popup → SW, popup → main.js | runtime / tabs | `{ value: boolean }` |
| `SG_SET_OVERRIDE` | popup → SW, popup → main.js | runtime / tabs | `{ value: boolean }` |
| `SG_SET_PAUSED` | popup → SW, popup → main.js | runtime / tabs | `{ value: boolean }` |
| `SG_SET_SPEED` | main.js → api-layer | postMessage | `{ interval: number }` |
| `SG_START_POLLING` | main.js → api-layer | postMessage | `{ interval, start, end }` |
| `SG_STOP_POLLING` | main.js → api-layer | postMessage | — |
| `SG_TOGGLE_HUD` | popup → main.js | tabs | — |
| `SG_TOGGLE_OVERRIDE` | popup → main.js | tabs | — |
| `SG_TOGGLE_PAUSE` | popup → main.js | tabs | — |

---

## Related

- [[Data Flow]] — End-to-end data paths with sequence diagrams
- [[main.js]] — ISOLATED world message handlers
- [[api-layer.js]] — MAIN world message handlers
- [[service-worker.js]] — Alarm router and runtime message handlers
- [[popup.js]] — Message originator (popup side)
- [[Security Audit]] — Risks in the message bus (spoofing, no sender validation)
- [[Technical Debt Register]] — Storage key duplication and race conditions
- [[Configuration Reference]] — Storage key names used as implicit bus addresses
