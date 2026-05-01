# Security Hardening v2.1

Implementation details for anti-reverse-engineering, payment-wall protection, and operational security in the commercial SaaS version of [[Shift Grabber V9 Index|Shift Grabber V9]].

## What Changed

### Build Pipeline
- `build.js` — Node.js script using `javascript-obfuscator` with aggressive settings
- `package.json` — Build dependencies and scripts
- **Obfuscation features:** control-flow flattening, string array encoding, dead code injection, debug protection, mangled identifiers
- **HMAC key injection** at build time via `SG_HMAC_KEY` environment variable

### Extension-Side Protections

| File | Protection |
|------|-----------|
| `src/shared/crypto.js` | AES-GCM token encryption, PBKDF2 key derivation, HMAC-SHA256 signing/verification |
| `src/shared/fingerprint.js` | Canvas + browser characteristic fingerprinting for device binding |
| `background/service-worker.js` | Encrypted token storage, HMAC response validation, self-integrity checks, circuit breaker, device fingerprint sent with verify |
| `src/content/api-layer.js` | Stealth engine (Poisson polling, reaction delay, query rotation, decoy interactions, client ID sniffing) |
| `popup/popup.js` | Subscription UI, tier display, billing portal integration |

### Server-Side Expectations

The server must implement:
- **HMAC signing** of `/verify` responses: `signature = HMAC_SHA256(secret, token + "|" + expiresAt + "|" + tier)`
- **Rate limiting**: max 5 verify attempts per IP per minute, 3 per key per minute
- **`/config` endpoint**: returns stealth parameters and integrity hash
- **`/claim-report` endpoint**: (future) receives claim events for blacklisting

## Threat Mitigation Matrix

| Threat | Before v2.1 | After v2.1 |
|--------|-------------|------------|
| CRX unpack + read source | Trivial | Harder (obfuscated) |
| Patch license check | 3 lines to edit | Scattered checks + integrity validation |
| Fake token via DevTools | Set storage directly | Token encrypted with device-bound key |
| Fork + redistribute | Delete SW, keep scripts | Claiming tied to SW heartbeat + server config |
| MITM license server | No validation | HMAC signature verification |
| Key sharing across devices | Single UUID | Canvas fingerprint + browser characteristics |

## Known Limitations

Chrome extensions are inherently client-side software. **A sufficiently skilled and determined attacker can always reverse engineer the extension.** The goal is to make cracking economically unviable:

- Cracking time > 8 hours → most users pay instead
- Cracked version lacks config updates → becomes obsolete
- Server-side features (claim reporting, priority support) unavailable to cracked users

## Related

- [[Security Audit]] — Full security assessment and scoring
- [[Commercial Architecture]] — Subscription model and billing
- [[Technical Debt Register]] — Outstanding security items
