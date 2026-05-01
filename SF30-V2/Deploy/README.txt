================================================================================
  SF30 V2.0 — Stealth Shift Grabber for Amazon AtoZ
  Private Distribution Package
================================================================================

PRODUCT OVERVIEW
----------------
SF30 V2.0 is a stealth Chrome Extension for Amazon AtoZ that automates shift
polling and instant claiming. It operates entirely within your browser with
zero external server dependencies for core functionality.

PACKAGE CONTENTS
----------------
SF30-V2.0.zip    — Production extension package (73 KB)
README.txt       — This file
INSTALL-GUIDE.md — Detailed installation instructions
CHANGELOG.md     — Version history

SYSTEM REQUIREMENTS
-------------------
- Google Chrome (v110+) or Chromium-based browser (Edge, Brave, Opera)
- Windows 10/11, macOS, or Linux
- Amazon AtoZ account (atoz.amazon.work)

INSTALLATION (Sideloading)
--------------------------
1. Unzip SF30-V2.0.zip to a permanent folder (e.g. C:\SF30\)
2. Open Chrome and navigate to: chrome://extensions/
3. Enable "Developer mode" (toggle in top-right corner)
4. Click "Load unpacked"
5. Select the unzipped SF30-V2.0 folder
6. The extension icon will appear in your toolbar

ACTIVATION
----------
1. Click the SF30 icon in your Chrome toolbar
2. Read and accept the Privacy Notice
3. Copy your Device Fingerprint
4. Send the fingerprint to receive your license key
5. Enter the license key and click "Verify"
6. Toggle "Shift Grabber" ON
7. Open Amazon AtoZ — the extension activates automatically

KEY FEATURES
------------
- Silent GraphQL polling (1-5 second intervals)
- Instant shift claiming via automated GraphQL mutations
- Turbo mode for high-speed polling
- Smart blacklist filtering (skip unwanted dates/sites)
- Telegram notifications for claimed shifts
- Stealth HUD with closed Shadow DOM (invisible to page scripts)
- Keyboard shortcuts: P (pause), Shift+O (override), Shift+H (HUD), R (reload)
- Per-install secret generation (device-bound security)
- AES-GCM-256 encrypted credential storage

SECURITY & PRIVACY
------------------
- No data transmitted during normal operation
- License validation uses HTTPS with device fingerprint binding
- Telegram credentials encrypted at rest with PBKDF2 (600k iterations)
- No plaintext secrets in source code
- Comprehensive Content Security Policy
- No web_accessible_resources (minimal detection surface)

SUPPORT
-------
Telegram: https://t.me/shift_grabber

LICENSE
-------
See TERMS.md in the project root for full terms of service.
Personal, non-transferable license. One device per license key.

VERSION
-------
SF30 V2.0.0
Build Date: 2026-04-25
