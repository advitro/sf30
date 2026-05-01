// Polyfills for jsdom environment
global.TextEncoder = require("util").TextEncoder;
global.TextDecoder = require("util").TextDecoder;

// Mock crypto.subtle for fingerprint/crypto tests in jsdom
if (!global.crypto) {
  global.crypto = {};
}
if (!global.crypto.subtle) {
  const cryptoModule = require("crypto");
  global.crypto.subtle = {
    digest: async function(algorithm, data) {
      const hash = cryptoModule.createHash(algorithm.toLowerCase().replace("-", ""));
      hash.update(Buffer.from(data));
      return hash.digest().buffer;
    },
    importKey: async function(format, keyData, algorithm, extractable, keyUsages) {
      return { algorithm, keyData: Buffer.from(keyData).toString("base64") };
    },
    encrypt: async function(algorithm, key, data) {
      const iv = cryptoModule.randomBytes(12);
      const cipher = cryptoModule.createCipheriv("aes-256-gcm", cryptoModule.randomBytes(32), iv);
      const encrypted = Buffer.concat([cipher.update(Buffer.from(data)), cipher.final()]);
      return { iv: Array.from(iv), data: Array.from(encrypted) };
    },
    decrypt: async function(algorithm, key, data) {
      return new Uint8Array([1, 2, 3]).buffer; // dummy
    },
    sign: async function(algorithm, key, data) {
      const hmac = cryptoModule.createHmac("sha256", Buffer.from("dummy-key"));
      hmac.update(Buffer.from(data));
      return hmac.digest().buffer;
    }
  };
}

// Mock canvas for fingerprint tests
global.document = global.document || {};
const _origCreateElement = global.document.createElement;
global.document.createElement = function(tagName) {
  const el = _origCreateElement ? _origCreateElement.call(this, tagName) : {};
  if (tagName === "canvas") {
    el.getContext = function(ctx) {
      if (ctx === "2d") {
        return {
          textBaseline: "",
          font: "",
          fillStyle: "",
          fillRect: function() {},
          fillText: function() {},
          getImageData: function() { return { data: [] }; }
        };
      }
      return null;
    };
    el.toDataURL = function() { return "data:image/png;base64,iVBORw0KGgo="; };
  }
  return el;
};

global.chrome = {
  runtime: {
    id: "test-extension-id",
    getManifest: () => ({ version: "2.1.0" }),
    onMessage: { addListener: jest.fn() },
    onInstalled: { addListener: jest.fn() },
    onStartup: { addListener: jest.fn() },
    sendMessage: jest.fn()
  },
  storage: {
    local: {
      get: jest.fn((keys, cb) => cb && cb({})),
      set: jest.fn((obj, cb) => cb && cb()),
      remove: jest.fn((keys, cb) => cb && cb()),
      clear: jest.fn((cb) => cb && cb())
    }
  },
  alarms: {
    create: jest.fn(),
    clearAll: jest.fn((cb) => cb && cb()),
    clear: jest.fn((name, cb) => cb && cb()),
    get: jest.fn((name, cb) => cb && cb(null)),
    onAlarm: { addListener: jest.fn() }
  },
  tabs: {
    query: jest.fn((q, cb) => cb && cb([])),
    sendMessage: jest.fn(),
    reload: jest.fn(),
    create: jest.fn()
  }
};
