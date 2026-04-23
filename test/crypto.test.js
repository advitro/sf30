// Shift Grabber V9 — Crypto Unit Tests
// Run: npm test (requires a test runner like mocha or jest)

const assert = require("assert");

// Minimal shim for Web Crypto API in Node test environment
const { webcrypto } = require("crypto");
global.crypto = webcrypto;

// Load crypto module (adapt paths as needed)
const path = require("path");
const fs = require("fs");

// Evaluate the IIFE in a minimal global context
const cryptoCode = fs.readFileSync(path.join(__dirname, "../src/shared/crypto.js"), "utf-8");
const globalCtx = {};
eval(cryptoCode.replace(/\(function \(global\)/, "(function (global)").replace(/\)\(typeof self[^)]+\)\);?$/, ")(" + JSON.stringify(globalCtx) + ");"));

const SG_CRYPTO = globalCtx.SG_CRYPTO;

describe("SG_CRYPTO", function () {
  it("should encrypt and decrypt a token", async function () {
    const token = "test-token-123";
    const passphrase = "device-fingerprint-abc";
    const encrypted = await SG_CRYPTO.encrypt(token, passphrase);
    assert(encrypted.iv && encrypted.data, "encrypted should have iv and data");
    const decrypted = await SG_CRYPTO.decrypt(encrypted, passphrase);
    assert.strictEqual(decrypted, token);
  });

  it("should produce different ciphertexts for same input", async function () {
    const token = "same-token";
    const passphrase = "same-fp";
    const e1 = await SG_CRYPTO.encrypt(token, passphrase);
    const e2 = await SG_CRYPTO.encrypt(token, passphrase);
    assert.notDeepStrictEqual(e1.data, e2.data, "IV randomization should produce different ciphertexts");
  });

  it("should verify HMAC correctly", async function () {
    const message = "token|exp|tier";
    const secret = "test-secret";
    const sig = await SG_CRYPTO.hmac(message, secret);
    const valid = await SG_CRYPTO.verifyHmac(message, sig, secret);
    assert.strictEqual(valid, true);
  });

  it("should reject tampered HMAC", async function () {
    const message = "token|exp|tier";
    const secret = "test-secret";
    const sig = await SG_CRYPTO.hmac(message, secret);
    const valid = await SG_CRYPTO.verifyHmac(message + "x", sig, secret);
    assert.strictEqual(valid, false);
  });
});
