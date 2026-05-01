#!/usr/bin/env node
// SF30 V2.0 — Post-Build Validation Script
// Run after `node build.js` to verify the dist/ is production-ready.
// Usage: node scripts/validate-build.js

const fs = require("fs");
const path = require("path");

const DIST_DIR = path.resolve(__dirname, "../dist");
const PKG_PATH = path.resolve(__dirname, "../package.json");
const EXIT_OK = 0;
const EXIT_FAIL = 1;

// Read expected version from package.json — single source of truth
let EXPECTED_VERSION = "0.0.0";
let EXPECTED_NAME = "";
try {
  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, "utf-8"));
  EXPECTED_VERSION = pkg.version || "0.0.0";
  // Derive expected manifest name from package version: "SF30 V2.0" for 2.0.x
  const vMajor = EXPECTED_VERSION.split(".")[0];
  const vMinor = EXPECTED_VERSION.split(".")[1] || "0";
  EXPECTED_NAME = `SF30 V${vMajor}.${vMinor}`;
} catch (e) {
  console.error("⚠️  Could not read package.json:", e.message);
}

let errors = 0;
let warnings = 0;

function pass(msg) { console.log("  ✅", msg); }
function fail(msg) { console.error("  ❌", msg); errors++; }
function warn(msg) { console.warn("  ⚠️ ", msg); warnings++; }

function readFile(rel) {
  const p = path.join(DIST_DIR, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf-8");
}

function fileExists(rel) {
  return fs.existsSync(path.join(DIST_DIR, rel));
}

console.log(`\n🏗️  SF30 V${EXPECTED_VERSION} Post-Build Validation\n`);

// ── 1. manifest.json ──
console.log("📋 manifest.json");
const manifestRaw = readFile("manifest.json");
if (!manifestRaw) { fail("manifest.json missing"); process.exit(EXIT_FAIL); }

let manifest;
try {
  manifest = JSON.parse(manifestRaw);
  pass("Valid JSON");
} catch (e) {
  fail("Invalid JSON: " + e.message);
  process.exit(EXIT_FAIL);
}

if (manifest.name === EXPECTED_NAME) pass("Name: " + EXPECTED_NAME);
else fail(`Name mismatch — manifest: "${manifest.name}", expected: "${EXPECTED_NAME}"`);

if (manifest.version === EXPECTED_VERSION) pass("Version: " + EXPECTED_VERSION);
else fail(`Version mismatch — manifest: "${manifest.version}", expected: "${EXPECTED_VERSION}"`);

// Check for placeholders
const placeholders = manifestRaw.match(/__SG_[A-Z_]+__/g);
if (placeholders) {
  fail("Unresolved placeholders in manifest: " + placeholders.join(", "));
} else {
  pass("No unresolved placeholders");
}

// CSP check — should NOT contain server domain
if (manifestRaw.includes("shiftgrabber.net")) {
  fail("CSP still contains server domain (shiftgrabber.net)");
} else {
  pass("CSP is server-free");
}

// ── 2. Required files ──
console.log("\n📁 Required Files");
const requiredFiles = [
  "manifest.json",
  "background/service-worker.js",
  "src/content/main.js",
  "src/content/api-layer.js",
  "popup/popup.js",
  "popup/index.html",
  "popup/styles.css",
  "src/shared/constants.js",
  "src/shared/crypto.js",
  "src/shared/fingerprint.js",
  "src/shared/circuit-breaker.js",
  "src/shared/license-validator.js",
  "icons/icon16.png",
  "icons/icon48.png",
  "icons/icon128.png",
  "sounds/click.mp3"
];

for (const f of requiredFiles) {
  if (fileExists(f)) pass(f);
  else fail("Missing: " + f);
}

// ── 3. license-validator.js checks ──
console.log("\n🔐 license-validator.js");
const lvRaw = readFile("src/shared/license-validator.js");
if (lvRaw) {
  if (lvRaw.includes("__SG_LICENSE_PUBLIC_KEY__")) {
    fail("Public key placeholder still present (not injected at build time)");
  } else if (lvRaw.includes('"kty"') || lvRaw.includes('"n"')) {
    pass("Public key appears embedded (JWK format detected)");
  } else {
    warn("Cannot verify public key embedding — inspect manually");
  }

  // Check for clock tamper protection (string may be obfuscated/fragmented)
  if (lvRaw.includes("clock-tamper") || lvRaw.includes("tamper") || lvRaw.includes("sg_max_seen_time")) pass("Clock tamper protection present");
  else warn("Clock tamper protection missing (may be obfuscated)");

  // Check for device binding (string may be obfuscated/fragmented)
  if (lvRaw.includes("device-limit") || lvRaw.includes("sg_bound_fp") || lvRaw.includes("limit-exceeded")) pass("Device binding present");
  else warn("Device binding missing (may be obfuscated)");

  if (lvRaw.includes("console.error")) warn("Contains console.error — acceptable for debugging");
} else {
  fail("license-validator.js not found in dist");
}

// ── 4. Service worker checks ──
console.log("\n⚙️  Service Worker");
const swRaw = readFile("background/service-worker.js");
if (swRaw) {
  const swSizeKB = Math.round(Buffer.byteLength(swRaw, "utf-8") / 1024);
  if (swSizeKB < 1024) pass(`Size: ${swSizeKB}KB (< 1MB MV3 limit)`);
  else fail(`Size: ${swSizeKB}KB (exceeds 1MB MV3 limit!)`);

  // HMAC key placeholder must be resolved by build.js (any __SG_*__ format)
  const hmacPlaceholders = swRaw.match(/__SG_HMAC_KEY[A-Z_]*__/g);
  if (hmacPlaceholders) {
    fail("HMAC placeholder still present in service worker: " + hmacPlaceholders.join(", "));
  } else {
    pass("HMAC placeholder resolved");
  }

  // Check for dead server references that should not exist
  const deadRefs = ["loadEncryptedToken", "fetchServerConfig", "SERVER_URL"];
  for (const ref of deadRefs) {
    if (swRaw.includes(ref)) warn(`Dead server reference found: ${ref}`);
  }

  if (swRaw.includes("SG_LICENSE") || swRaw.includes("validate")) pass("Uses offline license validator");
  else warn("Does not reference SG_LICENSE.validate (may be obfuscated)");
} else {
  fail("service-worker.js not found in dist");
}

// ── 5. popup.js checks ──
console.log("\n🎛️  Popup");
const popupRaw = readFile("popup/popup.js");
if (popupRaw) {
  if (popupRaw.includes("__SG_CONTACT_URL__")) {
    fail("Contact URL placeholder still present in popup");
  } else {
    pass("Contact URL placeholder resolved");
  }

  if (popupRaw.includes("sg_license_exp") || popupRaw.includes("license_exp")) pass("Uses sg_license_exp (offline model)");
  else warn("May still use legacy TOKEN_EXP — verify");
} else {
  fail("popup.js not found in dist");
}

// ── 6. Obfuscation checks ──
console.log("\n🔒 Obfuscation Quality");
const obfFiles = ["background/service-worker.js", "popup/popup.js", "src/content/main.js"];
for (const f of obfFiles) {
  const raw = readFile(f);
  if (!raw) { fail("Missing: " + f); continue; }

  // Check for high entropy (indicates obfuscation)
  const hasHighEntropy = raw.length > 5000 && /_[a-zA-Z0-9]{6,}/.test(raw);
  if (hasHighEntropy) pass(`${path.basename(f)} appears obfuscated`);
  else warn(`${path.basename(f)} may not be sufficiently obfuscated`);

  // No raw console.log (should be mangled or removed)
  const rawLogs = (raw.match(/console\.log\s*\(/g) || []).length;
  if (rawLogs === 0) pass(`${path.basename(f)}: no raw console.log`);
  else warn(`${path.basename(f)}: ${rawLogs} raw console.log statements`);
}

// ── 7. Private key leak check ──
console.log("\n🛡️  Security Leak Check");
const allJsFiles = [];
function collectJs(dir, base) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collectJs(p, base);
    else if (e.name.endsWith(".js")) allJsFiles.push(p);
  }
}
if (fs.existsSync(DIST_DIR)) collectJs(DIST_DIR, DIST_DIR);

let leakedPrivateKey = false;
const PRIVATE_KEY_PATH = path.join(__dirname, "../keys/private.key");
if (fs.existsSync(PRIVATE_KEY_PATH)) {
  const privateKeyContent = fs.readFileSync(PRIVATE_KEY_PATH, "utf-8");
  // Extract a unique chunk to search for
  const keyChunk = privateKeyContent.replace(/-----.*?-----/g, "").replace(/\s/g, "").slice(0, 100);
  if (keyChunk.length > 50) {
    for (const f of allJsFiles) {
      const content = fs.readFileSync(f, "utf-8");
      if (content.includes(keyChunk)) {
        fail("PRIVATE KEY LEAKED in " + path.relative(DIST_DIR, f));
        leakedPrivateKey = true;
      }
    }
    if (!leakedPrivateKey) pass("Private key not found in any built file");
  }
} else {
  warn("keys/private.key not found — cannot check for leaks");
}

// ── 8. Integrity manifest ──
console.log("\n🔐 Bundle Integrity");
const integrityPath = "src/shared/integrity.json";
if (fileExists(integrityPath)) {
  pass("integrity.json present");
  try {
    const block = JSON.parse(readFile(integrityPath));
    if (block && block.manifest && block.signature) {
      const fileCount = Object.keys(block.manifest).length;
      pass(`integrity.json well-formed (${fileCount} files hashed, signed)`);
      if (fileCount < 4) warn(`Only ${fileCount} files in manifest — expected at least 4 critical files`);
    } else {
      fail("integrity.json missing manifest or signature field");
    }
  } catch (e) {
    fail("integrity.json is not valid JSON: " + e.message);
  }
} else {
  fail("integrity.json missing — runtime tamper detection will be disabled");
}

// ── Summary ──
console.log("\n" + "=".repeat(50));
if (errors === 0 && warnings === 0) {
  console.log("✅ ALL CHECKS PASSED — Build is production-ready.");
  process.exit(EXIT_OK);
} else if (errors === 0) {
  console.log(`⚠️  PASSED with ${warnings} warning(s) — review before shipping.`);
  process.exit(EXIT_OK);
} else {
  console.log(`❌ FAILED: ${errors} error(s), ${warnings} warning(s). Fix before shipping.`);
  process.exit(EXIT_FAIL);
}
