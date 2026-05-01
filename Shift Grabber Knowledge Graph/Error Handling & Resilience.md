# Error Handling & Resilience

How [[Shift Grabber V9 Index|Shift Grabber V9]] handles failure across all modules — and where the safety nets have holes.

---

## Error Philosophy

The extension follows a **graceful degradation** strategy:
- API polling fails → fall back to DOM backup
- Token expires → stop polling, auto-resume when refreshed
- Rate limited → back off, recover after 30 seconds
- Network down → queue Telegram messages, retry on next alarm

No single failure crashes the extension. But not all failures are surfaced to the user.

---

## Module-by-Module Error Handling

### api-layer.js (GraphQL Client)

| Error | Handler | Recovery | User Notification |
|-------|---------|----------|-------------------|
| HTTP 429 (rate limit) | `handleRateLimit()` | 5 s polls for 30 s | Orange "BACKED OFF" HUD |
| HTTP 5xx | `pollOnce()` catch | Silent resolve, next poll continues | None |
| Network timeout | `pollOnce()` catch | Silent resolve | None |
| EID null | `pollOnce()` early return | Skips poll | None |
| Terminal claim error | `isTerminalError()` | No retry, no notification | None (shift is gone) |
| Transient claim error | `attempt(n+1)` retry | One retry after 80–200 ms | None unless retry also fails |
| CSRF missing | `getCsrf()` returns empty | Request sent without token → likely 401 | None |

**Critical gap:** `api-layer.js` silently swallows most network errors. If Amazon changes the GraphQL endpoint or schema, the extension will poll indefinitely with no user feedback. See [[Technical Debt Register]] #2.

### main.js (Content Script)

| Error | Handler | Recovery | User Notification |
|-------|---------|----------|-------------------|
| api-layer not loaded | `window.__SG_API_LOADED` polling | Falls back to DOM-only after 1.5 s timeout | None |
| Token expiry | `updateHUD()` guard | Stops API polling, auto-resumes on refresh | HUD shows "NO KEY" |
| DOM scan finds no buttons | `findAddShiftButtons()` | Returns empty array, next scan in 800 ms | None |
| Confirm button missing | `findConfirmButton()` | Returns null, `tryToGrabShifts()` continues | None |
| Telegram queue write fails | `sendTelegramLog()` catch | Logs to console, continues | None |
| Audio play blocked | `playAlert()` catch | Silent fail | No sound |

**Critical gap:** If `api-layer.js` fails to inject (e.g., Amazon CSP blocks it), the user has no idea API polling is unavailable. The HUD still shows "LIVE". See [[Technical Debt Register]] #17.

### service-worker.js (Background)

| Error | Handler | Recovery | User Notification |
|-------|---------|----------|-------------------|
| Token refresh fails (SW) | `refreshTokenInBackground()` returns false | Falls back to popup message | None (popup may be closed) |
| Token refresh fails (popup) | `tryAutoRefreshTokenIfNeeded()` gives up | Token expires, scheduling stops | HUD shows "NO KEY" |
| Telegram send fails | `sendTelegram()` returns false | Re-queued by `flushTelegramQueue()` | None |
| Telegram flush fails | `flushTelegramQueue()` catch | Logs to console, queue preserved | None |
| Alarm fire with invalid token | Alarm router early return | Skips action | None |
| Message from unknown sender | `handleMessage()` processes anyway | Executes action | None |

**Critical gap:** No sender validation on `chrome.runtime.onMessage`. Any extension or content script could trigger scheduling. See [[Technical Debt Register]] #7.

### popup.js (Control Panel)

| Error | Handler | Recovery | User Notification |
|-------|---------|----------|-------------------|
| License verify network error | `verifyWithServer()` catch | Returns `{ ok: false, reason: "network" }` | Status text shows error |
| License verify HTTP error | Reads JSON body, falls back | Returns reason from body or status code | Status text shows error |
| Token refresh fallback fails | `SG_REQUEST_TOKEN_REFRESH` handler | No further action | Status text shows expired |
| Device ID generation fails | `crypto.randomUUID()` (browser native) | N/A (extremely unlikely) | N/A |

**Critical gap:** Minimal input validation on license key (any string is accepted and sent to server). See [[Technical Debt Register]].

### license.js (Background Helper)

| Error | Handler | Recovery | User Notification |
|-------|---------|----------|-------------------|
| No key | Returns false, stores `verified: false, reason: "no-key"` | N/A | N/A (caller shows UI) |
| Network error | Returns false, stores `reason: "network"` | N/A | N/A (caller shows UI) |
| HTTP error | Returns false, stores `reason` from JSON or `"unauthorized"` | N/A | N/A (caller shows UI) |

**Critical gap:** No retry logic. Transient network blips during background verification mark the license as invalid until the next alarm (2 minutes later).

---

## Resilience Patterns

### Pattern 1: Clear-Before-Send (Telegram)

`flushTelegramQueue()` clears the storage queue **before** attempting sends. If the SW restarts mid-flush, messages are not double-sent.

```javascript
// Read queue
const queue = res.sg_tg_queue || [];
if (queue.length === 0) return;
// Clear FIRST
await chrome.storage.local.set({ sg_tg_queue: [] }, r);
// Then send
for (const item of queue) { /* ... */ }
```

### Pattern 2: Token Expiry Guard

`main.js` stops API polling immediately when token expires, then auto-resumes when SW refreshes it:

```javascript
if (!hasToken && !tokenExpiredPollingStopped) {
  tokenExpiredPollingStopped = true;
  stopApiPolling();
} else if (hasToken && tokenExpiredPollingStopped) {
  tokenExpiredPollingStopped = false;
  startApiPolling();
}
```

### Pattern 3: Claim Deduplication

`api-layer.js` marks an opportunity as claimed **before** the network request:

```javascript
claimedIds[oppId] = true; // Set before fetch
// ... fetch claim mutation
```

This prevents double-claiming even if the request is slow or retried.

### Pattern 4: WeakSet DOM Tracking

`main.js` uses `WeakSet` to track clicked buttons, preventing repeat clicks without leaking memory:

```javascript
const clickedButtons = new WeakSet();
// ...
if (clickedButtons.has(btn)) continue;
clickedButtons.add(btn);
```

### Pattern 5: Jitter Everywhere

Both polling and scheduling add random jitter to avoid detectable fixed cadences:

| Jitter Location | Range | Purpose |
|-----------------|-------|---------|
| API poll interval | ±200 ms | Avoid bot fingerprinting |
| Burst reload delay | ±250 ms | Avoid thundering herd |
| Claim retry delay | 80–200 ms | Spread retry attempts |

---

## Failure Modes Not Handled

| Scenario | Current Behaviour | Ideal Behaviour |
|----------|-------------------|-----------------|
| Amazon changes GraphQL schema | Silent failure, empty polls | Schema validation + user alert |
| Amazon blocks MAIN world injection | Silent fallback to DOM-only | HUD warning: "API unavailable" |
| Employee ID key renamed in localStorage | `eid()` returns null, no polling | Fallback chain + user alert |
| License server permanently down | Extension stops after token expiry | Offline grace period |
| Storage quota exceeded | Unknown (would crash writes) | Pruning logic + alert |
| Browser clears extension storage | Full reset to defaults | Cloud backup or re-verification flow |
| Concurrent popup + SW token refresh | Race condition, last write wins | Single-writer lock or atomic compare-and-swap |

---

## Related

- [[Technical Debt Register]] — 18 tracked issues including error handling gaps
- [[api-layer.js]] — GraphQL error handling implementation
- [[main.js]] — DOM backup and token expiry guard
- [[service-worker.js]] — Background error handling and retry logic
- [[popup.js]] — License verification error handling
- [[State & Storage Model]] — How storage failures affect state
- [[MV3 Platform Constraints]] — Why SW restarts complicate error recovery
