#!/usr/bin/env node
/**
 * Build Packaging Script — SF30 V2.0
 *
 * Creates a clean .zip distribution package from the dist/ directory.
 * Run after `npm run build`.
 *
 * Cross-platform: uses the `archiver` npm package (pure JS, no native deps).
 */

const fs = require('fs');
const path = require('path');
const { createWriteStream } = require('fs');
const archiver = require('archiver');

const DIST_DIR = path.resolve(__dirname, '../dist');
const OUTPUT_DIR = path.resolve(__dirname, '../Deploy');
const ZIP_NAME = 'SF30-V2.0.zip';

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function main() {
  if (!fs.existsSync(DIST_DIR)) {
    console.error('❌ dist/ directory not found. Run `npm run build` first.');
    process.exit(1);
  }

  ensureDir(OUTPUT_DIR);
  const zipPath = path.join(OUTPUT_DIR, ZIP_NAME);

  // Remove existing zip
  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }

  const output = createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  archive.on('warning', (err) => {
    if (err.code === 'ENOENT') {
      console.warn('Archiver warning:', err.message);
    } else {
      console.error('❌ Archiver error:', err.message);
      process.exit(1);
    }
  });

  archive.on('error', (err) => {
    console.error('❌ Archiver error:', err.message);
    process.exit(1);
  });

  archive.pipe(output);
  archive.directory(DIST_DIR, false);
  archive.finalize();

  await new Promise((resolve, reject) => {
    output.on('close', () => {
      const sizeKB = (fs.statSync(zipPath).size / 1024).toFixed(1);
      console.log(`\n✅ Created ${ZIP_NAME} (${sizeKB} KB)`);
      console.log(`📦 Location: ${zipPath}`);
      resolve();
    });
    output.on('error', reject);
  });
}

main().catch((e) => {
  console.error('❌ Failed to create zip:', e.message);
  process.exit(1);
});
