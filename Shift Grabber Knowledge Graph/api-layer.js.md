# api-layer.js

## File Role
292 lines. Content script running in **MAIN world** on `atoz.amazon.work`. Self-contained GraphQL polling engine and instant claimer. Executes `fetch` to Amazon's internal GraphQL endpoint with the page's own cookies and CSRF tokens.

## Why MAIN World Is Required

The AtoZ GraphQL API (`https://atoz-apps.amazon.work/apis/ScheduleManagementService/graphql`) is same-origin to `atoz.amazon.work`. Authenticated requests require:
1. **Session cookies** — including `anti-csrftoken-a2z`.
2. **CSRF token** — from cookie or `<meta name="anti-csrftoken-a2z">`.
3. **`Referer`** matching the page.

An **ISOLATED** world content script cannot read page cookies (cookie partition isolation in MV3) and would hit CORS if `fetch`ing the API. MAIN world runs in the page's JS context, inheriting all credentials natively. This is why `credentials: "include"` works here without cross-origin blocks.

## GraphQL Queries

Included verbatim from lines 11–13:

**POLL_Q** (line 11):
```javascript
var POLL_Q = "query PollShifts($timeRange:DateTimeRangeInput!,$filter:ShiftOpportunitiesFilter,$opportunityTypes:TypeFilter!){shiftOpportunities(timeRange:$timeRange,filter:$filter){opportunities(opportunityTypes:$opportunityTypes){id type shift{id timeRange{start end __typename}duration{value __typename}site{name __typename}__typename}__typename}__typename}}";
```

**CLAIM_Q** (line 13):
```javascript
var CLAIM_Q = "mutation AddShift($shiftOpportunityId:AddShiftInput!){addShift(input:$shiftOpportunityId)}";
```

`POLL_Q` queries `shiftOpportunities` with `filter: { includeIneligible: false }` and `opportunityTypes: { types: ["ADD"] }` — only requesting eligible ADD shifts. The code comments (lines 188–190) note that querying ineligible/expired shifts is a bot signal.

## CSRF Caching Strategy

`getCsrf(force)` — lines 33–43.

- **Cache duration:** 60 seconds (`60000` ms).
- **Sources:** `document.cookie.match(/anti-csrftoken-a2z=([^;]+)/)` first; falls back to `<meta name="anti-csrftoken-a2z">`.
- **Why cache:** Avoids reading `document.cookie` and parsing on **every** poll request. Reduces DOM access frequency, which lowers detection surface.

State variables: `cachedCsrf` (string), `csrfTs` (timestamp).

## Employee ID Extraction

`eid()` — lines 46–58.

Scans `Object.keys(localStorage)` for a key matching `/aza-user-features-(\d+)-prod/`. Extracts the numeric capture group as the employee ID. Caches in `cachedEid`. This ID is appended as `?employeeId=` to every GraphQL URL.

Sent once to [[main.js]] via `postMessage` type `SG_EID` (lines 173–176), guarded by `window.__SG_EID_SENT` to prevent duplicate sends.

The `window.__SG_EID_SENT` flag is set immediately after the first broadcast. If `main.js` reloads (e.g., page refresh), it will request a new EID via `SG_START_POLLING`, but `api-layer.js` will not re-send because the flag persists for the lifetime of the MAIN world context (which survives page soft-navigations within the SPA).

## pollOnce() Detailed Walkthrough

Lines 167–231. Returns a `Promise` that resolves when the request cycle completes.

1. **EID check** (line 169): If `eid()` is null, resolve immediately.
2. **EID relay** (lines 173–176): Send `SG_EID` postMessage once per load.
3. **Range build** (line 179): `getQueryRange()` returns `{ start, end }`. Prefers `tabWindow` (from `SG_START_POLLING`) else defaults to today + 7 days.
4. **Fetch** (lines 181–197):
   - URL: `GQL + "?employeeId=" + id`
   - Method: `POST`, `credentials: "include"`, headers from `makeHeaders()`
   - Body: `operationName: "PollShifts"`, variables include `filter: { includeIneligible: false }`, `timeRange: range`, `opportunityTypes: { types: ["ADD"] }`
5. **Rate-limit detection** (line 199): If `r.status === 429`, calls `handleRateLimit()` and returns null.
6. **Opportunity extraction** (lines 205–207): Navigates `data.data.shiftOpportunities.opportunities || []`.
7. **Claim loop** (lines 210–224): Iterates opportunities; for each `ADD` type not in `claimedIds`, builds `info` object (`start`, `end`, `duration`, `site`) and calls `fireClaim(id, opp.id, info)`.
8. **Reset error counter** (line 226): `consecutiveErrors = 0` on success.
9. **Catch** (line 229): Silently resolves on network error.

## fireClaim() Detailed Walkthrough

Lines 97–146. **Design principle: single attempt, one retry only on transient/network error.** No burst firing (comment line 96).

1. **Deduplication** (line 98): If `claimedIds[oppId]` is true, return immediately.
2. **Blacklist check** (lines 101–104): If `blacklistDates` is non-empty and `shiftInfo.start.split('T')[0]` is in the array, skip.
3. **Mark claimed** (line 106): Set `claimedIds[oppId] = true` **before** the network request to prevent duplicate claims even if the request is slow.
4. **URL + body** (lines 108–113): `GQL + "?employeeId=" + id`, body is `CLAIM_Q` mutation with `variables.shiftOpportunityId.shiftOpportunityId = oppId`.
5. **Attempt function** (lines 115–143):
   - `fetch` with `credentials: "include"`, `makeHeaders()`.
   - Parse JSON.
   - **Terminal error check** (line 120): `isTerminalError(data)` checks for `'capacity'`, `'expired'`, `'already accepted'`, `'not eligible'`, `'ineligible'`. If terminal, **return without retry or notification** — shift is gone.
   - **Transient error + retry** (lines 125–127): If `hasError && n < 2`, schedules `attempt(n + 1)` after `80 + random(120)` ms.
   - **Result post** (lines 131–135): Posts `SG_CLAIM_RESULT` to [[main.js]] with `data`, `oppId`, `attempt`, `shift`.
   - **Network catch + retry** (lines 137–141): If `n < 2`, retry after `100 + random(150)` ms.

## Rate Limit Handling: handleRateLimit()

Lines 149–164.

- Increments `consecutiveErrors`.
- Sets `rateLimited = true`.
- Logs backoff message.
- Posts `SG_RATE_LIMITED` (limited: true) to [[main.js]] so HUD turns orange.
- Sets `pollInterval = 5000` (5 seconds).
- Starts 30-second recovery timer (`errorRecoveryTimer`). On expiry:
  - `rateLimited = false`
  - `consecutiveErrors = 0`
  - `pollInterval = baseInterval`
  - Posts `SG_RATE_LIMITED` (limited: false) to [[main.js]]

## Polling Loop with Jitter

`startLoop()` — lines 236–247.

- Sequential: waits for `pollOnce()` promise to resolve before scheduling next iteration.
- Jitter: `Math.floor(Math.random() * 400) - 200` → **±200ms** (line 242).
- Minimum clamp: `Math.max(300, pollInterval + jitter)` — never polls faster than 300ms.
- Why jitter: "Fixed-cadence DOM polling is a detectable bot pattern."

`stopLoop()` — lines 249–252. Sets `running = false`, clears `pollTimer`.

## Blacklist Date Filtering

Applied in two places:

1. **`fireClaim`** (lines 101–104): Checks if `shiftInfo.start.split('T')[0]` is in `blacklistDates`. If so, skips claim entirely.
2. **Message handler** (lines 274–277): Receives `SG_SET_BLACKLIST_DATES` from [[main.js]], updates local `blacklistDates` array.

## postMessage Protocol

[[api-layer.js]] listens on `window.addEventListener('message', ...)` (lines 255–278). Filters `e.source !== window || !e.data || !e.data.sg`.

| Incoming Type | Lines | Action |
|---------------|-------|--------|
| `SG_START_POLLING` | 258–268 | Sets `baseInterval`, `pollInterval`, `tabWindow`, resets error state, calls `startLoop()` |
| `SG_STOP_POLLING` | 269 | Calls `stopLoop()` |
| `SG_SET_SPEED` | 270–273 | Updates `baseInterval`; if not rate-limited, updates `pollInterval` |
| `SG_SET_BLACKLIST_DATES` | 274–277 | Sets `blacklistDates` array |

Outgoing messages (to [[main.js]]):

| Outgoing Type | Lines | Payload |
|---------------|-------|---------|
| `SG_EID` | 175 | `{ eid: id }` |
| `SG_CLAIM_RESULT` | 131–135 | `{ data, oppId, attempt, shift }` |
| `SG_RATE_LIMITED` | 154, 161 | `{ limited: true/false }` |

## Periodic Stats Log

Lines 281–289. `setInterval` every 30 seconds logs:
- Poll count per 30s
- Current interval + jitter
- Cached EID
- Window start + 7d
- Blacklist dates (if any)

Then resets `pollCount = 0`.

## Related Notes

- [[main.js]]
- [[service-worker.js]]
- [[Data Flow]]
- [[Security Audit]]
- [[manifest.json]]
- [[Configuration Reference]]
- [[Technical Debt Register]]
- [[External API Contracts]]
- [[Project Evolution]]
- [[Shift Grabber V9 Index]]
- [[Master Document]]
