# MV3 Platform Constraints

How Manifest V3's architectural restrictions fundamentally shaped every design decision in [[Shift Grabber V9 Index|Shift Grabber V9]].

---

## The MV3 Constraint Matrix

| Constraint | MV3 Rule | Shift Grabber Adaptation |
|------------|----------|--------------------------|
| **Ephemeral service workers** | SW terminates after ~30 s inactivity | Alarm-based scheduling instead of `setInterval` |
| **No blocking web requests** | `webRequestBlocking` removed | Content-script GraphQL polling replaces request interception |
| **No remote code** | `eval()`, `new Function()`, remote scripts forbidden | All code bundled statically; no dynamic injection |
| **Content script CORS** | ISOLATED world cannot read page cookies | MAIN world injection for `api-layer.js` |
| **`chrome.storage` quota** | 5 MB local / 8 MB sync | Telegram queue + state fits in < 15 KB |
| **No persistent background pages** | Background scripts become event pages | All state moved to `chrome.storage.local` |
| **Host permissions require user action** | New permissions need user approval | Declares all hosts up-front in manifest |

---

## Ephemeral Service Worker → Alarm Architecture

### The Problem

In Manifest V2, extensions used **persistent background pages**:

```javascript
// MV2 — this runs forever
setInterval(() => reloadTabs(), 5000);
```

In MV3, `setInterval` dies when the SW terminates. The browser may kill the SW after 30 seconds of inactivity.

### The Solution

`chrome.alarms` are managed by the browser process and **persist across SW lifecycles**:

```javascript
// MV3 — survives termination
chrome.alarms.create("SG_BURST_START", { when: anchorTime });
chrome.alarms.onAlarm.addListener((alarm) => {
  // SW wakes up, handles alarm, may terminate again
});
```

**Impact on design:**
- Burst scheduling uses alarm anchors instead of continuous polling from background
- Token refresh happens on a 2-minute alarm rather than a timer
- All scheduling state must be serialised to storage because SW memory is lost on termination
- The `nextFiveMinuteAnchorMinus800ms()` function exists specifically to compute alarm times that the browser can fire reliably

---

## Cookie Partitioning → MAIN World Injection

### The Problem

MV3 content scripts in the **ISOLATED** world run in a separate JavaScript context:
- Cannot read page `document.cookie` (partitioned)
- Cannot perform authenticated `fetch` to the page's own API (CORS blocked)
- Cannot access page `localStorage`

Amazon's GraphQL endpoint (`atoz-apps.amazon.work`) requires:
1. Session cookies (`anti-csrftoken-a2z`)
2. CSRF token from cookie or `<meta>` tag
3. Matching `Referer` header

### The Solution

`manifest.json` declares `api-layer.js` with `"world": "MAIN"`:

```json
{
  "js": ["src/content/api-layer.js"],
  "world": "MAIN",
  "run_at": "document_end"
}
```

MAIN world scripts:
- Run in the **page's own JS context**
- Inherit all cookies automatically
- Can read `localStorage` and `<meta>` tags
- Can `fetch` same-origin endpoints with `credentials: "include"`

**Impact on design:**
- Split content script into two files: `main.js` (ISOLATED) + `api-layer.js` (MAIN)
- `postMessage` bridge becomes the only communication channel between worlds
- `api-layer.js` is invisible to extension DevTools (runs in page context)
- Amazon could theoretically detect the injected script

---

## Storage as State Machine

### The Problem

With no persistent background page, there is no long-lived JavaScript memory. The popup closes. The SW terminates. Only `chrome.storage.local` survives.

### The Solution

Every state transition writes to storage:

```javascript
// Token refresh
await chrome.storage.local.set({
  sg_access_token: token,
  sg_token_exp: exp
});

// Schedule state
await chrome.storage.local.set({
  sg_next_due: anchor.getTime(),
  sg_burst_left: count
});
```

**Impact on design:**
- `chrome.storage.local` acts as a database, not just a cache
- All modules read from storage on wake rather than holding in-memory state
- Race conditions possible because storage operations are non-atomic
- Performance cost: every alarm wake triggers multiple `storage.local.get()` calls

---

## No Dynamic Code Execution

### The Problem

MV3 forbids `eval()`, `new Function()`, and loading remote scripts. This prevents:
- Dynamic configuration fetching that executes JS
- Runtime plugin loading
- Obfuscation techniques that rely on runtime code generation

### The Solution

All code is statically bundled:
- GraphQL queries are hardcoded strings in `api-layer.js`
- Telegram bot token is hardcoded in `service-worker.js`
- No external dependencies or CDN loads

**Impact on design:**
- Configuration changes require extension update (cannot be pushed remotely)
- Hardcoded credentials cannot be rotated without shipping new version
- Extension size is small (~2,096 lines) because no bundler or framework is used

---

## Permission Model Changes

### The Problem

MV3 requires user gesture for new host permissions. `optional_permissions` exist but are cumbersome.

### The Solution

All required hosts are declared upfront in `host_permissions`:

```json
"host_permissions": [
  "https://atoz.amazon.work/*",
  "https://atoz-apps.amazon.work/*",
  "https://shift-grabber.vercel.app/*",
  "https://api.telegram.org/*"
]
```

**Impact on design:**
- User sees all hosts at install time
- No runtime permission requests needed
- `scripting` permission declared for future-proofing (not actively used)

---

## Why Competitors Struggle with MV3

Many DOM-only grabbers were built for MV2 and break under MV3:

| Competitor Pattern | MV2 | MV3 | Shift Grabber Advantage |
|-------------------|-----|-----|------------------------|
| Persistent background polling | `setInterval` in background page | Dies after 30s | Alarm-based scheduling |
| Request interception | `webRequest` API | Removed | GraphQL polling doesn't need it |
| Cookie reading from background | Direct access | Blocked | MAIN world inherits cookies |
| One tab per date | Simple tab management | Same complexity | 7-day window reduces tab count |

---

## Related

- [[manifest.json]] — MV3 declaration details
- [[service-worker.js]] — Alarm-based scheduling implementation
- [[api-layer.js]] — MAIN world injection rationale
- [[State & Storage Model]] — How storage replaces in-memory state
- [[Project Evolution]] — V7→V9 migration likely driven by MV3
- [[Development & Deployment]] — MV3 reloading behaviour
