#!/usr/bin/env node
/**
 * SF30 License Keypair Generator
 *
 * Generates an ECDSA P-256 keypair for offline license signing.
 * Run this ONCE and keep private.pem secret.
 *
 * Usage:
 *   node generate-keypair.js
 *
 * Outputs:
 *   private.pem   — PKCS#8 private key (KEEP SECRET)
 *   public.pem    — SPKI public key (for reference)
 *   public.key    — Base64-encoded SPKI DER (for extension build)
 */

import { generateKeyPairSync } from 'crypto';
import { writeFileSync, existsSync } from 'fs';

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { force: false, help: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--force') { result.force = true; }
    else if (arg === '--help' || arg === '-h') { result.help = true; }
  }
  return result;
}

function printHelp() {
  console.log(`
SF30 License Keypair Generator

Generates an ECDSA P-256 keypair for offline license signing.
Run this ONCE and keep private.pem secret.

Usage:
  node generate-keypair.js
  node generate-keypair.js --force    # overwrite existing keys

Options:
  --force     Overwrite existing keypair (invalidates all existing licenses)
  -h, --help  Show this help

Outputs:
  private.pem   — PKCS#8 private key (KEEP SECRET)
  public.pem    — SPKI public key (for reference)
  public.key    — Base64-encoded SPKI DER (for extension build)
`);
}

function main() {
  const args = parseArgs();

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  // Safety check — don't overwrite existing keys unless --force
  if (existsSync('private.pem') && !args.force) {
    console.error('❌ private.pem already exists.');
    console.error('');
    console.error('   If you want to keep the existing keypair, skip this step.');
    console.error('   (Keypair generation is ONE-TIME. You only need to do it once.)');
    console.error('');
    console.error('   If you want to ROTATE keys (invalidates all existing licenses):');
    console.error('     node generate-keypair.js --force');
    process.exit(1);
  }

  const { privateKey, publicKey } = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1', // P-256 (aka secp256r1) — natively supported by Web Crypto
  });

  const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const publicPem = publicKey.export({ type: 'spki', format: 'pem' });
  const publicDer = publicKey.export({ type: 'spki', format: 'der' });
  const publicBase64 = publicDer.toString('base64');

  writeFileSync('private.pem', privatePem);
  writeFileSync('public.pem', publicPem);
  writeFileSync('public.key', publicBase64);

  console.log('');
  console.log('🔐 ECDSA P-256 keypair generated successfully');
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('private.pem  →  KEEP SECRET — used to sign licenses');
  console.log('public.pem   →  Reference only');
  console.log('public.key   →  Pass to extension build (base64 SPKI DER)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Store private.pem somewhere safe (not in git)');
  console.log('  2. Build the extension with the public key:');
  console.log('     set VITE_LICENSE_PUBLIC_KEY=<contents of public.key>');
  console.log('     npm run build');
  console.log('');
}

main();
