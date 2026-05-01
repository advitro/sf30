# Dependency Graph

> Vault node: [[Shift Grabber V9 Index]]  
> Related: [[Architecture Map]], [[Module Analysis]], [[Data Flow]], [[Security Audit]]

## File-Level Dependency Matrix

| Source → Target | Relation | Evidence |
|-----------------|----------|----------|
| [[main.js]] → [[api-layer.js]] | `window.postMessage` protocol | Main.js lines 428, 563, 567, 571 |
| [[api-layer.js]] → [[main.js]] | `window.postMessage` protocol | Api-Layer.js lines 131-135, 154, 161, 175 |
| [[main.js]] → [[service-worker.js]] | `chrome.runtime.sendMessage` | Main.js lines 440, 451, 480, 495, 595 |
| [[popup.js]] → [[service-worker.js]] | `chrome.runtime.sendMessage` | Popup.js lines 65, 71, 76, 212, 280, 289, 299 |
| [[popup.js]] → [[main.js]] | `chrome.tabs.sendMessage` | Popup.js lines 167-169, 263-266 |
| [[service-worker.js]] → [[main.js]] | `chrome.tabs.reload` (indirect) | Service-Worker.js lines 101-105 |
| [[Popup UI|index.html]] → [[popup.js]] | `<script src>` | Index.html line 85 |
| [[Popup UI|index.html]] → styles.css | `<link rel="stylesheet">` | Index.html line 6 |
| [[manifest.json]] → [[main.js]] | `content_scripts` declaration | Manifest.json lines 31-37 |
| [[manifest.json]] → [[api-layer.js]] | `content_scripts` (MAIN world) | Manifest.json lines 38-44 |
| [[manifest.json]] → [[service-worker.js]] | `background.service_worker` | Manifest.json lines 13-15 |
| [[manifest.json]] → [[popup.js]] | `action.default_popup` | Manifest.json lines 16-19 |

```mermaid
graph LR
    MANIFEST[[manifest.json]]

    subgraph Content ["Content Scripts"]
        MAIN[[main.js]]
        API[[api-layer.js]]
    end

    subgraph Background ["Background"]
        SW[[service-worker.js]]
    end

    subgraph Popup ["Popup UI"]
        HTML[[Popup UI|index.html]]
        POP[[popup.js]]
        CSS[styles.css]
    end

    MAIN <-->|postMessage| API
    MAIN -->|sendMessage| SW
    POP -->|sendMessage| SW
    POP -->|tabs.sendMessage| MAIN
    SW -->|tabs.reload| MAIN
    HTML -->|script src| POP
    HTML -->|link rel| CSS
    MANIFEST -->|declares| MAIN
    MANIFEST -->|declares| API
    MANIFEST -->|declares| SW
    MANIFEST -->|declares| POP
```

## Function Call Graph

### [[main.js]] Callers & Callees

```
init() [IIFE line 575]
  ├── updateHUD()
  ├── startMainLoop()
  │   ├── clickStayLoggedInIfPresent()
  │   └── tryToGrabShifts()
  │       ├── findAddShiftButtons()
  │       ├── parseShiftInfo()
  │       ├── findConfirmButton()
  │       ├── showToast()
  │       ├── playAlert()
  │       └── sendTelegramLog()
  └── waitForApiLayer()
      └── startApiPolling()
          ├── getTabDateWindow()
          └── setApiSpeed()

updateHUD() [line 203]
  ├── ensureHUD()
  ├── updateDot()
  │   └── ensureDot()
  └── chrome.storage.local.get()

chrome.runtime.onMessage listener [line 421]
  ├── chrome.storage.local.set()
  ├── window.postMessage() → Api-Layer.js
  ├── toggleHUD()
  └── chrome.runtime.sendMessage() → Service-Worker.js

window.addEventListener('message') [line 491]
  ├── chrome.storage.local.set()
  ├── chrome.runtime.sendMessage() → Service-Worker.js
  ├── updateHUD()
  ├── showToast()
  ├── playAlert()
  ├── flashOverlay()
  └── sendTelegramLogForDate()
      └── chrome.storage.local.get/set()
```

### [[api-layer.js]] Callers & Callees

All functions are enclosed in an IIFE. The only external caller is the `window.addEventListener('message')` handler (line 255).

```
window.addEventListener('message') [line 255]
  ├── startLoop() [line 236]
  │   └── pollOnce() [line 167]
  │       ├── eid() [line 46]
  │       ├── getQueryRange() [line 74]
  │       ├── makeHeaders() [line 61]
  │       │   └── getCsrf() [line 33]
  │       └── fireClaim() [line 97]
  │           └── makeHeaders()
  ├── stopLoop() [line 249]
  └── pollInterval / baseInterval mutation
```

### [[service-worker.js]] Callers & Callees

```
chrome.alarms.onAlarm [line 136]
  ├── tryAutoRefreshTokenIfNeeded() [line 325]
  │   └── refreshTokenInBackground() [line 293]
  ├── flushTelegramQueue() [line 7]
  │   └── sendTelegram() [line 30]
  ├── scheduleNextBurstAnchor() [line 112]
  └── startOverrideTick() [line 124]

chrome.runtime.onMessage [line 192]
  └── handleMessage() [line 198]
      ├── clearAllAlarms()
      ├── getState()
      ├── setState()
      ├── scheduleNextBurstAnchor()
      ├── startOverrideTick()
      └── reloadAllAtoZTabs() [line 101]

chrome.runtime.onInstalled [line 346]
  └── setState(), ensureTokenCheckAlarm(), flushTelegramQueue()

chrome.runtime.onStartup [line 353]
  └── clearAllAlarms(), ensureTokenCheckAlarm(), flushTelegramQueue(), schedule logic
```

### [[popup.js]] Callers & Callees

```
DOMContentLoaded [line 183]
  ├── getStore()
  ├── renderDates() [line 120]
  ├── renderBlacklistDates() [line 143]
  ├── refreshLicenseStatusUI() [line 84]
  ├── updateStatusBadge() [line 105]
  └── Event listener registrations
      ├── verifyWithServer() [line 54]
      │   └── getDeviceId() [line 44]
      ├── setStore()
      ├── chrome.runtime.sendMessage() → Service-Worker.js
      ├── sendToAllAtoZ() [line 166]
      │   └── chrome.tabs.query/sendMessage() → Main.js
      └── chrome.tabs.create()
```

## Data Dependencies

### chrome.storage.local Keys

| Key | Written By | Read By | Purpose |
|-----|------------|---------|---------|
| `sg_enabled` | Popup.js:211, Service-Worker.js:218 | Main.js:576, Service-Worker.js:113,145, Popup.js:185 | Master on/off switch |
| `sg_paused` | Main.js:439,464, Popup.js:279, Service-Worker.js:243 | Main.js:207,437, Service-Worker.js:115,146, Popup.js:106,278 | Pause state |
| `sg_override` | Main.js:450,472, Popup.js:288, Service-Worker.js:232 | Main.js:208, Service-Worker.js:115,147, Popup.js:106,286 | Fast-reload mode |
| `sg_access_token` | Popup.js:76, Service-Worker.js:313 | Main.js:213, Service-Worker.js:117,146 | License token |
| `sg_token_exp` | Popup.js:76, Service-Worker.js:313 | Main.js:214, Service-Worker.js:117,146 | Token expiry |
| `sg_next_due` | Service-Worker.js:120,131,159,175 | Main.js:212, Service-Worker.js:66 | Next alarm timestamp |
| `sg_burst_left` | Service-Worker.js:120,153,156,172,250 | Main.js:213, Service-Worker.js:73 | Remaining burst reloads |
| `SG_userKey` | Popup.js:76 | Main.js:74, Service-Worker.js:298, Popup.js:86 | License key string |
| `sg_blacklist_dates` | Main.js:427, Popup.js:249 | Main.js:578, Api-Layer.js:275 | Dates to skip |
| `sg_dates` | Popup.js:225 | Popup.js:221 | User-selected open-tab dates |
| `sg_tg_queue` | Main.js:82,552 | Service-Worker.js:9 | Pending Telegram messages |
| `sg_eid` | Service-Worker.js:269 | — | Employee ID cache |
| `sg_hud_hidden` | Main.js:200 | Main.js:577 | HUD visibility |
| `SG_deviceId` | Popup.js:49 | Service-Worker.js:299, Popup.js:46 | Unique device ID |

### window.postMessage Events

| Event | Direction | Payload | Line |
|-------|-----------|---------|------|
| `SG_START_POLLING` | Main.js → Api-Layer.js | `{ interval, tabWindow }` | Main.js:563 |
| `SG_STOP_POLLING` | Main.js → Api-Layer.js | — | Main.js:567 |
| `SG_SET_SPEED` | Main.js → Api-Layer.js | `{ interval }` | Main.js:571 |
| `SG_SET_BLACKLIST_DATES` | Main.js → Api-Layer.js | `{ blacklist }` | Main.js:428 |
| `SG_EID` | Api-Layer.js → Main.js | `{ eid }` | Api-Layer.js:175 |
| `SG_RATE_LIMITED` | Api-Layer.js → Main.js | `{ limited: boolean }` | Api-Layer.js:154,161 |
| `SG_CLAIM_RESULT` | Api-Layer.js → Main.js | `{ data, oppId, attempt, shift }` | Api-Layer.js:131 |

### Global Variables (Module-Scope State)

| File | Variables | Line(s) |
|------|-----------|---------|
| [[main.js]] | `hudEl`, `dotEl`, `isPaused`, `overrideMode`, `hudTimer`, `hudHidden`, `turboMode`, `rateLimited`, `tokenExpiredPollingStopped` | 25-35 |
| [[main.js]] | `apiClaimNotified` (object map), `clickedButtons` (WeakSet) | 38, 41 |
| [[api-layer.js]] | `claimedIds`, `pollTimer`, `pollInterval`, `running`, `pollCount`, `cachedEid`, `blacklistDates`, `tabWindow`, `baseInterval`, `consecutiveErrors`, `rateLimited`, `errorRecoveryTimer`, `cachedCsrf`, `csrfTs` | 16-31 |
| [[service-worker.js]] | `TG_BOT_TOKEN`, `TG_CHAT_ID` (hardcoded secrets) | 4-5 |

## External Dependencies

| Service | URL / Endpoint | Consumer | Line |
|---------|----------------|----------|------|
| Amazon GraphQL | `https://atoz-apps.amazon.work/apis/ScheduleManagementService/graphql` | Api-Layer.js | 9 |
| Amazon GraphQL (poll query) | same + `?employeeId=` | Api-Layer.js | 181 |
| License verification | `https://shift-grabber.vercel.app/verify` | Popup.js | 57 |
| License verification (SW fallback) | `https://shift-grabber.vercel.app/verify` | Service-Worker.js | 302 |
| Telegram sendMessage | `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage` | Service-Worker.js | 37 |
| Browser sound asset | `chrome.runtime.getURL("sounds/click.mp3")` | Main.js | 109, 379 |

### Chrome APIs Used

| API | Purpose | Files |
|-----|---------|-------|
| `chrome.storage.local.get/set` | Shared state | Main.js, Service-Worker.js, Popup.js |
| `chrome.runtime.sendMessage` | Cross-tier commands | Main.js, Service-Worker.js, Popup.js |
| `chrome.runtime.onMessage` | Command reception | Main.js, Service-Worker.js, Popup.js |
| `chrome.runtime.getURL` | Asset resolution | Main.js |
| `chrome.runtime.onInstalled` | Bootstrap defaults | Service-Worker.js |
| `chrome.runtime.onStartup` | Resume scheduling | Service-Worker.js |
| `chrome.tabs.query` | Find AtoZ tabs | Service-Worker.js, Popup.js |
| `chrome.tabs.reload` | Burst reload | Service-Worker.js |
| `chrome.tabs.sendMessage` | Popup → Content | Popup.js |
| `chrome.tabs.create` | Open date tabs | Popup.js |
| `chrome.alarms.create/clearAll` | Background scheduling | Service-Worker.js |
| `chrome.alarms.onAlarm` | Alarm dispatch | Service-Worker.js |

## Related Notes

- [[Shift Grabber V9 Index]]
- [[Architecture Map]]
- [[Module Analysis]]
- [[Data Flow]]
- [[Security Audit]]
- [[main.js]]
- [[api-layer.js]]
- [[service-worker.js]]
- [[popup.js]]
- [[Popup UI]]
- [[license.js]]
- [[manifest.json]]
- [[Configuration Reference]]
- [[Technical Debt Register]]
- [[External API Contracts]]
- [[Project Evolution]]
- [[Master Document]]
