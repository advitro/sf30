/**
 * @jest-environment jsdom
 */
describe("SG_CONSTS", () => {
  beforeAll(() => {
    require("../../src/shared/constants.js");
  });

  it("is defined on self", () => {
    expect(self.SG_CONSTS).toBeDefined();
  });

  it("has required top-level sections", () => {
    expect(self.SG_CONSTS.VERSION).toBe("V9");
    expect(self.SG_CONSTS.KEYS).toBeDefined();
    expect(self.SG_CONSTS.TIMING).toBeDefined();
    expect(self.SG_CONSTS.URLS).toBeDefined();
    expect(self.SG_CONSTS.GQL).toBeDefined();
    expect(self.SG_CONSTS.MSG).toBeDefined();
    expect(self.SG_CONSTS.ALARMS).toBeDefined();
    expect(self.SG_CONSTS.REASONS).toBeDefined();
    expect(self.SG_CONSTS.DEFAULTS).toBeDefined();
    expect(self.SG_CONSTS.MSG_SCHEMA).toBeDefined();
    expect(self.SG_CONSTS.STATES).toBeDefined();
  });

  it("has placeholder server URL (replaced at build)", () => {
    expect(self.SG_CONSTS.URLS.SERVER).toBe("__SG_SERVER_URL__");
  });

  it("has placeholder contact URL (replaced at build)", () => {
    expect(self.SG_CONSTS.URLS.CONTACT_URL).toBe("__SG_CONTACT_URL__");
  });

  it("has all required storage keys", () => {
    const k = self.SG_CONSTS.KEYS;
    expect(k.ENABLED).toBe("sg_enabled");
    expect(k.OVERRIDE).toBe("sg_override");
    expect(k.PAUSED).toBe("sg_paused");
    expect(k.ACCESS_TOKEN).toBe("sg_access_token");
    expect(k.TOKEN_EXP).toBe("sg_license_exp");
    expect(k.USER_KEY).toBe("sg_userKey");
    expect(k.DEVICE_ID).toBe("sg_device_id");
  });

  it("has message schema for critical types", () => {
    expect(self.SG_CONSTS.MSG_SCHEMA.SG_VERIFY_LICENSE).toEqual({ required: ["key"], optional: [] });
    expect(self.SG_CONSTS.MSG_SCHEMA.SG_SET_ENABLED).toEqual({ required: ["value"], optional: [] });
  });

  it("states are well-formed strings", () => {
    expect(Object.values(self.SG_CONSTS.STATES).every((s) => typeof s === "string" && s.length > 0)).toBe(true);
  });
});
