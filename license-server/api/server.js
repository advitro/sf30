/**
 * SF30 V2.0 License Server
 *
 * Endpoints:
 *   POST /api/v2/activate   — First-time key activation
 *   POST /api/v2/validate   — Periodic re-verification
 *   GET  /api/v2/revocations — Revoked keys list (ETag cached)
 *
 * Auth: fingerprint-based (public API), Bearer token (admin)
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createLicense, getLicense, activateLicense, listRevoked, createCustomer, getCustomerByLicense, listAllCustomers, createPendingPayment, getPendingPayment, completePendingPayment, extendLicenseExpiry, recordRenewal, getLicenseRenewals } from './db.js';
import crypto from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = parseInt(process.env.PORT || '3000', 10);
const DEFAULT_DAYS = parseInt(process.env.DEFAULT_DAYS || '30', 10);
const API_TOKEN = process.env.API_TOKEN;

// ── BitPay Config ──
const BITPAY_API_TOKEN = process.env.BITPAY_API_TOKEN;
const BITPAY_ENV = process.env.BITPAY_ENV || 'prod';
const BITPAY_BASE_URL = BITPAY_ENV === 'test' ? 'https://test.bitpay.com' : 'https://bitpay.com';
const SERVER_URL = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';

const app = express();
app.use(express.json());
app.use(cors({ origin: '*' }));

// ── Static files (landing page, download, success page) ──
app.use(express.static(join(__dirname, 'public')));

// ── Helpers ──

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function daysFromNow(days) {
  return nowSeconds() + days * 24 * 3600;
}

function computeRevocationEtag(rows) {
  const payload = rows.map((r) => r.key).join('|');
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    const char = payload.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `"rev-${Math.abs(hash).toString(16)}"`;
}

// ── Auth ──

function requireAdminToken(req, res, next) {
  if (!API_TOKEN) {
    if (process.env.VERCEL === '1' || process.env.VERCEL_ENV === 'production') {
      return res.status(500).json({ ok: false, error: 'Server misconfiguration: API_TOKEN not set' });
    }
    console.warn('[SF30] API_TOKEN not set — admin endpoint is unsecured');
    return next();
  }
  const auth = req.headers.authorization || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (token !== API_TOKEN) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  next();
}

// ── Routes ──

/**
 * POST /api/v2/activate
 * Body: { key, fingerprint, fingerprintHash }
 */
app.post('/api/v2/activate', async (req, res) => {
  const { key, fingerprintHash } = req.body || {};

  if (!key || typeof key !== 'string') {
    return res.status(400).json({ ok: false, error: 'Missing key' });
  }
  if (!fingerprintHash || typeof fingerprintHash !== 'string') {
    return res.status(400).json({ ok: false, error: 'Missing fingerprintHash' });
  }

  try {
    const record = await getLicense(key);

    if (!record) {
      return res.status(404).json({ ok: false, error: 'Invalid license key' });
    }

    if (record.revoked) {
      return res.status(403).json({ ok: false, error: 'License key revoked' });
    }

    if (record.fingerprint_hash && record.fingerprint_hash !== fingerprintHash) {
      return res.status(403).json({ ok: false, error: 'Device fingerprint mismatch' });
    }

    const now = nowSeconds();

    if (record.expires_at && record.expires_at < now) {
      return res.status(403).json({ ok: false, error: 'License expired' });
    }

    if (!record.activated_at) {
      const exp = daysFromNow(DEFAULT_DAYS);
      await activateLicense(record.id, { activatedAt: now, expiresAt: exp, fingerprintHash });
      return res.json({ ok: true, tier: record.tier || 'basic', exp });
    }

    return res.json({ ok: true, tier: record.tier || 'basic', exp: record.expires_at });
  } catch (err) {
    console.error('[activate]', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

/**
 * POST /api/v2/validate
 * Body: { key, fingerprintHash }
 */
app.post('/api/v2/validate', async (req, res) => {
  const { key, fingerprintHash } = req.body || {};

  if (!key || typeof key !== 'string') {
    return res.status(400).json({ ok: false, error: 'Missing key' });
  }
  if (!fingerprintHash || typeof fingerprintHash !== 'string') {
    return res.status(400).json({ ok: false, error: 'Missing fingerprintHash' });
  }

  try {
    const record = await getLicense(key);

    if (!record || record.revoked) {
      return res.json({ ok: false, error: 'Invalid or revoked key' });
    }

    if (record.fingerprint_hash && record.fingerprint_hash !== fingerprintHash) {
      return res.json({ ok: false, error: 'Device fingerprint mismatch' });
    }

    const now = nowSeconds();
    if (record.expires_at && record.expires_at < now) {
      return res.json({ ok: false, error: 'License expired' });
    }

    return res.json({ ok: true, tier: record.tier || 'basic', exp: record.expires_at });
  } catch (err) {
    console.error('[validate]', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

/**
 * GET /api/v2/revocations
 * Returns: { revokedKeys: [...], updatedAt }
 * Supports ETag conditional requests (304 Not Modified)
 */
app.get('/api/v2/revocations', async (req, res) => {
  try {
    const rows = await listRevoked();
    const revokedKeys = rows.map((r) => r.key);
    const etag = computeRevocationEtag(rows);

    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }

    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json({ revokedKeys, updatedAt: new Date().toISOString(), etag });
  } catch (err) {
    console.error('[revocations]', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// ── Checkout (BitPay) ──

app.post('/api/checkout', async (req, res) => {
  if (!BITPAY_API_TOKEN) {
    return res.status(503).json({ ok: false, error: 'Payment processor not configured' });
  }

  const { renewKey } = req.body || {};
  const orderId = renewKey ? `renew:${renewKey}` : crypto.randomUUID();
  const now = nowSeconds();

  try {
    const bpRes = await fetch(`${BITPAY_BASE_URL}/invoices`, {
      method: 'POST',
      headers: {
        'X-Accept-Version': '2.0.0',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token: BITPAY_API_TOKEN,
        price: 99,
        currency: 'CAD',
        orderId: orderId,
        itemDesc: 'Shift Grabber — Monthly Subscription (1 Device)',
        notificationURL: `${SERVER_URL}/api/webhook/bitpay`,
        redirectURL: `${SERVER_URL}/success.html?invoice_id=${orderId}`,
        closeURL: `${SERVER_URL}/`,
        extendedNotifications: true,
      }),
    });

    const bpData = await bpRes.json();
    if (!bpRes.ok || !bpData.data) {
      console.error('[checkout] BitPay error:', bpData);
      return res.status(502).json({ ok: false, error: 'Payment provider error' });
    }

    const invoice = bpData.data;

    // Store pending payment in our DB
    await createPendingPayment({
      paymentId: orderId,
      status: 'pending',
      licenseKey: null,
      amountCad: '99.00',
      createdAt: now,
    });

    return res.json({ ok: true, url: invoice.url });
  } catch (e) {
    console.error('[checkout]', e);
    return res.status(500).json({ ok: false, error: 'Checkout failed' });
  }
});

// ── Payment Status (polled by success page) ──

app.get('/api/payment-status', async (req, res) => {
  const { invoice_id } = req.query;
  if (!invoice_id) {
    return res.status(400).json({ ok: false, error: 'Missing invoice_id' });
  }

  try {
    // First check our DB
    const record = await getPendingPayment(invoice_id);
    if (!record) {
      return res.status(404).json({ ok: false, error: 'Payment not found' });
    }

    if (record.status === 'completed' && record.license_key) {
      // Get expiry info
      const license = await getLicense(record.license_key);
      return res.json({ ok: true, status: 'completed', key: record.license_key, expiresAt: license?.expires_at });
    }

    // Fallback: verify with BitPay API directly
    if (BITPAY_API_TOKEN) {
      try {
        const bpRes = await fetch(`${BITPAY_BASE_URL}/invoices/${invoice_id}?token=${BITPAY_API_TOKEN}`);
        const bpData = await bpRes.json();
        if (bpRes.ok && bpData.data && (bpData.data.status === 'confirmed' || bpData.data.status === 'complete')) {
          // BitPay says it's paid but our webhook hasn't processed it yet
          return res.json({ ok: true, status: 'processing' });
        }
      } catch (e) {
        // ignore BitPay polling errors
      }
    }

    return res.json({ ok: true, status: 'pending' });
  } catch (e) {
    console.error('[payment-status]', e);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// ── BitPay Webhook ──

app.post('/api/webhook/bitpay', async (req, res) => {
  // Always respond 200 to BitPay so they don't retry
  res.status(200).json({ received: true });

  const payload = req.body || {};
  const { id, orderId, status } = payload.data || {};

  if (!orderId || !id) {
    console.log('[webhook] Ignoring — missing orderId or invoice id');
    return;
  }

  // Only act on confirmed/complete statuses
  if (status !== 'confirmed' && status !== 'complete') {
    console.log('[webhook] Ignoring — status:', status);
    return;
  }

  try {
    // Verify with BitPay API that this invoice is actually paid
    const verifyRes = await fetch(`${BITPAY_BASE_URL}/invoices/${id}?token=${BITPAY_API_TOKEN}`);
    const verifyData = await verifyRes.json();
    if (!verifyRes.ok || !verifyData.data) {
      console.log('[webhook] Verification failed:', verifyData);
      return;
    }
    const invoice = verifyData.data;
    if (invoice.status !== 'confirmed' && invoice.status !== 'complete') {
      console.log('[webhook] Invoice not confirmed/complete:', invoice.status);
      return;
    }

    const now = nowSeconds();
    const expiresAt = daysFromNow(30);
    const isRenewal = orderId.startsWith('renew:');

    if (isRenewal) {
      const existingKey = orderId.replace('renew:', '');
      const license = await getLicense(existingKey);
      if (!license) {
        console.log('[webhook] License not found for renewal:', existingKey);
        return;
      }

      // Extend expiry by 30 days from now
      await extendLicenseExpiry(existingKey, expiresAt);
      await recordRenewal({
        licenseKey: existingKey,
        invoiceId: id,
        amountCad: '99.00',
        paidAt: now,
        periodStart: now,
        periodEnd: expiresAt,
      });
      await completePendingPayment(orderId, { licenseKey: existingKey, completedAt: now });

      console.log('[webhook] License renewed:', existingKey, 'new expiry:', expiresAt);
    } else {
      // Check if we already completed this payment
      const existing = await getPendingPayment(orderId);
      if (!existing) {
        console.log('[webhook] Unknown order:', orderId);
        return;
      }
      if (existing.status === 'completed') {
        console.log('[webhook] Already completed:', orderId);
        return;
      }

      // Generate new license key with 30-day expiry
      const key = generateLicenseKey();

      await createLicense({
        key,
        fingerprintHash: null,
        tier: 'basic',
        createdAt: now,
        expiresAt,
      });

      await completePendingPayment(orderId, { licenseKey: key, completedAt: now });
      await recordRenewal({
        licenseKey: key,
        invoiceId: id,
        amountCad: '99.00',
        paidAt: now,
        periodStart: now,
        periodEnd: expiresAt,
      });

      // Store customer info from BitPay
      const buyerEmail = invoice.buyer?.email || null;
      if (buyerEmail) {
        await createCustomer({
          email: buyerEmail,
          stripeCustomerId: null,
          stripeSubscriptionId: id,
          licenseKey: key,
          tier: 'basic',
          createdAt: now,
        });
      }

      console.log('[webhook] License created:', key, 'expiry:', expiresAt);
    }
  } catch (e) {
    console.error('[webhook] Error processing payment:', e);
  }
});

// ── Download ──

app.get('/download', (_req, res) => {
  const zipPath = join(__dirname, 'public', 'download', 'shift-grabber.zip');
  res.download(zipPath, 'shift-grabber.zip');
});

// ── Admin ──

app.get('/admin.html', (_req, res) => {
  const html = readFileSync(join(__dirname, 'admin.html'), 'utf-8');
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

app.post('/api/admin/generate', requireAdminToken, async (req, res) => {
  const { tier, days } = req.body || {};

  const key = generateLicenseKey();
  const now = nowSeconds();
  const expiresAt = now + (days || DEFAULT_DAYS) * 24 * 3600;

  try {
    await createLicense({
      key,
      fingerprintHash: null,
      tier: tier || 'basic',
      createdAt: now,
      expiresAt,
    });
    res.json({ ok: true, key, tier: tier || 'basic', expiresAt });
  } catch (e) {
    console.error('[admin/generate]', e);
    res.status(500).json({ ok: false, error: 'Database error' });
  }
});

// ── Admin: List Customers ──

app.get('/api/admin/customers', requireAdminToken, async (_req, res) => {
  try {
    const rows = await listAllCustomers();
    res.json({ ok: true, customers: rows });
  } catch (e) {
    console.error('[admin/customers]', e);
    res.status(500).json({ ok: false, error: 'Database error' });
  }
});

// ── Admin: Customer Detail + Renewals ──

app.get('/api/admin/customers/:key', requireAdminToken, async (req, res) => {
  const { key } = req.params;
  try {
    const license = await getLicense(key);
    if (!license) {
      return res.status(404).json({ ok: false, error: 'License not found' });
    }
    const customer = await getCustomerByLicense(key);
    const renewals = await getLicenseRenewals(key);
    res.json({ ok: true, license, customer, renewals });
  } catch (e) {
    console.error('[admin/customer-detail]', e);
    res.status(500).json({ ok: false, error: 'Database error' });
  }
});

function generateLicenseKey() {
  const prefix = 'sf30';
  const segments = 4;
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const parts = [];
  for (let s = 0; s < segments; s++) {
    let segment = '';
    for (let i = 0; i < 4; i++) {
      segment += chars[crypto.randomInt(chars.length)];
    }
    parts.push(segment);
  }
  return `${prefix}-${parts.join('-')}`;
}

// ── Health Check ──

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '2.0.0' });
});

// ── Start ──

if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`[SF30 License Server] Running on port ${PORT}`);
    console.log(`[SF30 License Server] Auth: fingerprint-based (public), Bearer token (admin)`);
  });
}

export default app;
