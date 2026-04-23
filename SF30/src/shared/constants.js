// SF30 V1.0 — Shared Constants
// Single source of truth for all timing values, storage keys, URLs, and message types.
// Loaded before all other scripts via manifest (content scripts) or importScripts (SW).

(function (global) {
  "use strict";

  if (global.SG_CONSTS) return; // Already loaded

  global.SG_CONSTS = {
    // ── Version ──
    VERSION: "V1.0",

    // ── Storage Keys ──
    KEYS: {
      ENABLED:         "sg_enabled",
      OVERRIDE:        "sg_override",
      PAUSED:          "sg_paused",
      ACCESS_TOKEN:    "sg_access_token",
      TOKEN_EXP:       "sg_token_exp",
      NEXT_DUE:        "sg_next_due",
      BURST_REMAINING: "sg_burst_left",
      DATES:           "sg_dates",
      BLACKLIST_DATES: "sg_blacklist_dates",
      TG_QUEUE:        "sg_tg_queue",
      TURBO:           "sg_turbo",
      HUD_HIDDEN:      "sg_hud_hidden",
      DEVICE_ID:       "sg_device_id",   // unified — was SG_deviceId / deviceId
      BASE_MS:         "sg_base_ms",
      JITTER_MS:       "sg_jitter_ms",
      BURST_COUNT:     "sg_burst_count",
      EID:             "sg_eid",
      USER_KEY:        "sg_userKey",     // unified lowercase
      CONTACT_URL:     "sg_contact_url", // externalised
      TG_BOT_TOKEN:    "sg_tg_bot_token",// externalised
      TG_CHAT_ID:      "sg_tg_chat_id",  // externalised
      TG_OPT_OUT:      "sg_tg_opt_out",  // user can disable Telegram notifications
      CONSENT_GIVEN:   "sg_consent_given",
      CONSENT_DATE:    "sg_consent_date"
    },

    // ── Timing (milliseconds unless noted) ──
    TIMING: {
      CONFIRM_WAIT_MS:            120,
      PER_SHIFT_STAGGER_MS:       100,
      HUD_REFRESH_MS:             500,
      DOM_SCAN_MS:                800,
      NOTIFY_DURATION_MS:         4000,
      POLL_INTERVAL_MS:           1000,
      TURBO_POLL_INTERVAL_MS:     500,
      RATE_LIMIT_POLL_MS:         5000,
      RATE_LIMIT_DURATION_MS:     30000,
      POLL_JITTER_MS:             200,
      BASE_MS:                    4000,
      BURST_JITTER_MS:            250,
      BURST_COUNT:                2,
      BURST_ANCHOR_EARLY_MS:      800,
      TOKEN_CHECK_INTERVAL_MS:    120000,
      TOKEN_REFRESH_THRESHOLD_S:  120,
      CSRF_CACHE_TTL_MS:          60000,
      API_LOAD_TIMEOUT_MS:        1500,
      API_LOAD_POLL_MS:           100,
      API_LOAD_MAX_TRIES:         15,
      STATS_LOG_INTERVAL_MS:      30000
    },

    // ── URLs ──
    URLS: {
      GQL:          "https://atoz-apps.amazon.work/apis/ScheduleManagementService/graphql",
      CONTACT_URL:  "__SG_CONTACT_URL__",
      TELEGRAM_API: "https://api.telegram.org"
    },

    // ── License (embedded at build time) ──
    LICENSE_PUBLIC_KEY: "__SG_LICENSE_PUBLIC_KEY__",

    // ── GraphQL ──
    GQL: {
      POLL_Q: "query PollShifts($timeRange:DateTimeRangeInput!,$filter:ShiftOpportunitiesFilter,$opportunityTypes:TypeFilter!){shiftOpportunities(timeRange:$timeRange,filter:$filter){opportunities(opportunityTypes:$opportunityTypes){id type shift{id timeRange{start end __typename}duration{value __typename}site{name __typename}__typename}__typename}__typename}}",
      CLAIM_Q: "mutation AddShift($shiftOpportunityId:AddShiftInput!){addShift(input:$shiftOpportunityId)}"
    },

    // ── Message Types ──
    MSG: {
      START_POLLING:        "SG_START_POLLING",
      STOP_POLLING:         "SG_STOP_POLLING",
      SET_SPEED:            "SG_SET_SPEED",
      SET_BLACKLIST_DATES:  "SG_SET_BLACKLIST_DATES",
      EID:                  "SG_EID",
      CLAIM_RESULT:         "SG_CLAIM_RESULT",
      RATE_LIMITED:         "SG_RATE_LIMITED",
      SET_ENABLED:          "SG_SET_ENABLED",
      SET_PAUSED:           "SG_SET_PAUSED",
      SET_OVERRIDE:         "SG_SET_OVERRIDE",
      RELOAD_ALL_NOW:       "SG_RELOAD_ALL_NOW",
      LICENSE_VERIFIED:     "SG_LICENSE_VERIFIED",
      POKE_SCHEDULE:        "SG_POKE_SCHEDULE",
      REQUEST_TOKEN_REFRESH:"SG_REQUEST_TOKEN_REFRESH",
      TOGGLE_HUD:           "SG_TOGGLE_HUD",
      TOGGLE_PAUSE:         "SG_TOGGLE_PAUSE",
      TOGGLE_OVERRIDE:      "SG_TOGGLE_OVERRIDE",
      TELEGRAM_LOG:         "SG_TELEGRAM_LOG",
      HEARTBEAT:            "SG_HEARTBEAT",
      KILL:                 "SG_KILL"
    },

    // ── Alarm Names ──
    ALARMS: {
      TOKEN_CHECK:   "SG_TOKEN_CHECK",
      BURST_START:   "SG_BURST_START",
      BURST_STEP:    "SG_BURST_STEP",
      OVERRIDE_TICK: "SG_OVERRIDE_TICK",
      HEARTBEAT:     "SG_HEARTBEAT"
    },

    // ── Error Reasons ──
    REASONS: {
      DEVICE_LIMIT_EXCEEDED: "device-limit-exceeded",
      REVOKED:               "revoked",
      TAMPER_DETECTED:       "tamper-detected",
      SERVER_UNREACHABLE:    "server-unreachable",
      INVALID_SIGNATURE:     "invalid-signature",
      INCOMPLETE_RESPONSE:   "incomplete-server-response"
    },

    // ── Defaults ──
    DEFAULTS: {
      sg_enabled:      false,
      sg_override:     false,
      sg_paused:       false,
      sg_base_ms:      4000,
      sg_jitter_ms:    250,
      sg_burst_count:  2,
      sg_next_due:     null,
      sg_burst_left:   0,
      sg_access_token: null,
      sg_token_exp:    0,
      sg_tg_queue:     [],
      sg_dates:        [],
      sg_blacklist_dates: [],
      sg_contact_url:  "__SG_CONTACT_URL__",
      sg_consent_given: false
    },

    // ── Employee ID localStorage key pattern ──
    EID_PATTERN: /aza-user-features-(\d+)-prod/,

    // ── Inter-script message secret (randomized at build time) ──
    MSG_SECRET: "__SG_MSG_SECRET__",

    // ── Debug / Production ──
    DEBUG: false,  // Set to true for verbose logging; build.js can override to false for production

    // ── Message Schema Validation ──
    MSG_SCHEMA: {
      SG_VERIFY_LICENSE:        { required: ["key"], optional: [] },
      SG_SET_ENABLED:           { required: ["value"], optional: [] },
      SG_SET_PAUSED:            { required: ["value"], optional: [] },
      SG_SET_OVERRIDE:          { required: ["value"], optional: [] },
      SG_RELOAD_ALL_NOW:        { required: [], optional: [] },
      SG_TELEGRAM_LOG:          { required: ["userKey", "date", "time"], optional: [] },
      SG_EID:                   { required: ["eid"], optional: [] },
      SG_POKE_SCHEDULE:         { required: [], optional: [] },
      SG_REQUEST_TOKEN_REFRESH: { required: [], optional: [] },
      SG_TOGGLE_HUD:            { required: [], optional: [] },
      SG_TOGGLE_PAUSE:          { required: [], optional: [] },
      SG_TOGGLE_OVERRIDE:       { required: [], optional: [] },
      SG_SET_BLACKLIST_DATES:   { required: ["blacklist"], optional: [] },
      SG_STORE_TELEGRAM_CONFIG: { required: ["botToken", "chatId"], optional: [] }
    },

    // ── State Machine States ──
    STATES: {
      OFF:         "OFF",
      LIVE:        "LIVE",
      PAUSED:      "PAUSED",
      FAST:        "FAST",
      NO_KEY:      "NO_KEY",
      RATE_LIMITED:"RATE_LIMITED"
    }
  };

})(typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : this);
