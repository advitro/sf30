# Shift Grabber V9 — Seller Build Instructions

## Prerequisites
- Node.js 18+ installed
- npm (comes with Node.js)
- PowerShell (Windows) or bash (Mac/Linux) for packaging

## Build Steps

### 1. Install Dependencies
```bash
npm install
```

This installs `javascript-obfuscator` and other dev dependencies.

### 2. Set the HMAC Key (Required)
The service worker needs a secret HMAC key for license signature validation.

**Windows (PowerShell):**
```powershell
$env:SG_HMAC_KEY="your-secret-key-here"
```

**Mac/Linux (bash):**
```bash
export SG_HMAC_KEY="your-secret-key-here"
```

> ⚠️ **Never commit this key.** It should match the key used by your Vercel `/verify` endpoint.

### 3. Run the Build
```bash
node build.js
```

This creates a `dist/` folder with:
- Obfuscated JavaScript (all logic protected)
- Copied static assets (HTML, CSS, icons, sounds)
- Injected HMAC key in the service worker

### 4. Replace the Extension Folder
Copy the obfuscated build into the deploy package:

**Windows:**
```powershell
Remove-Item -Recurse -Force Deploy/extension
Copy-Item -Recurse dist Deploy/extension
```

**Mac/Linux:**
```bash
rm -rf Deploy/extension
cp -r dist Deploy/extension
```

### 5. Package for Customers
```powershell
.\Deploy\package.ps1 -Obfuscated
```

This creates `Deploy/shift-grabber-v9.zip` ready to distribute.

---

## What Gets Obfuscated?
| File | Protection Level |
|------|-----------------|
| `service-worker.js` | High — license validation, encryption, Telegram |
| `popup.js` | High — UI logic, billing links |
| `api-layer.js` | High — GraphQL polling, claiming, stealth engine |
| `main.js` | High — HUD, DOM grabbing, keyboard shortcuts |
| `constants.js` | Medium — URLs, keys, query strings |
| `crypto.js` | High — AES-GCM, HMAC verification |
| `fingerprint.js` | Medium — device fingerprinting |

Static files (`manifest.json`, HTML, CSS, icons, sounds) are copied as-is.

---

## Rebuilding After Code Changes
1. Make your changes in the source files
2. Run `node build.js` again
3. Replace `Deploy/extension/` with `dist/`
4. Run `package.ps1`

## Version Bump
Before building a release, update the version in:
- `manifest.json` → `"version"`
- `popup/index.html` → `.version` span text
- `package.json` → `"version"`
