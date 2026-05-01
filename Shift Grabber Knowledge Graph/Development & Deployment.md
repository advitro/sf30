# Development & Deployment

Practical guide for loading, modifying, and shipping [[Shift Grabber V9 Index|Shift Grabber V9]]. Bridges the Obsidian knowledge graph with real-world Chrome extension development workflow.

---

## Unpacked Extension Loading

### Step-by-Step

1. Open Chrome and navigate to `chrome://extensions/`
2. Toggle **Developer mode** ON (top-right corner)
3. Click **Load unpacked**
4. Select the project root: `c:\Users\Dexinox\Documents\GitHub\atoz - tg ready`
5. The extension appears in the list with its icon and version `2.0.0`

### Post-Load Checklist

| Check | How |
|-------|-----|
| Content scripts injecting | Open any `atoz.amazon.work` page → open DevTools → Console should show `[ShiftGrabber]` logs |
| HUD visible | Bottom-right corner should show green dot + panel |
| Popup opens | Click extension icon in toolbar → popup renders with dark theme |
| Service worker alive | In `chrome://extensions/`, click **service worker** link → DevTools opens with no errors |

---

## Hot-Reload Behaviour

Chrome extensions do **not** auto-reload like a web server. Each context has its own reload rules:

| File Changed | Context | Required Action | Notes |
|--------------|---------|-----------------|-------|
| `manifest.json` | Entire extension | Click refresh icon on extension card | Full reload; all tabs re-injected |
| `src/content/main.js` | Content script | Reload the AtoZ tab | `run_at: document_end` re-runs on refresh |
| `src/content/api-layer.js` | Content script | Reload the AtoZ tab | Same as above |
| `background/service-worker.js` | Service worker | Click refresh icon on extension card | Alarms are reset; state re-initialised |
| `background/license.js` | Service worker (imported) | Click refresh icon on extension card | Imported modules are bundled at load time |
| `popup/index.html` | Popup | Close and reopen popup | HTML is parsed fresh every open |
| `popup/styles.css` | Popup | Close and reopen popup | Stylesheet re-fetched on popup open |
| `popup/popup.js` | Popup | Close and reopen popup | Script re-executed on popup open |
| `icons/*.png` | Extension | Click refresh icon | Icon cache invalidated |
| `sounds/click.mp3` | Web-accessible | Reload the AtoZ tab | Resource fetched via `chrome.runtime.getURL()` |

---

## Debugging Each Context

### Content Script (ISOLATED — main.js)

- **DevTools:** Open on the AtoZ page → **Console** tab → filter by `[ShiftGrabber]`
- **Scope:** Can inspect `chrome.storage`, `chrome.runtime`, DOM
- **Limitation:** Cannot see page `localStorage`, cookies, or network requests to Amazon GraphQL

### Content Script (MAIN — api-layer.js)

- **DevTools:** Same page console, but logs appear without the extension prefix because it runs in page context
- **Scope:** Can see `localStorage`, `document.cookie`, network tab shows GraphQL requests
- **Identification:** Look for `fetch` to `atoz-apps.amazon.work/apis/ScheduleManagementService/graphql`

### Service Worker

- **DevTools:** `chrome://extensions/` → click **service worker** link on the extension card
- **Scope:** Background alarms, storage, `fetch` to license server and Telegram
- **Lifetime:** Ephemeral — may terminate between alarms. Use `chrome.alarms` timing, not `setInterval`.

### Popup

- **DevTools:** Right-click inside popup → **Inspect**
- **Scope:** Isolated to popup window; communicates via `chrome.runtime.sendMessage` and `chrome.tabs.sendMessage`
- **Lifetime:** Destroys when popup loses focus

---

## Testing Strategy (Current State)

> **Debt:** Zero automated tests exist. See [[Technical Debt Register]] #9.

### Manual Test Matrix

| Scenario | Steps | Expected |
|----------|-------|----------|
| Fresh install | Load unpacked, open AtoZ | HUD appears, no errors |
| License verify | Enter key, click Verify | Badge turns green, token stored |
| Token expiry | Wait 10+ min or hack `sg_token_exp` | HUD shows "NO KEY", polling stops |
| Turbo mode | Press `Shift+T` | HUD shows "FAST", poll interval 500 ms |
| Pause | Press `P` | HUD shows "PAUSED", polling halts |
| Rate limit | Rapid-fire poll or mock 429 | HUD shows "BACKED OFF", 5 s intervals |
| Blacklist | Add today's date to blacklist | Shift on that date is skipped |
| DOM backup | Manually open shift-claim page | Buttons clicked in duration-descending order |
| Telegram | Claim a shift | Message appears in configured chat within 2 min |

### Suggested Automated Test Suite

If tests are added later, cover these critical paths:

1. **Token lifecycle:** Verify → store → expiry guard → refresh → invalidate
2. **Alarm scheduling:** Burst anchor math, jitter bounds, override ticks
3. **Claim deduplication:** Same `oppId` should not trigger multiple claims
4. **Rate-limit recovery:** 429 response → backoff → recovery → normal speed
5. **Message routing:** Every `chrome.runtime.sendMessage` type has a valid handler
6. **Storage key consistency:** All modules reference the same key strings

---

## Packaging for Release

### ZIP Structure

```
shift-grabber-v9.zip
├── manifest.json
├── background/
│   ├── service-worker.js
│   └── license.js
├── src/
│   └── content/
│       ├── main.js
│       └── api-layer.js
├── popup/
│   ├── index.html
│   ├── popup.js
│   └── styles.css
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── sounds/
    └── click.mp3
```

### Chrome Web Store Submission Checklist

- [ ] Manifest `version` bumped
- [ ] `description` updated
- [ ] Icons present at all three sizes
- [ ] No `console.log` left in production (or stripped by build step)
- [ ] Hardcoded secrets **removed or externalised** (Telegram token is a blocker)
- [ ] Screenshot(s) of popup UI
- [ ] Screenshot(s) of HUD on AtoZ page
- [ ] Privacy policy URL (required for `storage` permission)
- [ ] Distribution countries selected

---

## Environment & Dependencies

| Dependency | Version | Source |
|------------|---------|--------|
| Chrome / Chromium | 88+ | Required for MV3 support |
| Amazon AtoZ account | Active | Needed for GraphQL auth |
| License server | `shift-grabber.vercel.app` | Must be online for verification |
| Telegram bot | Configured | For claim notifications (optional but expected) |

No build tools, bundlers, or npm dependencies. The extension is pure static files.

---

## Related

- [[Shift Grabber V9 Index]] — Project overview
- [[Master Document]] — Canonical vault hub
- [[Technical Debt Register]] — Why there are no tests yet
- [[Popup UI]] — Popup-specific debugging
- [[service-worker.js]] — SW alarm internals
- [[main.js]] — Content script debugging
- [[Configuration Reference]] — Tunable values that affect runtime behaviour
