# popup.js

## File Role
308 lines. Popup control panel. Runs in the context of `popup/index.html`. Provides the user interface for enabling/disabling the extension, managing target dates and blacklists, toggling pause/override, verifying license keys, and sending control messages to the service worker and content scripts.

## UI Element Bindings

`els` object — lines 16–37. Maps DOM `id` attributes from `index.html` to script references.

| Key | Element ID | Purpose |
|-----|-----------|---------|
| `enableToggle` | `enableToggle` | Master on/off switch |
| `dateInput` / `addDateBtn` | `dateInput` / `addDateBtn` | Add target dates to open |
| `datesList` | `datesList` | Rendered pill list of target dates |
| `clearDatesBtn` / `openDatesNowBtn` | `clearDatesBtn` / `openDatesNowBtn` | Clear list or open tabs |
| `blacklistDateInput` / `addBlacklistDateBtn` | `blacklistDateInput` / `addBlacklistDateBtn` | Add blacklist skip-dates |
| `blacklistDatesList` | `blacklistDatesList` | Rendered pill list of blacklisted dates |
| `clearBlacklistDatesBtn` / `applyBlacklistDatesBtn` | `clearBlacklistDatesBtn` / `applyBlacklistDatesBtn` | Clear or apply blacklist |
| `pauseToggleBtn` / `overrideToggleBtn` | `pauseToggleBtn` / `overrideToggleBtn` | Pause and override toggles |
| `hideHudBtn` | `hideHudBtn` | Toggle HUD visibility on all tabs |
| `reloadNowBtn` | `reloadNowBtn` | Immediate reload all AtoZ tabs |
| `licenseInput` / `saveKeyBtn` | `licenseInput` / `saveKeyBtn` | License key entry and verification |
| `licenseStatus` | `licenseStatus` | Text display of license state |
| `statusBadge` | `statusBadge` | Visual badge: OFF / PAUSED / FAST / LIVE |
| `contactBtn` | `contactBtn` | Opens Telegram contact URL |

## License Verification Flow

### `verifyWithServer(key)` — lines 54–82
1. Gets or creates `deviceId` via `getDeviceId()` (lines 44–52).
2. POSTs to `${SERVER}/verify` with `{ key, deviceId }`.
3. If HTTP not OK or `!data.authorized`:
   - Clears token (`sg_access_token = null`, `sg_token_exp = 0`).
   - Sends `SG_LICENSE_VERIFIED` with `value: false` to [[service-worker.js]].
   - Returns `{ ok: false, reason }`.
4. If authorized:
   - Extracts `accessToken` (fallback `crypto.randomUUID()`) and `expiresAt` (fallback `now + 600`).
   - Stores token, expiry, and key.
   - Sends `SG_LICENSE_VERIFIED` with `value: true` to [[service-worker.js]].
   - Returns `{ ok: true, token, exp }`.

### `refreshLicenseStatusUI()` — lines 84–103
Reads `USER_KEY`, `ACCESS_TOKEN`, `TOKEN_EXP` from storage.
- No key → `"No key saved — enter a key and click Verify."` (red)
- Token present and `exp > now` → `"✅ License Active"` (green)
- Else → `"❌ Invalid or expired — click Verify."` (red)

## Date Management

### `renderDates(dates)` — lines 120–141
Renders target-date pills into `els.datesList`. Each pill has a remove button that filters the date from `sg_dates` storage and re-renders.

### `renderBlacklistDates(dates)` — lines 143–164
Identical pattern to `renderDates`, but operates on `sg_blacklist_dates`.

### Date Flow
- **Add target date:** Reads `sg_dates`, adds to `Set`, sorts, stores, re-renders (lines 218–227).
- **Open dates now:** Iterates stored dates, opens `chrome.tabs.create` with AtoZ schedule URL + `date=` parameter, `active: false` (lines 234–240).
- **Add blacklist date:** Reads `sg_blacklist_dates`, adds to `Set`, sorts, stores, re-renders (lines 242–252).
- **Apply blacklist:** Reads `sg_blacklist_dates`, sends `SG_SET_BLACKLIST_DATES` message to **all** AtoZ tabs (lines 259–274). Also shows `alert()` confirmation.

## Message Sending to Service Worker and Content Scripts

### `sendToAllAtoZ(message)` — lines 166–170
Queries `chrome.tabs.query({ url: "https://atoz.amazon.work/*" })`, sends the message to each tab via `chrome.tabs.sendMessage`.

### Control Message Map

| UI Action | Lines | Storage Update | SW Message | Content Script Message |
|-----------|-------|----------------|------------|------------------------|
| Save/Verify Key | 192–207 | `USER_KEY`, `ACCESS_TOKEN`, `TOKEN_EXP` | `SG_LICENSE_VERIFIED` | — |
| Enable Toggle | 209–216 | `ENABLED` | `SG_SET_ENABLED`, then `SG_POKE_SCHEDULE` | — |
| Pause Toggle | 276–283 | `PAUSED` | `SG_SET_PAUSED` | `SG_TOGGLE_PAUSE` to all tabs |
| Override Toggle | 285–292 | `OVERRIDE` | `SG_SET_OVERRIDE` | `SG_TOGGLE_OVERRIDE` to all tabs |
| Hide HUD | 294–296 | — | — | `SG_TOGGLE_HUD` to all tabs |
| Reload Now | 298–300 | — | `SG_RELOAD_ALL_NOW` | — |
| Apply Blacklist | 259–274 | — | — | `SG_SET_BLACKLIST_DATES` to all tabs |

## Token Auto-Refresh Handler

Lines 172–181. Listens for `SG_REQUEST_TOKEN_REFRESH` from [[service-worker.js]].

- Reads `USER_KEY` from storage.
- If key exists, calls `verifyWithServer(key)` to re-verify and refresh token.
- Calls `refreshLicenseStatusUI()` to update popup display.

This is the **popup fallback** path when the service worker's background refresh fails.

## Status Badge System

### `updateStatusBadge()` — lines 105–118
Reads `ENABLED`, `PAUSED`, `OVERRIDE` from storage. Sets `textContent` and CSS class:

| State | Text | Class |
|-------|------|-------|
| `!ENABLED` | `OFF` | `off` |
| `PAUSED` | `PAUSED` | `paused` |
| `OVERRIDE` | `FAST` | `fast` |
| Default | `LIVE` | `live` |

Refreshed every 2 seconds via `setInterval(updateStatusBadge, 2000)` (line 307).

## Contact Button

`contactBtn` opens `CONTACT_URL = "https://t.me/shift_grabber"` (line 2). This Telegram deep link is not surfaced in UI text — the button simply says "Contact Us".

## Device ID Divergence

`popup.js` maintains its own device ID under key `SG_deviceId` (lines 44–52). This is **separate** from `license.js` which uses key `deviceId`. The two modules generate and store independent UUIDs, meaning the server sees two different device IDs for the same browser depending on which module verifies.

> **Bug:** See [[State & Storage Model]] and [[Technical Debt Register]] for full analysis.

## Init (`DOMContentLoaded`) — lines 183–308

1. Reads initial state from storage (lines 184).
2. Sets `enableToggle.checked`, `licenseInput.value`.
3. Renders date lists and blacklist lists.
4. Calls `refreshLicenseStatusUI()` and `updateStatusBadge()`.
5. Binds all click/change event listeners (lines 192–304).
6. Starts two intervals:
   - `refreshLicenseStatusUI` every 5 seconds (line 306)
   - `updateStatusBadge` every 2 seconds (line 307)

## Related Notes

- [[service-worker.js]]
- [[main.js]]
- [[Popup UI]]
- [[license.js]]
- [[License & Token Lifecycle]]
- [[manifest.json]]
- [[Configuration Reference]]
- [[Technical Debt Register]]
- [[External API Contracts]]
- [[Project Evolution]]
- [[Shift Grabber V9 Index]]
- [[Master Document]]
