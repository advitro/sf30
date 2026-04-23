# Shift Grabber V9 — Privacy Policy

**Effective Date:** 2026-04-22

## What Data We Collect

Shift Grabber V9 collects only the data necessary to function:

- **License key** — stored locally in your browser to authenticate with our server
- **Employee ID** — extracted from the AtoZ page to query shift availability
- **Shift data** — dates and times of shifts you choose to grab
- **Device fingerprint** — used to bind your license to your browser and prevent key sharing

## What We Do NOT Collect

- We do not track your browsing history outside AtoZ
- We do not sell or share your data with third parties for advertising
- We do not use cookies or analytics trackers

## Telegram Notifications (Optional)

If you configure Telegram bot credentials, shift grab confirmations are sent to your private Telegram chat. This is **opt-in** — you control the bot token and chat ID. You can disable notifications at any time in the extension settings.

## Data Storage

All data is stored **locally on your device** using Chrome's `storage.local` API. Your license token is encrypted at rest using AES-GCM with a key derived from your device fingerprint.

## Data Retention

- Shift grab logs are retained until you clear them or uninstall the extension
- Telegram queue messages are deleted after successful delivery
- License tokens expire automatically and are refreshed on demand

## Your Rights

You may:
- Uninstall the extension at any time to delete all local data
- Request account deletion by contacting support
- Opt out of Telegram notifications via the extension settings

## Contact

For privacy questions or data deletion requests, contact us via the "Need help?" link in the extension popup.
