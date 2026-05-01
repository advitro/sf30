# Configuration Reference

Single source of truth for every tunable constant, storage key, and environment variable across [[Shift Grabber V9 Index|Shift Grabber V9]].

---

## Timing Constants

### `src/content/main.js` — `CFG` object

| Key | Value | Purpose |
|-----|-------|---------|
| `HUD_REFRESH_MS` | `800` | How often the HUD DOM updates |
| `DOM_SCAN_MS` | `800` | Backup shift button scanner interval |
| `CONFIRM_WAIT_MS` | `120` | Wait for confirm dialog after clicking |
| `PER_SHIFT_STAGGER_MS` | `100` | Delay between clicking multiple shifts |
| `NOTIFY_DURATION_MS` | `3500` | Toast notification visibility |

### `src/content/api-layer.js` — Polling

| Key | Value | Purpose |
|-----|-------|---------|
| `pollInterval` (default) | `1000` | GraphQL poll interval (ms) |
| `pollInterval` (turbo) | `500` | `Shift+T` turbo mode interval |
| `baseInterval` | `1000` | Reset target after rate-limit recovery |
| `rateLimitPollMs` | `5000` | Backed-off poll interval on HTTP 429 |
| `rateLimitDurationMs` | `30000` | How long to stay in backed-off state |
| `jitterMs` | `200` | Random ± jitter added to every poll |

### `background/service-worker.js` — Scheduling

| Key | Value | Purpose |
|-----|-------|---------|
| `BASE_MS` | `4000` | Delay between burst reloads |
| `JITTER_MS` | `250` | Random jitter on reload timing |
| `BURST_COUNT` | `2` | Reloads per 5-minute cycle |
| `BURST_ANCHOR_EARLY_MS` | `800` | Wake before 5-min mark (00:00, 05:00, …) |
| `TOKEN_CHECK_INTERVAL_MS` | `120000` | `SG_TOKEN_CHECK` alarm interval (2 min) |
| `TOKEN_REFRESH_THRESHOLD_S` | `60` | Refresh token if expires within this many seconds |

---

## Storage Keys

> ⚠️ **Debt:** These are defined independently in three modules. See [[Technical Debt Register]] #3.

### `main.js` — `K` object

| Key | String | Used By |
|-----|--------|---------|
| `ENABLED` | `"sg_enabled"` | Popup, main.js, SW |
| `PAUSED` | `"sg_paused"` | Popup, main.js |
| `OVERRIDE` | `"sg_override"` | Popup, main.js, SW |
| `ACCESS_TOKEN` | `"sg_access_token"` | Popup, main.js, SW, license.js |
| `TOKEN_EXP` | `"sg_token_exp"` | Popup, main.js, SW |
| `DATES` | `"sg_dates"` | Popup, main.js |
| `BLACKLIST` | `"sg_blacklist_dates"` | Popup, main.js, api-layer |
| `TURBO` | `"sg_turbo"` | Popup, main.js, api-layer |

### `popup.js` — `KEYS` object

| Key | String | Notes |
|-----|--------|-------|
| `ENABLED` | `"sg_enabled"` | Same as main.js |
| `PAUSED` | `"sg_paused"` | Same as main.js |
| `OVERRIDE` | `"sg_override"` | Same as main.js |
| `ACCESS_TOKEN` | `"sg_access_token"` | Same as main.js |
| `TOKEN_EXP` | `"sg_token_exp"` | Same as main.js |
| `DATES` | `"sg_dates"` | Same as main.js |
| `BLACKLIST` | `"sg_blacklist_dates"` | Same as main.js |
| `TURBO` | `"sg_turbo"` | Same as main.js |
| `USER_KEY` | `"SG_userKey"` | ⚠️ Different prefix casing (`SG_` vs `sg_`) |

### `service-worker.js` — `KEYS` object

Uses the same `sg_*` strings but lacks `USER_KEY`. Accesses `SG_userKey` indirectly via `license.js`.

### `license.js`

| Key | String | Purpose |
|-----|--------|---------|
| `deviceId` | `"deviceId"` | Persistent browser fingerprint |
| `verified` | `"verified"` | Boolean cache of last check |
| `reason` | `"reason"` | Failure reason from last check |

---

## GraphQL Constants

### `api-layer.js`

| Constant | Value |
|----------|-------|
| `GQL` | `https://atoz-apps.amazon.work/apis/ScheduleManagementService/graphql` |
| `POLL_Q` | `PollShifts` operation |
| `CLAIM_Q` | `AddShift` mutation |
| `CSRF_CACHE_TTL_MS` | `60000` |

---

## Telegram Configuration

| Constant | Value | Location |
|----------|-------|----------|
| `BOT_TOKEN` | hardcoded | `service-worker.js` |
| `CHAT_ID` | hardcoded | `service-worker.js` |
| `API_URL` | `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage` | `service-worker.js` |

---

## Manifest Values

| Field | Value |
|-------|-------|
| `manifest_version` | `3` |
| `version` | `2.0.0` |
| `name` | `Shift Grabber V9 — Extension (Licensed)` |

---

## Related

- [[Technical Debt Register]] — Why many of these constants are scattered
- [[main.js]] — Where `CFG` and `K` are defined
- [[popup.js]] — Where `KEYS` is defined
- [[service-worker.js]] — Where scheduling constants live
- [[api-layer.js]] — Where GraphQL and polling constants live
- [[License & Token Lifecycle]] — How storage keys form the token flow
