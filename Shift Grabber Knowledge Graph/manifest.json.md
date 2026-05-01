# manifest.json

## Purpose
The Chrome Extension Manifest V3 declaration. 46 lines. Defines the extension's identity, permissions, host access, background service worker, content scripts, popup action, and web-accessible resources.

## MV3 Structure

| Field | Value | Line |
|-------|-------|------|
| `manifest_version` | `3` | 2 |
| `name` | `"Shift Grabber V9 — Extension (Licensed)"` | 3 |
| `version` | `"2.0.0"` | 4 |
| `description` | Direct API shift grabber — polls 7-day window every 1s per tab, instant claim on detection. Burst reloads at 5-min marks, DOM backup, HUD, Telegram alerts. Protected by license. | 5 |
| `background.service_worker` | `"background/service-worker.js"` | 13–15 |
| `action.default_popup` | `"popup/index.html"` | 17–19 |
| `icons` | 16, 48, 128px PNGs under `icons/` | 20–24 |

## Permissions Analysis

| Permission | Line | What It Enables | Why It's Needed |
|------------|------|-----------------|-----------------|
| `tabs` | 6 | Query and reload tabs by URL pattern | `reloadAllAtoZTabs()` in [[service-worker.js]] and `sendToAllAtoZ()` in [[popup.js]] need to target `https://atoz.amazon.work/*` tabs |
| `storage` | 6 | `chrome.storage.local` key/value persistence | License token, employee ID, blacklist dates, Telegram queue, schedule state across SW restarts |
| `scripting` | 6 | Programmatic injection (future-proofing; not actively used in current codebase) | MV3 standard for content script orchestration |
| `alarms` | 6 | `chrome.alarms.create/clearAll` | Background scheduling in [[service-worker.js]]; `setInterval` does **not** survive SW termination in MV3 |

## Host Permissions

| Pattern | Line | Purpose |
|---------|------|---------|
| `https://atoz.amazon.work/*` | 8 | Primary target: Amazon AtoZ shift schedule pages. Content scripts match here. DOM backup + HUD inject here. |
| `https://atoz-apps.amazon.work/*` | 9 | GraphQL API origin: `atoz-apps.amazon.work/apis/ScheduleManagementService/graphql`. [[api-layer.js]] (MAIN world) fetches this directly. |
| `https://shift-grabber.vercel.app/*` | 10 | License server: `/verify` endpoint for key validation and token refresh. Used by [[popup.js]] `verifyWithServer` and [[service-worker.js]] `refreshTokenInBackground`. |
| `https://api.telegram.org/*` | 11 | Telegram Bot API: `sendMessage` endpoint. Used by [[service-worker.js]] `sendTelegram`. |

## Content Script Configuration

Two separate content script entries, both matching `https://atoz.amazon.work/*`, `run_at: "document_end"`, `all_frames: false`.

| Script | World | Line | Role |
|--------|-------|------|------|
| `src/content/main.js` | **ISOLATED** (default) | 31–37 | HUD, DOM backup grabbing, keyboard shortcuts, notification bridge. Runs in extension-isolated JS context. |
| `src/content/api-layer.js` | **MAIN** | 38–44 | GraphQL polling + claiming. Runs in the **page's own JS context** with full access to page cookies, `localStorage`, and same-origin CORS privileges. |

**Why MAIN world is required** (see also [[api-layer.js]]): The AtoZ GraphQL endpoint is same-origin to `atoz.amazon.work` but requires the `anti-csrftoken-a2z` cookie and CSRF meta tag. An ISOLATED-world content script cannot read page cookies or perform authenticated `fetch` to the page's own API without CORS blocking. MAIN world inherits the page's credential state natively.

## Web Accessible Resources

| Resource | Matches | Line |
|----------|---------|------|
| `sounds/click.mp3` | `https://atoz.amazon.work/*` | 25–30 |

Used by `playAlert()` in [[main.js]] (line 108–112) via `chrome.runtime.getURL("sounds/click.mp3")`. The audio element is created in MAIN world context, so the asset must be web-accessible.

## Related Notes

- [[Architecture Map]]
- [[Security Audit]]
- [[main.js]]
- [[api-layer.js]]
- [[service-worker.js]]
- [[popup.js]]
- [[Popup UI]]
- [[license.js]]
- [[Configuration Reference]]
- [[Technical Debt Register]]
- [[External API Contracts]]
- [[Project Evolution]]
- [[Shift Grabber V9 Index]]
- [[Master Document]]
