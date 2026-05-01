#!/usr/bin/env node
/**
 * SF30 License Verifier — Seller QA Tool
 *
 * Verify a license key BEFORE sending it to a customer.
 * Uses your public.pem to cryptographically validate the signature.
 *
 * Usage:
 *   node verify-license.js --key "sf30.xxx.yyy" --fingerprint <hash>
 *   node verify-license.js -k "sf30.xxx.yyy" -f <hash>
 */

import { readFileSync, existsSync } from 'fs';
import { createPublicKey, verify } from 'crypto';

// ── Argument Parsing ──

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { key: '', fingerprint: '' };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    if (arg === '--key' || arg === '-k') { result.key = next; i++; }
    else if (arg === '--fingerprint' || arg === '-f') { result.fingerprint = next; i++; }
    else if (arg === '--help' || arg === '-h') { result.help = true; }
  }

  return result;
}

function printHelp() {
  console.log(`
SF30 License Verifier — Check a key before sending to customer

Usage:
  node verify-license.js --key <license-key> --fingerprint <hash>

Options:
  -k, --key           The license key to verify (required)
  -f, --fingerprint   Expected device fingerprint hash (required)
  -h, --help          Show this help

Example:
  node verify-license.js -k "sf30.eyJmcCI6..." -f a1b2c3d4e5f6...

Prerequisites:
  public.pem must exist in this directory (run generate-keypair.js first)
`);
}

// ── Helpers ──

function b64urlDecode(str) {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padding = (4 - (base64.length % 4)) % 4;
  return Buffer.from(base64 + '='.repeat(padding), 'base64');
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

// ── Main ──

function main() {
  const args = parseArgs();

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.key) {
    console.error('Error: --key is required');
    printHelp();
    process.exit(1);
  }

  if (!args.fingerprint) {
    console.error('Error: --fingerprint is required');
    printHelp();
    process.exit(1);
  }

  if (!existsSync('public.pem')) {
    console.error('Error: public.pem not found. Run generate-keypair.js first.');
    process.exit(1);
  }

  // Parse key format: sf30.<payload>.<signature>
  const parts = args.key.split('.');
  if (parts.length !== 3 || parts[0] !== 'sf30') {
    console.error('❌ Invalid license key format');
    process.exit(1);
  }

  let payloadJson;
  try {
    payloadJson = b64urlDecode(parts[1]).toString('utf-8');
  } catch {
    console.error('❌ Malformed license payload');
    process.exit(1);
  }

  let payload;
  try {
    payload = JSON.parse(payloadJson);
  } catch {
    console.error('❌ Invalid license payload JSON');
    process.exit(1);
  }

  // Load public key
  const publicPem = readFileSync('public.pem', 'utf-8');
  const publicKey = createPublicKey(publicPem);

  // Verify ECDSA P-256 signature
  const signature = b64urlDecode(parts[2]);
  const valid = verify('sha256', Buffer.from(payloadJson), publicKey, signature);

  if (!valid) {
    console.error('❌ SIGNATURE INVALID — key is corrupt or forged');
    process.exit(1);
  }

  // Validate payload fields
  const checks = [];
  let allPass = true;

  if (payload.fp === args.fingerprint) {
    checks.push('✅ Fingerprint matches');
  } else {
    checks.push('❌ Fingerprint MISMATCH');
    allPass = false;
  }

  if (payload.t === 'basic' || payload.t === 'pro') {
    checks.push(`✅ Tier valid: ${payload.t}`);
  } else {
    checks.push('❌ Invalid tier');
    allPass = false;
  }

  const now = nowSeconds();
  if (typeof payload.e === 'number' && payload.e > now) {
    const daysLeft = Math.floor((payload.e - now) / 86400);
    checks.push(`✅ Expiry valid: ${new Date(payload.e * 1000).toISOString().split('T')[0]} (${daysLeft} days left)`);
  } else if (typeof payload.e === 'number') {
    checks.push('❌ License EXPIRED');
    allPass = false;
  } else {
    checks.push('❌ Invalid expiry');
    allPass = false;
  }

  console.log('');
  console.log(allPass ? '🟢 KEY IS VALID — safe to send to customer' : '🔴 KEY HAS PROBLEMS — do NOT send');
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  checks.forEach(c => console.log(c));
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  process.exit(allPass ? 0 : 1);
}

main();
