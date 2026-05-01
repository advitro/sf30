#!/usr/bin/env node
// SF30 V2.0 — Production Build Pipeline (Terser + Stealth Randomization)
// Usage: npm install && node build.js
//        node build.js --debug  (for unminified debug build)
// Output: dist/ directory with minified, production-ready extension

const fs = require("fs");
const path = require("path");
const Terser = require("terser");
const JavaScriptObfuscator = require("javascript-obfuscator");

const IS_DEBUG = process.argv.includes("--debug");

// Files that contain security-critical logic — apply heavy obfuscation on top of Terser.
// Control flow flattening + string array encryption + dead code injection raise the
// cost of reverse engineering significantly vs plain Terser minification.
const OBFUSCATE_FILES = new Set([
  "src/shared/license-validator.js",
  "src/shared/constants.js",
  "src/shared/crypto.js",
  "src/shared/fingerprint.js"
]);

// Obfuscator config tuned for Chrome extension runtime (no eval, no debugger traps
// that conflict with extension CSP, but aggressive control flow flattening + string encryption).
const OBFUSCATOR_CONFIG = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.4,
  debugProtection: false,            // can't use — breaks in extension contexts
  disableConsoleOutput: false,       // handled by Terser pure_funcs already
  identifierNamesGenerator: "hexadecimal",
  numbersToExpressions: true,
  renameGlobals: false,              // MUST be false — breaks SG_CONSTS/SG_LICENSE globals
  selfDefending: true,               // tampering with obfuscated code breaks it
  simplify: true,
  splitStrings: true,
  splitStringsChunkLength: 8,
  stringArray: true,
  stringArrayEncoding: ["base64"],
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayWrappersCount: 2,
  stringArrayWrappersChainedCalls: true,
  stringArrayWrappersParametersMaxCount: 4,
  stringArrayWrappersType: "function",
  stringArrayThreshold: 0.8,
  transformObjectKeys: false,        // MUST be false — breaks SG_CONSTS.KEYS.* lookups
  unicodeEscapeSequence: false
};
const SRC_DIR = path.resolve(__dirname);
const DIST_DIR = path.resolve(__dirname, IS_DEBUG ? "dist-debug" : "dist");

// JS files to minify (relative to project root)
const JS_PATTERNS = [
  "background/service-worker.js",
  "src/content/main.js",
  "src/content/api-layer.js",
  "popup/popup.js",
  "src/shared/constants.js",
  "src/shared/crypto.js",
  "src/shared/fingerprint.js",
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

// Terser config — compress + mangle, no environment-breaking transforms
// pure_funcs strips console.log/warn/info/debug calls in production.
// console.error is KEPT so real errors surface even in prod.
const TERSER_CONFIG = {
  compress: {
    drop_debugger: true,
    drop_console: false, // don't kill all console, only specific noisy ones
    pure_funcs: ["console.log", "console.warn", "console.info", "console.debug"],
    passes: 3,
    unused: true,
    dead_code: true,
    keep_fargs: false,
    keep_fnames: false,
    toplevel: true,
    hoist_funs: true,
    hoist_vars: false,
    inline: 3
  },
  mangle: {
    properties: false,
    toplevel: true
  },
  format: {
    comments: false
  }
};

// Debug config: no minification, keep comments and formatting
const DEBUG_CONFIG = {
  compress: false,
  mangle: false,
  format: { comments: true, beautify: true }
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

async function processFile(srcPath, destPath, relativePattern) {
  ensureDir(path.dirname(destPath));
  const code = fs.readFileSync(srcPath, "utf-8");
  if (IS_DEBUG) {
    fs.writeFileSync(destPath, code, "utf-8");
    console.log("📄 Copied:", path.relative(SRC_DIR, srcPath));
    return;
  }

  // Step 1: Terser minify (all files)
  const result = await Terser.minify(code, TERSER_CONFIG);
  if (result.error) {
    console.error("❌ Terser error:", result.error, "in", path.relative(SRC_DIR, srcPath));
    process.exit(1);
  }
  let finalCode = result.code;

  // Step 2: Apply javascript-obfuscator to security-critical files on top of Terser.
  // This adds control flow flattening, string encryption, and dead code injection.
  const shouldObfuscate = relativePattern && OBFUSCATE_FILES.has(relativePattern);
  if (shouldObfuscate) {
    try {
      const obfResult = JavaScriptObfuscator.obfuscate(finalCode, OBFUSCATOR_CONFIG);
      finalCode = obfResult.getObfuscatedCode();
    } catch (e) {
      console.error("❌ Obfuscator error:", e.message, "in", path.relative(SRC_DIR, srcPath));
      process.exit(1);
    }
  }

  fs.writeFileSync(destPath, finalCode, "utf-8");
  const originalSize = Buffer.byteLength(code, "utf-8");
  const finalSize = Buffer.byteLength(finalCode, "utf-8");
  const tag = shouldObfuscate ? "🛡️  Obfuscated:" : "🔒 Minified:";
  console.log(
    tag,
    path.relative(SRC_DIR, srcPath),
    `(${Math.round(originalSize / 1024)}KB → ${Math.round(finalSize / 1024)}KB)`
  );
}

// Multi-environment config injection
let ENV_CONFIG = { CONTACT_URL: "https://t.me/shift_grabber" };
try {
  const ENV = process.env.SG_ENV || "production";
  const envModule = require("./config/environments");
  if (envModule && envModule[ENV]) {
    ENV_CONFIG = envModule[ENV];
  }
} catch (e) {
  console.warn("⚠️  config/environments.js not found — using defaults for offline build.");
}

// HMAC key for Telegram credential encryption — must be provided for production
const hmacKey = process.env.SG_HMAC_KEY;
if (!IS_DEBUG && (!hmacKey || hmacKey === "change-me-in-production")) {
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

// Randomize inter-script message secret
const crypto = require("crypto");
const msgSecret = "sg_" + crypto.randomBytes(16).toString("hex") + crypto.randomBytes(16).toString("hex");

// ── Stealth: generate randomized prefix for DOM/CSS/console signatures ──
function generateStealthPrefix() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let prefix = "";
  for (let i = 0; i < 3; i++) {
    prefix += chars[crypto.randomInt(chars.length)];
  }
  return prefix;
}
const STEALTH_PREFIX = IS_DEBUG ? "sg" : generateStealthPrefix();

// Pre-process source files: replace placeholders before minification
function preprocessSource(srcPath) {
  let code = fs.readFileSync(srcPath, "utf-8");

  // Replace message secret placeholder
  code = code.split('"__SG_MSG_SECRET__"').join('"' + msgSecret + '"');

  // Replace contact URL placeholder in ALL files
  const contactUrl = (ENV_CONFIG && ENV_CONFIG.CONTACT_URL) || "https://t.me/shift_grabber";
  code = code.split("__SG_CONTACT_URL__").join(contactUrl);

  // Replace license public key placeholder in constants.js
  if (srcPath.includes("constants")) {
    if (licensePublicKey) {
      code = code.split('"__SG_LICENSE_PUBLIC_KEY__"').join(JSON.stringify(licensePublicKey));
    }
    // Inject pinned JWK components — modulus (n) and exponent (e) — as separate constants.
    // Runtime verifies the loaded JWK matches these pins, defeating key-swap attacks.
    if (licensePublicKey && licensePublicKey.n && licensePublicKey.e) {
      code = code.split('"__SG_JWK_N_PIN__"').join(JSON.stringify(licensePublicKey.n));
      code = code.split('"__SG_JWK_E_PIN__"').join(JSON.stringify(licensePublicKey.e));
    }
  }

  // Inject HMAC key into any file that uses it (for storage signing, integrity verification)
  if (hmacKey) {
    code = code.split('"__SG_HMAC_KEY__"').join(JSON.stringify(hmacKey));
  }

  return code;
}

// Post-process built files: randomize stealth signatures
function applyStealthRandomization(filePath) {
  if (IS_DEBUG) return; // don't randomize in debug mode
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== ".js" && ext !== ".css" && ext !== ".html") return;

  let content = fs.readFileSync(filePath, "utf-8");
  const p = STEALTH_PREFIX;

  // CSS class names / DOM IDs (be careful not to hit storage keys)
  const replacements = [
    // HUD styles
    { from: /sg-hud-bar/g, to: p + "-hud-bar" },
    { from: /sg-hud-header/g, to: p + "-hud-header" },
    { from: /sg-hud-badge/g, to: p + "-hud-badge" },
    { from: /sg-hud-timer-wrap/g, to: p + "-hud-timer-wrap" },
    { from: /sg-hud-timer-label/g, to: p + "-hud-timer-label" },
    { from: /sg-hud-timer/g, to: p + "-hud-timer" },
    { from: /sg-hud-divider/g, to: p + "-hud-divider" },
    { from: /sg-hud-row/g, to: p + "-hud-row" },
    { from: /sg-hud-label/g, to: p + "-hud-label" },
    { from: /sg-hud-value/g, to: p + "-hud-value" },
    { from: /sg-hud-dot/g, to: p + "-hud-dot" },
    { from: /sg-hud-bars/g, to: p + "-hud-bars" },
    { from: /sg-hud-brand/g, to: p + "-hud-brand" },
    { from: /sg-hud/g, to: p + "-hud" },
    // Animation keyframes
    { from: /sgToastIn/g, to: p + "ToastIn" },
    { from: /sgToastOut/g, to: p + "ToastOut" },
    // Style IDs
    { from: /sg-toast-styles/g, to: p + "-toast-styles" },
    { from: /sg-hud-styles/g, to: p + "-hud-styles" },
    // Console prefixes — specific patterns to avoid breaking strings
    { from: /\[ShiftGrabber\]/g, to: "[" + p + "]" },
    { from: /\[SG Telegram\]/g, to: "[" + p + " Telegram]" },
    { from: /\[SG Popup\]/g, to: "[" + p + " Popup]" },
    { from: /\[SG License\]/g, to: "[" + p + " License]" },
    { from: /\[SG SW\]/g, to: "[" + p + " SW]" },
    { from: /\[SG\]/g, to: "[" + p + "]" }
  ];

  for (const r of replacements) {
    content = content.replace(r.from, r.to);
  }

  fs.writeFileSync(filePath, content, "utf-8");
}

// Main build
(async function main() {
  // Clean dist
  if (fs.existsSync(DIST_DIR)) {
    fs.rmSync(DIST_DIR, { recursive: true });
  }
  fs.mkdirSync(DIST_DIR, { recursive: true });

  console.log(IS_DEBUG ? "🏗️  Building SF30 V2.0 — Debug (No Minification)\n" : "🏗️  Building SF30 V2.0 — Production (Terser + Stealth)\n");

  // Minify JS files (and obfuscate security-critical ones)
  for (const pattern of JS_PATTERNS) {
    const src = path.join(SRC_DIR, pattern);
    const dest = path.join(DIST_DIR, pattern);
    if (fs.existsSync(src)) {
      const preprocessed = preprocessSource(src);
      const tempSrc = src + ".tmp";
      fs.writeFileSync(tempSrc, preprocessed, "utf-8");
      await processFile(tempSrc, dest, pattern);
      fs.unlinkSync(tempSrc);
      if (!IS_DEBUG) applyStealthRandomization(dest);
    } else {
      console.warn("⚠️  Not found:", pattern);
    }
  }

  // Copy static files
  for (const pattern of COPY_PATTERNS) {
    copyGlob(pattern, SRC_DIR);
  }

  // Apply stealth randomization to copied CSS and HTML
  if (!IS_DEBUG) {
    for (const pattern of COPY_PATTERNS) {
      const parts = pattern.split("/");
      const fileName = parts[parts.length - 1];
      if (fileName.endsWith(".css") || fileName.endsWith(".html")) {
        const destPath = path.join(DIST_DIR, pattern);
        if (fs.existsSync(destPath)) applyStealthRandomization(destPath);
      }
    }
  }

  // Update manifest.json with contact URL
  const manifestPath = path.join(DIST_DIR, "manifest.json");
  if (fs.existsSync(manifestPath)) {
    let manifest = fs.readFileSync(manifestPath, "utf-8");
    manifest = manifest.split("__SG_CONTACT_URL__").join(ENV_CONFIG.CONTACT_URL || "https://t.me/shift_grabber");
    fs.writeFileSync(manifestPath, manifest, "utf-8");
    console.log("📝 Updated manifest.json");
  }

  console.log("🔀 Randomized message secret for inter-script validation");
  if (!IS_DEBUG) {
    console.log("🎭 Stealth prefix randomized:", STEALTH_PREFIX, "— DOM/CSS/console signatures obfuscated");
  }

  // ── Build Integrity Manifest ──
  // Hash every shipped JS file with SHA-256, sign the manifest with the build-time HMAC key,
  // and write it as a standalone data file. At runtime, the integrity verifier loads
  // this file, verifies the HMAC signature using the key embedded in its own (obfuscated)
  // code, then re-hashes each file and compares. Tampering with any shipped JS (e.g.,
  // patching license-validator.js to return {ok:true}) changes its hash and fails
  // verification. The verifier lives inside license-validator.js (which is obfuscated
  // with self-defending), so patching the verifier itself also breaks the code.
  if (!IS_DEBUG) {
    const integrityManifest = {};
    for (const pattern of JS_PATTERNS) {
      const filePath = path.join(DIST_DIR, pattern);
      if (!fs.existsSync(filePath)) continue;
      const contents = fs.readFileSync(filePath);
      const hash = crypto.createHash("sha256").update(contents).digest("hex");
      integrityManifest[pattern] = hash;
    }
    const manifestJson = JSON.stringify(integrityManifest);
    const integritySig = crypto.createHmac("sha256", hmacKey).update(manifestJson).digest("hex");
    const integrityBlock = {
      manifest: integrityManifest,
      signature: integritySig,
      built: new Date().toISOString(),
      version: "V2.0"
    };
    // Write as a standalone JSON file — simpler than injecting into obfuscated JS
    const integrityPath = path.join(DIST_DIR, "src/shared/integrity.json");
    ensureDir(path.dirname(integrityPath));
    fs.writeFileSync(integrityPath, JSON.stringify(integrityBlock), "utf-8");
    console.log("🔐 Integrity manifest written:", Object.keys(integrityManifest).length, "files hashed");
  }

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

  console.log("\n✅ SF30 V2.0 Build complete:", DIST_DIR);
  console.log("📦 Next: run `npm run build:zip` or upload Deploy/extension/ to Chrome Web Store.");
})();
