/**
 * Shared Constants — Single source of truth for all timing values,
 * storage keys, URLs, message types, and enums.
 *
 * All values are readonly to prevent accidental mutation.
 */

// Build-time injected by Vite define()
declare const __LICENSE_PUBLIC_KEY__: string | undefined;

// ── Version ──
export const SG_VERSION = '2.0.0';
export const SG_NAME = 'SF30 V2.0';

// ── Timing (milliseconds unless noted) ──
export const TIMING = {
  CONFIRM_WAIT_MS: 120,
  PER_SHIFT_STAGGER_MS: 100,
  HUD_REFRESH_MS: 2000,
  DOM_SCAN_MS: 800,
  NOTIFY_DURATION_MS: 4000,
  POLL_INTERVAL_MS: 1000,
  TURBO_POLL_INTERVAL_MS: 500,
  RATE_LIMIT_POLL_MS: 5000,
  RATE_LIMIT_DURATION_MS: 30000,
  POLL_JITTER_MS: 200,
  TOKEN_CHECK_INTERVAL_MS: 120000,
  TOKEN_REFRESH_THRESHOLD_S: 300, // 5 minutes
  CSRF_CACHE_TTL_MS: 60000,
  API_LOAD_TIMEOUT_MS: 1500,
  API_LOAD_POLL_MS: 100,
  API_LOAD_MAX_TRIES: 15,
  STATS_LOG_INTERVAL_MS: 30000,
  OFFLINE_GRACE_PERIOD_DAYS: 7,
  PERSIST_DEBOUNCE_MS: 500,
  TELEGRAM_QUEUE_FLUSH_INTERVAL_MS: 60000,
  ERROR_LOG_MAX_AGE_DAYS: 7,
  TELEGRAM_QUEUE_MAX_AGE_DAYS: 30,
  DEVICE_FP_CACHE_TTL_MS: 86400000, // 24 hours
} as const;

// ── URLs ──
export const URLS = {
  GQL: 'https://atoz-apps.amazon.work/apis/ScheduleManagementService/graphql',
  CONTACT_URL: 'https://t.me/shift_grabber',
  TELEGRAM_API: 'https://api.telegram.org',
} as const;

// ── License Verification ──

/** Base64-encoded SPKI DER public key for ECDSA P-256 license verification */
export function getLicensePublicKey(): string {
  if (typeof __LICENSE_PUBLIC_KEY__ !== 'undefined' && __LICENSE_PUBLIC_KEY__) {
    return __LICENSE_PUBLIC_KEY__;
  }
  return '';
}

// ── Storage Keys ──
export const STORAGE_KEYS = {
  STATE: 'sg_v2_state',
  INSTALL_SECRET: 'sg_v2_install_secret',
  DEVICE_FP: 'sg_v2_device_fp',
  DEVICE_FP_HASH: 'sg_v2_device_fp_hash',
  USER_KEY: 'sg_v2_user_key',
  LICENSE_EXP: 'sg_v2_license_exp',
  LICENSE_TIER: 'sg_v2_license_tier',
  CONSENT_GIVEN: 'sg_v2_consent_given',
  CONSENT_DATE: 'sg_v2_consent_date',
  TG_BOT_TOKEN_ENC: 'sg_v2_tg_bot_token_enc',
  TG_CHAT_ID_ENC: 'sg_v2_tg_chat_id_enc',
  TG_OPT_OUT: 'sg_v2_tg_opt_out',
  TG_QUEUE: 'sg_v2_tg_queue',
  ERROR_LOG: 'sg_v2_error_log',
  LAST_SERVER_TIME: 'sg_v2_last_server_time',
  REVOCATION_LIST: 'sg_v2_revocation_list',
  REVOCATION_LIST_ETAG: 'sg_v2_revocation_list_etag',
  INTEGRITY_HASHES: 'sg_v2_integrity_hashes',
} as const;

// ── GraphQL ──
export const GQL_QUERIES = {
  POLL: 'query PollShifts($timeRange:DateTimeRangeInput!,$filter:ShiftOpportunitiesFilter,$opportunityTypes:TypeFilter!){shiftOpportunities(timeRange:$timeRange,filter:$filter){opportunities(opportunityTypes:$opportunityTypes){id type shift{id timeRange{start end __typename}duration{value __typename}site{name __typename}__typename}__typename}__typename}}',
  CLAIM: 'mutation AddShift($shiftOpportunityId:AddShiftInput!){addShift(input:$shiftOpportunityId)}',
} as const;

// ── Message Types (cross-context communication) ──
export const MSG_TYPES = {
  // Popup / Content -> Background
  VERIFY_LICENSE: 'SG_V2_VERIFY_LICENSE',
  SET_ENABLED: 'SG_V2_SET_ENABLED',
  SET_PAUSED: 'SG_V2_SET_PAUSED',
  SET_OVERRIDE: 'SG_V2_SET_OVERRIDE',
  SET_SETTINGS: 'SG_V2_SET_SETTINGS',
  SET_TELEGRAM: 'SG_V2_SET_TELEGRAM',
  GET_STATE: 'SG_V2_GET_STATE',
  RELOAD_ALL: 'SG_V2_RELOAD_ALL',
  EXPORT_DATA: 'SG_V2_EXPORT_DATA',
  DELETE_DATA: 'SG_V2_DELETE_DATA',

  // Background -> All contexts
  STATE_CHANGED: 'SG_V2_STATE_CHANGED',
  KILL_SWITCH: 'SG_V2_KILL_SWITCH',
  TOKEN_REFRESHED: 'SG_V2_TOKEN_REFRESHED',

  // Content (isolated) -> Background
  CLAIM_RESULT: 'SG_V2_CLAIM_RESULT',
  EID_FOUND: 'SG_V2_EID_FOUND',
  RATE_LIMITED: 'SG_V2_RATE_LIMITED',

  // Background -> Content (isolated)
  START_POLLING: 'SG_V2_START_POLLING',
  STOP_POLLING: 'SG_V2_STOP_POLLING',
  SET_SPEED: 'SG_V2_SET_SPEED',
  SET_BLACKLIST: 'SG_V2_SET_BLACKLIST',

  // Popup -> Content (via background relay)
  TOGGLE_HUD: 'SG_V2_TOGGLE_HUD',
} as const;

// ── Alarm Names ──
export const ALARMS = {
  TOKEN_CHECK: 'SG_V2_TOKEN_CHECK',
  BURST_START: 'SG_V2_BURST_START',
  BURST_END: 'SG_V2_BURST_END',
  BURST_STEP: 'SG_V2_BURST_STEP',
  OVERRIDE_TICK: 'SG_V2_OVERRIDE_TICK',
  HEARTBEAT: 'SG_V2_HEARTBEAT',
  CLEANUP: 'SG_V2_CLEANUP',
  REVOCATION_SYNC: 'SG_V2_REVOCATION_SYNC',
  TELEGRAM_FLUSH: 'SG_V2_TELEGRAM_FLUSH',
} as const;

// ── Error Reasons ──
export const REASONS = {
  DEVICE_LIMIT_EXCEEDED: 'device-limit-exceeded',
  REVOKED: 'revoked',
  TAMPER_DETECTED: 'tamper-detected',
  SERVER_UNREACHABLE: 'server-unreachable',
  INVALID_SIGNATURE: 'invalid-signature',
  INCOMPLETE_RESPONSE: 'incomplete-server-response',
  TRIAL_EXPIRED: 'trial-expired',
  NO_KEY: 'no-key',
  OFFLINE_EXPIRED: 'offline-grace-expired',
} as const;

// ── License Tiers ──
export const TIERS = {
  BASIC: 'basic',
  PRO: 'pro',
} as const;

export type Tier = typeof TIERS[keyof typeof TIERS];

// ── Runtime States ──
export const STATES = {
  OFF: 'OFF',
  LIVE: 'LIVE',
  PAUSED: 'PAUSED',
  FAST: 'FAST',
  NO_KEY: 'NO_KEY',
  RATE_LIMITED: 'RATE_LIMITED',
  TRIAL: 'TRIAL',
} as const;

export type RuntimeState = typeof STATES[keyof typeof STATES];

// ── Employee ID Pattern ──
export const EID_PATTERN = /aza-user-features-(\d+)-prod/;

// ── Terminal Error Strings (GraphQL) ──
export const TERMINAL_ERRORS = [
  'capacity',
  'expired',
  'already accepted',
  'not eligible',
  'ineligible',
] as const;

// ── Consent Helper ──
export async function checkConsent(flag: 'license' | 'telegram' | 'errors'): Promise<boolean> {
  const key = `sg_v2_consent_${flag}`;
  const result = await chrome.storage.local.get([key, 'sg_v2_consent_given']);
  return result.sg_v2_consent_given === true && result[key] === true;
}
