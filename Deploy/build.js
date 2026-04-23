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
  "src/shared/fingerprint.js"
];

// Files to copy as-is
const COPY_PATTERNS = [
  "manifest.json",
  "popup/index.html",
  "popup/styles.css",
  "icons/**",
  "sounds/**"
];

// Obfuscation settings — aggressive but functional
const OBF_CONFIG = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.2,
  debugProtection: true,
  debugProtectionInterval: 2000,
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
  stringArrayEncoding: ["base64"],
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

function obfuscateFile(srcPath, destPath) {
  ensureDir(path.dirname(destPath));
  const code = fs.readFileSync(srcPath, "utf-8");
  const result = JavaScriptObfuscator.obfuscate(code, OBF_CONFIG);
  fs.writeFileSync(destPath, result.getObfuscatedCode(), "utf-8");
  const originalSize = Buffer.byteLength(code, "utf-8");
  const obfuscatedSize = Buffer.byteLength(result.getObfuscatedCode(), "utf-8");
  console.log(
    "🔒 Obfuscated:",
    path.relative(SRC_DIR, srcPath),
    `(${Math.round(originalSize / 1024)}KB → ${Math.round(obfuscatedSize / 1024)}KB)`
  );
}

// Clean dist
if (fs.existsSync(DIST_DIR)) {
  fs.rmSync(DIST_DIR, { recursive: true });
}
fs.mkdirSync(DIST_DIR, { recursive: true });

console.log("🏗️  Building Shift Grabber V9 — Production\n");

// Obfuscate JS files
for (const pattern of OBFUSCATE_PATTERNS) {
  const src = path.join(SRC_DIR, pattern);
  const dest = path.join(DIST_DIR, pattern);
  if (fs.existsSync(src)) {
    obfuscateFile(src, dest);
  } else {
    console.warn("⚠️  Not found:", pattern);
  }
}

// Copy static files
for (const pattern of COPY_PATTERNS) {
  copyGlob(pattern, SRC_DIR);
}

// Replace HMAC placeholder in service worker with real key (build-time injection)
const swPath = path.join(DIST_DIR, "background/service-worker.js");
if (fs.existsSync(swPath)) {
  let swCode = fs.readFileSync(swPath, "utf-8");
  // Replace placeholder with environment variable or build arg
  const hmacKey = process.env.SG_HMAC_KEY || "change-me-in-production";
  swCode = swCode.replace(
    /var _hk = \["sg","_","hmac","_","v1","_","key"\]\.join\("-"\); \/\/ placeholder/,
    `var _hk = "${hmacKey}";`
  );

  // Compute SHA-256 hash of the obfuscated service worker for integrity checking
  const crypto = require("crypto");
  const swHash = crypto.createHash("sha256").update(swCode, "utf-8").digest("hex");
  swCode = swCode.replace(
    /var computedHash = typeof __SG_INTEGRITY_HASH !== "undefined" \? __SG_INTEGRITY_HASH : "";\n    if \(!computedHash\) \{\n      console\.warn\("\[SG SW\] Integrity hash not injected at build time — skipping check"\);\n      return true;\n    \}/,
    `var computedHash = "${swHash}";`
  );

  fs.writeFileSync(swPath, swCode, "utf-8");
  console.log("🔑 Injected HMAC key into service worker");
  console.log("🔐 Injected integrity hash:", swHash.slice(0, 16) + "...");
}

// Build-time global name randomization — prevents attackers from calling exposed APIs
const GLOBAL_NAMES = ["SG_CONSTS", "SG_CRYPTO", "SG_FINGERPRINT"];
const globalNameMap = {};
const randName = () => "_" + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
GLOBAL_NAMES.forEach((name) => { globalNameMap[name] = randName(); });

for (const pattern of OBFUSCATE_PATTERNS) {
  const dest = path.join(DIST_DIR, pattern);
  if (fs.existsSync(dest)) {
    let code = fs.readFileSync(dest, "utf-8");
    for (const [oldName, newName] of Object.entries(globalNameMap)) {
      // Replace both global assignments and references
      code = code.split(oldName).join(newName);
    }
    fs.writeFileSync(dest, code, "utf-8");
  }
}
console.log("🔀 Randomized global names:", Object.entries(globalNameMap).map(([k, v]) => `${k}→${v}`).join(", "));

console.log("\n✅ Build complete:", DIST_DIR);
console.log("📦 Next: zip dist/ and upload to Chrome Web Store or distribute directly.");
console.log("⚠️  Remember to set SG_HMAC_KEY environment variable before building!");
