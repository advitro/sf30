#!/usr/bin/env node
// SF30 V1.0 — Debug Build (no obfuscation)
// Copies source files as-is with secrets injected.
// Use this to diagnose service worker issues.

const fs = require("fs");
const path = require("path");

const SRC_DIR = path.resolve(__dirname);
const DIST_DIR = path.resolve(__dirname, "dist-debug");

const JS_FILES = [
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

const COPY_FILES = [
  "manifest.json",
  "popup/index.html",
  "popup/styles.css",
  "icons/icon16.png",
  "icons/icon48.png",
  "icons/icon128.png",
  "sounds/click.mp3"
];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

// Load RSA public key
const PUBLIC_KEY_PATH = path.join(__dirname, "keys", "public.jwk.json");
let licensePublicKey = null;
if (fs.existsSync(PUBLIC_KEY_PATH)) {
  licensePublicKey = JSON.parse(fs.readFileSync(PUBLIC_KEY_PATH, "utf-8"));
} else {
  console.warn("⚠️  keys/public.jwk.json not found. License validation will not work.");
}

// HMAC key
const hmacKey = process.env.SG_HMAC_KEY || "debug-hmac-key-change-me";
if (!process.env.SG_HMAC_KEY) {
  console.warn("⚠️  SG_HMAC_KEY not set. Using default debug key.");
}

// Message secret
const crypto = require("crypto");
const msgSecret = "sg_debug_" + crypto.randomBytes(16).toString("hex");

// Contact URL
const contactUrl = "https://t.me/shift_grabber";

// Clean dist-debug
if (fs.existsSync(DIST_DIR)) {
  fs.rmSync(DIST_DIR, { recursive: true });
}
fs.mkdirSync(DIST_DIR, { recursive: true });

// Process JS files: inject secrets, then copy
for (const rel of JS_FILES) {
  const src = path.join(SRC_DIR, rel);
  const dest = path.join(DIST_DIR, rel);
  if (!fs.existsSync(src)) {
    console.warn("⚠️  Missing:", rel);
    continue;
  }
  let code = fs.readFileSync(src, "utf-8");

  // Inject message secret
  code = code.split('"__SG_MSG_SECRET__"').join('"' + msgSecret + '"');

  // Inject contact URL
  code = code.split("__SG_CONTACT_URL__").join(contactUrl);

  // Inject license public key into constants.js
  if (rel.includes("constants") && licensePublicKey) {
    code = code.split('"__SG_LICENSE_PUBLIC_KEY__"').join(JSON.stringify(licensePublicKey));
  }

  // Inject HMAC key into service worker
  if (rel.includes("service-worker")) {
    code = code.replace(/\["__SG",\s*"_HMAC",\s*"_KEY",\s*"_PLACEHOLDER__"\]\.join\(""\)/g, '"' + hmacKey + '"');
  }

  ensureDir(path.dirname(dest));
  fs.writeFileSync(dest, code, "utf-8");
  console.log("📄 Copied:", rel);
}

// Copy static files
for (const rel of COPY_FILES) {
  const src = path.join(SRC_DIR, rel);
  const dest = path.join(DIST_DIR, rel);
  if (fs.existsSync(src)) {
    copyFile(src, dest);
    console.log("📄 Copied:", rel);
  } else {
    console.warn("⚠️  Missing:", rel);
  }
}

// Safety check: no HMAC placeholder in service worker
const swPath = path.join(DIST_DIR, "background/service-worker.js");
if (fs.existsSync(swPath)) {
  const swCode = fs.readFileSync(swPath, "utf-8");
  if (swCode.includes("__SG_HMAC_KEY_PLACEHOLDER__")) {
    console.error("❌ HMAC placeholder still present in service worker");
    process.exit(1);
  }
}

// Safety check: no license placeholder in constants
const constPath = path.join(DIST_DIR, "src/shared/constants.js");
if (fs.existsSync(constPath)) {
  const constCode = fs.readFileSync(constPath, "utf-8");
  if (constCode.includes('"__SG_LICENSE_PUBLIC_KEY__"')) {
    console.error("❌ License public key placeholder still present in constants.js");
    process.exit(1);
  }
  console.log("🔑 Public key injected into constants.js");
}

console.log("\n✅ Debug build complete:", DIST_DIR);
console.log("📋 Load this folder in Chrome (unpacked) to diagnose issues.");
console.log("   No obfuscation — all console errors will be visible.");
