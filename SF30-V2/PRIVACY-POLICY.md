# SF30 Privacy Policy

**Effective Date:** 2026-04-23

## 1. Introduction

SF30 ("the Extension") is a browser extension that helps users claim shifts on Amazon AtoZ. This Privacy Policy explains how we collect, use, store, and protect your personal data when you use SF30.

## 2. Data Controller

The data controller for SF30 is the SF30 development team. For privacy inquiries, please contact: **privacy@sf30.app**

## 3. Data Categories Collected

We collect and process the following categories of data:

| Category | Description |
|----------|-------------|
| **Device Fingerprint** | A unique hash derived from browser and system characteristics used for license binding and fraud prevention. |
| **License Key** | The license key you enter to activate the Extension. |
| **Shift Preferences** | Target dates, blacklist dates, and toggle settings you configure within the Extension. |
| **Telegram Configuration** | Bot token and chat ID (optional) if you choose to enable Telegram notifications. |
| **Error Logs** | Diagnostic information collected when errors occur to help us improve the Extension. |

## 4. Purposes of Processing

We process your data for the following purposes:

- **License Validation:** Verifying that your license key is valid, not revoked, and bound to your device.
- **Shift Claiming:** Automatically navigating to your preferred dates on Amazon AtoZ.
- **Notifications:** Sending shift claim notifications via Telegram (only if configured).
- **Fraud Prevention:** Detecting unauthorized license sharing or abuse.
- **Diagnostics:** Identifying and fixing bugs or performance issues.

## 5. Legal Basis for Processing

Under the GDPR, our legal bases are:

- **Art. 6(1)(a) Consent:** For storing and processing your Telegram configuration and sending notifications.
- **Art. 6(1)(b) Contract:** For performing the license agreement (activation, validation).
- **Art. 6(1)(f) Legitimate Interest:** For fraud prevention, security monitoring, and diagnostic logging. We have balanced these interests against your privacy rights and minimize data collection accordingly.

## 6. Data Retention Periods

| Data Type | Retention Period |
|-----------|------------------|
| License data | Duration of the valid license period |
| Device fingerprint | Duration of the valid license period |
| Shift preferences | Until you delete the Extension data or uninstall |
| Telegram configuration | Until you delete the Extension data or revoke consent |
| Error logs | 7 days |
| Telegram message queue | 30 days |

After the retention period expires, data is automatically deleted or anonymized.

## 7. Third-Party Recipients

We transmit data to the following third-party services:

- **License Server (`license.sf30.app`):** Device fingerprint and license key for activation and periodic validation.
- **Telegram API (`api.telegram.org`):** Shift claim notifications (date, time, site) if you configure Telegram notifications. We do not share your Telegram credentials with any other party.

We do not sell, rent, or trade your personal data.

## 8. Security Measures

- Your **Telegram credentials** are encrypted with **AES-GCM-256** before being stored locally in your browser.
- All communication with the license server uses **HTTPS/TLS**.
- No sensitive data is stored on our servers beyond what is necessary for license validation.

## 9. Canvas Fingerprinting Disclosure

SF30 uses canvas fingerprinting as part of its device fingerprinting process. This technique renders a hidden canvas element and extracts a hash from the rendered image. The purpose is solely to generate a stable device identifier for license binding and fraud prevention. The canvas rendering happens entirely locally; the raw image data is not transmitted to any server—only the resulting hash is sent to the license server.

## 10. Your Rights

Under the GDPR and similar privacy laws, you have the following rights:

- **Right of Access:** Request a copy of the personal data we hold about you.
- **Right to Rectification:** Request correction of inaccurate or incomplete data.
- **Right to Erasure ("Right to be Forgotten"):** Request deletion of your personal data.
- **Right to Data Portability:** Receive your data in a structured, machine-readable format.
- **Right to Restriction:** Request limitation of processing under certain conditions.
- **Right to Object:** Object to processing based on legitimate interests.
- **Right to Withdraw Consent:** Withdraw consent at any time (does not affect prior lawful processing).

To exercise any of these rights, contact us at **privacy@sf30.app**. You may also use the **"Delete All Data"** button in the Extension's Settings tab to erase locally stored data immediately.

## 11. Age Restriction

SF30 is not intended for use by individuals under the age of **16**. We do not knowingly collect data from children under 16. If you believe we have inadvertently collected such data, please contact us immediately.

## 12. Changes to This Policy

We may update this Privacy Policy from time to time. If we make material changes, we will notify you via the Extension or by email. Your continued use of SF30 after changes constitutes acceptance of the updated policy.

## 13. Contact Information

For questions or concerns about this Privacy Policy or our data practices, please contact:

**Email:** privacy@sf30.app
