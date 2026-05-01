#!/usr/bin/env node
/**
 * SF30 / Shift Grabber — Dev Build Script
 *
 * Creates an un-obfuscated, debuggable extension in Deploy/extension/
 * for testing with a real Amazon account.
 *
 * Usage:
 *   cd Deploy
 *   node scripts/dev-build.js
 *
 * Differences from production build.js:
 *   - No obfuscation (debuggable in Chrome DevTools)
 *   - No SG_HMAC_KEY required
 *   - No keys/public.jwk.json required
 *   - License validation auto-passes (dev bypass)
 *   - Randomized message secret for inter-script communication
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SRC_DIR = path.resolve(__dirname, '..');
const EXT_DIR = path.resolve(__dirname, '..', 'extension');

const CONTACT_URL = 'https://t.me/shift_grabber';
const MSG_SECRET = 'dev_' + crypto.randomBytes(16).toString('hex');

// Items that make up the extension package
const EXT_ITEMS = [
  'manifest.json',
  'background',
  'popup',
  'src',
  'icons',
  'sounds',
  'config'
];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function processJsFile(src, dest) {
  ensureDir(path.dirname(dest));
  let code = fs.readFileSync(src, 'utf-8');

  // Replace contact URL placeholder
  code = code.split('__SG_CONTACT_URL__').join(CONTACT_URL);

  // Replace message secret placeholder
  code = code.split('"__SG_MSG_SECRET__"').join('"' + MSG_SECRET + '"');

  // Replace license public key placeholder with null (triggers dev bypass)
  code = code.split('"__SG_LICENSE_PUBLIC_KEY__"').join('null');

  // Dev mode license bypass — auto-validates when no public key is present
  if (src.includes('license-validator')) {
    code = code.replace(
      'async function validateLicense(rawKey, deviceFp) {',
      `async function validateLicense(rawKey, deviceFp) {
    // Dev mode bypass — remove for production builds
    if (!PUBLIC_KEY_JWK) {
      return { ok: true, tier: "pro", cid: "dev", exp: 9999999999 };
    }`
    );
  }

  // Dev mode: auto-populate dummy license key on install so popup never prompts
  if (src.includes('service-worker')) {
    code = code.replace(
      'chrome.runtime.onInstalled.addListener(async () => {',
      `chrome.runtime.onInstalled.addListener(async () => {
  // Dev mode: auto-populate dummy license key
  const devKey = "DEV-TEST-KEY-0000-0000-0000-0000";
  const hasKey = await new Promise(r => chrome.storage.local.get({ [K.USER_KEY]: "" }, r));
  if (!hasKey[K.USER_KEY]) {
    await new Promise(r => chrome.storage.local.set({ [K.USER_KEY]: devKey }, r));
    console.log("[SG SW] Dev mode: auto-populated dummy license key");
  }`
    );
    // Dev mode: remove deviceId requirement from verifyLicense (it's empty on first run)
    code = code.replace(
      'if (!key || !deviceId) {return { ok: false, reason: "no-key" };}',
      'if (!key) {return { ok: false, reason: "no-key" };}'
    );
  }

  // Dev mode: popup auto-sets dummy key on open (onInstalled doesn't fire on reload)
  if (src.includes('popup') && src.includes('popup.js')) {
    code = code.replace(
      '  // Prefill license input\n  els.licenseInput.value = key;',
      `  // Dev mode: auto-populate dummy license key if none exists\n  if (!key) {\n    key = "DEV-TEST-KEY-0000-0000-0000-0000";\n    await setStore({ [KEYS.USER_KEY]: key });\n    console.log("[SG Popup] Dev mode: auto-populated dummy license key");\n  }\n\n  // Prefill license input\n  els.licenseInput.value = key;`
    );
  }

  fs.writeFileSync(dest, code, 'utf-8');
}

function walkDir(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    ensureDir(dest);
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      copyRecursive(path.join(src, entry.name), path.join(dest, entry.name));
    }
  } else {
    copyFile(src, dest);
  }
}

// ── Build ──

console.log('🏗️  Shift Grabber — Dev Build (Debug / Test Ready)\n');

// Clean old extension dir
if (fs.existsSync(EXT_DIR)) {
  fs.rmSync(EXT_DIR, { recursive: true });
  console.log('🗑️  Cleaned old Deploy/extension/');
}
ensureDir(EXT_DIR);

for (const item of EXT_ITEMS) {
  const src = path.join(SRC_DIR, item);
  const dest = path.join(EXT_DIR, item);

  if (!fs.existsSync(src)) {
    console.warn('⚠️  Not found:', src);
    continue;
  }

  const stat = fs.statSync(src);

  if (stat.isDirectory()) {
    const files = walkDir(src);
    for (const file of files) {
      const relPath = path.relative(src, file);
      const destPath = path.join(dest, relPath);
      if (file.endsWith('.js')) {
        processJsFile(file, destPath);
      } else {
        copyFile(file, destPath);
      }
    }
    console.log('📁 Copied:', item, `(${files.length} files)`);
  } else {
    // Single file (manifest.json)
    copyFile(src, dest);
    console.log('📄 Copied:', item);
  }
}

console.log('\n✅ Dev build complete:', EXT_DIR);
console.log('🔓 License validation: DEV BYPASS (auto-pass)');
console.log('🎨 Obfuscation: NONE (debuggable)');
console.log('');
console.log('Next steps:');
console.log('  1. Open Chrome → chrome://extensions/');
console.log('  2. Enable "Developer mode" (toggle top-right)');
console.log('  3. Click "Load unpacked"');
console.log('  4. Select this folder:', EXT_DIR);
console.log('');
