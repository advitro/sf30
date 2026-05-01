# External API Contracts

Every outbound network call made by [[Shift Grabber V9 Index|Shift Grabber V9]], documented as a consumable contract.

---

## 1. Amazon AtoZ GraphQL

### Endpoint

```
POST https://atoz-apps.amazon.work/apis/ScheduleManagementService/graphql
```

### Authentication
- Sent automatically by browser via `credentials: "include"` (MAIN world cookie jar)
- `csrf-token` header read from cookies or `<meta>` tag
- `x-amz-csrf` header required on mutations

### Poll Query (`PollShifts`)

**Purpose:** Discover available shifts in a 7-day window.

**Variables:**
```json
{
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "employeeId": "string"
}
```

**Request shape (inferred):**
```graphql
query PollShifts($startDate: String!, $endDate: String!, $employeeId: String!) {
  pollShifts(startDate: $startDate, endDate: $endDate, employeeId: $employeeId) {
    opportunities {
      id
      opportunityId
      start
      end
      durationHours
      // ... other fields
    }
  }
}
```

**Response contract (assumed):**
```json
{
  "data": {
    "pollShifts": {
      "opportunities": [
        { "id": "...", "opportunityId": "...", "start": "2026-04-22T08:00:00Z", "end": "..." }
      ]
    }
  }
}
```

> **Debt:** Response schema is not validated. See [[Technical Debt Register]] #2.

### Claim Mutation (`AddShift`)

**Purpose:** Claim a specific shift opportunity.

**Variables:**
```json
{
  "opportunityId": "string",
  "employeeId": "string"
}
```

**Retry policy:** 3 attempts with stagger `0 ms → 20 ms → 50 ms`.

**Terminal errors (no retry):**
- Opportunity already claimed
- Opportunity no longer available
- Employee ineligible

**Transient errors (one retry):**
- Network timeout
- HTTP 5xx

**Rate limit:**
- HTTP 429 → enter backoff: 5 s polls for 30 s
- No exponential escalation

---

## 2. License Verification Server

### Endpoint

```
POST https://shift-grabber.vercel.app/verify
```

### Request

```json
{
  "key": "user-license-key",
  "deviceId": "550e8400-e29b-41d4-a716-446655440000"
}
```

### Success Response (200)

```json
{
  "authorized": true,
  "accessToken": "uuid-string",
  "expiresAt": 1713823200
}
```

### Failure Response (200 with `authorized: false`)

```json
{
  "authorized": false,
  "reason": "invalid-key | expired | revoked | device-limit"
}
```

### Error Response (non-2xx)

No guaranteed shape. Client falls back to `reason: "network"`.

### Consumers

| Module | Call site | Notes |
|--------|-----------|-------|
| `popup.js` | `verifyWithServer()` | Manual user-initiated verification |
| `license.js` | `verifyLicense()` | Background automated refresh |

> **Debt:** Dual call sites. See [[Technical Debt Register]] #4.

---

## 3. Telegram Bot API

### Endpoint

```
POST https://api.telegram.org/bot{BOT_TOKEN}/sendMessage
```

### Request

```json
{
  "chat_id": "{CHAT_ID}",
  "text": "Shift claimed: 2026-04-22 08:00\nLicense: ..."
}
```

### Behaviour

- Messages are queued in memory (`telegramQueue` array) inside the service worker
- Queue flushed on every `SG_TOKEN_CHECK` alarm (every 2 minutes)
- Fire-and-forget: failures are logged but not retried

### Security

- Bot token is hardcoded in `service-worker.js` source
- Chat ID is hardcoded
- **Risk:** Anyone with source can extract token and read/send messages

> **Debt:** See [[Technical Debt Register]] #1 and [[Security Audit]].

---

## 4. Web Accessible Resources

### Endpoint (internal)

```
https://atoz.amazon.work/sounds/click.mp3
```

Served via `web_accessible_resources` in [[manifest.json]]. Played by `main.js` when a shift is claimed.

---

## Related

- [[api-layer.js]] — Implementation of Amazon GraphQL client
- [[popup.js]] — License verification UI caller
- [[license.js]] — Background license verifier
- [[service-worker.js]] — Telegram queue flusher
- [[Security Audit]] — Risk analysis for all external calls
- [[Technical Debt Register]] — Known contract weaknesses
