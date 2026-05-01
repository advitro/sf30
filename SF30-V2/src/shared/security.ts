/**
 * Security utilities — sender validation, integrity checks, install secrets,
 * and trust boundaries.
 *
 * All cross-context messages MUST pass through validateMessageSender()
 * before being processed.
 */

import { computeHash } from './crypto';

// ── Sender Validation ──

/**
 * Validates that a message sender is trusted.
 *
 * In MV3, trusted senders are:
 * 1. Messages from our own extension (sender.id === chrome.runtime.id)
 * 2. Messages from chrome-extension:// URLs within our extension
 * 3. Messages from content scripts injected by our extension
 *
 * All external origins, web pages, and other extensions are rejected.
 */
export function validateMessageSender(sender: chrome.runtime.MessageSender): boolean {
  if (!sender) {
    return false;
  }

  // Check 1: Sender has our extension ID
  if (sender.id && sender.id === chrome.runtime.id) {
    return true;
  }

  // Check 2: Sender URL is within our extension
  const extensionUrl = `chrome-extension://${chrome.runtime.id}/`;
  if (sender.url && sender.url.startsWith(extensionUrl)) {
    return true;
  }

  // Check 3: Sender is a content script (null id, but from a tab we control)
  // We verify the tab URL is in our allowed host list
  const tabUrl = sender.tab?.url;
  if (tabUrl) {
    const allowedHosts = [
      'https://atoz.amazon.work/',
      'https://atoz-apps.amazon.work/',
    ];
    const isAllowedHost = allowedHosts.some((host) => tabUrl.startsWith(host));
    if (isAllowedHost) {
      return true;
    }
  }

  // Reject everything else
  return false;
}

/**
 * Validates message structure — ensures required fields are present
 * and payload types are correct.
 */
export function validateMessageStructure(
  message: unknown
): { readonly valid: boolean; readonly error?: string } {
  if (!message || typeof message !== 'object') {
    return { valid: false, error: 'message-not-object' };
  }

  const msg = message as Record<string, unknown>;

  if (!msg.type || typeof msg.type !== 'string') {
    return { valid: false, error: 'missing-or-invalid-type' };
  }

  // Type must be a known message type (prevent injection of arbitrary types)
  const knownTypePrefix = 'SG_V2_';
  if (!msg.type.startsWith(knownTypePrefix)) {
    return { valid: false, error: 'unknown-message-type' };
  }

  return { valid: true };
}

// ── Install Secret Management ──

const INSTALL_SECRET_KEY = 'sg_v2_install_secret';

/**
 * Generates or retrieves the per-install secret used for:
 * - Inter-context message validation (postMessage bridge)
 * - Credential encryption passphrase component
 *
 * This secret is generated once at install time and never changes.
 * It is NOT the same as the build-time MSG_SECRET (which was a V1 vulnerability).
 */
export async function getInstallSecret(): Promise<string | null> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return null;
  }

  try {
    const result = await chrome.storage.local.get(INSTALL_SECRET_KEY);
    return result[INSTALL_SECRET_KEY] as string | undefined ?? null;
  } catch (e) {
    console.error('[Security] Failed to get install secret:', e);
    return null;
  }
}

/**
 * Generates a new per-install secret.
 * Called once during chrome.runtime.onInstalled.
 */
export async function generateInstallSecret(): Promise<string> {
  const secret = crypto.randomUUID();

  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.set({ [INSTALL_SECRET_KEY]: secret });
  }

  return secret;
}

/**
 * Validates a postMessage payload using the install secret.
 * Prevents cross-extension and page-script spoofing.
 */
export async function validatePostMessage(payload: unknown): Promise<boolean> {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const msg = payload as Record<string, unknown>;
  const receivedSecret = msg.secret;

  if (typeof receivedSecret !== 'string') {
    return false;
  }

  const installSecret = await getInstallSecret();
  if (!installSecret) {
    // If no install secret exists (shouldn't happen), reject
    return false;
  }

  // Constant-time comparison to prevent timing attacks
  return constantTimeCompare(receivedSecret, installSecret);
}

// ── Integrity Checks ──

/**
 * Computes SHA-256 hash of a string.
 */
export async function computeStringHash(data: string): Promise<string> {
  return computeHash(data);
}

/**
 * Verifies script integrity by comparing computed hash against expected hash.
 *
 * @param scriptContent — actual script content (e.g., from fetch or self-reading)
 * @param expectedHash — SHA-256 hex string from build-time computation
 */
export async function verifyScriptIntegrity(
  scriptContent: string,
  expectedHash: string
): Promise<boolean> {
  const actualHash = await computeHash(scriptContent);
  return constantTimeCompare(actualHash, expectedHash);
}

/**
 * Reads the current service worker source and verifies its integrity.
 *
 * In production, the expected hash is embedded at build time.
 * If the hash doesn't match, the extension may have been tampered with.
 */
export async function verifyServiceWorkerIntegrity(expectedHash: string): Promise<boolean> {
  try {
    // In a service worker, we can read our own URL
    const response = await fetch(chrome.runtime.getURL('src/background/index.js'));
    const content = await response.text();
    return verifyScriptIntegrity(content, expectedHash);
  } catch (e) {
    console.error('[Security] Integrity check failed:', e);
    return false;
  }
}

// ── Token Generation ──

/**
 * Generates a cryptographically secure random hex string.
 */
export function generateSecureToken(length = 32): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ── Constant-Time Comparison ──

/**
 * Constant-time comparison of two strings to prevent timing attacks.
 *
 * DO NOT use === for comparing secrets, HMACs, or cryptographic values.
 */
export function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
