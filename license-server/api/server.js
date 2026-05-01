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
import { createLicense, getLicense, activateLicense, listRevoked, createCustomer, createPendingPayment, getPendingPayment, completePendingPayment } from './db.js';
import crypto from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = parseInt(process.env.PORT || '3000', 10);
const DEFAULT_DAYS = parseInt(process.env.DEFAULT_DAYS || '30', 10);
const API_TOKEN = process.env.API_TOKEN;

// ── NOWPayments Config ──
const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY;
const NOWPAYMENTS_PAYOUT_CURRENCY = process.env.NOWPAYMENTS_PAYOUT_CURRENCY || 'usdt';
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

// ── Checkout (NOWPayments) ──

app.post('/api/checkout', async (req, res) => {
  if (!NOWPAYMENTS_API_KEY) {
    return res.status(503).json({ ok: false, error: 'Payment processor not configured' });
  }

  const orderId = crypto.randomUUID();
  const now = nowSeconds();

  try {
    const npRes = await fetch('https://api.nowpayments.io/v1/invoice', {
      method: 'POST',
      headers: {
        'x-api-key': NOWPAYMENTS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        price_amount: 99,
        price_currency: 'cad',
        order_id: orderId,
        order_description: 'Shift Grabber License — 1 Device Lifetime',
        ipn_callback_url: `${SERVER_URL}/api/webhook/nowpayments`,
        success_url: `${SERVER_URL}/success.html?payment_id=${orderId}`,
        cancel_url: `${SERVER_URL}/`,
      }),
    });

    const npData = await npRes.json();
    if (!npRes.ok) {
      console.error('[checkout] NOWPayments error:', npData);
      return res.status(502).json({ ok: false, error: 'Payment provider error' });
    }

    // Store pending payment in our DB
    await createPendingPayment({
      paymentId: orderId,
      status: 'pending',
      licenseKey: null,
      amountCad: '99.00',
      createdAt: now,
    });

    return res.json({ ok: true, url: npData.invoice_url });
  } catch (e) {
    console.error('[checkout]', e);
    return res.status(500).json({ ok: false, error: 'Checkout failed' });
  }
});

// ── Payment Status (polled by success page) ──

app.get('/api/payment-status', async (req, res) => {
  const { payment_id } = req.query;
  if (!payment_id) {
    return res.status(400).json({ ok: false, error: 'Missing payment_id' });
  }

  try {
    const record = await getPendingPayment(payment_id);
    if (!record) {
      return res.status(404).json({ ok: false, error: 'Payment not found' });
    }

    if (record.status === 'completed' && record.license_key) {
      return res.json({ ok: true, status: 'completed', key: record.license_key });
    }

    return res.json({ ok: true, status: 'pending' });
  } catch (e) {
    console.error('[payment-status]', e);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// ── NOWPayments Webhook ──

app.post('/api/webhook/nowpayments', async (req, res) => {
  // Always respond 200 to NOWPayments so they don't retry indefinitely
  res.status(200).json({ received: true });

  const payload = req.body || {};
  const { payment_id, order_id, payment_status } = payload;

  if (!order_id || payment_status !== 'finished') {
    console.log('[webhook] Ignoring — status:', payment_status, 'order:', order_id);
    return;
  }

  try {
    // Verify with NOWPayments API that this payment is actually finished
    const verifyRes = await fetch(`https://api.nowpayments.io/v1/payment/${payment_id}`, {
      headers: { 'x-api-key': NOWPAYMENTS_API_KEY },
    });
    const verifyData = await verifyRes.json();
    if (!verifyRes.ok || verifyData.payment_status !== 'finished') {
      console.log('[webhook] Verification failed or not finished:', verifyData);
      return;
    }

    // Check if we already completed this payment
    const existing = await getPendingPayment(order_id);
    if (!existing) {
      console.log('[webhook] Unknown order:', order_id);
      return;
    }
    if (existing.status === 'completed') {
      console.log('[webhook] Already completed:', order_id);
      return;
    }

    // Generate lifetime license key
    const key = generateLicenseKey();
    const now = nowSeconds();

    await createLicense({
      key,
      fingerprintHash: null,
      tier: 'basic',
      createdAt: now,
      expiresAt: null, // lifetime
    });

    await completePendingPayment(order_id, { licenseKey: key, completedAt: now });

    console.log('[webhook] License generated for order', order_id, 'key:', key);
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
