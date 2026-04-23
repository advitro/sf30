module.exports = {
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/tests/setup.js"],
  testMatch: ["<rootDir>/tests/**/*.test.js"],
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
