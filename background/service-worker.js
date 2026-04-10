// service-worker.js — background scheduler that requires server-issued token
// It uses chrome.alarms for timing and only runs when a valid token exists.

const TG_BOT_TOKEN = "8528351436:AAFzN8eMG21RYQUCcDr4XWZEFCrurLa8cdA";
const TG_CHAT_ID   = "-1003719428092";

async function flushTelegramQueue() {
  try {
    const res   = await new Promise(r => chrome.storage.local.get({ sg_tg_queue: [] }, r));
    const queue = res.sg_tg_queue || [];
    if (queue.length === 0) return;
    await new Promise(r => chrome.storage.local.set({ sg_tg_queue: [] }, r));
    for (const item of queue) {
      await sendTelegram(item.userKey, item.date, item.time);
    }
  } catch (e) {
    console.error("[SG Telegram] flush error:", e);
  }
}

async function sendTelegram(userKey, date, time) {
  try {
    const text =
      `✅ <b>Shift Grabbed</b>\n` +
      `👤 <b>Key:</b> <code>${userKey}</code>\n` +
      `📅 <b>Date:</b> ${date}\n` +
      `⏰ <b>At:</b> ${time}`;
    const res = await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TG_CHAT_ID, text, parse_mode: "HTML" })
    });
    const json = await res.json();
    if (!json.ok) console.error("[SG Telegram] Failed:", json);
  } catch (e) {
    console.error("[SG Telegram] Error:", e);
  }
}

const KEYS = {
  ENABLED: "sg_enabled",
  OVERRIDE: "sg_override",
  PAUSED: "sg_paused",
  ACCESS_TOKEN: "sg_access_token",
  TOKEN_EXP: "sg_token_exp",
  BASE_MS: "sg_base_ms",
  JITTER_MS: "sg_jitter_ms",
  BURST_COUNT: "sg_burst_count",
  NEXT_DUE: "sg_next_due",
  BURST_REMAINING: "sg_burst_left",
  USER_KEY: "SG_userKey"
};

const DEFAULTS = {
  [KEYS.ENABLED]: false,
  [KEYS.OVERRIDE]: false,
  [KEYS.PAUSED]: false,
  [KEYS.BASE_MS]: 4000,
  [KEYS.JITTER_MS]: 250,
  [KEYS.BURST_COUNT]: 2,
  [KEYS.NEXT_DUE]: null,
  [KEYS.BURST_REMAINING]: 0,
  [KEYS.ACCESS_TOKEN]: null,
  [KEYS.TOKEN_EXP]: 0
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

function nextFiveMinuteAnchorMinus100ms(from = new Date()) {
  const d = new Date(from.getTime());
  const mins = d.getMinutes();
  const add = (5 - (mins % 5)) % 5;
  d.setSeconds(0, 0);
  d.setMinutes(mins + add);
  d.setTime(d.getTime() - 800);
  if (d.getTime() <= from.getTime()) d.setMinutes(d.getMinutes() + 5);
  return d;
}

function reloadAllAtoZTabs() {
  chrome.tabs.query({ url: "https://atoz.amazon.work/*" }, (tabs) => {
    tabs.forEach((t) => chrome.tabs.reload(t.id));
  });
}

async function clearAllAlarms() {
  await new Promise((r) => chrome.alarms.clearAll(() => r()));
}

// Schedule logic that requires token validity
async function scheduleNextBurstAnchor() {
  const st = await getState();
  const nowSec = Math.floor(Date.now() / 1000);
  if (!st[KEYS.ENABLED] || st[KEYS.OVERRIDE] || st[KEYS.PAUSED]) return;
  // token must be present and not expired
  if (!st[KEYS.ACCESS_TOKEN] || !st[KEYS.TOKEN_EXP] || st[KEYS.TOKEN_EXP] <= nowSec) return;

  const anchor = nextFiveMinuteAnchorMinus100ms(new Date());
  await setState({ [KEYS.NEXT_DUE]: anchor.getTime(), [KEYS.BURST_REMAINING]: st[KEYS.BURST_COUNT] });
  chrome.alarms.create("SG_BURST_START", { when: anchor.getTime() });
}

async function startOverrideTick() {
  const st = await getState();
  const nowSec = Math.floor(Date.now() / 1000);
  if (!st[KEYS.ENABLED] || !st[KEYS.OVERRIDE] || st[KEYS.PAUSED]) return;
  if (!st[KEYS.ACCESS_TOKEN] || !st[KEYS.TOKEN_EXP] || st[KEYS.TOKEN_EXP] <= nowSec) return;

  const delay = jitteredDelay(st[KEYS.BASE_MS], st[KEYS.JITTER_MS]);
  await setState({ [KEYS.NEXT_DUE]: Date.now() + delay, [KEYS.BURST_REMAINING]: 0 });
  chrome.alarms.create("SG_OVERRIDE_TICK", { when: Date.now() + delay });
}

// Alarm router
chrome.alarms.onAlarm.addListener(async (alarm) => {
  const st = await getState();
  const nowSec = Math.floor(Date.now() / 1000);
  if (!st[KEYS.ENABLED] || st[KEYS.PAUSED]) return;
  if (!st[KEYS.ACCESS_TOKEN] || !st[KEYS.TOKEN_EXP] || st[KEYS.TOKEN_EXP] <= nowSec) return;

  flushTelegramQueue();

  if (alarm.name === "SG_BURST_START") {
    if (st[KEYS.OVERRIDE]) return;
    await setState({ [KEYS.BURST_REMAINING]: st[KEYS.BURST_COUNT] });
    reloadAllAtoZTabs();
    const left = st[KEYS.BURST_COUNT] - 1;
    await setState({ [KEYS.BURST_REMAINING]: Math.max(0, left) });
    if (left > 0) {
      const delay = jitteredDelay(st[KEYS.BASE_MS], st[KEYS.JITTER_MS]);
      await setState({ [KEYS.NEXT_DUE]: Date.now() + delay });
      chrome.alarms.create("SG_BURST_STEP", { when: Date.now() + delay });
    } else {
      await scheduleNextBurstAnchor();
    }
  }

  if (alarm.name === "SG_BURST_STEP") {
    const s2 = await getState();
    if (!s2[KEYS.ENABLED] || s2[KEYS.PAUSED] || s2[KEYS.OVERRIDE]) return;
    if (!s2[KEYS.ACCESS_TOKEN] || !s2[KEYS.TOKEN_EXP] || s2[KEYS.TOKEN_EXP] <= nowSec) return;
    reloadAllAtoZTabs();
    const left = Math.max(0, (s2[KEYS.BURST_REMAINING] || 0) - 1);
    await setState({ [KEYS.BURST_REMAINING]: left });
    if (left > 0) {
      const delay = jitteredDelay(s2[KEYS.BASE_MS], s2[KEYS.JITTER_MS]);
      await setState({ [KEYS.NEXT_DUE]: Date.now() + delay });
      chrome.alarms.create("SG_BURST_STEP", { when: Date.now() + delay });
    } else {
      await scheduleNextBurstAnchor();
    }
  }

  if (alarm.name === "SG_OVERRIDE_TICK") {
    const s3 = await getState();
    if (!s3[KEYS.ENABLED] || !s3[KEYS.OVERRIDE] || s3[KEYS.PAUSED]) return;
    if (!s3[KEYS.ACCESS_TOKEN] || !s3[KEYS.TOKEN_EXP] || s3[KEYS.TOKEN_EXP] <= nowSec) return;
    reloadAllAtoZTabs();
    await startOverrideTick();
  }
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;
  handleMessage(msg, sender, sendResponse);
  return true; // keeps message channel open for async response
});

async function handleMessage(msg, sender, sendResponse) {
  if (msg.type === "SG_LICENSE_VERIFIED") {
    // popup says license verified (value true/false)
    const ok = !!msg.value;
    // if verified true, re-schedule; if false clear
    await clearAllAlarms();
    const st = await getState();
    if (ok) {
      // token must be present (popup stored token). kick off scheduling
      if (st[KEYS.ENABLED]) {
        if (st[KEYS.OVERRIDE]) await startOverrideTick();
        else await scheduleNextBurstAnchor();
      }
    } else {
      await setState({ [KEYS.NEXT_DUE]: null, [KEYS.BURST_REMAINING]: 0 });
    }
    sendResponse && sendResponse({ ok: true });
  }

  if (msg.type === "SG_SET_ENABLED") {
    await setState({ [KEYS.ENABLED]: !!msg.value });
    await clearAllAlarms();
    const st = await getState();
    if (st[KEYS.ENABLED]) {
      if (st[KEYS.OVERRIDE]) await startOverrideTick();
      else await scheduleNextBurstAnchor();
    } else {
      await setState({ [KEYS.NEXT_DUE]: null, [KEYS.BURST_REMAINING]: 0 });
    }
    sendResponse && sendResponse({ ok: true });
  }

  if (msg.type === "SG_SET_OVERRIDE") {
    await setState({ [KEYS.OVERRIDE]: !!msg.value });
    await clearAllAlarms();
    const st = await getState();
    if (st[KEYS.ENABLED]) {
      if (st[KEYS.OVERRIDE]) await startOverrideTick();
      else await scheduleNextBurstAnchor();
    }
    sendResponse && sendResponse({ ok: true });
  }

  if (msg.type === "SG_SET_PAUSED") {
    await setState({ [KEYS.PAUSED]: !!msg.value });
    await clearAllAlarms();
    const st = await getState();
    if (st[KEYS.ENABLED] && !st[KEYS.PAUSED]) {
      if (st[KEYS.OVERRIDE]) await startOverrideTick();
      else await scheduleNextBurstAnchor();
    } else {
      await setState({ [KEYS.NEXT_DUE]: null, [KEYS.BURST_REMAINING]: 0 });
    }
    sendResponse && sendResponse({ ok: true });
  }

  if (msg.type === "SG_RELOAD_ALL_NOW") {
    const st = await getState();
    const nowSec = Math.floor(Date.now() / 1000);
    if (st[KEYS.ENABLED] && !st[KEYS.PAUSED] && st[KEYS.ACCESS_TOKEN] && st[KEYS.TOKEN_EXP] > nowSec) reloadAllAtoZTabs();
    sendResponse && sendResponse({ ok: true });
  }

  if (msg.type === "SG_TELEGRAM_LOG") {
    await sendTelegram(msg.userKey, msg.date, msg.time);
    sendResponse && sendResponse({ ok: true });
  }

  if (msg.type === "SG_POKE_SCHEDULE") {
    await clearAllAlarms();
    const st = await getState();
    const nowSec = Math.floor(Date.now() / 1000);
    if (st[KEYS.ENABLED] && st[KEYS.ACCESS_TOKEN] && st[KEYS.TOKEN_EXP] > nowSec) {
      if (st[KEYS.PAUSED]) {
        await setState({ [KEYS.NEXT_DUE]: null, [KEYS.BURST_REMAINING]: 0 });
      } else if (st[KEYS.OVERRIDE]) {
        await startOverrideTick();
      } else {
        await scheduleNextBurstAnchor();
      }
    }
    sendResponse && sendResponse({ ok: true });
  }
}

// Also monitor token expiry and auto-refresh attempt: the background will attempt to refresh token by calling /verify (if user key stored)
// To refresh we need server URL and user key; we'll implement a refresh attempt that simply asks popup to re-verify via runtime message.
async function tryAutoRefreshTokenIfNeeded() {
  const st = await getState();
  const nowSec = Math.floor(Date.now() / 1000);
  const exp = st[KEYS.TOKEN_EXP] || 0;
  // If token expires within 60s, ask popup to re-verify (popup will hit server)
  if (st[KEYS.ACCESS_TOKEN] && exp - nowSec <= 60) {
    // send a message to popup to re-verify (popup handles verify + notifies back)
    chrome.runtime.sendMessage({ type: "SG_REQUEST_TOKEN_REFRESH" }, () => {});
  }
}

// periodic check every 30s
setInterval(tryAutoRefreshTokenIfNeeded, 30 * 1000);

// Initialize on start
chrome.runtime.onInstalled.addListener(async () => {
  await setState(DEFAULTS);
});
chrome.runtime.onStartup.addListener(async () => {
  await clearAllAlarms();
  const st = await getState();
  const nowSec = Math.floor(Date.now() / 1000);
  if (st[KEYS.ENABLED] && !st[KEYS.PAUSED] && st[KEYS.ACCESS_TOKEN] && st[KEYS.TOKEN_EXP] > nowSec) {
    if (st[KEYS.OVERRIDE]) await startOverrideTick();
    else await scheduleNextBurstAnchor();
  }
});
