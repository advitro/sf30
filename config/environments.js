/**
 * Multi-environment configuration for Shift Grabber V9 builds.
 *
 * Usage in build.js:
 *   const env = process.env.SG_ENV || "production";
 *   const cfg = require("./config/environments")[env];
 */

const COMMON = {
  EXTENSION_NAME: "Shift Grabber V9",
  VERSION: require("../manifest.json").version,
  ALARM_PERIOD_TOKEN_CHECK: 2,      // minutes
  ALARM_PERIOD_HEARTBEAT: 10,     // minutes
  CIRCUIT_BREAKER_THRESHOLD: 5,
  CIRCUIT_BREAKER_COOLDOWN_MIN: 15
};

module.exports = {
  development: {
    ...COMMON,
    SERVER_URL: "http://localhost:3000",
    CONTACT_URL: "https://t.me/shift_grabber",
    DEBUG: true,
    OBFUSCATE: false,
    TELEGRAM_BOT_TOKEN: null,       // disable in dev
    INTEGRITY_CHECK: false
  },

  staging: {
    ...COMMON,
    SERVER_URL: "https://staging.shiftgrabber.net",
    CONTACT_URL: "https://t.me/shift_grabber",
    DEBUG: true,
    OBFUSCATE: true,
    TELEGRAM_BOT_TOKEN: process.env.SG_TELEGRAM_BOT_TOKEN || null,
    INTEGRITY_CHECK: true
  },

  production: {
    ...COMMON,
    // NOTE: Set up custom domain in Vercel Dashboard → Domains for a clean URL.
    // Until then, the Vercel production URL is: https://project-qgqvr.vercel.app
    SERVER_URL: "https://api.shiftgrabber.net",
    CONTACT_URL: "https://t.me/shift_grabber",
    DEBUG: false,
    OBFUSCATE: true,
    TELEGRAM_BOT_TOKEN: process.env.SG_TELEGRAM_BOT_TOKEN,
    INTEGRITY_CHECK: true
  }
};
