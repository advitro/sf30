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
