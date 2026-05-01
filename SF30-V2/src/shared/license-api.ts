/**
 * License Verification — SF30 V2.0
 *
 * Offline cryptographic license verification using ECDSA P-256.
 * No server required — validation is performed locally using a build-time
 * embedded public key.
 *
 * License key format:
 *   sf30.<base64url-payload>.<base64url-signature>
 *
 * Payload (JSON):
 *   { "fp": "<fingerprint-hash>", "t": "<tier>", "e": <expiry-epoch>, "n": "<nonce>" }
 */

import { getLicensePublicKey } from './constants';
import type {
  ApiResult,
  LicenseActivationRequest,
  LicenseActivationResponse,
  LicenseValidationRequest,
  LicenseValidationResponse,
  TrialRequest,
  TrialResponse,
  RevocationListResponse,
} from '../types';

// ── Public API ──

/**
 * Activates (verifies) a license key locally.
 * Validates the ECDSA signature, fingerprint binding, and expiry.
 */
export async function activateLicense(
  request: LicenseActivationRequest
): Promise<ApiResult<LicenseActivationResponse>> {
  return verifyLicenseKey(request.key, request.fingerprintHash);
}

/**
 * Re-validates a license key locally.
 * Same as activate — performs full signature verification.
 */
export async function validateLicense(
  request: LicenseValidationRequest
): Promise<ApiResult<LicenseValidationResponse>> {
  return verifyLicenseKey(request.key, request.fingerprintHash);
}

/**
 * Trial requests are no longer supported.
 */
export async function requestTrial(
  _request: TrialRequest,
  _installSecret: string
): Promise<ApiResult<TrialResponse>> {
  return { ok: false, error: 'Trial not available' };
}

/**
 * Revocation list fetch is no longer supported (no server).
 * Returns null — revocation is handled by keypair rotation.
 */
export async function fetchRevocationList(
  _installSecret: string
): Promise<RevocationListResponse | null> {
  return null;
}

// ── Core Verification ──

async function verifyLicenseKey(
  key: string,
  fingerprintHash: string
): Promise<ApiResult<LicenseActivationResponse>> {
  const publicKeyBase64 = getLicensePublicKey();
  if (!publicKeyBase64) {
    return { ok: false, error: 'License public key not configured' };
  }

  // Parse key format: sf30.<payload>.<signature>
  const parts = key.split('.');
  if (parts.length !== 3 || parts[0] !== 'sf30') {
    return { ok: false, error: 'Invalid license key format' };
  }

  const [, payloadB64, sigB64] = parts;

  let payloadJson: string;
  try {
    payloadJson = base64urlDecode(payloadB64);
  } catch {
    return { ok: false, error: 'Malformed license payload' };
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(payloadJson) as Record<string, unknown>;
  } catch {
    return { ok: false, error: 'Invalid license payload' };
  }

  // Verify ECDSA P-256 signature
  try {
    const publicKeyDer = base64ToArrayBuffer(publicKeyBase64);
    const publicKey = await crypto.subtle.importKey(
      'spki',
      publicKeyDer,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );

    const signature = base64urlToArrayBuffer(sigB64);
    const encoder = new TextEncoder();
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      signature,
      encoder.encode(payloadJson)
    );

    if (!valid) {
      return { ok: false, error: 'Invalid license signature' };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[License] Verification error:', msg);
    return { ok: false, error: msg || 'Verification failed' };
  }

  // Validate payload fields
  const payloadFp = payload.fp;
  if (typeof payloadFp !== 'string' || payloadFp !== fingerprintHash) {
    return { ok: false, error: 'Device fingerprint mismatch' };
  }

  const payloadTier = payload.t;
  if (typeof payloadTier !== 'string' || (payloadTier !== 'basic' && payloadTier !== 'pro')) {
    return { ok: false, error: 'Invalid license tier' };
  }

  const payloadExp = payload.e;
  if (typeof payloadExp !== 'number') {
    return { ok: false, error: 'Invalid license expiry' };
  }

  const now = Math.floor(Date.now() / 1000);
  if (payloadExp < now) {
    return { ok: false, error: 'License expired' };
  }

  return {
    ok: true,
    data: {
      ok: true,
      tier: payloadTier as 'basic' | 'pro',
      exp: payloadExp,
    },
  };
}

// ── Base64url Helpers ──

function base64urlDecode(str: string): string {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padding = (4 - (base64.length % 4)) % 4;
  const padded = base64 + '='.repeat(padding);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

function base64urlToArrayBuffer(str: string): ArrayBuffer {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padding = (4 - (base64.length % 4)) % 4;
  const padded = base64 + '='.repeat(padding);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
