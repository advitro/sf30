// License Validator — Offline RSA-signed license key verification
// Verifies key signature, checks expiry, binds to device fingerprint.
// No server required. Public key is embedded at build time.

(function (global) {
  "use strict";

  if (global.SG_LICENSE) return;

  // Embedded at build time from keys/public.jwk.json
  var PUBLIC_KEY_JWK = typeof __SG_LICENSE_PUBLIC_KEY__ !== "undefined"
    ? __SG_LICENSE_PUBLIC_KEY__
    : null;

  var _importedKey = null;

  async function getPublicKey() {
    if (_importedKey) return _importedKey;
    if (!PUBLIC_KEY_JWK) throw new Error("License public key not configured");
    _importedKey = await crypto.subtle.importKey(
      "jwk",
      PUBLIC_KEY_JWK,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );
    return _importedKey;
  }

  // base64url decode
  function b64urlDecode(str) {
    str += new Array(5 - (str.length % 4)).join("=");
    str = str.replace(/\-/g, "+").replace(/\_/g, "/");
    return new Uint8Array(
      atob(str).split("").map(function (c) { return c.charCodeAt(0); })
    );
  }

  async function verifySignature(payloadBytes, signatureBytes) {
    var key = await getPublicKey();
    return crypto.subtle.verify(
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      key,
      signatureBytes,
      payloadBytes
    );
  }

  /**
   * Validates a license key.
   * @param {string} rawKey — the license key string
   * @param {string} deviceFp — current device fingerprint
   * @returns {Promise<{ok:boolean, tier?:string, reason?:string}>}
   */
  async function validateLicense(rawKey, deviceFp) {
    try {
      if (!rawKey || typeof rawKey !== "string") {
        return { ok: false, reason: "no-key" };
      }

      var parts = rawKey.split(".");
      if (parts.length !== 2) {
        return { ok: false, reason: "invalid-key-format" };
      }

      var payloadBytes = b64urlDecode(parts[0]);
      var signatureBytes = b64urlDecode(parts[1]);
      var payload = JSON.parse(new TextDecoder().decode(payloadBytes));

      // Verify RSA signature
      var sigOk = await verifySignature(payloadBytes, signatureBytes);
      if (!sigOk) {
        return { ok: false, reason: "invalid-signature" };
      }

      // Check required fields
      if (!payload.exp || !payload.cid || !payload.tier) {
        return { ok: false, reason: "incomplete-key" };
      }

      // Check expiry (allow 5 min clock skew)
      var now = Math.floor(Date.now() / 1000);
      if (payload.exp < now - 300) {
        return { ok: false, reason: "expired" };
      }

      // Device binding check (requires chrome.storage)
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        var stored = await new Promise(function (resolve) {
          chrome.storage.local.get({ sg_bound_fp: "" }, function (res) {
            resolve(res.sg_bound_fp || "");
          });
        });

        if (!stored) {
          // First activation — bind to this device
          await new Promise(function (resolve) {
            chrome.storage.local.set({ sg_bound_fp: deviceFp }, resolve);
          });
        } else if (stored !== deviceFp) {
          return { ok: false, reason: "device-limit-exceeded" };
        }
      }

      return {
        ok: true,
        tier: payload.tier,
        cid: payload.cid,
        exp: payload.exp
      };
    } catch (e) {
      console.error("[SG License] Validation error:", e);
      return { ok: false, reason: "validation-error" };
    }
  }

  global.SG_LICENSE = {
    validate: validateLicense
  };

})(typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : this);
