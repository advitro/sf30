# Shift Grabber V9 — Security Runbook

## Incident Response

### License Key Leaked / Shared
1. **Revoke the key** immediately via your Vercel admin panel (`/admin/revoke` or database update)
2. The extension checks subscription status on popup open — revoked keys will show "Subscription Expired" within 5 minutes
3. No action needed on client side; fail-closed design stops functionality automatically

### Token Compromised
1. Tokens are encrypted at rest with AES-GCM + device fingerprint
2. If a token is stolen in transit (MITM), rotate the server HMAC key (`SG_HMAC_KEY` env var)
3. Rebuild and redistribute the extension with the new key
4. Old tokens will fail HMAC validation and be rejected

### Extension Code Tampered
1. The extension uses aggressive obfuscation (`controlFlowFlattening`, `deadCodeInjection`, `selfDefending`)
2. Global API names (`SG_CONSTS`, `SG_CRYPTO`, `SG_FINGERPRINT`) are randomized per build
3. Tokens are encrypted at rest with AES-GCM + device fingerprint — stolen code cannot decrypt tokens without the victim's device fingerprint
4. If tampering is suspected, rotate `SG_HMAC_KEY` and rebuild

### Amazon Detection / Ban Risk
1. Reduce polling frequency in server config (`baseMs`)
2. Advise users to use fewer date tabs simultaneously
3. Encourage use of override mode sparingly
4. If detection escalates, push a stealth config update via `/config`

## Security Checklist (Pre-Release)

- [ ] `SG_HMAC_KEY` environment variable is set and strong (>32 random chars)
- [ ] Build ran successfully with `node build.js`
- [ ] Message secret was randomized (check build output)
- [ ] Global names were randomized (check build output)
- [ ] Obfuscation settings are aggressive (`controlFlowFlattening: true`, `deadCodeInjection: true`)
- [ ] No plaintext secrets in source code
- [ ] `background/license.js` does not exist in dist
- [ ] `manifest.json` includes CSP
- [ ] Server `/verify` endpoint enforces device limits and revocation checks

## Contact
For security incidents, use the same support channel as customer inquiries.
