/**
 * @jest-environment jsdom
 */
describe("SG_FINGERPRINT", () => {
  beforeAll(() => {
    // Ensure navigator / screen mocks are in place before loading module
    Object.defineProperty(window, "navigator", {
      value: {
        userAgent: "Mozilla/5.0 Test",
        language: "en-US",
        hardwareConcurrency: 8,
        platform: "Win32"
      },
      writable: true,
      configurable: true
    });
    Object.defineProperty(window, "screen", {
      value: { width: 1920, height: 1080, colorDepth: 24 },
      writable: true,
      configurable: true
    });

    require("../../src/shared/fingerprint.js");
  });

  it("exposes getFingerprint", () => {
    expect(typeof self.SG_FINGERPRINT.getFingerprint).toBe("function");
  });

  it("returns a 64-character hex string", async () => {
    const fp = await self.SG_FINGERPRINT.getFingerprint();
    expect(typeof fp).toBe("string");
    expect(fp.length).toBe(64);
    expect(/^[0-9a-f]+$/i.test(fp)).toBe(true);
  });

  it("returns the same fingerprint for identical inputs (cached)", async () => {
    const fp1 = await self.SG_FINGERPRINT.getFingerprint();
    const fp2 = await self.SG_FINGERPRINT.getFingerprint();
    expect(fp1).toBe(fp2);
  });
});
