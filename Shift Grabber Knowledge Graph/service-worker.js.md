# service-worker.js

## File Role
363 lines. MV3 **background service worker**. Three responsibilities:
1. **Scheduler** — alarm-based burst reloads and override ticks.
2. **License gatekeeper** — verifies token presence/expiry before executing any schedule action; attempts background token refresh.
3. **Telegram relay** — flushes queued shift-grab notifications from storage to Telegram API.

## Alarm-Based Scheduling Architecture

**Why `chrome.alarms` instead of `setInterval`:**
In Manifest V3, service workers are ephemeral — they terminate after ~30 seconds of inactivity. `setInterval` does **not** survive termination. `chrome.alarms` are managed by the browser and will wake the service worker at the scheduled time. Comment at line 338: `setInterval() does NOT survive SW termination in MV3 — alarms do.`

### Alarm Types Used

| Alarm Name | Created By | Fires When | Purpose |
|------------|-----------|------------|---------|
| `SG_TOKEN_CHECK` | `ensureTokenCheckAlarm` | Every 2 minutes (periodic) | Calls `tryAutoRefreshTokenIfNeeded()` + `flushTelegramQueue()` |
| `SG_BURST_START` | `scheduleNextBurstAnchor` | At next 5-minute anchor minus 800ms | Triggers burst reload sequence |
| `SG_BURST_STEP` | Alarm router (itself) | Jittered delay after previous burst step | Subsequent reloads within a burst |
| `SG_OVERRIDE_TICK` | `startOverrideTick` | Jittered delay (~4s ± 250ms) | Override (fast) mode reloads |

## Burst Scheduling

### `nextFiveMinuteAnchorMinus800ms(from = new Date())` — lines 90–99
Calculates the next time whose minute value is a multiple of 5 (`:00`, `:05`, `:10`, etc.), subtracts 800ms so the reload fires **just before** the 5-minute boundary. If the computed time is already in the past, advances by another 5 minutes.

Example: at `10:03:00`, next anchor is `10:05:00` → alarm fires at `10:04:59.200`.

### `scheduleNextBurstAnchor()` — lines 112–122
Guard conditions (all must pass):
- `ENABLED` is true
- Not `OVERRIDE`
- Not `PAUSED`
- Valid token: `ACCESS_TOKEN` present and `TOKEN_EXP > nowSec`

Sets `NEXT_DUE` to anchor timestamp, `BURST_REMAINING` to `BURST_COUNT` (default 2). Creates `SG_BURST_START` alarm for that anchor.

### Burst Execution in Alarm Router (lines 151–164)
On `SG_BURST_START`:
1. Skip if `OVERRIDE` is true.
2. Set `BURST_REMAINING` to `BURST_COUNT`.
3. Call `reloadAllAtoZTabs()`.
4. Decrement `BURST_REMAINING`.
5. If remaining > 0, create `SG_BURST_STEP` alarm after jittered delay (`BASE_MS` 4000 ± `JITTER_MS` 250).
6. If remaining == 0, call `scheduleNextBurstAnchor()` to schedule next 5-min anchor.

### `SG_BURST_STEP` (lines 166–180)
1. Re-check state (enabled, not paused, not override, token valid).
2. `reloadAllAtoZTabs()`.
3. Decrement `BURST_REMAINING`.
4. If remaining > 0, schedule another `SG_BURST_STEP`.
5. If remaining == 0, schedule next anchor.

## Override Mode

### `startOverrideTick()` — lines 124–133
Guard conditions:
- `ENABLED` and `OVERRIDE` true
- Not `PAUSED`
- Token valid

Computes jittered delay (`BASE_MS` 4000 ± `JITTER_MS` 250). Sets `NEXT_DUE = now + delay`, `BURST_REMAINING = 0`. Creates `SG_OVERRIDE_TICK` alarm.

### `SG_OVERRIDE_TICK` (lines 182–188)
1. Re-check state (enabled, override, not paused, token valid).
2. `reloadAllAtoZTabs()`.
3. Call `startOverrideTick()` to schedule next tick.

**Behavior:** Override mode bypasses the 5-minute anchor schedule and reloads tabs every ~4 seconds with jitter.

## Alarm Router

`chrome.alarms.onAlarm.addListener` — lines 136–189.

Handles all four alarm types. Every alarm path first calls `flushTelegramQueue()` (except `SG_TOKEN_CHECK`, which calls it explicitly inside its own block). Every non-token alarm re-validates token expiry before proceeding.

## Message Handlers from Popup

`chrome.runtime.onMessage.addListener` — lines 192–196. Returns `true` to keep channel open for async.

`handleMessage(msg, sender, sendResponse)` — lines 198–288.

| Message | Lines | Action |
|---------|-------|--------|
| `SG_LICENSE_VERIFIED` | 199–214 | Clears all alarms. If `msg.value === true` and enabled, starts override tick or burst anchor. If false, nulls schedule. |
| `SG_SET_ENABLED` | 217–229 | Stores enabled state, clears alarms, ensures token check alarm, starts scheduling if enabled. |
| `SG_SET_OVERRIDE` | 231–240 | Stores override state, clears alarms, restarts scheduling if enabled. |
| `SG_SET_PAUSED` | 242–253 | Stores paused state, clears alarms, restarts scheduling if enabled and not paused, else nulls schedule. |
| `SG_RELOAD_ALL_NOW` | 255–260 | If enabled + not paused + token valid, reloads all AtoZ tabs immediately. |
| `SG_TELEGRAM_LOG` | 262–265 | Direct-send Telegram (bypasses queue). |
| `SG_EID` | 267–272 | Stores employee ID from content script to storage. |
| `SG_POKE_SCHEDULE` | 274–288 | Clears alarms, checks token, restarts appropriate schedule mode (paused → null, override → tick, normal → anchor). |

## Token Refresh Architecture

### `refreshTokenInBackground()` — lines 293–320
**Primary refresh path.** Works even when popup is closed.

1. Reads `SG_userKey` and `SG_deviceId` from storage.
2. POSTs to `https://shift-grabber.vercel.app/verify` with `{ key, deviceId }`.
3. If `!json.authorized`, returns false.
4. Generates/stores new token: `accessToken` from server or `crypto.randomUUID()` fallback; `expiresAt` from server or `now + 600` fallback.
5. Stores to `sg_access_token` and `sg_token_exp`.
6. Logs validity duration.

> **Device ID note:** This function reads `SG_deviceId` (popup's key). It does NOT use `license.js`'s `deviceId` key. This creates a divergence where SW refresh and `license.js` verification may send different device IDs to the server. See [[State & Storage Model]] and [[Technical Debt Register]] #16.

### `tryAutoRefreshTokenIfNeeded()` — lines 325–335
Called every 2 minutes by `SG_TOKEN_CHECK` alarm.

1. Reads token and expiry.
2. If token missing or `exp - nowSec > 120`, returns immediately (not expiring soon).
3. Calls `refreshTokenInBackground()`.
4. If SW refresh fails, sends `SG_REQUEST_TOKEN_REFRESH` to popup as fallback (only works if popup is open).

### `ensureTokenCheckAlarm()` — lines 339–343
Creates `SG_TOKEN_CHECK` alarm if absent:
- `delayInMinutes: 1` (first fire)
- `periodInMinutes: 2` (recurring)

## Telegram Queue System

### `flushTelegramQueue()` — lines 7–28
1. Reads `sg_tg_queue` from storage.
2. If empty, returns.
3. **Clears queue first** (line 13) to prevent double-send if SW restarts mid-flush.
4. Iterates items, calls `sendTelegram()`.
5. Failed items are re-queued: merges with any new items that arrived during flush, writes back to storage.

### `sendTelegram(userKey, date, time)` — lines 30–49
Direct `fetch` to `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`.
- `parse_mode: "HTML"`
- Message format: `✅ <b>Shift Grabbed</b>\n👤 <b>Key:</b> <code>${userKey}</code>\n📅 <b>Date:</b> ${date}\n⏰ <b>At:</b> ${time}`

Hardcoded credentials:
- `TG_BOT_TOKEN = "8528351436:AAFzN8eMG21RYQUCcDr4XWZEFCrurLa8cdA"` (line 4)
- `TG_CHAT_ID = "-1003719428092"` (line 5)

Returns boolean success/failure.

## Initialization

### `chrome.runtime.onInstalled` (lines 346–350)
- Sets all storage to `DEFAULTS`.
- Ensures token check alarm.
- Flushes any residual Telegram queue.

### `chrome.runtime.onStartup` (lines 353–363)
- Clears all alarms (clean slate after browser restart).
- Ensures token check alarm.
- Flushes Telegram queue.
- If enabled + not paused + token valid, resumes scheduling:
  - Override mode → `startOverrideTick()`
  - Normal → `scheduleNextBurstAnchor()`

## Related Notes

- [[popup.js]]
- [[main.js]]
- [[license.js]]
- [[License & Token Lifecycle]]
- [[Data Flow]]
- [[manifest.json]]
- [[Configuration Reference]]
- [[Technical Debt Register]]
- [[External API Contracts]]
- [[Project Evolution]]
- [[Shift Grabber V9 Index]]
- [[Master Document]]
