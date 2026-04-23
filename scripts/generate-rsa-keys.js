#!/usr/bin/env node
/**
 * generate-rsa-keys.js — One-time script to create RSA key pair for offline licensing.
 *
 * Run once:
 *   node scripts/generate-rsa-keys.js
 *
 * Outputs:
 *   private.key  — KEEP SECRET. Never commit, never share.
 *   public.key   — Embedded in the extension at build time.
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const KEYS_DIR = path.join(__dirname, "..", "keys");

function main() {
  if (!fs.existsSync(KEYS_DIR)) {
    fs.mkdirSync(KEYS_DIR, { recursive: true });
  }

  const privatePath = path.join(KEYS_DIR, "private.key");
  const publicPath = path.join(KEYS_DIR, "public.key");

  if (fs.existsSync(privatePath) || fs.existsSync(publicPath)) {
    console.error("Keys already exist in keys/ directory. Delete them first if you want to regenerate.");
    process.exit(1);
  }

  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  fs.writeFileSync(privatePath, privateKey, "utf-8");
  fs.writeFileSync(publicPath, publicKey, "utf-8");

  // Also export public key as JWK for easy embedding in the extension
  const publicKeyJwk = crypto.createPublicKey(publicKey).export({ format: "jwk" });
  fs.writeFileSync(
    path.join(KEYS_DIR, "public.jwk.json"),
    JSON.stringify(publicKeyJwk, null, 2),
    "utf-8"
  );

  console.log("RSA key pair generated successfully.");
  console.log("");
  console.log("  private.key  → KEEP SECRET. Use this to sign license keys.");
  console.log("  public.key   → This gets embedded in the extension.");
  console.log("");
  console.log("Store private.key in a secure location (password manager, encrypted drive).");
  console.log("NEVER commit private.key to git.");
}

main();
