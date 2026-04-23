# Shift Grabber V9 — Server Contract

## Base URL
- Production: `https://shiftgrabber.net`
- Staging: `https://staging.shiftgrabber.net`

## Endpoints

### POST `/verify`
Authenticates a license key and returns an encrypted access token.

#### Request Body
```json
{
  "key": "sg_live_xxxxxxxx",
  "deviceId": "<chrome.storage.sync.deviceId>",
  "fingerprint": "<canvas+webgl+fonts hash>"
}
```

#### Response — Success (200)
```json
{
  "ok": true,
  "accessToken": "<JWT or opaque token>",
  "expiresAt": 1714500000,
  "subscriptionStatus": "active",
  "tier": "pro"
}
```

#### Response — Device Limit Exceeded (403)
```json
{
  "ok": false,
  "reason": "device-limit-exceeded",
  "cooldownDays": 14,
  "message": "This key is active on another device. Transfer available in 14 days."
}
```

#### Response — Invalid Key (401)
```json
{
  "ok": false,
  "reason": "invalid-key"
}
```

#### Device Transfer Logic (server-side)
```
registered_device_fp == null           → register this device
registered_device_fp == fingerprint    → allow (same device)
registered_device_fp != fingerprint && last_seen_at > now - 30 days → reject
registered_device_fp != fingerprint && last_seen_at <= now - 30 days → transfer
```

### POST `/heartbeat`
Called every 10 minutes by the extension service worker.

#### Request Body
```json
{
  "key": "sg_live_xxxxxxxx",
  "deviceId": "<deviceId>",
  "fingerprint": "<fingerprint>"
}
```

#### Response — Healthy (200)
```json
{
  "ok": true,
  "kill": false,
  "config": { }
}
```

#### Response — Kill Switch Triggered (200)
```json
{
  "ok": true,
  "kill": true,
  "reason": "subscription-cancelled",
  "message": "Your subscription has been cancelled. Contact support for help."
}
```

### POST `/refresh`
Refreshes an expiring access token.

#### Request Body
```json
{
  "key": "sg_live_xxxxxxxx",
  "deviceId": "<deviceId>",
  "fingerprint": "<fingerprint>"
}
```

#### Response (200)
```json
{
  "ok": true,
  "accessToken": "<new token>",
  "expiresAt": 1714507200
}
```

## Security Requirements
1. All endpoints require HTTPS.
2. Responses must include `X-Response-Hmac` header (HMAC-SHA256 of response body).
3. The extension verifies this HMAC before trusting any response.
4. Tokens must be opaque or short-lived JWTs (≤ 2 hours).
5. Device fingerprinting is advisory; it can be bypassed by determined attackers. The real enforcement is the server-side `registered_device_fp` check.

## Rate Limits
- `/verify`: 5 requests / 60 seconds per key
- `/heartbeat`: 1 request / 5 minutes per key
- `/refresh`: 5 requests / 60 seconds per key
