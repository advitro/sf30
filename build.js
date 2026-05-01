#!/usr/bin/env node
// Shift Grabber V9 — Production Build Pipeline
// Usage: npm install && node build.js
// Output: dist/ directory with obfuscated, production-ready extension

const fs = require("fs");
const path = require("path");

// Check if javascript-obfuscator is available
let JavaScriptObfuscator;
try {
  JavaScriptObfuscator = require("javascript-obfuscator");
} catch (e) {
  console.error("❌ javascript-obfuscator not installed.");
  console.error("   Run: npm install javascript-obfuscator");
  process.exit(1);
}

const SRC_DIR = path.resolve(__dirname);
const DIST_DIR = path.resolve(__dirname, "dist");

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
  disableConsoleOutput: true,
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

// Obfuscate JS files
// Service worker is processed with stringArray disabled so build-time string injection works reliably
const SW_NO_STRING_ARRAY_CONFIG = { ...OBF_CONFIG, stringArray: false, stringArrayThreshold: 0 };
for (const pattern of OBFUSCATE_PATTERNS) {
  const src = path.join(SRC_DIR, pattern);
  const dest = path.join(DIST_DIR, pattern);
  if (fs.existsSync(src)) {
    const isServiceWorker = pattern.includes("service-worker");
    // Pre-process source to inject secrets/URLs before obfuscation
    const preprocessed = preprocessSource(src);
    const tempSrc = src + ".tmp";
    fs.writeFileSync(tempSrc, preprocessed, "utf-8");
    obfuscateFile(tempSrc, dest, isServiceWorker ? SW_NO_STRING_ARRAY_CONFIG : null);
    fs.unlinkSync(tempSrc);
  } else {
    console.warn("⚠️  Not found:", pattern);
  }
}

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
const GLOBAL_NAMES = ["SG_CONSTS", "SG_CRYPTO", "SG_FINGERPRINT", "SG_CIRCUIT_BREAKER", "SG_LICENSE"];
const globalNameMap = {};
const randName = () => "_" + crypto.randomBytes(6).toString("hex");
GLOBAL_NAMES.forEach((name) => { globalNameMap[name] = randName(); });

for (const pattern of OBFUSCATE_PATTERNS) {
  const dest = path.join(DIST_DIR, pattern);
  if (fs.existsSync(dest)) {
    let code = fs.readFileSync(dest, "utf-8");
    for (const [oldName, newName] of Object.entries(globalNameMap)) {
      code = code.split(oldName).join(newName);
    }
    fs.writeFileSync(dest, code, "utf-8");
  }
}
console.log("🔀 Randomized global names:", Object.entries(globalNameMap).map(([k, v]) => `${k}→${v}`).join(", "));
console.log("🔀 Randomized message secret for inter-script validation");

// Sync dist/ to Deploy/extension/ for customer-ready package
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

console.log("\n✅ Build complete:", DIST_DIR);
console.log("📦 Next: run `npm run build:zip` or upload Deploy/extension/ to Chrome Web Store.");
