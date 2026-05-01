# State & Storage Model

How [[Shift Grabber V9 Index|Shift Grabber V9]] uses `chrome.storage.local` as its single source of truth, and why that design creates both resilience and risk.

---

## Design Philosophy

In Manifest V3, the service worker is **ephemeral** — it can terminate at any moment. Popup is **transient** — it destroys on blur. Only `chrome.storage.local` persists across all contexts and browser restarts.

Therefore, **storage is the state machine**. Messages merely nudge it; alarms merely read it.

---

## Storage Key Registry

| Key | Type | Default | Writers | Readers | Purpose |
|-----|------|---------|---------|---------|---------|
| `sg_enabled` | boolean | `false` | popup.js | main.js, SW | Master on/off switch |
| `sg_paused` | boolean | `false` | popup.js, main.js | main.js, SW, popup.js | Pause state |
| `sg_override` | boolean | `false` | popup.js, main.js | main.js, SW, popup.js | Fast-reload mode |
| `sg_access_token` | string | `null` | popup.js | main.js, SW, license.js | License JWT/UUID |
| `sg_token_exp` | number | `0` | popup.js | main.js, SW | Token expiry (unix seconds) |
| `sg_next_due` | number | `0` | SW | main.js | Next burst anchor timestamp |
| `sg_burst_left` | number | `0` | SW | SW | Remaining reloads in burst |
| `sg_dates` | string[] | `[]` | popup.js | popup.js | Dates to open in tabs |
| `sg_blacklist_dates` | string[] | `[]` | popup.js | main.js, api-layer.js | Dates to skip claiming |
| `sg_tg_queue` | object[] | `[]` | main.js | SW | Pending Telegram messages |
| `sg_turbo` | boolean | `false` | popup.js, main.js | main.js, api-layer.js | 500 ms polling mode |
| `sg_hud_hidden` | boolean | `false` | main.js | main.js | HUD visibility preference |
| `SG_userKey` | string | `""` | popup.js | main.js, license.js | License key string |
| `SG_deviceId` | string | generated | popup.js | popup.js | Unique browser fingerprint |
| `deviceId` | string | generated | license.js | license.js | Alternate device ID (see [[#Device ID Divergence|below]]) |
| `verified` | boolean | `false` | license.js | SW | Last license check result |
| `reason` | string | `""` | license.js | SW | Last license failure reason |
| `sg_eid` | string | `""` | main.js | SW | Cached employee ID |

---

## State Machine: Extension Lifecycle

```
[Fresh Install]
    │
    ▼
[Disabled] ──sg_enabled=false──► All polling/scheduling OFF
    │
    ▼ user toggles ON in popup
[Enabled] ──sg_enabled=true──► Checks token
    │
    ├─ token valid ──► [Active] → start polling + scheduling
    │
    └─ token missing/expired ──► [Gated] → HUD shows "NO KEY"
         │
         ▼ user verifies license
    [Active] ──sg_access_token set──► normal operation
         │
         ├─ user presses P ──► [Paused] → polling stops, scheduling continues
         │
         ├─ user presses Shift+O ──► [Override] → fast reloads
         │
         ├─ user presses Shift+T ──► [Turbo] → 500 ms polls
         │
         └─ token expires ──► [Gated] → auto-resume if SW refreshes token
```

---

## Token Expiry Guard

`main.js` implements a critical guard in `updateHUD()` (lines ~220–235):

```javascript
const hasToken = st[K.ACCESS_TOKEN] && st[K.TOKEN_EXP] && st[K.TOKEN_EXP] > nowSec;
if (st[K.ENABLED] && !isPaused) {
  if (!hasToken && !tokenExpiredPollingStopped) {
    tokenExpiredPollingStopped = true;
    stopApiPolling();
  } else if (hasToken && tokenExpiredPollingStopped) {
    tokenExpiredPollingStopped = false;
    startApiPolling();
  }
}
```

**Why this matters:**
- Stops API polling immediately when token expires (avoids 401 spam)
- Auto-resumes when SW refreshes token in background (seamless recovery)
- `tokenExpiredPollingStopped` boolean prevents stop/start thrashing

---

## Storage Key Divergence

### `sg_*` vs `SG_*` Prefix

Two naming conventions exist simultaneously:

| Convention | Used By | Examples |
|------------|---------|----------|
| `sg_*` (lowercase) | main.js, popup.js, SW | `sg_enabled`, `sg_access_token`, `sg_token_exp` |
| `SG_*` (uppercase) | popup.js only | `SG_userKey`, `SG_deviceId` |

> **Debt:** Inconsistent casing. No functional impact, but creates cognitive overhead. See [[Technical Debt Register]] #3.

### Device ID Divergence

| Source | Storage Key | Generator | Used By |
|--------|-------------|-----------|---------|
| `popup.js` | `SG_deviceId` | `crypto.randomUUID()` | `getDeviceId()` in popup |
| `license.js` | `deviceId` | `crypto.randomUUID()` | `getDeviceId()` in license helper |
| `service-worker.js` | reads `SG_deviceId` | — | `refreshTokenInBackground()` |

**Critical finding:** Three different behaviours exist:
1. **Popup verify** (`popup.js`): Writes/reads `SG_deviceId`, sends to server
2. **Background verify** (`service-worker.js` line 299): Reads `SG_deviceId` (same as popup), sends to server
3. **License helper verify** (`license.js`): Writes/reads `deviceId` (different key!), sends to server

This means:
- Popup and SW share one device ID (`SG_deviceId`)
- `license.js` maintains a **second independent device ID** (`deviceId`)
- If `license.js` is called directly (e.g., from SW import), it sends a different ID than the SW's own refresh logic
- Server may see 2+ device IDs for the same browser

> **Debt:** This is a **functional bug**, not just style debt. See [[Technical Debt Register]] #16.

---

## Atomicity Risks

`chrome.storage.local` provides no transactions. The following operations are non-atomic:

1. **Token write:** `setStore({ accessToken, tokenExp, userKey })` — if crash occurs mid-write, partial state
2. **Telegram queue append:** read → push → write — race condition if two tabs claim simultaneously
3. **Burst state:** `NEXT_DUE` and `BURST_REMAINING` are separate keys — scheduler could read inconsistent pair

In practice, these races are rare because:
- Only one popup instance exists at a time
- Only one service worker runs per extension
- `main.js` per tab is independent

---

## Storage Quota

`chrome.storage.local` quota: **5 MB** (10 MB in some Chromium versions).

Current usage estimate:

| Data | Size |
|------|------|
| Token + expiry | ~100 bytes |
| Date lists (50 dates) | ~500 bytes |
| Blacklist (50 dates) | ~500 bytes |
| Telegram queue (100 messages) | ~10 KB |
| Employee ID | ~20 bytes |
| **Total typical** | **< 15 KB** |

Well within quota. No pruning logic needed.

---

## Related

- [[Configuration Reference]] — Full constant and key registry
- [[Technical Debt Register]] — Storage inconsistencies and race conditions
- [[License & Token Lifecycle]] — Token state machine deep-dive
- [[Message Router & State Bus]] — How messages mutate storage
- [[popup.js]] — Popup-side storage interactions
- [[main.js]] — Content-script storage reads
- [[service-worker.js]] — Background storage reads
