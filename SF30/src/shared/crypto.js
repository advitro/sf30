// Crypto utilities — token encryption at rest + HMAC validation
// Uses Web Crypto API (available in all modern browsers and MV3 service workers)

(function (global) {
  "use strict";

  if (global.SG_CRYPTO) return;

  // Derive an AES-GCM key from a passphrase (device fingerprint + static salt)
  async function deriveKey(passphrase) {
    var encoder = new TextEncoder();
    var salt = encoder.encode("sg-salt-v1-fixed"); // salt doesn't need to be secret
    var keyMaterial = await crypto.subtle.importKey(
      "raw", encoder.encode(passphrase), { name: "PBKDF2" }, false, ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: salt, iterations: 100000, hash: "SHA-256" },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  // Encrypt a string with AES-GCM
  async function encrypt(plaintext, passphrase) {
    var key = await deriveKey(passphrase);
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var encoder = new TextEncoder();
    var ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      key,
      encoder.encode(plaintext)
    );
    return {
      iv: Array.from(iv),
      data: Array.from(new Uint8Array(ciphertext))
    };
  }

  // Decrypt AES-GCM ciphertext
  async function decrypt(encrypted, passphrase) {
    var key = await deriveKey(passphrase);
    var iv = new Uint8Array(encrypted.iv);
    var data = new Uint8Array(encrypted.data);
    var decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv },
      key,
      data
    );
    return new TextDecoder().decode(decrypted);
  }

  // HMAC-SHA256 for response signature verification
  async function hmac(message, secret) {
    var encoder = new TextEncoder();
    var key = await crypto.subtle.importKey(
      "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    var signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
    return Array.from(new Uint8Array(signature))
      .map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
  }

  // Verify HMAC signature
  async function verifyHmac(message, signature, secret) {
    var computed = await hmac(message, secret);
    // Constant-time comparison to prevent timing attacks
    if (computed.length !== signature.length) return false;
    var result = 0;
    for (var i = 0; i < computed.length; i++) {
      result |= computed.charCodeAt(i) ^ signature.charCodeAt(i);
    }
    return result === 0;
  }

  global.SG_CRYPTO = {
    encrypt: encrypt,
    decrypt: decrypt,
    hmac: hmac,
    verifyHmac: verifyHmac
  };

})(typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : this);
