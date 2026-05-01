#!/usr/bin/env node
/**
 * SF30 License Signer — Offline License Key Generator
 *
 * Signs a license payload with your private key to create a self-validating
 * license key. The extension verifies this key locally using the embedded
 * public key — no server required.
 *
 * Usage:
 *   node sign-license.js --fingerprint <hash> --tier <basic|pro> --days <n>
 *   node sign-license.js -f <hash> -t pro -d 30
 *
 * The output license key has the format:
 *   sf30.<base64url-payload>.<base64url-signature>
 *
 * The payload is JSON: {"fp":"<fingerprint>","t":"<tier>","e":<expiry-epoch>,"n":"<nonce>"}
 */

import { readFileSync, existsSync } from 'fs';
import { createPrivateKey, sign, randomBytes } from 'crypto';

// ── Argument Parsing ──

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { fingerprint: '', tier: 'basic', days: 30 };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    if (arg === '--fingerprint' || arg === '-f') { result.fingerprint = next; i++; }
    else if (arg === '--tier' || arg === '-t') { result.tier = next; i++; }
    else if (arg === '--days' || arg === '-d') { result.days = parseInt(next, 10); i++; }
    else if (arg === '--help' || arg === '-h') { result.help = true; }
  }

  return result;
}

function printHelp() {
  console.log(`
SF30 License Signer — Create self-validating license keys

Usage:
  node sign-license.js --fingerprint <hash> [--tier <basic|pro>] [--days <n>]

Options:
  -f, --fingerprint   Customer's device fingerprint hash (64-char hex, required)
  -t, --tier          License tier: basic or pro (default: basic)
  -d, --days          Validity in days from now (default: 30)
  -h, --help          Show this help

Example:
  node sign-license.js -f a1b2c3d4...e5f6 -t pro -d 90

Prerequisites:
  private.pem must exist in this directory (run generate-keypair.js first)
`);
}

// ── Helpers ──

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function generateNonce() {
  return randomBytes(6).toString('base64url');
}

// ── Main ──

function main() {
  const args = parseArgs();

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.fingerprint) {
    console.error('Error: --fingerprint is required');
    printHelp();
    process.exit(1);
  }

  if (!existsSync('private.pem')) {
    console.error('Error: private.pem not found. Run generate-keypair.js first.');
    process.exit(1);
  }

  // Load private key
  const privatePem = readFileSync('private.pem', 'utf-8');
  const privateKey = createPrivateKey(privatePem);

  // Build payload
  const payload = {
    fp: args.fingerprint,
    t: args.tier,
    e: nowSeconds() + args.days * 24 * 3600,
    n: generateNonce(),
  };

  const payloadJson = JSON.stringify(payload);
  const payloadB64 = Buffer.from(payloadJson).toString('base64url');

  // Sign with ECDSA P-256 + SHA-256
  const signature = sign('sha256', Buffer.from(payloadJson), privateKey);
  const sigB64 = signature.toString('base64url');

  // License key format: sf30.<payload>.<signature>
  const licenseKey = `sf30.${payloadB64}.${sigB64}`;
  const expiresDate = new Date(payload.e * 1000).toISOString().split('T')[0];

  console.log('');
  console.log('✅ License key signed');
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Tier:              ', args.tier);
  console.log('Fingerprint:       ', args.fingerprint);
  console.log('Expires:           ', expiresDate, `(${args.days} days)`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('📋 Send this LICENSE KEY to your customer:');
  console.log('');
  console.log(licenseKey);
  console.log('');
  console.log(`(Length: ${licenseKey.length} characters)`);
  console.log('');
}

main();
