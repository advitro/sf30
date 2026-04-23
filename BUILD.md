# Shift Grabber V9 — Build Guide

## Prerequisites
- Node.js 18+
- `npm install`

## Environment Variables
| Variable | Required | Description |
|----------|----------|-------------|
| `SG_HMAC_KEY` | Yes | HMAC key for response validation. Rotate monthly. |
| `SG_ENV` | No | `development`, `staging`, or `production` (default: `production`) |
| `SG_TELEGRAM_BOT_TOKEN` | No | Telegram bot token for notifications. Omit to disable. |

## Build Commands
```bash
# Production build
npm run build

# Staging build
SG_ENV=staging npm run build

# Development build (no obfuscation)
SG_ENV=development npm run build

# Build + package as zip
npm run build:zip
```

## CI/CD
GitHub Actions workflow in `.github/workflows/ci.yml`:
- Runs on every push/PR to `main`
- Lints, builds, and uploads artifacts
- Runs `npm audit` and CodeQL security scanning

## Build Outputs
| Directory | Contents |
|-----------|----------|
| `dist/` | Obfuscated, production-ready extension |
| `Deploy/extension/` | Customer-ready unpacked extension |
| `Deploy/docs/` | Install, activate, troubleshoot, privacy policy, terms |

## Security Notes
- **Never commit `SG_HMAC_KEY`** — use GitHub Secrets for CI.
- Integrity hash is computed from the obfuscated service worker and injected at build time.
- Global names (`SG_CONSTS`, `SG_CRYPTO`, `SG_FINGERPRINT`) are randomized per build.
- `renameGlobals` is disabled in the obfuscator because we do our own global name randomization after obfuscation.
