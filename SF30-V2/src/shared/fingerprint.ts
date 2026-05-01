/**
 * Device Fingerprinting — SF30 V2.0
 *
 * Generates a stable device fingerprint for license binding.
 * Uses browser-feature hashing (NOT PII) to create a unique
 * but non-identifying device token.
 *
 * Fingerprint components:
 * - Screen resolution + color depth
 * - Language + timezone
 * - Hardware concurrency + device memory
 * - Platform + user agent (hashed)
 * - Canvas fingerprint (stable hash)
 *
 * The fingerprint is cached for 24 hours to avoid recomputation.
 */

import { TIMING, STORAGE_KEYS } from './constants';
import { computeHash } from './crypto';
import type { FingerprintComponents } from '../types';

// ── Constants ──

const CACHE_KEY = STORAGE_KEYS.DEVICE_FP;
const HASH_CACHE_KEY = STORAGE_KEYS.DEVICE_FP_HASH;
const CACHE_TTL_MS = TIMING.DEVICE_FP_CACHE_TTL_MS;

// ── Public API ──

/**
 * Generates (or retrieves cached) device fingerprint and hash.
 * Returns both the raw components (as base64 JSON) and the SHA-256 hash.
 */
export async function getDeviceFingerprint(): Promise<{
  fingerprint: string;
  fingerprintHash: string;
}> {
  // Try cache first
  const cached = await getCachedFingerprint();
  if (cached) {
    return cached;
  }

  // Generate fresh fingerprint
  const components = collectComponents();
  const fingerprint = btoa(JSON.stringify(components));
  const fingerprintHash = await hashComponents(components);

  // Cache it
  await cacheFingerprint(fingerprint, fingerprintHash);

  return { fingerprint, fingerprintHash };
}

/**
 * Returns just the fingerprint hash (used for quick license checks).
 */
export async function getFingerprintHash(): Promise<string | null> {
  const cached = await getCachedFingerprint();
  if (cached) {return cached.fingerprintHash;}

  const { fingerprintHash } = await getDeviceFingerprint();
  return fingerprintHash;
}

/**
 * Clears the cached fingerprint (e.g., after hardware change).
 */
export async function clearFingerprintCache(): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.remove([CACHE_KEY, HASH_CACHE_KEY]);
  }
}

// ── Component Collection ──

function collectComponents(): FingerprintComponents {
  const screenInfo = typeof screen !== 'undefined'
    ? `${screen.width}x${screen.height}x${screen.colorDepth}`
    : 'unknown';
  const language = typeof navigator !== 'undefined' ? navigator.language : 'unknown';
  const timezone = new Date().getTimezoneOffset();
  const hardwareConcurrency = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 1) : 1;
  const deviceMemory = typeof navigator !== 'undefined'
    ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory
    : undefined;
  const platform = typeof navigator !== 'undefined' ? navigator.platform : 'unknown';

  // Hash the user agent to avoid storing raw UA strings
  const userAgent = typeof navigator !== 'undefined'
    ? hashString(navigator.userAgent)
    : 'unknown';

  // Canvas fingerprint (stable across sessions on same hardware)
  // Not available in service worker context
  const canvas = typeof document !== 'undefined' ? getCanvasFingerprint() : '';

  return {
    userAgent,
    screen: screenInfo,
    language,
    timezone,
    hardwareConcurrency,
    deviceMemory,
    platform,
    canvas,
  };
}

// ── Hashing ──

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

function getCanvasFingerprint(): string {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext('2d');
    if (!ctx) {return '';}

    // Draw a standard pattern
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillStyle = '#f60';
    ctx.fillRect(0, 0, 200, 50);
    ctx.fillStyle = '#069';
    ctx.fillText('SF30 V2.0 🎯', 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('Shift Grabber', 4, 35);

    // Hash the canvas data URL
    return hashString(canvas.toDataURL());
  } catch {
    return '';
  }
}

async function hashComponents(components: FingerprintComponents): Promise<string> {
  const sorted = Object.keys(components)
    .sort()
    .map((k) => `${k}:${String((components as unknown as Record<string, unknown>)[k])}`)
    .join('|');
  return computeHash(sorted);
}

// ── Caching ──

interface CachedFingerprint {
  readonly fingerprint: string;
  readonly fingerprintHash: string;
  readonly timestamp: number;
}

async function getCachedFingerprint(): Promise<{
  fingerprint: string;
  fingerprintHash: string;
} | null> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return null;
  }

  try {
    const result = await chrome.storage.local.get([CACHE_KEY, HASH_CACHE_KEY]);
    const cached = result[CACHE_KEY] as CachedFingerprint | undefined;

    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return {
        fingerprint: cached.fingerprint,
        fingerprintHash: cached.fingerprintHash,
      };
    }
  } catch {
    // Ignore cache errors
  }

  return null;
}

async function cacheFingerprint(
  fingerprint: string,
  fingerprintHash: string
): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return;
  }

  const cache: CachedFingerprint = {
    fingerprint,
    fingerprintHash,
    timestamp: Date.now(),
  };

  try {
    await chrome.storage.local.set({
      [CACHE_KEY]: cache,
      [HASH_CACHE_KEY]: fingerprintHash,
    });
  } catch {
    // Ignore cache errors
  }
}
