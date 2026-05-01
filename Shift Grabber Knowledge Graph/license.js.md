# license.js

Background license verification helper. A small, focused module imported by [[service-worker.js]] to validate the user's license without duplicating network logic.

---

## File

`background/license.js` — 41 lines, zero dependencies.

---

## API

### `verifyLicense()` → `Promise<boolean>`

```js
export async function verifyLicense() {
  const key      = await getUserKey();
  const deviceId = await getDeviceId();
  // POST { key, deviceId } → VERIFY_URL
  // Stores { verified: boolean, reason: string } in chrome.storage.local
}
```

**Side effects:**
- Writes `verified` and `reason` keys to `chrome.storage.local`
- Returns `true` only if server responds with `authorized === true` or `ok === true`

**Error handling:**
- No key → `{ verified: false, reason: "no-key" }`
- Network failure → `{ verified: false, reason: "network" }`
- HTTP error (non-2xx with JSON parseable body) → `{ verified: false, reason: data.reason || "unauthorized" }`

### `getDeviceId()` → `Promise<string>`

Lazy-initialises a persistent device identifier:
1. Reads `deviceId` from `chrome.storage.local`
2. If missing, generates `crypto.randomUUID()`
3. Stores and returns it

Used to bind a license key to a single browser installation.

### `getUserKey()` → `Promise<string>`

Reads `SG_userKey` from `chrome.storage.local`. Returns empty string if unset.

> **Note:** This key name (`SG_userKey`) is one of several token-related storage keys. See [[Configuration Reference]] for the full key registry.

---

## Network Contract

| | |
|---|---|
| Endpoint | `POST https://shift-grabber.vercel.app/verify` |
| Request body | `{ key: string, deviceId: string }` |
| Success response | `{ authorized: true, accessToken?: string, expiresAt?: number }` |
| Failure response | `{ authorized: false, reason?: string }` |
| Timeout behaviour | No explicit timeout; relies on fetch default |

The same endpoint is also called by [[popup.js]] during manual verification. This creates **dual call sites** for the same contract.

---

## Security Observations

- No request signing or HMAC — raw key sent over HTTPS
- No certificate pinning
- No retry logic on transient failures
- `deviceId` is client-generated and therefore spoofable
- See [[Security Audit]] for full risk assessment.

---

## Integration

```
┌─────────────────┐     import      ┌─────────────┐
│ service-worker  │ ──────────────→ │ license.js  │
│   .js           │                 │             │
└─────────────────┘                 └──────┬──────┘
                                           │ fetch
                                           ↓
                              shift-grabber.vercel.app/verify
```

[[service-worker.js]] calls `verifyLicense()` inside `tryAutoRefreshTokenIfNeeded()` before any alarm-driven scheduling is allowed.

---

## Related

- [[service-worker.js]] — Alarm-based scheduler that gates on verification
- [[popup.js]] — Manual verification flow (duplicates same endpoint)
- [[License & Token Lifecycle]] — End-to-end token flow
- [[Security Audit]] — Risk findings
- [[External API Contracts]] — Full server API specification
