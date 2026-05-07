#!/usr/bin/env node
// SF30-GOD — God Mode Build Pipeline
// Usage: node SF30-GOD/build.js
// Output: SF30-GOD/dist/ directory with obfuscated, production-ready extension

const fs = require("fs");
const path = require("path");

let JavaScriptObfuscator;
try {
  JavaScriptObfuscator = require("javascript-obfuscator");
} catch (e) {
  console.error("❌ javascript-obfuscator not installed.");
  console.error("   Run: npm install javascript-obfuscator");
  process.exit(1);
}

const SRC_DIR = path.resolve(__dirname);
const ROOT_DIR = path.resolve(__dirname, "..");

const OBF_CONFIG = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 1.0,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.4,
  debugProtection: false,
  disableConsoleOutput: false,
  identifierNamesGenerator: "mangled",
  log: false,
  numbersToExpressions: true,
  renameGlobals: false,
  rotateStringArray: true,
  selfDefending: false,
  shuffleStringArray: true,
  splitStrings: true,
  splitStringsChunkLength: 10,
  stringArray: true,
  stringArrayEncoding: ["rc4"],
  stringArrayThreshold: 0.75,
  transformObjectKeys: true,
  unicodeEscapeSequence: false
};

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

function copyRecursive(src, dest) {
  ensureDir(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      copyFile(srcPath, destPath);
    }
  }
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
    `(${Math.round(originalSize / 1024)}KB → ${Math.round(obfuscatedSize / 1024)}KB)`
  );
}

const DIST_DIR = path.join(SRC_DIR, "dist");

// Clean dist
if (fs.existsSync(DIST_DIR)) {
  fs.rmSync(DIST_DIR, { recursive: true });
}
fs.mkdirSync(DIST_DIR, { recursive: true });

console.log("🏗️  Building SF30-GOD — Maximum Performance Edition\n");

// Bundle definitions
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

function preprocessSource(srcPath) {
  let code = fs.readFileSync(srcPath, "utf-8");
  // No placeholder replacement needed for GOD mode — everything is hardcoded
  return code;
}

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
  entryCode = entryCode.replace(/importScripts\([^)]+\);?\s*\n?/g, "");
  parts.push(entryCode);
  return parts.join("\n");
}

function writeBundle(code, tempPath, destPath, config) {
  fs.writeFileSync(tempPath, code, "utf-8");
  obfuscateFile(tempPath, destPath, config);
  fs.unlinkSync(tempPath);
}

// Build SW bundle
const swBundle = buildServiceWorkerBundle();
const swTemp = path.join(SRC_DIR, "background/sw.bundle.tmp");
writeBundle(swBundle, swTemp, path.join(DIST_DIR, "background/service-worker.js"), OBF_CONFIG_SW);

// Build popup bundle
const popupBundle = buildBundle(POPUP_FILES, "popup/popup.js");
const popupTemp = path.join(SRC_DIR, "popup/popup.bundle.tmp");
writeBundle(popupBundle, popupTemp, path.join(DIST_DIR, "popup/popup.bundle.js"), OBF_CONFIG);

// Build content bundles
const isoBundle = buildBundle(CONTENT_ISOLATED_FILES, "src/content/main.js");
const isoTemp = path.join(SRC_DIR, "src/content/content-isolated.bundle.tmp");
writeBundle(isoBundle, isoTemp, path.join(DIST_DIR, "src/content/content-isolated.bundle.js"), OBF_CONFIG);

const mainBundle = buildBundle(CONTENT_MAIN_FILES, "src/content/api-layer.js");
const mainTemp = path.join(SRC_DIR, "src/content/content-main.bundle.tmp");
writeBundle(mainBundle, mainTemp, path.join(DIST_DIR, "src/content/content-main.bundle.js"), OBF_CONFIG);

// Copy static files
copyFile(path.join(SRC_DIR, "manifest.json"), path.join(DIST_DIR, "manifest.json"));
copyFile(path.join(SRC_DIR, "popup/index.html"), path.join(DIST_DIR, "popup/index.html"));
copyFile(path.join(SRC_DIR, "popup/styles.css"), path.join(DIST_DIR, "popup/styles.css"));
copyRecursive(path.join(SRC_DIR, "icons"), path.join(DIST_DIR, "icons"));
copyRecursive(path.join(SRC_DIR, "sounds"), path.join(DIST_DIR, "sounds"));

// Global name randomization
const GLOBAL_NAMES = ["SG_CONSTS", "SG_CRYPTO", "SG_FINGERPRINT", "SG_CIRCUIT_BREAKER", "SG_LICENSE"];
const globalNameMap = {};
const randName = () => "_" + require("crypto").randomBytes(6).toString("hex");
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

// Create ZIP
const { execSync } = require("child_process");
const zipPath = path.join(ROOT_DIR, "SF30-GOD.zip");
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

// Use PowerShell Compress-Archive
const psCmd = `Compress-Archive -Path "${DIST_DIR}\*" -DestinationPath "${zipPath}" -Force`;
try {
  execSync(psCmd, { stdio: "inherit", shell: "powershell.exe" });
  console.log("📦 Created SF30-GOD.zip");
} catch (e) {
  console.error("❌ ZIP creation failed:", e.message);
}

console.log("\n✅ SF30-GOD build complete:", DIST_DIR);
console.log("📦 Output: SF30-GOD.zip");
