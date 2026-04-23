# Shift Grabber V9 — Extension Technical Overview

## What It Does
Shift Grabber is a **Chrome extension** (Manifest V3) for Amazon AtoZ warehouse workers that automatically detects and claims available shifts the moment they drop on the platform. It polls Amazon's GraphQL API every ~1 second (or faster in turbo mode) and fires claims via mutation the instant a shift appears.

**Supported Platforms:** Windows, macOS, Linux (any OS that runs Chrome browser)

## Core Architecture

### 1. **Content Scripts (main.js & api-layer.js)**
Runs on all `atoz.amazon.work` pages.

#### `api-layer.js` (MAIN world execution)
- Injected into the page's MAIN world to bypass CORS + read cookies
- Polls Amazon's GraphQL endpoint: `atoz-apps.amazon.work/apis/ScheduleManagementService/graphql`
- **Single poll covers 7 days** from the current tab's date — no need for multiple tabs per week (major optimization vs competitors)
- Extracts employee ID from localStorage (HttpOnly cookies can't be read by JS)
- Fires 3 rapid claim attempts (0ms, 20ms, 50ms stagger) on shift detection
- **Rate limit handling**: Detects HTTP 429 responses, auto-backs off to 5s polls for 30s, then recovers
- Sends claim results back to `main.js` via postMessage

#### `main.js` (ISOLATED world execution)
- Handles HUD (Heads-up display) in bottom-right corner
- DOM-based backup: scans for "Add Shift" buttons every 800ms, clicks longest first
- Listens for API claim results and shows notifications (toast, flash, sound, Telegram)
- Keyboard shortcuts:
  - **P** — Pause/Resume polling
  - **Shift+O** — Override mode (fast continuous reloads)
  - **Shift+H** — Toggle HUD visibility
  - **R** — Reload all AtoZ tabs now
  - **Shift+T** — Turbo mode (faster polling: 500ms instead of 1s)
- Relays employee ID to service worker for backup use
- Manages "Stay Logged In" clicks to keep session alive

### 2. **Service Worker (background/service-worker.js)**
Always running in background. Requires valid license token.

**Two scheduling modes:**

1. **Normal Mode (5-minute burst schedule)**
   - Schedules "burst anchors" at 5-minute marks (with 800ms early buffer)
   - 2 page reloads with 4s delay + 250ms jitter between them
   - Keeps tabs fresh so DOM-based grabber sees new opportunities
   - Works even when extension popup is closed

2. **Override Mode (fast continuous reloads)**
   - Reloads all AtoZ tabs every 4s (customizable via popup)
   - No waiting for 5-minute anchors — grab shifts as fast as humanly possible

**Additional responsibilities:**
- Manages token refresh (pings server if token expires in <60s)
- Routes chrome.alarms (scheduling API calls)
- Receives messages from popup (enable/disable/pause/override toggles)
- Flushes Telegram queue on every alarm fire
- Validates license tokens before allowing any scheduling

### 3. **Popup UI (popup/index.html + popup.js)**
User-facing control panel.

**Sections:**
- **Enable Toggle** — Turn entire extension on/off
- **Open Date Tabs** — Quick bulk-open AtoZ pages for specific dates
- **Blacklist Dates** — Skip shifts on certain dates (e.g., already have plans)
- **Keyboard Shortcuts** — Quick reference for P/Shift+O/Shift+H/R/Shift+T
- **License Key** — Enter and verify license (hits `shift-grabber.vercel.app/verify`)
- **Status Badge** — Shows current mode (OFF/LIVE/FAST/PAUSED)

## Core Features Explained

### API Polling (Primary Method)
- **What:** Every 1s (or 500ms in turbo), fetch from GraphQL with 7-day date range from current tab's date
- **Why:** Instant detection — no page reload needed, no DOM scraping delays
- **Trade-off:** Uses more bandwidth, but way faster than DOM-based tools
- **Rate limit safety:** Auto-detects 429 and backs off for 30s before retrying

### DOM-Based Backup (Secondary Method)
- **What:** Scans for "Add Shift" buttons every 800ms, clicks the longest first
- **Why:** Works if the tab happens to be showing available shifts
- **Trade-off:** Requires page reload to see new shifts; slower than API polling
- **When active:** Runs continuously, but only effective when page already loaded opportunities

### Burst Scheduling
- **What:** Wake up 800ms *before* every 5-minute mark (00:00, 05:00, 10:00, etc. in UTC)
- **Why:** Amazon fresh-drops shifts at 5-minute boundaries — reloading early catches them first
- **How:** Service worker uses chrome.alarms to schedule these exact times across browser restarts

### Turbo Mode
- Keyboard shortcut: **Shift+T**
- Changes polling from 1000ms → 500ms (2x faster)
- Useful when you know a shift is about to drop
- Can be toggled on/off without restarting extension

### HUD (Heads-Up Display)
- **Bottom-right corner** showing:
  - Live countdown to next burst reload
  - Current mode (LIVE/FAST/PAUSED/BACKED OFF/NO KEY)
  - Current time
  - Burst reload progress bars (2 bursts per 5-min cycle)
- **Color coded:**
  - Green = running normally
  - Yellow = license issue
  - Red = paused
  - Orange = rate limited

### Rate Limit Recovery
- When Amazon sends HTTP 429 (too many requests):
  1. Immediately backs off to 5s poll interval
  2. Shows orange "BACKED OFF" in HUD
  3. After 30s, attempts recovery to original speed
  4. If 429 happens again, repeat
- **Why this matters:** Prevents permanent bans; keeps extension usable even under load

### Telegram Notifications
- Every shift claim (via both API and DOM) queues a Telegram message
- Service worker flushes queue on every alarm wake
- Messages include: license key used, date, exact time of grab
- Hardcoded bot token + chat ID (private server)

### License System
- **Server:** `shift-grabber.vercel.app/verify`
- User enters a key → popup calls server with device ID + key
- Server responds with `accessToken` (UUID) and `expiresAt` (Unix timestamp)
- Token stored locally; if expired or invalid, extension won't schedule bursts
- Service worker checks token validity every 30s, auto-refreshes if <60s remaining

### Blacklist Dates
- Enter dates you want to **skip** (e.g., "2026-04-20")
- When API finds a shift on a blacklisted date, it silently skips claiming
- Useful if you already have shifts scheduled and want to avoid overbooking

## Data Flow Diagram

```
User lands on atoz.amazon.work/shifts/schedule/find?date=2026-04-15
                     ↓
        main.js + api-layer.js inject
                     ↓
        api-layer starts polling GraphQL every 1s
                     ↓
     shift appears in poll → fireClaim() fires 3 mutations
                     ↓
       Mutations complete → postMessage to main.js
                     ↓
   main.js shows toast + flash + sound + Telegram queue
                     ↓
    Service worker (if alarm fires) reloads tabs
                     ↓
      DOM backup detects new buttons and clicks them
```

## Technical Highlights

### Why This is Better Than Competitors
1. **Single API call covers 7 days** from current tab's date (competitors need 1 tab per date or manual polling)
2. **~220ms detect-to-claim** vs ~800ms for page-reload-based tools (measured)
3. **No page reloads required** — API polling is invisible and instant
4. **Adaptive rate limiting** — doesn't get permanently banned; recovers after backoff
5. **Service worker scheduling** — works even when popup closed, survives browser restarts

### Key Implementation Details
- Uses **MAIN world injection** for api-layer.js to bypass CORS (cookies sent automatically)
- **Sequential polling** with rate limit recovery (doesn't spam endpoints)
- **claimedIds Set** prevents re-claiming same opportunity twice
- **postMessage bridge** between MAIN and ISOLATED worlds (secure cross-world communication)
- **WeakSet for button tracking** prevents repeat clicks on already-clicked buttons
- **localStorage employee ID extraction** — solves HttpOnly cookie problem

## Configuration Values (Tunable)
In `service-worker.js`:
- `BASE_MS`: 4000ms — delay between burst reloads
- `JITTER_MS`: 250ms — random jitter added to prevent thundering herd
- `BURST_COUNT`: 2 — how many reloads per 5-minute cycle

In `api-layer.js`:
- `pollInterval`: 1000ms default (set by main.js, can be 500ms turbo)
- `baseInterval`: resets to this after rate limit recovery

In `main.js` popup:
- `CONFIRM_WAIT_MS`: 120ms — wait for confirm dialog after clicking shift
- `PER_SHIFT_STAGGER_MS`: 100ms — stagger between clicking multiple shifts

## Files Structure
```
manifest.json                          — MV3 manifest, version 2.0.0
src/content/
  ├── main.js                          — HUD, DOM backup, keyboard shortcuts, notifications
  └── api-layer.js                     — GraphQL polling + claiming (MAIN world)
background/
  └── service-worker.js                — Scheduling, alarms, token refresh, Telegram
popup/
  ├── index.html                       — UI layout
  ├── popup.js                         — Event handlers, license verification
  └── styles.css                       — Popup styling
icons/                                 — Extension icons (16/48/128px)
sounds/
  └── click.mp3                        — Alert sound on shift grab
```

## How to Use (For End User)
1. Install extension
2. Enter license key in popup (must verify with server)
3. Toggle "Enable Extension" ON
4. Open any AtoZ shift schedule page
5. Extension automatically polls API and claims shifts
6. Use Shift+T for turbo (faster), P for pause, R to reload now
7. HUD shows status + countdown to next reload

## Summary
Shift Grabber is a **hybrid grabber** combining:
- **Fast API polling** (primary) — 1000ms constant, auto-backs off on 429, covers 7-day window per tab
- **Burst scheduling** (supporting) — triggers page reloads at 5-min intervals
- **DOM backup** (fallback) — clicks buttons if page already showing opportunities
- **License validation** (gating) — requires server-verified token to run

The result: **~2-3x faster than DOM-only competitors**, with 7-day coverage per AtoZ tab open, intelligent rate limiting, and 24/7 background scheduling.
