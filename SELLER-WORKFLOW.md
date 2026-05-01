# SF30 V2.0 — Seller Workflow Guide

> **Who this is for:** You are the seller/distributor of the SF30 extension. This guide walks you through the complete process from building the extension to delivering a working license key to a customer.

---

## Project Layout

Know where you are. These are the two folders you work in:

```
atoz - tg ready/
├── license-tools/          ← Seller tools (signing, keypair)
│   ├── generate-keypair.js
│   ├── sign-license.js
│   ├── verify-license.js
│   └── private.pem         ← YOUR SECRET KEY
│
└── SF30-V2/                ← Extension source + build commands
    ├── package.json        ← npm scripts live here
    ├── src/
    ├── dist/               ← Build output appears here
    └── Deploy/
        └── SF30-V2.0.zip   ← Final zip for customers
```

> ⚠️ **Rule:** `npm run build` / `npm test` / `npm run validate` / `npm run build:zip` only work inside `SF30-V2/`. The `license-tools/` folder has no npm scripts.

---

## Quick Start Checklist

- [ ] You have Node.js 18+ installed
- [ ] You know which folder each command runs from (see above)
- [ ] You understand keypair generation is **ONE-TIME** — skip it if you already have `private.pem`

---

## Phase 1 — First-Time Setup (Do This Once)

### Step 1: Generate Your Cryptographic Keypair

This creates the keys that make your licenses unique and unforgeable. **Skip this step if you already have `private.pem` from a previous run.**

```bash
# Run from: license-tools/
cd license-tools
node generate-keypair.js
```

**Output:**
```
🔐 ECDSA P-256 keypair generated successfully

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
private.pem  →  KEEP SECRET — used to sign licenses
public.pem   →  Reference only
public.key   →  Pass to extension build (base64 SPKI DER)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

> ⚠️ **CRITICAL:** `private.pem` is your business secret. Store it safely (password manager, encrypted USB, offline). Anyone with this file can generate valid licenses for your extension.
>
> If you already have `private.pem` and run this again, you'll see:
> ```
> ❌ private.pem already exists.
>    If you want to keep the existing keypair, skip this step.
>    (Keypair generation is ONE-TIME. You only need to do it once.)
> ```
> This is normal — just skip to Step 2.

---

### Step 2: Build the Extension with Your Public Key

The public key is embedded into the extension at build time. Only licenses signed with your matching `private.pem` will be accepted.

```bash
# Run from: SF30-V2/
cd ../SF30-V2

# Windows PowerShell:
$env:VITE_LICENSE_PUBLIC_KEY = (Get-Content ..\license-tools\public.key -Raw).Trim()
npm run build

# macOS/Linux:
VITE_LICENSE_PUBLIC_KEY=$(cat ../license-tools/public.key | tr -d '\n') npm run build
```

This produces the production build in `SF30-V2/dist/`.

---

### Step 3: Run Tests & Validation

Ensure everything passes before distributing:

```bash
# Run from: SF30-V2/
npm test          # 156 tests should pass
npm run validate  # Build validation checks
```

If any test fails, **do not ship**. Fix the issue first.

---

### Step 4: Create the Distribution Zip

```bash
# Run from: SF30-V2/
npm run build:zip
```

**Output:**
```
✅ Created SF30-V2.0.zip (73.3 KB)
📦 Location: SF30-V2/Deploy/SF30-V2.0.zip
```

This zip is what you send to customers. Keep it safe — you'll reuse the same zip for multiple customers (the license key is what differentiates them, not the zip).

---

## Phase 2 — Per-Sale Workflow (Repeat for Each Customer)

### Step 1: Customer Installs & Sends Their Fingerprint

**Give the customer:**
1. `SF30-V2.0.zip`
2. `CUSTOMER-HANDOVER.md` (installation guide)

**Customer does:**
1. Unzips and loads the extension in Chrome (Developer Mode → Load Unpacked)
2. Opens the popup, accepts the privacy notice
3. Copies their **Device Fingerprint** (64-character hex string)
4. Sends the fingerprint to you via Telegram/DM/email

> 💡 **Tip:** Ask customers to double-check they copied the FULL fingerprint. A partial copy is the #1 cause of "key doesn't work" issues.

---

### Step 2: Sign a License for the Customer

```bash
# Run from: license-tools/
cd license-tools

# Example: 30-day Pro license
node sign-license.js -f "<customer-fingerprint>" -t pro -d 30

# Example: 90-day Basic license
node sign-license.js -f "<customer-fingerprint>" -t basic -d 90
```

**Output:**
```
✅ License key signed
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tier:               pro
Fingerprint:        abcd1234...
Expires:            2026-05-25 (30 days)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 Send this LICENSE KEY to your customer:

sf30.eyJmcCI6ImFiYzEyMy4uLiIsInQiOiJwcm8iLCJlIjoxNzc5NzI4OTgxLCJuIjoieHl6In0.abcd...

(Length: 251 characters)
```

---

### Step 3: Verify the Key Before Sending (QA Check)

**Always verify the key before sending it to the customer.** This catches typos, copy-paste errors, and fingerprint mismatches.

```bash
# Run from: license-tools/
node verify-license.js -k "<the-full-key>" -f "<customer-fingerprint>"
```

**Good output:**
```
🟢 KEY IS VALID — safe to send to customer

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Fingerprint matches
✅ Tier valid: pro
✅ Expiry valid: 2026-05-25 (30 days left)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Bad output:**
```
🔴 KEY HAS PROBLEMS — do NOT send

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❌ Fingerprint MISMATCH
✅ Tier valid: pro
✅ Expiry valid: 2026-05-25 (30 days left)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

If verification fails, re-run `sign-license.js` with the correct fingerprint.

---

### Step 4: Send Key to Customer

Send the customer:
1. The full license key (the `sf30.xxx.yyy` string)
2. Instructions: *"Open the SF30 popup → paste key → click Verify → flip toggle to ON"*

---

## Phase 3 — Troubleshooting

### "Key doesn't work" / "Invalid signature"

1. Ask the customer to copy their fingerprint AGAIN and send it to you
2. Re-run `verify-license.js` with the key + the new fingerprint
3. If fingerprint mismatch: the customer gave you the wrong one initially. Re-sign with the correct fingerprint.
4. If signature invalid: the key was corrupted in transit. Re-sign and resend.

### Customer wants to transfer to a new computer

Licenses are fingerprint-bound. A transfer requires a new key:

1. Ask customer to install on the new computer and send the NEW fingerprint
2. Run `sign-license.js` with the new fingerprint
3. Send the new key
4. The old key will naturally stop working (different fingerprint) — no manual revocation needed

### Need to revoke a customer

Since there's no server, you have two options:

**Option A: Do nothing** — The customer's key expires naturally in 30/90 days. For small-scale operations, this is often sufficient.

**Option B: Rotate keypair** — Nuclear option. Invalidates ALL existing licenses:
```bash
# Run from: license-tools/
cd license-tools
node generate-keypair.js --force    # overwrites old keys

# Run from: SF30-V2/
cd ../SF30-V2
$env:VITE_LICENSE_PUBLIC_KEY = (Get-Content ..\license-tools\public.key -Raw).Trim()
npm run build
npm run build:zip
```
Then redistribute the new zip to paying customers and re-sign their keys.

---

## Quick Reference

### Commands Cheat Sheet

| Task | Command | Run from |
|---|---|---|
| Generate keypair | `node generate-keypair.js` | `license-tools/` |
| Force regenerate | `node generate-keypair.js --force` | `license-tools/` |
| Sign a license | `node sign-license.js -f <fp> -t pro -d 30` | `license-tools/` |
| Verify a key | `node verify-license.js -k <key> -f <fp>` | `license-tools/` |
| Build extension | `npm run build` | `SF30-V2/` |
| Run tests | `npm test` | `SF30-V2/` |
| Validate build | `npm run validate` | `SF30-V2/` |
| Create zip | `npm run build:zip` | `SF30-V2/` |

### File Locations

| File | Location | What It Is |
|---|---|---|
| Private key | `license-tools/private.pem` | **SECRET** — your signing key |
| Public key | `license-tools/public.key` | Safe to embed in builds |
| Extension zip | `SF30-V2/Deploy/SF30-V2.0.zip` | What customers install |
| Seller tools | `license-tools/` | Scripts for signing/verifying |
| Customer guide | `SF30-V2/CUSTOMER-HANDOVER.md` | Give this to customers |

---

*SF30 V2.0 — Serverless license management. No hosting, no server maintenance, no monthly costs.*
