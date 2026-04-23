Shift Grabber V9 — Development Build
=====================================

This folder contains the UNBUILT, UNOBFUSCATED extension source.
It is ready to load in Chrome Developer Mode for testing.

Contents
--------
  manifest.json          — Extension manifest (MV3)
  background/            — Service worker
  src/shared/            — Constants, crypto, fingerprint, circuit breaker
  src/content/           — Content scripts (main.js + api-layer.js)
  popup/                 — Popup UI (HTML, JS, CSS)
  icons/                 — Extension icons
  sounds/                — Notification sound

How to Load in Chrome (Developer Mode)
--------------------------------------
  1. Open Chrome → chrome://extensions/
  2. Enable "Developer mode" (toggle top-right)
  3. Click "Load unpacked"
  4. Select this folder (Deploy/extension/)
  5. The extension icon should appear in your toolbar

IMPORTANT: This is NOT a production build
------------------------------------------
  • Server URLs are PLACEHOLDERS (__SG_SERVER_URL__, __SG_SERVER_DOMAIN__)
  • The HMAC key is a PLACEHOLDER (__SG_HMAC_KEY_PLACEHOLDER__)
  • Code is NOT obfuscated — server domains are visible in source
  • You MUST run the build pipeline for a production release

How to Build Production Package
-------------------------------
  1. cd to the project root
  2. npm install
  3. Set environment variable: SG_HMAC_KEY="your-32-char-secret"
  4. Set environment variable: SG_ENV="production" (or staging/development)
  5. npm run build
  6. The obfuscated, production-ready extension will be in dist/
     and also synced to Deploy/extension/

Environment Variables
---------------------
  SG_HMAC_KEY   (required) — HMAC secret for server response validation
  SG_ENV        (optional) — production | staging | development (default: production)

Build Outputs
-------------
  dist/                  — Obfuscated production extension
  Deploy/extension/      — Customer-ready unpacked extension (after build)
  shift-grabber-v9.zip   — Packaged extension for Chrome Web Store upload

Server Setup
------------
  A Next.js admin dashboard is included in the server/ directory.
  See server/.env.example for required environment variables.

Version
-------
  Shift Grabber V9
  Manifest version: 2.1.0
  Built: 2026-04-23
