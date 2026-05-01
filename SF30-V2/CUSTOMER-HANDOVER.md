# SF30 V2.0 — Customer Installation & Activation Guide

> **Welcome!** This guide walks you through installing the SF30 shift grabber and activating your device-bound license.

---

## What You Received

Your delivery package contains:

| File | What It Is |
|------|-----------|
| `SF30-V2.0.zip` | The extension package (do not rename) |
| **License Key** *(after activation)* | A unique key bound to your device fingerprint |

**One device at a time.** Your license is tied to your computer's fingerprint. If you need to move to a new device, contact support for a transfer.

---

## Step-by-Step Installation

### Step 1 — Unzip the Extension

Extract `SF30-V2.0.zip` to a folder on your computer. **Do not delete this folder** while the extension is installed.

> 💡 **Tip:** Put it somewhere permanent like:
> - Windows: `C:\Users\YourName\Extensions\SF30-V2.0`
> - Mac: `~/Extensions/SF30-V2.0`

---

### Step 2 — Open Chrome Developer Mode

1. Open **Google Chrome**
2. Go to `chrome://extensions/` (type in the address bar and press Enter)
3. Toggle **"Developer mode"** ON (top-right corner)

---

### Step 3 — Load the Extension

1. Click **"Load unpacked"** (button that appears in the top-left)
2. Navigate to and select the `SF30-V2.0` folder you extracted
3. Click **"Select Folder"**

You should now see **"SF30 V2.0"** appear in your extensions list.

---

### Step 4 — Accept the Privacy Notice

The first time you open the popup, you'll see a **Privacy Notice**. Review it and:

1. Check the box: **"I am 16 years or older"**
2. Click **"Accept & Continue"**

> ℹ️ You can toggle **Telegram Notifications** and **Error Reporting** on/off before accepting.

---

## How to Activate Your License

SF30 V2 uses **device fingerprinting** to bind your license to your computer. Here's how it works:

### Option A: Purchase a License (Full Access)

```
Step 1: Open the SF30 popup (click the icon in Chrome toolbar)
        ↓
Step 2: Copy your "Device Fingerprint" shown in the popup
        ↓
Step 3: Send the fingerprint to the seller (Telegram/DM)
        ↓
Step 4: Seller generates a license key bound to your device
        ↓
Step 5: You receive the license key
        ↓
Step 6: Paste the key into the popup → click "Verify"
        ↓
Step 7: Status shows "License Active" ✅ → flip toggle to ON
```



---

## Using the Popup

Click the SF30 icon anytime to open the control panel. It has three tabs:

| Tab | What You Can Do |
|-----|-----------------|
| **Shifts** | Add/remove target dates, manage blacklisted dates |
| **Controls** | Pause/resume, enable turbo mode, reload content scripts |
| **Settings** | Configure Telegram, export/delete your data |

---

## Shift Grabbing

Once the toggle is **ON** and you're on the AtoZ website (`atoz.amazon.work`), the extension will:

- **Poll** the shift schedule continuously
- **Detect** new available shifts matching your target dates
- **Claim** shifts instantly when they appear
- **Notify** you via Telegram (if configured)

### Requirements:
1. Toggle is **ON** in the popup
2. At least one **target date** is selected in the Shifts tab
3. You are on `https://atoz.amazon.work/shifts/schedule`

---

## Telegram Notifications (Optional)

To get instant alerts when a shift is claimed:

1. Open the **Settings** tab
2. Create a Telegram bot with [@BotFather](https://t.me/botfather) and copy the **bot token**
3. Get your **chat ID** (message [@userinfobot](https://t.me/userinfobot) to find it)
4. Paste both into the Settings tab and click **Save Config**
5. Toggle the switch to enable alerts

> 🔐 Your Telegram credentials are encrypted with **AES-GCM-256** before storage.

You'll receive messages like:

```
✅ Shift Claimed
📅 Date: 2026-05-23
⏰ Time: 14:00 — 18:00
🏢 Site: DPH4
```

---

## License & Device Binding

| Feature | Details |
|---------|---------|
| **Duration** | 30 days from activation |
| **Devices** | 1 device at a time (binds to your browser fingerprint) |
| **Trial** | Not available — license required |
| **Transfer** | Contact support to move to a new computer |
| **Expiry** | Extension automatically stops when license expires |

---

## Troubleshooting

### "Please accept the privacy notice first"

Click the SF30 icon, check the age box, and click **Accept & Continue**.

### "Invalid key — device fingerprint mismatch"

Your license key was generated for a different device. If you changed computers or reinstalled Chrome, contact support with your new fingerprint for a transfer.

### "License expired"

Your 30-day period has ended. Contact support to renew.

### Extension disappears after closing Chrome

This can happen in Developer Mode. Repeat **Step 3** (Load unpacked) to restore it.

### Nothing happens on AtoZ

1. Make sure the toggle is **ON** in the popup
2. Make sure you have at least one date selected in the **Shifts** tab
3. Check that you're on `https://atoz.amazon.work/shifts/schedule`
4. Try clicking **Reload** in the Controls tab
5. Check if the HUD (on-page status) is visible — if not, refresh the AtoZ page

### "Device Limit Exceeded"

Your key is already active on another browser/device. Contact support for a transfer.

---

## Support

Need help? Contact us:

- **Telegram:** [@shift_grabber](https://t.me/shift_grabber)

**Please include your license key or device fingerprint** when contacting support for faster resolution.

---

*SF30 V2.0 — Built for reliability. Grab shifts, not stress.*
