# SF30 V1.0 — Customer Installation Guide

> **Welcome!** This guide will walk you through installing the SF30 shift grabber extension and activating your license.

---

## What You Received

Your delivery package contains:

| File / Folder | What It Is |
|---------------|------------|
| `SF30-V1.0/` | The extension folder (do not rename) |
| **License Key** | A long string like `eyJjaW...signature` — this is your personal activation key |

**Keep your license key safe.** It can only be used on **one device** at a time.

---

## Step-by-Step Installation

### Step 1 — Unzip the Extension

Extract the `SF30-V1.0.zip` file to a folder on your computer. Remember where you put it — **do not delete this folder** while the extension is installed.

> 💡 **Tip:** Put it somewhere permanent like `C:\Users\YourName\Extensions\SF30-V1.0` (Windows) or `~/Extensions/SF30-V1.0` (Mac).

---

### Step 2 — Open Chrome Developer Mode

1. Open **Google Chrome**
2. Go to `chrome://extensions/` (type it in the address bar and press Enter)
3. Toggle **"Developer mode"** ON (top-right corner)

![Developer mode toggle](https://i.imgur.com/placeholder-dev-mode.png)

---

### Step 3 — Load the Extension

1. Click **"Load unpacked"** (button that appears in the top-left)
2. Navigate to and select the `SF30-V1.0` folder you extracted
3. Click **"Select Folder"**

You should now see **"SF30 V1.0"** appear in your extensions list.

---

### Step 4 — Activate Your License

1. Click the **SF30 icon** in your Chrome toolbar (looks like a small square icon)
2. Paste your **license key** into the input field
3. Click **"Verify"**
4. If the status says **"License Active"** ✅, flip the toggle to **ON**

That's it — the extension is now running!

---

## How to Use

### The Popup (Control Panel)

Click the SF30 icon anytime to open the control panel. It has three tabs:

| Tab | What You Can Do |
|-----|-----------------|
| **Shifts** | Add/remove dates you want to grab shifts for, manage blacklisted dates |
| **Controls** | Pause/resume, enable fast mode, hide the on-page HUD |
| **Settings** | Configure Telegram notifications, export/delete your data |

### Shift Grabbing

Once the toggle is **ON** and you're on the AtoZ website (`atoz.amazon.work`), the extension will:

- **Poll** the shift schedule every second
- **Detect** new available shifts in your selected dates
- **Claim** shifts instantly when they appear
- **Notify** you via Telegram (if configured)

### Telegram Notifications (Optional)

To get instant alerts when a shift is grabbed:

1. Open the **Settings** tab
2. Create a Telegram bot with [@BotFather](https://t.me/botfather) and copy the **bot token**
3. Get your **chat ID** (message [@userinfobot](https://t.me/userinfobot) to find it)
4. Paste both into the Settings tab and click **Save**

You'll now receive messages like:

```
✅ Shift Grabbed
👤 Key: your_key_id
📅 Date: 2026-05-23
⏰ At: 14:00
```

---

## License & Device Binding

| Feature | Details |
|---------|---------|
| **Duration** | 30 days from activation |
| **Devices** | 1 device at a time (binds to your browser) |
| **Transfer** | If you need to move to a new computer, contact support |
| **Expiry** | The extension will automatically stop working when your license expires |

---

## Troubleshooting

### "Device Limit Exceeded"

Your key is already active on another browser/device. If you changed computers or reinstalled Chrome, contact support for a transfer.

### "Invalid or expired — re-verify"

Your license may have expired. Check the expiry date or contact support to renew.

### Extension disappears after closing Chrome

This can happen in Developer Mode. Just repeat **Step 3** (Load unpacked) to restore it.

### "Clock tamper detected"

Your system clock was set back. Set it to the correct date/time and try again.

### Nothing happens on AtoZ

1. Make sure the toggle is **ON** in the popup
2. Make sure you have at least one date selected in the **Shifts** tab
3. Check that you're on `https://atoz.amazon.work/shifts/schedule`
4. Try clicking **Reload Now** in the Controls tab

---

## Support

Need help? Contact us:

- **Telegram:** [@shift_grabber](https://t.me/shift_grabber)
- **Email:** (your email here)

**Please include your license key** when contacting support for faster resolution.

---

*SF30 V1.0 — Built for reliability. Grab shifts, not stress.*
