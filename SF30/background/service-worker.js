// service-worker.js — SF30 V2.0 background scheduler
// Uses chrome.alarms for timing and only runs when a valid local license exists.
importScripts("../src/shared/constants.js");
importScripts("../src/shared/crypto.js");
importScripts("../src/shared/fingerprint.js");
importScripts("../src/shared/license-validator.js");

const C = self.SG_CONSTS;
const K = C.KEYS;
const TIMING = C.TIMING;
const URLS = C.URLS;
const MSG = C.MSG;
const ALARMS = C.ALARMS;
const SG_CRYPTO = self.SG_CRYPTO;
const SG_FINGERPRINT = self.SG_FINGERPRINT;
const SG_LICENSE = self.SG_LICENSE;

// Kill switch state
let killSwitchActive = false;

// ── Bundle Integrity Verifier ──
// Loads dist/src/shared/integrity.json (generated and HMAC-signed at build time),
// verifies the manifest signature using the build-time HMAC key embedded here,
// then re-hashes every shipped JS file and compares to the manifest.
// If anything mismatches → kill switch flips and license validation always fails.
// Result is cached for the SW lifetime to keep the hot path fast.
const SG_INTEGRITY_HMAC_KEY = "__SG_HMAC_KEY__";
let _integrityVerified = null; // null = not yet checked, true = ok, false = tampered

async function verifyBundleIntegrity() {
  if (_integrityVerified !== null) return _integrityVerified;
  // Debug build with no key injected — skip the check (dev only)
  if (SG_INTEGRITY_HMAC_KEY === "__SG_HMAC_KEY__") {
    _integrityVerified = true;
    return true;
  }
  try {
    const url = chrome.runtime.getURL("src/shared/integrity.json");
    const resp = await fetch(url);
    if (!resp.ok) {
      console.error("[SG SW] integrity.json missing or unreadable");
      _integrityVerified = false;
      return false;
    }
    const block = await resp.json();
    if (!block || !block.manifest || !block.signature) {
      console.error("[SG SW] integrity.json malformed");
      _integrityVerified = false;
      return false;
    }
    // Verify HMAC signature on the manifest body
    const manifestJson = JSON.stringify(block.manifest);
    const sigOk = await SG_CRYPTO.verifyHmac(manifestJson, block.signature, SG_INTEGRITY_HMAC_KEY);
    if (!sigOk) {
      console.error("[SG SW] integrity manifest signature mismatch — tamper detected");
      _integrityVerified = false;
      return false;
    }
    // Re-hash each file and compare against the manifest
    for (const filePath in block.manifest) {
      const fileUrl = chrome.runtime.getURL(filePath);
      const fileResp = await fetch(fileUrl);
      if (!fileResp.ok) {
        // File listed in manifest but missing on disk = tamper
        console.error("[SG SW] integrity: file missing", filePath);
        _integrityVerified = false;
        return false;
      }
      const buf = await fileResp.arrayBuffer();
      const hashBuf = await crypto.subtle.digest("SHA-256", buf);
      const hashHex = Array.from(new Uint8Array(hashBuf))
        .map(b => b.toString(16).padStart(2, "0")).join("");
      if (hashHex !== block.manifest[filePath]) {
        console.error("[SG SW] integrity: file tampered", filePath);
        _integrityVerified = false;
        return false;
      }
    }
    _integrityVerified = true;
    return true;
  } catch (e) {
    console.error("[SG SW] integrity check error:", e);
    _integrityVerified = false;
    return false;
  }
}

/** Load valid token from storage.
 *  Verifies bundle integrity, HMAC signature on stored state, and devtools/debugger absence.
 *  Three layers of tamper detection before returning a usable token. */
async function getValidToken() {
  // Layer 1: Bundle integrity — has any shipped file been edited post-build?
  const integrityOk = await verifyBundleIntegrity();
  if (!integrityOk) return null;

  // Layer 2: Anti-debug — is a debugger likely attached right now?
  if (SG_LICENSE && SG_LICENSE.isDebuggerLikelyOpen && SG_LICENSE.isDebuggerLikelyOpen()) {
    console.warn("[SG SW] Debugger detected — refusing to issue token");
    return null;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const st = await new Promise(r => chrome.storage.local.get({
    sg_license_exp: 0,
    sg_tier: "",
    sg_userKey: "",
    sg_device_fp: "",
    sg_license_state_sig: ""
  }, r));
  const exp = st.sg_license_exp || 0;
  if (exp <= nowSec + 60) return null;

  // HMAC signature verification — prevents storage poisoning
  if (SG_LICENSE && SG_LICENSE.verifyStateSignature) {
    const sigOk = await SG_LICENSE.verifyStateSignature({
      exp: exp,
      tier: st.sg_tier,
      userKey: st.sg_userKey,
      fp: st.sg_device_fp
    }, st.sg_license_state_sig);
    if (!sigOk) {
      console.warn("[SG SW] License state signature invalid — storage may be tampered");
      return null;
    }
  }
  return { token: "offline", exp: exp };
}

/**
 * Offline license check — verifies local expiry and device binding.
 * Replaces server heartbeat in the no-server model.
 * @returns {Promise<{ok:boolean}>}
 */
async function sendHeartbeat() {
  try {
    const st = await getState();
    const key = st[K.USER_KEY];
    if (!key) return { ok: false, reason: "no-key" };

    const fp = await SG_FINGERPRINT.getFingerprint();
    const result = await SG_LICENSE.validate(key, fp);

    if (!result.ok) {
      if (result.reason === "expired") {
        killSwitchActive = true;
        await setState({ [K.ENABLED]: false, sg_kill_reason: "license-expired" });
        await withAlarmLock(async () => {
          await clearAllAlarms();
          await setState({ [K.NEXT_DUE]: null, [K.BURST_REMAINING]: 0 });
        });
        chrome.runtime.sendMessage({ type: "SG_KILL", reason: "license-expired" });
        console.warn("[SG SW] License expired — extension disabled");
      }
      return { ok: false, reason: result.reason };
    }

    killSwitchActive = false;
    return { ok: true };
  } catch (e) {
    console.error("[SG SW] License check error:", e);
    return { ok: false, reason: "validation-error" };
  }
}

/**
 * Validates incoming messages against a strict schema.
 * @param {any} msg
 * @returns {{valid:boolean, reason?:string}}
 */
function validateMessage(msg) {
  if (!msg || typeof msg !== "object") return { valid: false, reason: "missing-message" };
  if (!msg.type) return { valid: false, reason: "missing-type" };
  const schema = C.MSG_SCHEMA[msg.type];
  if (!schema) return { valid: true }; // unknown types pass through
  for (const key of schema.required) {
    if (!(key in msg)) return { valid: false, reason: "missing-field:" + key };
  }
  return { valid: true };
}

// ── State Machine ──
// Computes canonical state from storage booleans + token status
/**
 * Derives runtime state from chrome.storage.local.
 * @returns {Promise<Object>}
 */
async function computeState() {
  const st = await getState();
  const nowSec = Math.floor(Date.now() / 1000);
  const tok = await getValidToken();
  const hasToken = !!tok && tok.exp > nowSec;

  if (!st[K.ENABLED]) return C.STATES.OFF;
  if (!hasToken) return C.STATES.NO_KEY;
  if (st[K.PAUSED]) return C.STATES.PAUSED;
  if (st[K.OVERRIDE]) return C.STATES.FAST;
  return C.STATES.LIVE;
}

// Encrypt/decrypt sensitive config values using device fingerprint
/**
 * Encrypts a string value using AES-GCM.
 * @param {string} value
 * @returns {Promise<string>} base64 ciphertext
 */
async function encryptConfig(value) {
  try {
    var fp = await SG_FINGERPRINT.getFingerprint();
    return await SG_CRYPTO.encrypt(value, fp);
  } catch (e) { return null; }
}

/**
 * Decrypts an AES-GCM ciphertext.
 * @param {string} encrypted base64 ciphertext
 * @returns {Promise<string|null>}
 */
async function decryptConfig(encrypted) {
  try {
    if (!encrypted) return null;
    var fp = await SG_FINGERPRINT.getFingerprint();
    return await SG_CRYPTO.decrypt(encrypted, fp);
  } catch (e) { return null; }
}

async function getTelegramCredentials() {
  const data = await new Promise(r => chrome.storage.local.get({
    sg_tg_bot_token_enc: "",
    sg_tg_chat_id_enc:   ""
  }, r));
  const tokenEnc = data.sg_tg_bot_token_enc;
  const chatIdEnc = data.sg_tg_chat_id_enc;
  if (!tokenEnc || !chatIdEnc) {
    // Legacy plaintext fallback — read and migrate
    const legacy = await new Promise(r => chrome.storage.local.get({
      [K.TG_BOT_TOKEN]: "",
      [K.TG_CHAT_ID]:   ""
    }, r));
    if (legacy[K.TG_BOT_TOKEN] && legacy[K.TG_CHAT_ID]) {
      const token = legacy[K.TG_BOT_TOKEN];
      const chatId = legacy[K.TG_CHAT_ID];
      // Migrate to encrypted
      const tokEnc = await encryptConfig(token);
      const cidEnc = await encryptConfig(chatId);
      if (tokEnc && cidEnc) {
        await new Promise(r => chrome.storage.local.set({
          sg_tg_bot_token_enc: tokEnc,
          sg_tg_chat_id_enc: cidEnc,
          [K.TG_BOT_TOKEN]: "",
          [K.TG_CHAT_ID]: ""
        }, r));
      }
      return { botToken: token, chatId: chatId };
    }
    console.warn("[SG SW] Telegram credentials not configured — skipping notifications");
    return null;
  }
  const token = await decryptConfig(tokenEnc);
  const chatId = await decryptConfig(chatIdEnc);
  if (!token || !chatId) {
    console.warn("[SG SW] Telegram credentials decryption failed");
    return null;
  }
  return { botToken: token, chatId: chatId };
}

/**
 * Sends queued Telegram notifications.
 * @returns {Promise<void>}
 */
async function flushTelegramQueue() {
  try {
    const res   = await new Promise(r => chrome.storage.local.get({ sg_tg_queue: [] }, r));
    const queue = res.sg_tg_queue || [];
    if (queue.length === 0) return;
    // Clear before sending — prevents double-send if SW restarts mid-flush
    await new Promise(r => chrome.storage.local.set({ sg_tg_queue: [] }, r));
    const failed = [];
    for (const item of queue) {
      const ok = await sendTelegram(item.userKey, item.date, item.time);
      if (!ok) failed.push(item); // re-queue on Telegram API failure
    }
    if (failed.length > 0) {
      // Merge back with any new items that arrived while we were flushing
      const current = await new Promise(r => chrome.storage.local.get({ sg_tg_queue: [] }, r));
      const merged  = [...failed, ...(current.sg_tg_queue || [])];
      await new Promise(r => chrome.storage.local.set({ sg_tg_queue: merged }, r));
    }
  } catch (e) {
    console.error("[SG Telegram] flush error:", e);
  }
}

async function sendTelegram(userKey, date, time) {
  try {
    const optOut = await new Promise(r => chrome.storage.local.get({ sg_tg_opt_out: false }, r));
    if (optOut.sg_tg_opt_out) return false; // user disabled Telegram notifications
    const creds = await getTelegramCredentials();
    if (!creds) return false; // fail silently if not configured
    const text =
      `✅ <b>Shift Grabbed</b>\n` +
      `👤 <b>Key:</b> <code>${userKey}</code>\n` +
      `📅 <b>Date:</b> ${date}\n` +
      `⏰ <b>At:</b> ${time}`;
    const res = await fetch(`${URLS.TELEGRAM_API}/bot${creds.botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: creds.chatId, text, parse_mode: "HTML" }),
      signal: AbortSignal.timeout(10000)
    });
    const json = await res.json();
    if (!json.ok) { console.error("[SG Telegram] Failed:", json); return false; }
    return true;
  } catch (e) {
    console.error("[SG Telegram] Error:", e);
    return false;
  }
}

const DEFAULTS = {
  [K.ENABLED]: false,
  [K.OVERRIDE]: false,
  [K.PAUSED]: false,
  [K.BASE_MS]: 4000,
  [K.JITTER_MS]: 250,
  [K.BURST_COUNT]: 2,
  [K.NEXT_DUE]: null,
  [K.BURST_REMAINING]: 0,
  [K.ACCESS_TOKEN]: null,
  [K.TOKEN_EXP]: 0,
  [K.TG_BOT_TOKEN]: "",
  [K.TG_CHAT_ID]:   "",
  [K.CONTACT_URL]:  URLS.CONTACT_URL,
  [K.USER_KEY]:     ""
};

function getState() {
  return new Promise((resolve) => chrome.storage.local.get(DEFAULTS, resolve));
}
function setState(obj) {
  return new Promise((resolve) => chrome.storage.local.set(obj, resolve));
}

function jitteredDelay(base, jitter) {
  const span = jitter * 2 + 1;
  return base + (Math.floor(Math.random() * span) - jitter);
}

function nextFiveMinuteAnchorMinus800ms(from = new Date()) {
  const d = new Date(from.getTime());
  const mins = d.getMinutes();
  const add = (5 - (mins % 5)) % 5;
  d.setSeconds(0, 0);
  d.setMinutes(mins + add);
  d.setTime(d.getTime() - 800);
  if (d.getTime() <= from.getTime()) d.setMinutes(d.getMinutes() + 5);
  return d;
}

// Cached tab IDs to avoid repeated chrome.tabs.query calls
let _cachedTabIds = [];
let _tabCacheTs = 0;
const TAB_CACHE_TTL_MS = 10000;

function getAtoZTabIds(cb) {
  const now = Date.now();
  if (_cachedTabIds.length > 0 && (now - _tabCacheTs) < TAB_CACHE_TTL_MS) {
    cb(_cachedTabIds);
    return;
  }
  chrome.tabs.query({ url: "https://atoz.amazon.work/*" }, (tabs) => {
    _cachedTabIds = (tabs || []).map(t => t.id);
    _tabCacheTs = now;
    cb(_cachedTabIds);
  });
}

function invalidateTabCache() {
  _cachedTabIds = [];
  _tabCacheTs = 0;
}

function reloadAllAtoZTabs() {
  getAtoZTabIds((ids) => {
    ids.forEach((id) => chrome.tabs.reload(id));
  });
}

// Simple mutex to prevent alarm creation races between concurrent message handlers
let _alarmLock = false;
let _alarmQueue = [];

/**
 * Mutex for alarm clear/create to prevent races in MV3.
 * @param {Function} fn
 * @returns {Promise<void>}
 */
async function withAlarmLock(fn) {
  if (_alarmLock) {
    return new Promise((resolve) => _alarmQueue.push(() => fn().then(resolve)));
  }
  _alarmLock = true;
  try {
    await fn();
  } finally {
    _alarmLock = false;
    const next = _alarmQueue.shift();
    if (next) next();
  }
}

/**
 * Clears all SG alarms. Must be called inside withAlarmLock.
 * @returns {Promise<void>}
 */
async function clearAllAlarms() {
  await new Promise((r) => chrome.alarms.clearAll(() => r()));
}

// Schedule logic that requires token validity
async function scheduleNextBurstAnchor() {
  const st = await getState();
  const nowSec = Math.floor(Date.now() / 1000);
  if (!st[K.ENABLED] || st[K.OVERRIDE] || st[K.PAUSED]) return;
  // token must be present and not expired
  const tok = await getValidToken();
  if (!tok || !tok.exp || tok.exp <= nowSec) return;

  const anchor = nextFiveMinuteAnchorMinus800ms(new Date());
  await setState({ [K.NEXT_DUE]: anchor.getTime(), [K.BURST_REMAINING]: st[K.BURST_COUNT] });
  chrome.alarms.create("SG_BURST_START", { when: anchor.getTime() });
}

async function startOverrideTick() {
  const st = await getState();
  const nowSec = Math.floor(Date.now() / 1000);
  if (!st[K.ENABLED] || !st[K.OVERRIDE] || st[K.PAUSED]) return;
  const tok = await getValidToken();
  if (!tok || !tok.exp || tok.exp <= nowSec) return;

  const delay = jitteredDelay(st[K.BASE_MS], st[K.JITTER_MS]);
  await setState({ [K.NEXT_DUE]: Date.now() + delay, [K.BURST_REMAINING]: 0 });
  chrome.alarms.create("SG_OVERRIDE_TICK", { when: Date.now() + delay });
}

// Alarm router
chrome.alarms.onAlarm.addListener(async (alarm) => {
  // Token check alarm — runs every 2 min regardless of enabled/paused state
  if (alarm.name === "SG_TOKEN_CHECK") {
    await tryAutoRefreshTokenIfNeeded();
    await flushTelegramQueue();
    return;
  }

  // Heartbeat alarm — runs every 10 min
  if (alarm.name === ALARMS.HEARTBEAT) {
    await sendHeartbeat();
    return;
  }

  const st = await getState();
  const nowSec = Math.floor(Date.now() / 1000);
  if (!st[K.ENABLED] || st[K.PAUSED]) return;
  const tok = await getValidToken();
  if (!tok || !tok.exp || tok.exp <= nowSec) return;

  await flushTelegramQueue();

  if (alarm.name === "SG_BURST_START") {
    if (st[K.OVERRIDE]) return;
    await setState({ [K.BURST_REMAINING]: st[K.BURST_COUNT] });
    reloadAllAtoZTabs();
    const left = st[K.BURST_COUNT] - 1;
    await setState({ [K.BURST_REMAINING]: Math.max(0, left) });
    if (left > 0) {
      const delay = jitteredDelay(st[K.BASE_MS], st[K.JITTER_MS]);
      await setState({ [K.NEXT_DUE]: Date.now() + delay });
      chrome.alarms.create("SG_BURST_STEP", { when: Date.now() + delay });
    } else {
      await scheduleNextBurstAnchor();
    }
  }

  if (alarm.name === "SG_BURST_STEP") {
    const s2 = await getState();
    if (!s2[K.ENABLED] || s2[K.PAUSED] || s2[K.OVERRIDE]) return;
    const tok2 = await getValidToken();
    if (!tok2 || !tok2.exp || tok2.exp <= nowSec) return;
    reloadAllAtoZTabs();
    const left = Math.max(0, (s2[K.BURST_REMAINING] || 0) - 1);
    await setState({ [K.BURST_REMAINING]: left });
    if (left > 0) {
      const delay = jitteredDelay(s2[K.BASE_MS], s2[K.JITTER_MS]);
      await setState({ [K.NEXT_DUE]: Date.now() + delay });
      chrome.alarms.create("SG_BURST_STEP", { when: Date.now() + delay });
    } else {
      await scheduleNextBurstAnchor();
    }
  }

  if (alarm.name === "SG_OVERRIDE_TICK") {
    const s3 = await getState();
    if (!s3[K.ENABLED] || !s3[K.OVERRIDE] || s3[K.PAUSED]) return;
    const tok3 = await getValidToken();
    if (!tok3 || !tok3.exp || tok3.exp <= nowSec) return;
    reloadAllAtoZTabs();
    await startOverrideTick();
  }
});

/**
 * Validates that a message sender is trusted (from this extension).
 * In some Chrome versions popup messages arrive without sender.id,
 * so we also accept matching chrome-extension:// URLs.
 */
function isTrustedSender(sender) {
  if (!sender) return false;
  if (sender.id === chrome.runtime.id) return true;
  if (!sender.id && sender.url &&
      sender.url.startsWith("chrome-extension://" + chrome.runtime.id + "/")) {
    return true;
  }
  return false;
}

/**
 * Safely call sendResponse, swallowing any errors (e.g. port already closed).
 */
function safeSendResponse(sendResponse, payload) {
  try {
    if (typeof sendResponse === "function") {
      sendResponse(payload);
    }
  } catch (e) {
    console.error("[SG SW] sendResponse failed:", e);
  }
}

// Handle messages from popup / content scripts
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) {
    safeSendResponse(sendResponse, { ok: false, reason: "missing-message" });
    return true;
  }
  // Security: validate sender is from this extension only
  if (!isTrustedSender(sender)) {
    console.warn("[SG SW] Blocked message from untrusted sender:", sender);
    safeSendResponse(sendResponse, { ok: false, reason: "untrusted-sender" });
    return true;
  }
  // Schema validation
  const validation = validateMessage(msg);
  if (!validation.valid) {
    console.warn("[SG SW] Invalid message schema:", validation.reason, msg.type);
    safeSendResponse(sendResponse, { ok: false, reason: validation.reason });
    return true;
  }
  handleMessage(msg, sender, sendResponse).catch((err) => {
    console.error("[SG SW] Unhandled error in handleMessage:", err);
    safeSendResponse(sendResponse, { ok: false, reason: "sw-error" });
  });
  return true; // keeps message channel open for async response
});

/**
 * Routes incoming runtime messages to handlers.
 * @param {Object} msg
 * @param {chrome.runtime.MessageSender} sender
 * @param {Function} sendResponse
 * @returns {Promise<boolean|void>}
 */
async function handleMessage(msg, sender, sendResponse) {
  if (msg.type === "SG_VERIFY_LICENSE") {
    console.log("[SG SW] SG_VERIFY_LICENSE start");
    const key = msg.key;
    const result = await verifyLicense(key);
    console.log("[SG SW] SG_VERIFY_LICENSE result:", result.ok, result.reason || "-");
    if (result.ok) {
      await withAlarmLock(async () => {
        await clearAllAlarms();
        const st = await getState();
        if (st[K.ENABLED]) {
          if (st[K.OVERRIDE]) await startOverrideTick();
          else await scheduleNextBurstAnchor();
        }
      });
    } else {
      await setState({ [K.ACCESS_TOKEN]: null, [K.TOKEN_EXP]: 0, sg_subscription_status: "expired" });
    }
    safeSendResponse(sendResponse, result);
    console.log("[SG SW] SG_VERIFY_LICENSE responded");
    return;
  }

  if (msg.type === "SG_LICENSE_VERIFIED") {
    // popup says license verified (value true/false)
    const ok = !!msg.value;
    // if verified true, re-schedule; if false clear
    await withAlarmLock(async () => {
      await clearAllAlarms();
      const st = await getState();
      if (ok) {
        // token must be present (popup stored token). kick off scheduling
        if (st[K.ENABLED]) {
          if (st[K.OVERRIDE]) await startOverrideTick();
          else await scheduleNextBurstAnchor();
        }
      } else {
        await setState({ [K.NEXT_DUE]: null, [K.BURST_REMAINING]: 0 });
      }
    });
    safeSendResponse(sendResponse, { ok: true });
    return;
  }

  if (msg.type === "SG_SET_ENABLED") {
    await setState({ [K.ENABLED]: !!msg.value });
    // Broadcast to all content scripts so they start/stop polling
    const tabs = await chrome.tabs.query({ url: "https://atoz.amazon.work/*" });
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, { type: "SG_SET_ENABLED", value: !!msg.value }).catch(() => {});
    }
    await withAlarmLock(async () => {
      await clearAllAlarms();
      const st = await getState();
      if (st[K.ENABLED]) {
        ensureTokenCheckAlarm();
        if (st[K.OVERRIDE]) await startOverrideTick();
        else await scheduleNextBurstAnchor();
      } else {
        await setState({ [K.NEXT_DUE]: null, [K.BURST_REMAINING]: 0 });
      }
    });
    safeSendResponse(sendResponse, { ok: true });
    return;
  }

  if (msg.type === "SG_SET_OVERRIDE") {
    await setState({ [K.OVERRIDE]: !!msg.value });
    await withAlarmLock(async () => {
      await clearAllAlarms();
      const st = await getState();
      if (st[K.ENABLED]) {
        if (st[K.OVERRIDE]) await startOverrideTick();
        else await scheduleNextBurstAnchor();
      }
    });
    safeSendResponse(sendResponse, { ok: true });
    return;
  }

  if (msg.type === "SG_SET_PAUSED") {
    await setState({ [K.PAUSED]: !!msg.value });
    await withAlarmLock(async () => {
      await clearAllAlarms();
      const st = await getState();
      if (st[K.ENABLED] && !st[K.PAUSED]) {
        if (st[K.OVERRIDE]) await startOverrideTick();
        else await scheduleNextBurstAnchor();
      } else {
        await setState({ [K.NEXT_DUE]: null, [K.BURST_REMAINING]: 0 });
      }
    });
    safeSendResponse(sendResponse, { ok: true });
    return;
  }

  if (msg.type === "SG_RELOAD_ALL_NOW") {
    const st = await getState();
    const tok = await getValidToken();
    const nowSec = Math.floor(Date.now() / 1000);
    if (st[K.ENABLED] && !st[K.PAUSED] && tok && tok.exp > nowSec) reloadAllAtoZTabs();
    safeSendResponse(sendResponse, { ok: true });
    return;
  }

  if (msg.type === "SG_TELEGRAM_LOG") {
    await sendTelegram(msg.userKey, msg.date, msg.time);
    safeSendResponse(sendResponse, { ok: true });
    return;
  }

  if (msg.type === "SG_STORE_TELEGRAM_CONFIG") {
    try {
      const tokEnc = await encryptConfig(msg.botToken);
      const cidEnc = await encryptConfig(msg.chatId);
      if (tokEnc && cidEnc) {
        await setState({ sg_tg_bot_token_enc: tokEnc, sg_tg_chat_id_enc: cidEnc });
        safeSendResponse(sendResponse, { ok: true });
      } else {
        safeSendResponse(sendResponse, { ok: false, error: "encryption-failed" });
      }
    } catch (e) {
      console.error("[SG SW] Store telegram config failed:", e);
      safeSendResponse(sendResponse, { ok: false, error: e.message });
    }
    return;
  }

  if (msg.type === "SG_EID") {
    // Store employee ID relayed from content script for future use
    await setState({ sg_eid: msg.eid });
    console.log("[SG SW] Employee ID stored:", msg.eid);
    safeSendResponse(sendResponse, { ok: true });
    return;
  }

  if (msg.type === "SG_POKE_SCHEDULE") {
    await withAlarmLock(async () => {
      await clearAllAlarms();
      const st = await getState();
      const tok = await getValidToken();
      const nowSec = Math.floor(Date.now() / 1000);
      if (st[K.ENABLED] && tok && tok.exp > nowSec) {
        if (st[K.PAUSED]) {
          await setState({ [K.NEXT_DUE]: null, [K.BURST_REMAINING]: 0 });
        } else if (st[K.OVERRIDE]) {
          await startOverrideTick();
        } else {
          await scheduleNextBurstAnchor();
        }
      }
    });
    safeSendResponse(sendResponse, { ok: true });
    return;
  }

  if (msg.type === "SG_HEARTBEAT") {
    const result = await sendHeartbeat();
    safeSendResponse(sendResponse, result);
    return;
  }
}

/**
 * Verifies a license key with the server. Fail-closed: no self-issue fallback.
 * @param {string} key
 * @param {string} deviceId
 * @returns {Promise<{ok:boolean, reason?:string}>}
 */
async function verifyLicense(key) {
  try {
    if (!key) return { ok: false, reason: "no-key" };

    // Bundle integrity gate — if any shipped file was tampered with post-build,
    // refuse to validate any key. This makes patching license-validator.js (or
    // any other file) detectable even though only license-validator.js itself
    // has selfDefending obfuscation.
    const integrityOk = await verifyBundleIntegrity();
    if (!integrityOk) {
      return { ok: false, reason: "tamper-detected" };
    }

    var fp = await SG_FINGERPRINT.getFingerprint();
    var result = await SG_LICENSE.validate(key, fp);

    if (!result.ok) {
      if (result.reason === "device-limit-exceeded") {
        await setState({
          sg_device_limit_reason: result.reason,
          sg_device_cooldown_days: 0
        });
      }
      return result;
    }

    // Store license info locally
    await setState({
      [K.USER_KEY]: key,
      sg_tier: result.tier,
      sg_license_exp: result.exp,
      sg_device_limit_reason: null,
      sg_device_cooldown_days: 0
    });

    // Sign the license state — any later tampering via DevTools will fail verification.
    // The HMAC key is embedded in obfuscated code, so attackers cannot forge a valid signature.
    if (SG_LICENSE && SG_LICENSE.signState) {
      var sig = await SG_LICENSE.signState({
        exp: result.exp,
        tier: result.tier,
        userKey: key,
        fp: fp
      });
      if (sig) await setState({ sg_license_state_sig: sig });
    }

    console.log("[SG SW] License verified · tier:", result.tier, "· expires:", new Date(result.exp * 1000).toISOString());
    return { ok: true, tier: result.tier, exp: result.exp };
  } catch (e) {
    console.error("[SG SW] License verification error:", e);
    return { ok: false, reason: "validation-error" };
  }
}

/**
 * Attempts silent token refresh before expiry.
 * @returns {Promise<{ok:boolean, reason?:string}>}
 */
async function refreshTokenInBackground() {
  try {
    const data = await new Promise(r =>
      chrome.storage.local.get({ [K.USER_KEY]: "", [K.DEVICE_ID]: "" }, r)
    );
    let deviceId = data[K.DEVICE_ID];
    // Defensive fallback: read legacy keys if unified key not populated yet
    if (!deviceId) {
      const legacy = await new Promise(r =>
        chrome.storage.local.get({ SG_deviceId: "", deviceId: "" }, r)
      );
      deviceId = legacy.SG_deviceId || legacy.deviceId || "";
    }
    const result = await verifyLicense(data[K.USER_KEY]);
    return result.ok;
  } catch (e) {
    console.error("[SG SW] Background token refresh error:", e);
    return false;
  }
}

// Check token expiry; refresh if within 120s of expiry.
// Uses encrypted token loader + SW-direct refresh.
/**
 * Auto-refreshes token if it expires within 5 minutes.
 * @returns {Promise<void>}
 */
async function tryAutoRefreshTokenIfNeeded() {
  const st = await getState();
  const nowSec = Math.floor(Date.now() / 1000);
  const exp = st.sg_license_exp || 0;
  const key = st[K.USER_KEY] || "";
  if (!key || exp - nowSec > 300) return; // not expiring soon
  const ok = await refreshTokenInBackground();
  if (!ok) {
    chrome.runtime.sendMessage({ type: "SG_REQUEST_TOKEN_REFRESH" });
  }
}

// Ensure SG_TOKEN_CHECK alarm exists (fires every 2 min, wakes SW to check token).
// setInterval() does NOT survive SW termination in MV3 — alarms do.
/**
 * Creates the SG_TOKEN_CHECK alarm if missing.
 */
function ensureTokenCheckAlarm() {
  chrome.alarms.get(ALARMS.TOKEN_CHECK, (alarm) => {
    if (!alarm) chrome.alarms.create(ALARMS.TOKEN_CHECK, { delayInMinutes: 1, periodInMinutes: 2 });
  });
}

/**
 * Creates the SG_HEARTBEAT alarm if missing.
 */
function ensureHeartbeatAlarm() {
  chrome.alarms.get(ALARMS.HEARTBEAT, (alarm) => {
    if (!alarm) chrome.alarms.create(ALARMS.HEARTBEAT, { delayInMinutes: 2, periodInMinutes: 10 });
  });
}

// Initialize on install
chrome.runtime.onInstalled.addListener(async () => {
  // Migrate legacy device IDs to unified key on first run
  const legacy = await new Promise(r => chrome.storage.local.get({
    SG_deviceId: "",
    deviceId: ""
  }, r));
  if (legacy.SG_deviceId || legacy.deviceId) {
    const migrated = legacy.SG_deviceId || legacy.deviceId;
    await new Promise(r => chrome.storage.local.set({ [K.DEVICE_ID]: migrated }, r));
    await new Promise(r => chrome.storage.local.remove(["SG_deviceId", "deviceId"], r));
    console.log("[SG SW] Migrated legacy device ID to", K.DEVICE_ID);
  }
  // Only set defaults for keys that don't exist yet — preserve user settings on update
  const existing = await getState();
  const merged = { ...DEFAULTS, ...existing };
  await setState(merged);
  await withAlarmLock(async () => {
    await clearAllAlarms();
    ensureTokenCheckAlarm();
    ensureHeartbeatAlarm();
  });
  await flushTelegramQueue();
});

// Initialize on browser startup
chrome.runtime.onStartup.addListener(async () => {
  await withAlarmLock(async () => {
    await clearAllAlarms();
    ensureTokenCheckAlarm();
    ensureHeartbeatAlarm();
  });
  await flushTelegramQueue();
  const st     = await getState();
  const cached = await getValidToken();
  const nowSec = Math.floor(Date.now() / 1000);
  await withAlarmLock(async () => {
    if (st[K.ENABLED] && !st[K.PAUSED] && cached && cached.exp > nowSec) {
      if (st[K.OVERRIDE]) await startOverrideTick();
      else await scheduleNextBurstAnchor();
    }
  });
});
