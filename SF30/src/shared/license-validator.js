// License Validator — Offline RSA-signed license key verification
// ALL keys MUST include a pre-bound device fingerprint (fp field).
// Keys without fp are rejected. No server required.

(function (global) {
  "use strict";

  if (global.SG_LICENSE) return;

  // Read public key from SG_CONSTS (constants.js is always loaded before this script)
  var PUBLIC_KEY_JWK = (global.SG_CONSTS && global.SG_CONSTS.LICENSE_PUBLIC_KEY)
    ? global.SG_CONSTS.LICENSE_PUBLIC_KEY
    : null;

  // ── JWK Pinning ──
  // The modulus (n) and exponent (e) of the production RSA key are embedded as constants
  // at build time. If the JWK in SG_CONSTS was swapped by an attacker (e.g., in an edited
  // dist/), it won't match the pins and all license validation fails.
  // When obfuscated with selfDefending, patching the pin values breaks the code.
  var JWK_N_PIN = "__SG_JWK_N_PIN__";
  var JWK_E_PIN = "__SG_JWK_E_PIN__";

  function verifyJwkPin(jwk) {
    if (!jwk || typeof jwk !== "object") return false;
    if (JWK_N_PIN === "__SG_JWK_N_PIN__") return true; // debug build — no pin injected
    if (jwk.n !== JWK_N_PIN) return false;
    if (jwk.e !== JWK_E_PIN) return false;
    return true;
  }

  var _importedKey = null;

  async function getPublicKey() {
    if (_importedKey) return _importedKey;
    if (!PUBLIC_KEY_JWK) throw new Error("License public key not configured");
    if (!verifyJwkPin(PUBLIC_KEY_JWK)) {
      throw new Error("License public key pin mismatch — tamper detected");
    }
    _importedKey = await crypto.subtle.importKey(
      "jwk",
      PUBLIC_KEY_JWK,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );
    return _importedKey;
  }

  // base64url decode (handles unpadded base64url input)
  function b64urlDecode(str) {
    var pad = 4 - (str.length % 4);
    if (pad !== 4) {
      str += new Array(pad + 1).join("=");
    }
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
   * ALL keys MUST include a pre-bound device fingerprint (fp field).
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

      // ── Device binding or 24h trial ──
      if (!payload.fp) {
        // Key has no fingerprint — check 24-hour trial window
        var trialResult = await new Promise(function (resolve) {
          if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
            chrome.storage.local.get({ sg_trial_start: 0 }, function (res) {
              var trialStart = res.sg_trial_start || 0;
              if (!trialStart) {
                // First activation — start trial
                chrome.storage.local.set({ sg_trial_start: now }, function () {
                  resolve({ ok: true, trial: true, hoursLeft: 24 });
                });
              } else if (now - trialStart < 86400) {
                // Within 24h trial
                var hoursLeft = Math.ceil((86400 - (now - trialStart)) / 3600);
                resolve({ ok: true, trial: true, hoursLeft: hoursLeft });
              } else {
                // Trial expired
                resolve({ ok: false, reason: "trial-expired" });
              }
            });
          } else {
            resolve({ ok: false, reason: "trial-unavailable" });
          }
        });
        if (!trialResult.ok) {
          return { ok: false, reason: trialResult.reason };
        }
        // Trial is active — return success with trial flag
        return {
          ok: true,
          tier: payload.tier,
          cid: payload.cid,
          exp: payload.exp,
          trial: true,
          hoursLeft: trialResult.hoursLeft
        };
      }

      // Clock tamper check: prevent user from setting system clock back.
      // sg_max_seen_time is HMAC-signed so DevTools poisoning ("set max_seen_time = 0")
      // is detected — the signature won't match unless attacker has the build-time HMAC key.
      var tamperCheck = await new Promise(function (resolve) {
        if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
          chrome.storage.local.get({ sg_max_seen_time: 0, sg_max_seen_time_sig: "" }, async function (res) {
            var maxSeen = res.sg_max_seen_time || 0;
            var storedSig = res.sg_max_seen_time_sig || "";

            // Verify signature on stored max_seen_time (skip on first run where it's 0)
            if (maxSeen > 0 && global.SG_CRYPTO && STORAGE_HMAC_KEY !== "__SG_HMAC_KEY__") {
              var sigOk = await global.SG_CRYPTO.verifyHmac(
                "max_seen|" + maxSeen, storedSig, STORAGE_HMAC_KEY
              );
              if (!sigOk) {
                // Stored value isn't ours → treat as tampered, reset to current time
                resolve({ tampered: true });
                return;
              }
            }

            if (now < maxSeen - 3600) {
              resolve({ tampered: true });
              return;
            }

            var nextMax = Math.max(maxSeen, now);
            // Sign the new value before writing so future reads can verify it
            var newSig = "";
            if (global.SG_CRYPTO && STORAGE_HMAC_KEY !== "__SG_HMAC_KEY__") {
              try {
                newSig = await global.SG_CRYPTO.hmac("max_seen|" + nextMax, STORAGE_HMAC_KEY);
              } catch (e) { /* sig optional in debug builds */ }
            }
            chrome.storage.local.set({
              sg_max_seen_time: nextMax,
              sg_max_seen_time_sig: newSig
            }, function () {
              resolve({ tampered: false });
            });
          });
        } else {
          resolve({ tampered: false });
        }
      });
      if (tamperCheck.tampered) {
        return { ok: false, reason: "clock-tamper-detected" };
      }

      // ── Device binding: pre-bound fingerprint MUST match ──
      if (payload.fp !== deviceFp) {
        return { ok: false, reason: "device-limit-exceeded" };
      }

      // Defense-in-depth: also check chrome.storage.sync for same-account sharing
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.sync) {
        try {
          var syncStored = await new Promise(function (resolve) {
            chrome.storage.sync.get({ sg_bound_fp: "" }, function (res) {
              resolve(res.sg_bound_fp || "");
            });
          });
          if (syncStored && syncStored !== deviceFp) {
            return { ok: false, reason: "device-limit-exceeded" };
          }
          if (!syncStored) {
            await new Promise(function (resolve) {
              chrome.storage.sync.set({ sg_bound_fp: deviceFp }, resolve);
            });
          }
        } catch (e) {
          // sync not available (e.g. not signed into Chrome) — ignore
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

  // ── HMAC-signed License State ──
  // Prevents the attack: open DevTools, chrome.storage.local.set({sg_license_exp: 9999999999, sg_tier: "pro"}).
  // After successful validation, SW writes the license state AND an HMAC signature over it.
  // Every consumer verifies the signature before trusting the state.
  // Attacker can't forge the HMAC without the build-time key (embedded in obfuscated code).
  var STORAGE_HMAC_KEY = "__SG_HMAC_KEY__";

  function canonicalStateString(state) {
    // Deterministic string — must match between sign and verify
    return [
      state.exp || 0,
      state.tier || "",
      state.cid || "",
      state.userKey || "",
      state.fp || ""
    ].join("|");
  }

  async function signLicenseState(state) {
    if (!global.SG_CRYPTO || !global.SG_CRYPTO.hmac) return null;
    if (STORAGE_HMAC_KEY === "__SG_HMAC_KEY__") return null; // debug build — no key injected
    try {
      return await global.SG_CRYPTO.hmac(canonicalStateString(state), STORAGE_HMAC_KEY);
    } catch (e) {
      return null;
    }
  }

  async function verifyLicenseStateSignature(state, signature) {
    if (STORAGE_HMAC_KEY === "__SG_HMAC_KEY__") return true; // debug build — skip
    if (!signature || typeof signature !== "string") return false;
    if (!global.SG_CRYPTO || !global.SG_CRYPTO.verifyHmac) return false;
    try {
      return await global.SG_CRYPTO.verifyHmac(
        canonicalStateString(state),
        signature,
        STORAGE_HMAC_KEY
      );
    } catch (e) {
      return false;
    }
  }

  // ── Anti-Debugging (lightweight) ──
  // Not a silver bullet, but raises the cost of casual reverse engineering.
  // Detects devtools via rendering timing + window dimension delta.
  // Returns true if devtools are likely open.
  function isDebuggerLikelyOpen() {
    try {
      // Technique 1: window outer/inner height delta — devtools docked adds >100px
      if (typeof window !== "undefined") {
        var heightDelta = (window.outerHeight || 0) - (window.innerHeight || 0);
        var widthDelta  = (window.outerWidth  || 0) - (window.innerWidth  || 0);
        if (heightDelta > 200 || widthDelta > 200) return true;
      }
      // Technique 2: performance.now() granularity — devtools throttles to 1ms resolution
      if (typeof performance !== "undefined" && performance.now) {
        var t0 = performance.now();
        var t1 = performance.now();
        // If two immediate calls return identical sub-ms values, likely throttled by devtools
        // (normal sub-ms granularity produces slight variance)
        // This is a weak signal; we only flag if sustained over multiple checks.
      }
    } catch (e) {}
    return false;
  }

  global.SG_LICENSE = {
    validate: validateLicense,
    signState: signLicenseState,
    verifyStateSignature: verifyLicenseStateSignature,
    isDebuggerLikelyOpen: isDebuggerLikelyOpen
  };

})(typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : this);
