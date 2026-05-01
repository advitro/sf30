# main.js

## File Role
624 lines. Content script running in **ISOLATED world** on `atoz.amazon.work`. Four responsibilities:
1. **HUD** — floating overlay + dot showing mode, countdown, burst bars, clock, token status.
2. **DOM backup** — if API claiming fails or shifts only appear in DOM, clicks "Add Shift" buttons and confirmation dialogs.
3. **Keyboard shortcuts** — pause (`P`), override (`Shift+O`), hide HUD (`Shift+H`), reload (`R`), turbo (`Shift+T`).
4. **Notification bridge** — relays API-layer claim results, rate limits, and employee ID to popup/service worker; queues Telegram logs via storage.

## Constants and Configuration

| Name | Lines | Value | Purpose |
|------|-------|-------|---------|
| `CFG` | 3–8 | `{ CONFIRM_WAIT_MS: 120, PER_SHIFT_STAGGER_MS: 100, BEEP: true, LOG: true }` | DOM-grab timing and sensory feedback toggles |
| `K` | 10–20 | Storage keys for `chrome.storage.local` | Centralized key names: `sg_enabled`, `sg_override`, `sg_paused`, `sg_next_due`, `sg_burst_left`, `sg_access_token`, `sg_token_exp`, `SG_userKey`, `sg_blacklist_dates` |
| `VERSION` | 22 | `"V9"` | HUD badge string |

## Function Inventory

| Name | Lines | Purpose | Called By |
|------|-------|---------|-----------|
| `log` | 43 | Conditional `console.log` with `[ShiftGrabber]` prefix | Throughout |
| `sleep` | 44 | Promise-based `setTimeout` | `tryToGrabShifts` |
| `getPageDate` | 47–55 | Extracts `date=YYYY-MM-DD` from URL, returns localized date string | `sendTelegramLog`, claim result handler |
| `getTabDateWindow` | 58–70 | Parses tab URL date, returns `{ start, windowStart, windowEnd }` where end = start + 7 days | `startApiPolling` |
| `sendTelegramLog` | 72–86 | Pushes `{ userKey, date, time }` onto `sg_tg_queue` in storage for SW flush | `tryToGrabShifts`, `sendTelegramLogForDate` |
| `showToast` | 89–103 | Injects a fixed-position toast div, auto-removes after `ms` | `tryToGrabShifts`, rate-limit handler, claim result handler |
| `playAlert` | 105–113 | Plays `sounds/click.mp3` via injected `<audio>` | `tryToGrabShifts`, claim result handler |
| `flashOverlay` | 115–128 | Full-screen flash div with opacity transition | Keyboard shortcuts, pause/override toggles |
| `mmss` | 131–136 | Formats milliseconds to `MM:SS` | `updateHUD` |
| `burstBars` | 138–149 | HTML string of 2 horizontal bars showing remaining burst count | `updateHUD` |
| `ensureDot` | 151–161 | Creates fixed-position status dot (10px) bottom-right if absent | `updateDot`, `toggleHUD` |
| `updateDot` | 163–180 | Sets dot color based on `rateLimited` > `PAUSED` > token missing/disabled > running | `updateHUD` |
| `ensureHUD` | 182–194 | Creates fixed-position HUD panel (230px wide) bottom-right if absent | `updateHUD`, `toggleHUD` |
| `toggleHUD` | 196–201 | Flips `hudHidden`, toggles display, persists to storage | Keyboard shortcut `Shift+H`, message handler `SG_TOGGLE_HUD` |
| `updateHUD` | 203–314 | **Core UI update loop.** Reads storage, handles token expiry guard, rebuilds HUD innerHTML with mode badge, countdown, burst bars, status rows | `init` (interval every 500ms), toggles, message handlers |
| `clickStayLoggedInIfPresent` | 317–330 | Iterates buttons, clicks any containing "stay logged/signed in" | `startMainLoop` |
| `findAddShiftButtons` | 333–336 | `querySelectorAll` for buttons with text `"add shift"` | `tryToGrabShifts` |
| `parseShiftInfo` | 338–345 | Parses hours/minutes from nearest container text, returns `{ total, label }` | `tryToGrabShifts` |
| `findConfirmButton` | 347–353 | Finds button with text exactly/including `"confirm"`, `"accept"`, `"done"` | `tryToGrabShifts` |
| `tryToGrabShifts` | 355–403 | **DOM backup grabber.** Filters unclicked buttons, sorts by duration descending, clicks with stagger, waits `CONFIRM_WAIT_MS`, clicks confirm dialog if present, fires toast/sound/Telegram | `startMainLoop` |
| `startMainLoop` | 410–418 | Self-rescheduling `setTimeout` loop with **random 600–1000ms** interval to avoid fixed-cadence bot fingerprinting | `init` |
| `sendTelegramLogForDate` | 544–556 | Same as `sendTelegramLog` but accepts explicit date string for API claims | Claim result handler |
| `startApiPolling` | 559–564 | `postMessage` `SG_START_POLLING` to [[api-layer.js]] with interval + 7-day window | `init`, token refresh resume, pause-off |
| `stopApiPolling` | 566–568 | `postMessage` `SG_STOP_POLLING` to [[api-layer.js]] | Token expiry guard, pause-on |
| `setApiSpeed` | 570–572 | `postMessage` `SG_SET_SPEED` to [[api-layer.js]] | Turbo keyboard shortcut |

## HUD System

### `ensureHUD` (lines 182–194)
Creates a single `div` appended to `document.body` with:
- `position:fixed; bottom:14px; right:14px; z-index:2147483646`
- Dark theme (`#0d0d0f` bg, `#242428` border), 230px width, 14px radius.

### `ensureDot` (lines 151–161)
Creates a 10px circle at `bottom:18px; right:18px; z-index:2147483647`. Hidden when HUD is visible, shown when HUD is hidden.

### `updateHUD` (lines 203–314)
**Token Expiry Guard (lines 220–235):**
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
This is the **auto-resume mechanism**: when the service worker refreshes the token in background, `updateHUD` detects `hasToken` became true and restarts API polling without user intervention.

**Mode rendering (lines 249–284):**
Priority order: `rateLimited` → `!hasToken` → `PAUSED` → `OVERRIDE` → default `LIVE`.

**HUD HTML structure (lines 286–313):**
- Top row: `SG · V9` + mode badge pill.
- Center: large `MM:SS` countdown + label (`NEXT BURST`, `NEXT RELOAD`, etc.).
- Divider.
- Bottom rows: STATUS (colored dot + text), CLOCK, BURST (2 bars).

### `toggleHUD` (lines 196–201)
Flips `hudHidden`, persists to `sg_hud_hidden` in storage, and ensures dot visibility.

## Shift Grabbing Logic (DOM Backup)

### `findAddShiftButtons` (lines 333–336)
```javascript
[...document.querySelectorAll("button,[role='button']")]
  .filter(n => (n.textContent || "").toLowerCase().includes("add shift"));
```

### `parseShiftInfo` (lines 338–345)
Walks up DOM via `closest("[data-test-component],[data-testid],div")`, regex-matches `/(\d+)\s*hrs?/` and `/(\d+)\s*mins?/`, returns total minutes for sorting.

### `tryToGrabShifts` (lines 355–403)
1. Early-exit if `isPaused`.
2. Filter buttons against `clickedButtons` `WeakSet` (line 359) — **prevents double-clicking across loops**.
3. Map + sort descending by duration (line 364).
4. For each shift:
   - Add to `clickedButtons` **before** clicking (line 371).
   - Click button (line 374).
   - Sleep `CFG.CONFIRM_WAIT_MS` (120ms) (line 384).
   - Look for confirm/accept/done button (line 385).
   - If found, click it (line 388).
   - Fire `showToast`, `playAlert`, `sendTelegramLog` regardless of dialog path (lines 395–397).

## Keyboard Shortcuts Handler

`window.addEventListener("keydown", ...)` at lines 459–486.

| Key | Modifiers | Action | Lines |
|-----|-----------|--------|-------|
| `P` | none | Toggle pause; immediately stops/starts API polling; syncs storage + SW | 460–468 |
| `Shift+O` | none | Toggle override mode; syncs storage + SW | 469–476 |
| `Shift+H` | none | Toggle HUD visibility | 477–478 |
| `R` | none | Send `SG_RELOAD_ALL_NOW` to SW | 479–480 |
| `Shift+T` | none | Toggle turbo mode (500ms vs 1000ms API polling); calls `setApiSpeed` | 481–485 |

All shortcuts avoid `ctrlKey` and `altKey` to prevent colliding with browser/OS chords.

## API-Layer Bridge

Three `postMessage` wrappers talk to [[api-layer.js]] via `window.postMessage` with `{ sg: true, ... }`:

| Function | Lines | Message Type | Payload |
|----------|-------|--------------|---------|
| `startApiPolling` | 559–564 | `SG_START_POLLING` | `interval`, `tabWindow` |
| `stopApiPolling` | 566–568 | `SG_STOP_POLLING` | none |
| `setApiSpeed` | 570–572 | `SG_SET_SPEED` | `interval` |

`tabWindow` is computed from `getTabDateWindow()` so each tab polls a **7-day window anchored to its own URL date**.

## Message Handlers from Popup / Service Worker

`chrome.runtime.onMessage.addListener` at lines 421–456.

| Message | Lines | Action |
|---------|-------|--------|
| `SG_SET_BLACKLIST_DATES` | 424–430 | Stores to `chrome.storage.local`, relays via `postMessage` to api-layer |
| `SG_TOGGLE_HUD` | 432–434 | Calls `toggleHUD()` |
| `SG_TOGGLE_PAUSE` | 436–445 | Reads storage, flips `PAUSED`, syncs to SW, stops/starts API polling, flashes overlay |
| `SG_TOGGLE_OVERRIDE` | 447–455 | Reads storage, flips `OVERRIDE`, syncs to SW, flashes overlay |

## Window Message Listener (from api-layer)

`window.addEventListener('message', ...)` at lines 491–541. Filters `e.source !== window || !e.data?.sg`.

| Type | Lines | Action |
|------|-------|--------|
| `SG_EID` | 495–498 | Stores employee ID to storage + relays to SW via `SG_EID` message |
| `SG_RATE_LIMITED` | 502–511 | Sets `rateLimited` boolean, shows toast, calls `updateHUD()` |
| `SG_CLAIM_RESULT` | 515–540 | Checks for errors; deduplicates by `oppId` via `apiClaimNotified`; formats shift date; shows toast, sound, flash, Telegram log |

## Init (lines 575–624)
IIFE `init()`:
1. Reads storage for enabled/override/paused/hidden/blacklist.
2. If not enabled, logs and returns.
3. Sets local state variables.
4. If no valid `NEXT_DUE`, sends `SG_POKE_SCHEDULE` to SW.
5. Starts `updateHUD` interval (500ms).
6. Starts main DOM loop.
7. Sends blacklist to api-layer if present.
8. **Waits for api-layer readiness** via `window.__SG_API_LOADED` polling (100ms × 15 tries = 1.5s max) before calling `startApiPolling()`.

## Api-Layer Readiness Protocol

`main.js` cannot immediately call `startApiPolling()` on init because `api-layer.js` (MAIN world) may not have loaded yet. The init function polls `window.__SG_API_LOADED` every 100 ms for up to 15 attempts (1.5 s timeout). If the flag is never set, API polling never starts — the extension falls back to DOM-only grabbing.

`api-layer.js` sets `window.__SG_API_LOADED = true` at the bottom of its IIFE (immediately after parsing). This coordination mechanism is invisible to users but critical for the hybrid grab strategy.

> **Debt:** No fallback if api-layer fails to load. See [[Technical Debt Register]].

## Related Notes

- [[api-layer.js]]
- [[service-worker.js]]
- [[popup.js]]
- [[Popup UI]]
- [[Data Flow]]
- [[manifest.json]]
- [[Configuration Reference]]
- [[Technical Debt Register]]
- [[External API Contracts]]
- [[Project Evolution]]
- [[Shift Grabber V9 Index]]
- [[Master Document]]
