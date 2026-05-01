// SF30 V1.0 — License Validator Unit Tests
// Run with Node.js: node tests/unit/license-validator.test.js
// Requires: keys/private.key + keys/public.jwk.json (or generate them first)

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// ── Test harness ──
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log("  ✅", name);
  } catch (e) {
    failed++;
    console.error("  ❌", name);
    console.error("     ", e.message);
  }
}

function assertEq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error((msg || "Assertion failed") + `: expected "${expected}", got "${actual}"`);
  }
}

function assertTrue(val, msg) {
  if (!val) throw new Error(msg || "Expected true, got false");
}

function assertFalse(val, msg) {
  if (val) throw new Error(msg || "Expected false, got true");
}

// ── Key generation helpers ──
const KEYS_DIR = path.join(__dirname, "../../keys");
const PRIVATE_KEY_PATH = path.join(KEYS_DIR, "private.key");
const PUBLIC_JWK_PATH = path.join(KEYS_DIR, "public.jwk.json");

function ensureKeys() {
  if (!fs.existsSync(PRIVATE_KEY_PATH) || !fs.existsSync(PUBLIC_JWK_PATH)) {
    console.log("🔑 Generating RSA key pair for tests...");
    const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" }
    });
    if (!fs.existsSync(KEYS_DIR)) fs.mkdirSync(KEYS_DIR, { recursive: true });
    fs.writeFileSync(PRIVATE_KEY_PATH, privateKey, "utf-8");
    const jwk = crypto.createPublicKey(publicKey).export({ format: "jwk" });
    fs.writeFileSync(PUBLIC_JWK_PATH, JSON.stringify(jwk, null, 2), "utf-8");
  }
}

function loadPrivateKey() {
  return fs.readFileSync(PRIVATE_KEY_PATH, "utf-8");
}

function loadPublicJwk() {
  return JSON.parse(fs.readFileSync(PUBLIC_JWK_PATH, "utf-8"));
}

function signLicense(payload) {
  const privateKey = loadPrivateKey();
  const payloadBytes = Buffer.from(JSON.stringify(payload));
  const sig = crypto.createSign("RSA-SHA256").update(payloadBytes).sign(privateKey, "base64url");
  const payloadB64 = payloadBytes.toString("base64url");
  return payloadB64 + "." + sig;
}

// ── Mock WebCrypto + chrome.storage for Node.js ──
function setupMockEnvironment(publicJwk) {
  global.crypto = {
    subtle: {
      async importKey(format, jwk, algo, extractable, usages) {
        return { _jwk: jwk, _algo: algo };
      },
      async verify(algo, key, signature, data) {
        // Node.js verification
        const pubKey = crypto.createPublicKey({ key: key._jwk, format: "jwk", type: "spki" });
        return crypto.createVerify("RSA-SHA256").update(Buffer.from(data)).verify(pubKey, Buffer.from(signature));
      }
    }
  };

  const storage = {};
  global.chrome = {
    storage: {
      local: {
        get: (keys, cb) => {
          const defaults = keys;
          const result = {};
          for (const k in defaults) {
            result[k] = storage[k] !== undefined ? storage[k] : defaults[k];
          }
          if (cb) cb(result);
          return Promise.resolve(result);
        },
        set: (obj, cb) => {
          Object.assign(storage, obj);
          if (cb) cb();
          return Promise.resolve();
        }
      },
      sync: {
        get: (keys, cb) => {
          const defaults = keys;
          const result = {};
          for (const k in defaults) {
            result[k] = storage[k] !== undefined ? storage[k] : defaults[k];
          }
          if (cb) cb(result);
          return Promise.resolve(result);
        },
        set: (obj, cb) => {
          Object.assign(storage, obj);
          if (cb) cb();
          return Promise.resolve();
        }
      }
    }
  };

  global.self = global;
  global.window = global;

  global.SG_CONSTS = {
    LICENSE_PUBLIC_KEY: publicJwk
  };
}

// ── Load license-validator.js in Node.js ──
function loadValidator() {
  const validatorPath = path.join(__dirname, "../../src/shared/license-validator.js");
  const code = fs.readFileSync(validatorPath, "utf-8");
  eval(code);
  return global.SG_LICENSE;
}

// ── Main test suite ──
console.log("\n🧪 SF30 V1.0 License Validator Tests (Mandatory Pre-Bound)\n");

ensureKeys();
const publicJwk = loadPublicJwk();
setupMockEnvironment(publicJwk);
const SG_LICENSE = loadValidator();

const now = Math.floor(Date.now() / 1000);
const fingerprintA = "fp_device_A_abc123def456";
const fingerprintB = "fp_device_B_xyz789uvw012";

test("Pre-bound key with matching fingerprint passes", async () => {
  const key = signLicense({ cid: "test_001", exp: now + 86400, tier: "pro", fp: fingerprintA });
  const result = await SG_LICENSE.validate(key, fingerprintA);
  assertTrue(result.ok, "Should be valid on matching device");
  assertEq(result.tier, "pro");
  assertEq(result.cid, "test_001");
});

test("Pre-bound key with wrong fingerprint is rejected", async () => {
  const key = signLicense({ cid: "test_002", exp: now + 86400, tier: "pro", fp: fingerprintA });
  const result = await SG_LICENSE.validate(key, fingerprintB);
  assertFalse(result.ok, "Should reject wrong device");
  assertEq(result.reason, "device-limit-exceeded");
});

test("Key without fp field is rejected", async () => {
  const key = signLicense({ cid: "test_003", exp: now + 86400, tier: "pro" }); // no fp
  const result = await SG_LICENSE.validate(key, fingerprintA);
  assertFalse(result.ok, "Should reject key without fp");
  assertEq(result.reason, "key-not-device-bound");
});

test("Invalid signature is rejected", async () => {
  const key = signLicense({ cid: "test_004", exp: now + 86400, tier: "pro", fp: fingerprintA });
  const tampered = key.slice(0, -10) + "X".repeat(10);
  const result = await SG_LICENSE.validate(tampered, fingerprintA);
  assertFalse(result.ok);
  assertEq(result.reason, "invalid-signature");
});

test("Expired key is rejected", async () => {
  const key = signLicense({ cid: "test_005", exp: now - 86400, tier: "basic", fp: fingerprintA });
  const result = await SG_LICENSE.validate(key, fingerprintA);
  assertFalse(result.ok);
  assertEq(result.reason, "expired");
});

test("Malformed key format is rejected", async () => {
  const result = await SG_LICENSE.validate("not-a-valid-key", fingerprintA);
  assertFalse(result.ok);
  assertEq(result.reason, "invalid-key-format");
});

test("Empty key is rejected", async () => {
  const result = await SG_LICENSE.validate("", fingerprintA);
  assertFalse(result.ok);
  assertEq(result.reason, "no-key");
});

test("Key with missing fields is rejected", async () => {
  const key = signLicense({ cid: "test_006", exp: now + 86400, fp: fingerprintA }); // missing tier
  const result = await SG_LICENSE.validate(key, fingerprintA);
  assertFalse(result.ok);
  assertEq(result.reason, "incomplete-key");
});

test("Clock tamper detection rejects backdated system", async () => {
  global.chrome.storage.local.set({ sg_max_seen_time: now + 10000 });
  const key = signLicense({ cid: "test_007", exp: now + 86400, tier: "pro", fp: fingerprintA });
  const result = await SG_LICENSE.validate(key, fingerprintA);
  assertFalse(result.ok);
  assertEq(result.reason, "clock-tamper-detected");
});

test("Basic tier pre-bound key works", async () => {
  const key = signLicense({ cid: "test_008", exp: now + 86400, tier: "basic", fp: fingerprintA });
  const result = await SG_LICENSE.validate(key, fingerprintA);
  assertTrue(result.ok);
  assertEq(result.tier, "basic");
});

test("Same key copied to new device is rejected", async () => {
  // Simulate: key generated for Device A, user tries on Device B
  const key = signLicense({ cid: "test_009", exp: now + 86400, tier: "pro", fp: fingerprintA });
  // Device B has different fingerprint
  const result = await SG_LICENSE.validate(key, fingerprintB);
  assertFalse(result.ok);
  assertEq(result.reason, "device-limit-exceeded");
});

test("chrome.storage.sync mismatch is rejected", async () => {
  // Simulate: same Google account, different device
  global.chrome.storage.sync.set({ sg_bound_fp: fingerprintA });
  const key = signLicense({ cid: "test_010", exp: now + 86400, tier: "pro", fp: fingerprintA });
  // Different device on same account tries to use it
  const result = await SG_LICENSE.validate(key, fingerprintB);
  assertFalse(result.ok);
  assertEq(result.reason, "device-limit-exceeded");
});

test("24h trial mode works on first activation (no fp)", async () => {
  global.chrome.storage.local.set({ sg_trial_start: 0 });
  const key = signLicense({ cid: "test_trial_001", exp: now + 86400, tier: "basic" }); // no fp
  const result = await SG_LICENSE.validate(key, fingerprintA);
  assertTrue(result.ok, "Trial should work on first activation");
  assertTrue(result.trial, "Should be flagged as trial");
  assertEq(result.hoursLeft, 24);
  // Check that trial start time was stored
  const stored = await global.chrome.storage.local.get({ sg_trial_start: 0 });
  assertTrue(stored.sg_trial_start > 0, "Trial start time should be stored");
});

test("24h trial expires after 24 hours", async () => {
  global.chrome.storage.local.set({ sg_trial_start: now - 90000 }); // 25 hours ago
  const key = signLicense({ cid: "test_trial_002", exp: now + 86400, tier: "basic" }); // no fp
  const result = await SG_LICENSE.validate(key, fingerprintA);
  assertFalse(result.ok, "Trial should expire after 24h");
  assertEq(result.reason, "trial-expired");
});

test("Pre-bound key bypasses trial logic", async () => {
  const key = signLicense({ cid: "test_trial_003", exp: now + 86400, tier: "pro", fp: fingerprintA });
  const result = await SG_LICENSE.validate(key, fingerprintA);
  assertTrue(result.ok);
  assertFalse(!!result.trial, "Pre-bound key should not be a trial");
});

// ── Summary ──
console.log("\n" + "=".repeat(40));
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("❌ Some tests failed.");
  process.exit(1);
} else {
  console.log("✅ All tests passed!");
  process.exit(0);
}
