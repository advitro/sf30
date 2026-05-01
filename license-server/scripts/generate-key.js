#!/usr/bin/env node
/**
 * SF30 License Key Generator — Standalone (zero dependencies)
 *
 * Usage:
 *   node scripts/generate-key.js --fingerprint ABC123... --tier basic --days 30
 *   node scripts/generate-key.js -f ABC123... -t pro -d 90
 *
 * This script has NO dependencies. Just run it with Node.js.
 * It prints the license key + the SQL to insert it into your license server database.
 *
 * Copy the key and send it to your customer.
 * Run the SQL on your deployed license server (or save it for later).
 */

import crypto from 'crypto';

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

function generateKey() {
  const prefix = 'sf30';
  const segments = 4;
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
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

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function printHelp() {
  console.log(`
SF30 License Key Generator

Usage:
  node scripts/generate-key.js --fingerprint <hash> [--tier <basic|pro>] [--days <n>]

Options:
  -f, --fingerprint   Customer's fingerprint hash (required)
  -t, --tier          License tier: basic or pro (default: basic)
  -d, --days          Expiry in days from activation (default: 30)
  -h, --help          Show this help

Example:
  node scripts/generate-key.js -f a1b2c3d4e5f6 -t pro -d 90
`);
}

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

  const key = generateKey();
  const now = nowSeconds();
  const expiresAt = now + args.days * 24 * 3600;
  const expiresDate = new Date(expiresAt * 1000).toISOString().split('T')[0];

  console.log('\n✅ License key generated');
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Key:               ', key);
  console.log('Fingerprint:       ', args.fingerprint);
  console.log('Tier:              ', args.tier);
  console.log('Expires:           ', expiresDate);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('📋 Send this KEY to your customer:');
  console.log('   ', key);
  console.log('');
  console.log('🗄️  Run this SQL on your license server database:');
  console.log('');
  console.log(`INSERT INTO licenses (key, fingerprint_hash, tier, created_at, expires_at, revoked)`);
  console.log(`VALUES ('${key}', '${args.fingerprint}', '${args.tier}', ${now}, ${expiresAt}, 0);`);
  console.log('');
}

main();
