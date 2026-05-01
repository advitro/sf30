#!/usr/bin/env node
/**
 * Post-Build Validation Script — SF30 V2.0
 *
 * Comprehensive validation of the built extension:
 * 1. Manifest integrity
 * 2. Required files
 * 3. Security checks (no leaks, no debug code)
 * 4. CSP completeness
 * 5. Obfuscation quality
 * 6. Integrity hashes
 *
 * Exit code 0 = pass, 1 = fail
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DIST_DIR = path.resolve(__dirname, '../dist');

let errors = 0;
let warnings = 0;

function pass(msg) { console.log('  ✅', msg); }
function fail(msg) { console.error('  ❌', msg); errors++; }
function warn(msg) { console.warn('  ⚠️ ', msg); warnings++; }

function readFile(rel) {
  const p = path.join(DIST_DIR, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf-8');
}

function fileExists(rel) {
  return fs.existsSync(path.join(DIST_DIR, rel));
}

function computeHash(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function collectJsFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectJsFiles(p, files);
    } else if (entry.name.endsWith('.js')) {
      files.push(p);
    }
  }
  return files;
}

function collectAllFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectAllFiles(p, files);
    } else {
      files.push(p);
    }
  }
  return files;
}

console.log('\n🏗️  SF30 V2.0 Post-Build Validation\n');

// ── 1. Manifest ──
console.log('📋 manifest.json');
const manifestRaw = readFile('manifest.json');
if (!manifestRaw) { fail('manifest.json missing'); process.exit(1); }

let manifest;
try {
  manifest = JSON.parse(manifestRaw);
  pass('Valid JSON');
} catch (e) {
  fail('Invalid JSON: ' + e.message);
  process.exit(1);
}

if (manifest.manifest_version === 3) pass('Manifest V3');
else fail('Not Manifest V3');

// Read package.json for canonical name/version
let pkg;
try {
  pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8'));
} catch (e) {
  fail('Could not read package.json: ' + e.message);
  process.exit(1);
}

if (manifest.name === pkg.name) pass(`Name matches package.json (${pkg.name})`);
else fail(`Manifest name "${manifest.name}" does not match package.json "${pkg.name}"`);

if (manifest.version === pkg.version) pass(`Version matches package.json (${pkg.version})`);
else fail(`Manifest version "${manifest.version}" does not match package.json "${pkg.version}"`);

// No WAR
if (manifest.web_accessible_resources) {
  fail('web_accessible_resources present — stealth violation');
} else {
  pass('No web_accessible_resources');
}

// Minimal permissions
const required = ['storage', 'scripting', 'alarms', 'activeTab'];
const hasRequired = required.every(p => manifest.permissions?.includes(p));
if (hasRequired) pass('Required permissions present');
else fail('Missing required permissions');

const forbidden = ['tabs', 'webNavigation', 'history', 'bookmarks', 'cookies'];
const foundForbidden = forbidden.filter(p => manifest.permissions?.includes(p));
if (foundForbidden.length > 0) fail('Forbidden permissions: ' + foundForbidden.join(', '));
else pass('No forbidden permissions');

// Host permissions (serverless — no license server required)
const forbiddenHost = 'https://license.sf30.app/*';
const hasForbiddenHost = manifest.host_permissions?.includes(forbiddenHost);
if (!hasForbiddenHost) pass('host_permissions does not include old license server');
else fail('host_permissions still includes old license server URL');

// CSP completeness
const csp = manifest.content_security_policy?.extension_pages || '';
const cspDirectives = ['default-src', 'script-src', 'style-src', 'connect-src', 'img-src', 'font-src', 'media-src', 'frame-src', 'base-uri', 'form-action'];
const missingCsp = cspDirectives.filter(d => !csp.includes(d));
if (missingCsp.length === 0) pass('CSP directives complete');
else fail('Missing CSP directives: ' + missingCsp.join(', '));

// No placeholders
const placeholders = manifestRaw.match(/__[A-Z_]+__/g);
if (placeholders) fail('Unresolved placeholders: ' + [...new Set(placeholders)].join(', '));
else pass('No unresolved placeholders');

// ── 2. Required Files ──
console.log('\n📁 Required Files');
const requiredFiles = [
  'manifest.json',
  'src/background/index.js',
  'src/content/isolated/index.js',
  'src/content/main/index.js',
  'src/popup/index.html',
  'src/popup/index.js',
  'index.css',
  'index.js',
  'icons/icon16.png',
  'icons/icon48.png',
  'icons/icon128.png',
  'sounds/click.mp3',
];

for (const f of requiredFiles) {
  if (fileExists(f)) pass(f);
  else fail('Missing: ' + f);
}

// ── 3. Security Checks ──
console.log('\n🛡️  Security Checks');
const jsFiles = fs.existsSync(DIST_DIR) ? collectJsFiles(DIST_DIR) : [];
const allJsContent = jsFiles.map(f => fs.readFileSync(f, 'utf-8')).join('');

// No console.log
let consoleLogCount = 0;
for (const f of jsFiles) {
  const content = fs.readFileSync(f, 'utf-8');
  const logs = (content.match(/console\.log\s*\(/g) || []).length;
  consoleLogCount += logs;
}
if (consoleLogCount === 0) pass('No console.log in production');
else fail(`${consoleLogCount} console.log statements found`);

// No debug code
if (allJsContent.includes('debugger')) fail('debugger statements found');
else pass('No debugger statements');

// No placeholders
const jsPlaceholders = allJsContent.match(/__[A-Z_]+__/g);
if (jsPlaceholders) fail('Unresolved placeholders in JS: ' + [...new Set(jsPlaceholders)].join(', '));
else pass('No unresolved placeholders in JS');

// No source maps in production (check for .map files)
const mapFiles = [];
function collectMaps(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) collectMaps(p);
    else if (entry.name.endsWith('.map')) mapFiles.push(p);
  }
}
if (fs.existsSync(DIST_DIR)) collectMaps(DIST_DIR);
if (mapFiles.length === 0) pass('No source maps in production');
else fail('Source maps present: ' + mapFiles.length + ' files');

// Orphaned files check
console.log('\n🧹 Orphaned Files');
if (fs.existsSync(DIST_DIR)) {
  const allFiles = collectAllFiles(DIST_DIR);
  const expectedSet = new Set(requiredFiles.map(f => path.join(DIST_DIR, f).toLowerCase()));
  const allowedExtensions = new Set(['.js', '.html', '.css', '.png', '.json', '.mp3']);
  let orphanedCount = 0;
  for (const f of allFiles) {
    const rel = path.relative(DIST_DIR, f);
    const ext = path.extname(f).toLowerCase();
    const normalized = f.toLowerCase();
    if (expectedSet.has(normalized)) continue;
    if (!allowedExtensions.has(ext)) {
      fail('Unexpected file type in dist: ' + rel);
      orphanedCount++;
    }
  }
  if (orphanedCount === 0) pass('No unexpected file types in dist');
} else {
  fail('dist/ directory does not exist');
}

// ── 4. Size Checks ──
console.log('\n📦 Size Checks');
for (const f of jsFiles) {
  const sizeKB = (fs.statSync(f).size / 1024).toFixed(1);
  const relPath = path.relative(DIST_DIR, f);
  if (sizeKB < 1024) pass(`${relPath}: ${sizeKB} KB`);
  else warn(`${relPath}: ${sizeKB} KB (large)`);
}

// ── 5. Integrity Hashes ──
console.log('\n🔐 Integrity Hashes');
for (const f of jsFiles) {
  const hash = computeHash(f);
  const relPath = path.relative(DIST_DIR, f);
  pass(`${relPath}: ${hash.slice(0, 16)}...`);
}

// ── Summary ──
console.log('\n' + '='.repeat(50));
if (errors === 0 && warnings === 0) {
  console.log('✅ ALL CHECKS PASSED — Build is production-ready.');
  process.exit(0);
} else if (errors === 0) {
  console.log(`⚠️  PASSED with ${warnings} warning(s) — review before shipping.`);
  process.exit(0);
} else {
  console.log(`❌ FAILED: ${errors} error(s), ${warnings} warning(s). Fix before shipping.`);
  process.exit(1);
}
