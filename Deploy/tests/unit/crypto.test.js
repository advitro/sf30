/**
 * @jest-environment jsdom
 */
describe("SG_CRYPTO", () => {
  beforeAll(() => {
    require("../../src/shared/crypto.js");
  });

  it("exposes encrypt, decrypt, hmac, verifyHmac", () => {
    expect(typeof self.SG_CRYPTO.encrypt).toBe("function");
    expect(typeof self.SG_CRYPTO.decrypt).toBe("function");
    expect(typeof self.SG_CRYPTO.hmac).toBe("function");
    expect(typeof self.SG_CRYPTO.verifyHmac).toBe("function");
  });

  it("encrypt returns an object with iv and data arrays", async () => {
    const originalSubtle = crypto.subtle;
    crypto.subtle = {
      importKey: jest.fn().mockResolvedValue("keyMaterial"),
      deriveKey: jest.fn().mockResolvedValue("derivedKey"),
      encrypt: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer),
      decrypt: jest.fn().mockResolvedValue(new Uint8Array([116, 101, 115, 116]).buffer),
      sign: jest.fn().mockResolvedValue(new Uint8Array([255]).buffer),
      digest: jest.fn().mockResolvedValue(new Uint8Array(32).buffer)
    };
    crypto.getRandomValues = (arr) => arr;

    const result = await self.SG_CRYPTO.encrypt("test", "pass");
    expect(result).toHaveProperty("iv");
    expect(result).toHaveProperty("data");
    expect(Array.isArray(result.iv)).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);

    crypto.subtle = originalSubtle;
  });

  it("decrypt returns a string", async () => {
    const originalSubtle = crypto.subtle;
    crypto.subtle = {
      importKey: jest.fn().mockResolvedValue("keyMaterial"),
      deriveKey: jest.fn().mockResolvedValue("derivedKey"),
      encrypt: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer),
      decrypt: jest.fn().mockResolvedValue(new Uint8Array([116, 101, 115, 116]).buffer),
      sign: jest.fn().mockResolvedValue(new Uint8Array([255]).buffer),
      digest: jest.fn().mockResolvedValue(new Uint8Array(32).buffer)
    };

    const result = await self.SG_CRYPTO.decrypt({ iv: [1], data: [2] }, "pass");
    expect(typeof result).toBe("string");

    crypto.subtle = originalSubtle;
  });

  it("hmac returns a hex string", async () => {
    const originalSubtle = crypto.subtle;
    crypto.subtle = {
      importKey: jest.fn().mockResolvedValue("keyMaterial"),
      deriveKey: jest.fn().mockResolvedValue("derivedKey"),
      encrypt: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer),
      decrypt: jest.fn().mockResolvedValue(new Uint8Array([116, 101, 115, 116]).buffer),
      sign: jest.fn().mockResolvedValue(new Uint8Array([255]).buffer),
      digest: jest.fn().mockResolvedValue(new Uint8Array(32).buffer)
    };

    const result = await self.SG_CRYPTO.hmac("message", "secret");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);

    crypto.subtle = originalSubtle;
  });

  it("verifyHmac returns true for matching signature", async () => {
    const originalSubtle = crypto.subtle;
    crypto.subtle = {
      importKey: jest.fn().mockResolvedValue("keyMaterial"),
      deriveKey: jest.fn().mockResolvedValue("derivedKey"),
      encrypt: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer),
      decrypt: jest.fn().mockResolvedValue(new Uint8Array([116, 101, 115, 116]).buffer),
      sign: jest.fn().mockResolvedValue(new Uint8Array([255]).buffer),
      digest: jest.fn().mockResolvedValue(new Uint8Array(32).buffer)
    };

    const sig = await self.SG_CRYPTO.hmac("message", "secret");
    const ok = await self.SG_CRYPTO.verifyHmac("message", sig, "secret");
    expect(ok).toBe(true);

    crypto.subtle = originalSubtle;
  });

  it("verifyHmac returns false for mismatching signature", async () => {
    const originalSubtle = crypto.subtle;
    crypto.subtle = {
      importKey: jest.fn().mockResolvedValue("keyMaterial"),
      deriveKey: jest.fn().mockResolvedValue("derivedKey"),
      encrypt: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer),
      decrypt: jest.fn().mockResolvedValue(new Uint8Array([116, 101, 115, 116]).buffer),
      sign: jest.fn().mockResolvedValue(new Uint8Array([255]).buffer),
      digest: jest.fn().mockResolvedValue(new Uint8Array(32).buffer)
    };

    const ok = await self.SG_CRYPTO.verifyHmac("message", "bad-signature", "secret");
    expect(ok).toBe(false);

    crypto.subtle = originalSubtle;
  });
});
