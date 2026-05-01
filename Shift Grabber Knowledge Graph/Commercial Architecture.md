# Commercial Architecture

How Shift Grabber operates as a subscription SaaS product.

## Business Model

- **Basic Plan** ($15/mo): Standard polling (1000ms mean), 1 device, email support
- **Pro Plan** ($25/mo): Faster polling (600ms mean), 2 devices, priority support
- **Payment**: Stripe Checkout + Customer Portal
- **License**: Key-based, tied to Stripe subscription, device-fingerprinted

## Subscription Flow

```
User enters license key in popup
         ↓
Popup sends SG_VERIFY_LICENSE to service worker
         ↓
SW POSTs /verify { key, deviceId }
         ↓
Server checks Stripe subscription status
         ↓
Server returns { authorized, accessToken, expiresAt, subscription: { status, tier } }
         ↓
SW stores token + subscription metadata
         ↓
Popup displays tier badge + subscription status
         ↓
User clicks "Manage Billing" → Stripe Customer Portal
```

## Extension-Side Changes

### api-layer.js (Stealth)
- **Poisson polling**: Exponentially distributed intervals instead of uniform jitter
- **Human reaction delay**: 80–300ms before firing claim mutation
- **Query rotation**: 3 semantically identical GraphQL query shapes, cycled per poll
- **Client ID sniffing**: Extracts `x-atoz-client-id` from page scripts instead of hardcoding
- **Decoy interactions**: 8% scroll events, 4% mouse-move events per poll cycle
- **Single claim attempt**: No retries (retries are a bot signal)

### service-worker.js (Resilience)
- **Circuit breaker**: After 3 consecutive server failures, uses cached token for 5 min
- **Config push**: Fetches `/config` on successful verify for remote stealth tuning
- **No hardcoded secrets**: Telegram credentials fail closed if not configured
- **Degraded mode**: Shows "working offline" when server is unreachable

### popup.js (UX)
- **Subscription status card**: Active / Payment Failed / Expired
- **Tier badge**: BASIC / PRO in header
- **Manage Billing button**: Opens Stripe Customer Portal
- **Upgrade button**: Opens `/upgrade` for Basic → Pro

## Server-Side Endpoints (Vercel)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/verify` | POST | Validate license key + device ID, return token + subscription |
| `/config` | GET | Return stealth parameters (pollMeanMs, reactionDelay, queryRotationSet) |
| `/create-checkout-session` | POST | Stripe Checkout session creation |
| `/stripe-webhook` | POST | Handle Stripe webhooks (payment success/failure/cancellation) |
| `/billing-portal` | GET | Redirect to Stripe Customer Portal |

## Success Metrics

- Ban rate < 1% per 1000 claim attempts
- Churn < 10% monthly
- Uptime > 99.5%
- Claim success rate > 95%

## Related

- Stripe Integration — Webhook handling and subscription lifecycle (server-side)
- Stealth Engine — Anti-detection strategies and query rotation (api-layer.js)
- [[Technical Debt Register]] — Resolved items marked
