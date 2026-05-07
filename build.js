#!/usr/bin/env node
// Shift Grabber V9 — Production Build Pipeline
// Usage: npm install && node build.js
// Output: dist/ directory with obfuscated, production-ready extension

const fs = require("fs");
const path = require("path");

// Check if javascript-obfuscator is available
process.env.JAVASCRIPT_OBFUSCATOR_DISABLE_ADS = "true";
let JavaScriptObfuscator;
try {
  JavaScriptObfuscator = require("javascript-obfuscator");
} catch (e) {
  console.error("❌ javascript-obfuscator not installed.");
  console.error("   Run: npm install javascript-obfuscator");
  process.exit(1);
}

const SRC_DIR = path.resolve(__dirname);

// Files to obfuscate (relative to project root)
const OBFUSCATE_PATTERNS = [
  "background/service-worker.js",
  "src/content/main.js",
  "src/content/api-layer.js",
  "popup/popup.js",
  "src/shared/constants.js",
  "src/shared/crypto.js",
  "src/shared/fingerprint.js",
  "src/shared/circuit-breaker.js",
  "src/shared/license-validator.js"
];

// Files to copy as-is
const COPY_PATTERNS = [
  "manifest.json",
  "popup/index.html",
  "popup/styles.css",
  "icons/**",
  "sounds/**"
];

// Obfuscation settings — extreme protection
const OBF_CONFIG = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 1.0,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.4,
  debugProtection: true,
  debugProtectionInterval: 4000,
  disableConsoleOutput: false,
  identifierNamesGenerator: "mangled",
  log: false,
  numbersToExpressions: true,
  renameGlobals: false, // keep global names like window.SG_CONSTS
  rotateStringArray: true,
  selfDefending: true,
  shuffleStringArray: true,
  splitStrings: true,
  splitStringsChunkLength: 10,
  stringArray: true,
  stringArrayEncoding: ["rc4"],
  stringArrayThreshold: 0.75,
  transformObjectKeys: true,
  unicodeEscapeSequence: false
};

// Service-worker-safe obfuscation config — bundles all shared files + SW into one file.
// Aggressive features that inject `window` references or cause runtime crashes
// in Chrome MV3 service workers are disabled:
//   - selfDefending / debugProtection inject `window` fallbacks
//   - controlFlowFlattening + deadCodeInjection can cause runtime errors
//   - transformObjectKeys can break cross-file object interfaces
//   - splitStrings with stringArray disabled causes decoder issues
const OBF_CONFIG_SW = {
  compact: true,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  debugProtection: false,
  disableConsoleOutput: false,
  identifierNamesGenerator: "mangled",
  log: false,
  numbersToExpressions: true,
  renameGlobals: false,
  rotateStringArray: false,
  selfDefending: false,
  shuffleStringArray: false,
  splitStrings: false,
  stringArray: false,
  stringArrayThreshold: 0,
  transformObjectKeys: false,
  unicodeEscapeSequence: false
};

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
  console.log("📄 Copied:", path.relative(SRC_DIR, src));
}

function copyGlob(pattern, baseDir) {
  const parts = pattern.split("/");
  const recurse = (currentDir, remainingParts, targetDir) => {
    if (remainingParts.length === 0) return;
    const part = remainingParts[0];
    const rest = remainingParts.slice(1);

    if (part === "**") {
      // Recursive copy
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const srcPath = path.join(currentDir, entry.name);
        const destPath = path.join(targetDir, entry.name);
        if (entry.isDirectory()) {
          recurse(srcPath, rest, destPath);
        } else if (rest.length === 0) {
          copyFile(srcPath, destPath);
        }
      }
    } else if (part.includes("*")) {
      const regex = new RegExp("^" + part.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$");
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (regex.test(entry.name)) {
          const srcPath = path.join(currentDir, entry.name);
          const destPath = path.join(targetDir, entry.name);
          if (entry.isDirectory() && rest.length > 0) {
            recurse(srcPath, rest, destPath);
          } else {
            copyFile(srcPath, destPath);
          }
        }
      }
    } else {
      const srcPath = path.join(currentDir, part);
      const destPath = path.join(targetDir, part);
      if (rest.length === 0) {
        if (fs.existsSync(srcPath)) copyFile(srcPath, destPath);
      } else {
        recurse(srcPath, rest, destPath);
      }
    }
  };
  recurse(baseDir, parts, DIST_DIR);
}

function obfuscateFile(srcPath, destPath, customConfig) {
  ensureDir(path.dirname(destPath));
  const code = fs.readFileSync(srcPath, "utf-8");
  if (ENV_CONFIG.OBFUSCATE === false) {
    fs.writeFileSync(destPath, code, "utf-8");
    console.log("📄 Copied (debug):", path.relative(SRC_DIR, srcPath));
    return;
  }
  const config = customConfig || OBF_CONFIG;
  const result = JavaScriptObfuscator.obfuscate(code, config);
  fs.writeFileSync(destPath, result.getObfuscatedCode(), "utf-8");
  const originalSize = Buffer.byteLength(code, "utf-8");
  const obfuscatedSize = Buffer.byteLength(result.getObfuscatedCode(), "utf-8");
  console.log(
    "🔒 Obfuscated:",
    path.relative(SRC_DIR, srcPath),
    `(${Math.round(originalSize / 1024)}KB → ${Math.round(obfuscatedSize / 1024)}KB)`,
    config.stringArrayThreshold === 0 ? "[stringArray disabled for injection safety]" : ""
  );
}

// Multi-environment config injection
const ENV = process.env.SG_ENV || "production";
const ENV_CONFIG = require("./config/environments")[ENV];
if (!ENV_CONFIG) {
  console.error("❌ Unknown environment:", ENV);
  process.exit(1);
}
const DIST_DIR = path.resolve(__dirname, ENV_CONFIG.OBFUSCATE !== false ? "dist" : "dist-debug");

// HMAC key for Telegram credential encryption — must be provided
const hmacKey = process.env.SG_HMAC_KEY;
if (!hmacKey || hmacKey === "change-me-in-production") {
  console.error("❌ SG_HMAC_KEY environment variable is required. Aborting build.");
  process.exit(1);
}

// Load RSA public key for license validation
const PUBLIC_KEY_PATH = path.join(__dirname, "keys", "public.jwk.json");
let licensePublicKey = null;
if (fs.existsSync(PUBLIC_KEY_PATH)) {
  licensePublicKey = JSON.parse(fs.readFileSync(PUBLIC_KEY_PATH, "utf-8"));
} else {
  console.warn("⚠️  keys/public.jwk.json not found. Run 'node scripts/generate-rsa-keys.js' first.");
  console.warn("   License validation will not work without a public key.");
}

// Randomize inter-script message secret BEFORE obfuscation so it survives stringArray encoding
const crypto = require("crypto");
const msgSecret = "sg_" + crypto.randomBytes(16).toString("hex") + crypto.randomBytes(16).toString("hex");

// Pre-process source files: replace placeholders before obfuscation
function preprocessSource(srcPath) {
  let code = fs.readFileSync(srcPath, "utf-8");

  // Replace message secret placeholder
  code = code.split('"__SG_MSG_SECRET__"').join('"' + msgSecret + '"');

  // Replace contact URL placeholder in ALL files
  const contactUrl = ENV_CONFIG.CONTACT_URL || "https://t.me/shift_grabber";
  code = code.split("__SG_CONTACT_URL__").join(contactUrl);

  // Replace server URL placeholder in ALL files
  const serverUrl = ENV_CONFIG.SERVER_URL || "";
  code = code.split('"__SG_SERVER_URL__"').join('"' + serverUrl + '"');

  // Replace license public key placeholder in constants.js
  if (srcPath.includes("constants")) {
    if (licensePublicKey) {
      code = code.split('"__SG_LICENSE_PUBLIC_KEY__"').join(JSON.stringify(licensePublicKey));
    }
  }

  // Service worker: replace split-string HMAC placeholder with real key before obfuscation
  if (srcPath.includes("service-worker")) {
    code = code.replace(/\["__SG",\s*"_HMAC",\s*"_KEY",\s*"_PLACEHOLDER__"\]\.join\(""\)/g, '"' + hmacKey + '"');
  }

  return code;
}

// Clean dist
if (fs.existsSync(DIST_DIR)) {
  fs.rmSync(DIST_DIR, { recursive: true });
}
fs.mkdirSync(DIST_DIR, { recursive: true });

console.log("🏗️  Building Shift Grabber V9 — Production (Offline License)\n");

// Service worker bundle: concatenate shared files + SW into one file.
// This prevents mangled-name collisions and window-reference crashes that
// occur when multiple independently-obfuscated files are loaded via
// importScripts() into the same global scope.
const SW_SHARED_FILES = [
  "src/shared/constants.js",
  "src/shared/crypto.js",
  "src/shared/fingerprint.js",
  "src/shared/circuit-breaker.js",
  "src/shared/license-validator.js"
];

const POPUP_FILES = [
  "src/shared/constants.js",
  "src/shared/crypto.js",
  "src/shared/fingerprint.js"
];

const CONTENT_ISOLATED_FILES = [
  "src/shared/constants.js",
  "src/shared/crypto.js",
  "src/shared/fingerprint.js",
  "src/shared/license-validator.js"
];

const CONTENT_MAIN_FILES = [
  "src/shared/constants.js",
  "src/shared/fingerprint.js",
  "src/shared/license-validator.js"
];

function buildServiceWorkerBundle() {
  const parts = [];
  for (const file of SW_SHARED_FILES) {
    const srcPath = path.join(SRC_DIR, file);
    if (!fs.existsSync(srcPath)) {
      console.warn("⚠️  SW dependency not found:", file);
      continue;
    }
    parts.push(preprocessSource(srcPath));
  }

  const swPath = path.join(SRC_DIR, "background/service-worker.js");
  let swCode = preprocessSource(swPath);
  // Remove importScripts calls — shared code is now bundled inline
  swCode = swCode.replace(/importScripts\([^)]+\);?\s*\n?/g, "");
  parts.push(swCode);

  return parts.join("\n");
}

function buildBundle(depFiles, entryFile) {
  const parts = [];
  for (const file of depFiles) {
    const srcPath = path.join(SRC_DIR, file);
    if (!fs.existsSync(srcPath)) {
      console.warn("⚠️  Bundle dependency not found:", file);
      continue;
    }
    parts.push(preprocessSource(srcPath));
  }

  const entryPath = path.join(SRC_DIR, entryFile);
  let entryCode = preprocessSource(entryPath);
  // Remove importScripts calls — dependencies are now bundled inline
  entryCode = entryCode.replace(/importScripts\([^)]+\);?\s*\n?/g, "");
  parts.push(entryCode);

  return parts.join("\n");
}

// Build and obfuscate the SW bundle first
const swBundle = buildServiceWorkerBundle();
const swBundleTemp = path.join(SRC_DIR, "background/service-worker.bundle.tmp");
fs.writeFileSync(swBundleTemp, swBundle, "utf-8");
obfuscateFile(swBundleTemp, path.join(DIST_DIR, "background/service-worker.js"), OBF_CONFIG_SW);
fs.unlinkSync(swBundleTemp);

// Build and obfuscate popup bundle (all popup deps + popup.js in one file)
const popupBundle = buildBundle(POPUP_FILES, "popup/popup.js");
const popupBundleTemp = path.join(SRC_DIR, "popup/popup.bundle.tmp");
fs.writeFileSync(popupBundleTemp, popupBundle, "utf-8");
obfuscateFile(popupBundleTemp, path.join(DIST_DIR, "popup/popup.bundle.js"), OBF_CONFIG);
fs.unlinkSync(popupBundleTemp);

// Build and obfuscate content script bundles
const contentIsolatedBundle = buildBundle(CONTENT_ISOLATED_FILES, "src/content/main.js");
const contentIsolatedTemp = path.join(SRC_DIR, "src/content/content-isolated.bundle.tmp");
fs.writeFileSync(contentIsolatedTemp, contentIsolatedBundle, "utf-8");
obfuscateFile(contentIsolatedTemp, path.join(DIST_DIR, "src/content/content-isolated.bundle.js"), OBF_CONFIG);
fs.unlinkSync(contentIsolatedTemp);

const contentMainBundle = buildBundle(CONTENT_MAIN_FILES, "src/content/api-layer.js");
const contentMainTemp = path.join(SRC_DIR, "src/content/content-main.bundle.tmp");
fs.writeFileSync(contentMainTemp, contentMainBundle, "utf-8");
obfuscateFile(contentMainTemp, path.join(DIST_DIR, "src/content/content-main.bundle.js"), OBF_CONFIG);
fs.unlinkSync(contentMainTemp);

// Copy static files
for (const pattern of COPY_PATTERNS) {
  copyGlob(pattern, SRC_DIR);
}

// Update manifest.json with contact URL and server URL
const manifestPath = path.join(DIST_DIR, "manifest.json");
if (fs.existsSync(manifestPath)) {
  let manifest = fs.readFileSync(manifestPath, "utf-8");
  manifest = manifest.split("__SG_CONTACT_URL__").join(ENV_CONFIG.CONTACT_URL || "https://t.me/shift_grabber");
  const serverUrl = ENV_CONFIG.SERVER_URL || "";
  manifest = manifest.split("__SG_SERVER_URL__").join(serverUrl);
  fs.writeFileSync(manifestPath, manifest, "utf-8");
  console.log("📝 Updated manifest.json");
}

// Post-obfuscation safety check: ensure no HMAC placeholder remains in service worker
const swPath = path.join(DIST_DIR, "background/service-worker.js");
if (fs.existsSync(swPath)) {
  let swCode = fs.readFileSync(swPath, "utf-8");
  if (swCode.includes("__SG_HMAC_KEY_PLACEHOLDER__")) {
    console.error("❌ HMAC placeholder still present in service worker after obfuscation. Build aborted.");
    process.exit(1);
  }
  console.log("🔑 Verified HMAC key injected into service worker");
}

// Build-time global name randomization — prevents attackers from calling exposed APIs
// Skipped in debug mode for readability
if (ENV_CONFIG.OBFUSCATE !== false) {
  const GLOBAL_NAMES = ["SG_CONSTS", "SG_CRYPTO", "SG_FINGERPRINT", "SG_CIRCUIT_BREAKER", "SG_LICENSE"];
  const globalNameMap = {};
  const randName = () => "_" + crypto.randomBytes(6).toString("hex");
  GLOBAL_NAMES.forEach((name) => { globalNameMap[name] = randName(); });

  const BUNDLE_PATHS = [
    "background/service-worker.js",
    "popup/popup.bundle.js",
    "src/content/content-isolated.bundle.js",
    "src/content/content-main.bundle.js"
  ];
  for (const bundlePath of BUNDLE_PATHS) {
    const dest = path.join(DIST_DIR, bundlePath);
    if (fs.existsSync(dest)) {
      let code = fs.readFileSync(dest, "utf-8");
      for (const [oldName, newName] of Object.entries(globalNameMap)) {
        code = code.split(oldName).join(newName);
      }
      fs.writeFileSync(dest, code, "utf-8");
    }
  }
  console.log("🔀 Randomized global names:", Object.entries(globalNameMap).map(([k, v]) => `${k}→${v}`).join(", "));
} else {
  console.log("🔀 Global name randomization skipped (debug mode)");
}
console.log("🔀 Randomized message secret for inter-script validation");

// Sync dist/ to Deploy/extension/ for customer-ready package (skip for debug builds)
if (ENV_CONFIG.OBFUSCATE !== false) {
  const DEPLOY_EXT_DIR = path.resolve(__dirname, "Deploy/extension");
  if (fs.existsSync(DEPLOY_EXT_DIR)) {
    fs.rmSync(DEPLOY_EXT_DIR, { recursive: true });
  }
  function copyRecursive(src, dest) {
    ensureDir(dest);
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        copyRecursive(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
  copyRecursive(DIST_DIR, DEPLOY_EXT_DIR);
  console.log("📦 Synced dist/ → Deploy/extension/");
} else {
  console.log("📦 Deploy sync skipped (debug mode)");
}

console.log("\n✅ Build complete:", DIST_DIR);
console.log("📦 Next: run `npm run build:zip` or upload Deploy/extension/ to Chrome Web Store.");
