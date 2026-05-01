# SF30 License Tools — Offline License Management

These tools let you generate and sign license keys **without running a server**.
Each license key is cryptographically signed and self-validating — the extension
verifies it locally using an embedded public key.

> 📖 **For the complete seller workflow**, see [`SELLER-WORKFLOW.md`](../SELLER-WORKFLOW.md)
> (step-by-step from building the zip to delivering keys).

## How It Works

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│   Customer      │         │     Seller      │         │   Extension     │
│  (gets FP)      │ ──FP──► │  (signs key)    │ ──Key──►│ (verifies sig)  │
└─────────────────┘         └─────────────────┘         └─────────────────┘
```

1. **Customer** installs the extension and copies their device fingerprint
2. **Seller** runs `sign-license.js` with the fingerprint → gets a signed key
3. **Customer** pastes the key → extension verifies the signature locally

**No internet connection required for validation.**

## Setup (One-Time)

### 1. Generate your keypair

```bash
cd license-tools
node generate-keypair.js
```

This creates three files:
- `private.pem` — **KEEP SECRET**. Used to sign licenses. Never share or commit this.
- `public.pem` — For your reference.
- `public.key` — Base64-encoded public key. Embed this in the extension build.

### 2. Build the extension with your public key

```bash
cd ../SF30-V2

# Windows PowerShell:
$env:VITE_LICENSE_PUBLIC_KEY = (Get-Content ..\license-tools\public.key -Raw)
npm run build

# macOS/Linux:
VITE_LICENSE_PUBLIC_KEY=$(cat ../license-tools/public.key) npm run build
```

The public key is baked into the extension at build time. Only licenses signed
with your matching `private.pem` will be accepted.

## Daily Workflow

### Customer sends their fingerprint

The extension shows a device fingerprint (64-character hex string) in the popup.
The customer copies it and sends it to you.

### You sign a license

```bash
cd license-tools

# 30-day Pro license
node sign-license.js -f <customer-fingerprint> -t pro -d 30

# 90-day Basic license
node sign-license.js -f <customer-fingerprint> -t basic -d 90
```

Output:
```
✅ License key signed
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tier:               pro
Fingerprint:        abc123...
Expires:            2026-07-24 (90 days)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 Send this LICENSE KEY to your customer:

sf30.eyJmcCI6ImFiYzEyMy4uLiIsInQiOiJwcm8iLCJlIjoxNzc5NzI4OTgxLCJuIjoieHl6In0.abcd...

(Length: 234 characters)
```

Copy the license key and send it to your customer.

### Customer activates

1. Opens the extension popup
2. Pastes the license key
3. Clicks "Activate"
4. Extension verifies the signature locally — instant, no server needed

## Key Format

```
sf30.<base64url-payload>.<base64url-signature>
```

Payload (JSON):
```json
{
  "fp": "<64-char device fingerprint hash>",
  "t": "pro|basic",
  "e": 1779728981,
  "n": "<random nonce>"
}
```

- `fp` — Device fingerprint hash (SHA-256 hex). The key only works on this device.
- `t` — License tier: `basic` or `pro`
- `e` — Expiry timestamp (Unix epoch seconds)
- `n` — Random nonce ensuring each key is unique

The signature is ECDSA P-256 with SHA-256, produced by your `private.pem`.

## Security Notes

- **Keep `private.pem` secret.** Anyone with your private key can generate valid licenses.
- **Store `private.pem` offline** if possible (USB drive, password manager, encrypted volume).
- **Don't commit `private.pem` to git.** Add it to `.gitignore`.
- **The public key is safe to share.** It's embedded in every extension build.
- **Key rotation:** If your private key is compromised, generate a new keypair and
distribute a new extension build. Old licenses will no longer validate.

## Revocation

Since there's no server, traditional revocation (blacklisting a specific key) is
not automatic. You have a few options:

1. **Ignore it** — For small-scale operations, simply don't issue refunds/replacements.
2. **Rotate the keypair** — Generate a new keypair and distribute a new build. All
   old licenses become invalid.
3. **Static revocation list** — Host a `revocations.json` on GitHub Pages or S3.
   The extension checks it periodically. See `revocations.example.json`.

## Requirements

- Node.js 18+ (for `crypto.generateKeyPairSync`)
- No npm dependencies — these scripts use only Node.js built-ins
