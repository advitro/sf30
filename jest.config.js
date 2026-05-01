module.exports = {
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/tests/setup.js"],
  testMatch: ["<rootDir>/tests/**/*.test.js"],
  testPathIgnorePatterns: [
    "<rootDir>/tests/e2e/"
  ],
  modulePathIgnorePatterns: [
    "<rootDir>/node_modules/",
    "<rootDir>/dist/",
    "<rootDir>/Deploy/",
    "<rootDir>/.skills/",
    "<rootDir>/.claude/",
    "<rootDir>/SF30/",
    "<rootDir>/SF30-V2/",
    "<rootDir>/license-server/",
    "<rootDir>/license-tools/",
    "<rootDir>/server/"
  ],
  watchPathIgnorePatterns: [
    "node_modules",
    "dist",
    "Deploy",
    ".skills",
    ".claude",
    "SF30",
    "SF30-V2",
    "license-server",
    "license-tools",
    "server"
  ],
  collectCoverageFrom: [
    "src/shared/*.js",
    "background/*.js",
    "popup/*.js"
  ],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50
    }
  }
};
