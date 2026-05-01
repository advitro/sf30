// popup.js — Unified Control Panel for Shift Grabber V9
// Single license input, single toggle, tabbed sections.

const CONTACT_URL = (typeof SG_CONSTS !== "undefined" ? SG_CONSTS.URLS.CONTACT_URL : "__SG_CONTACT_URL__");

const KEYS = {
  ENABLED:         "sg_enabled",
  DATES:           "sg_dates",
  BLACKLIST_DATES: "sg_blacklist_dates",
  OVERRIDE:        "sg_override",
  PAUSED:          "sg_paused",
  USER_KEY:        "sg_userKey",
  ACCESS_TOKEN:    "sg_access_token",
  TOKEN_EXP:       "sg_license_exp"
};

const getStore = (keys) => new Promise((res) => chrome.storage.local.get(keys, res));
const setStore = (obj)  => new Promise((res) => chrome.storage.local.set(obj, res));

/* ── UI helpers ── */

function setStatus(el, text, type) {
  el.textContent = text;
  el.className = "status-text" + (type ? " " + type : "");
}

function show(el) { el.classList.remove("hidden"); }
function hide(el) { el.classList.add("hidden"); }

function setLoading(el, isLoading) {
  if (isLoading) {el.classList.add("loading");}
  else {el.classList.remove("loading");}
}

function setTierBadge(tier) {
  if (!tier || tier === "unknown") {
    hide(els.tierBadge);
    return;
  }
  els.tierBadge.textContent = tier.toUpperCase();
  els.tierBadge.className = "tier-badge " + tier;
  show(els.tierBadge);
}

/* ── Element refs ── */

const els = {
  /* Header */
  statusBadge:           document.getElementById("statusBadge"),
  tierBadge:             document.getElementById("tierBadge"),
  licenseInput:          document.getElementById("licenseInput"),
  verifyBtn:             document.getElementById("verifyBtn"),
  licenseStatus:         document.getElementById("licenseStatus"),
  masterToggle:          document.getElementById("masterToggle"),
  toggleDesc:            document.getElementById("toggleDesc"),
  licenseStatusRow:      document.getElementById("licenseStatusRow"),
  tierDetail:            document.getElementById("tierDetail"),

  /* Tabs */
  tabShifts:             document.getElementById("tabShifts"),
  tabControls:           document.getElementById("tabControls"),
  tabSettings:           document.getElementById("tabSettings"),
  panelShifts:           document.getElementById("panelShifts"),
  panelControls:         document.getElementById("panelControls"),
  panelSettings:         document.getElementById("panelSettings"),

  /* Shifts tab */
  dateInput:             document.getElementById("dateInput"),
  addDateBtn:            document.getElementById("addDateBtn"),
  datesList:             document.getElementById("datesList"),
  clearDatesBtn:         document.getElementById("clearDatesBtn"),
  openDatesNowBtn:       document.getElementById("openDatesNowBtn"),
  blacklistDateInput:    document.getElementById("blacklistDateInput"),
  addBlacklistDateBtn:   document.getElementById("addBlacklistDateBtn"),
  blacklistDatesList:    document.getElementById("blacklistDatesList"),
  clearBlacklistDatesBtn: document.getElementById("clearBlacklistDatesBtn"),
  applyBlacklistDatesBtn: document.getElementById("applyBlacklistDatesBtn"),

  /* Controls tab */
  pauseToggleBtn:        document.getElementById("pauseToggleBtn"),
  overrideToggleBtn:     document.getElementById("overrideToggleBtn"),
  hideHudBtn:            document.getElementById("hideHudBtn"),
  reloadNowBtn:          document.getElementById("reloadNowBtn"),

  /* Settings tab */
  tgBotTokenInput:       document.getElementById("tgBotTokenInput"),
  tgChatIdInput:         document.getElementById("tgChatIdInput"),
  tgSaveBtn:             document.getElementById("tgSaveBtn"),
  tgOptOutToggle:        document.getElementById("tgOptOutToggle"),
  telegramStatus:        document.getElementById("telegramStatus"),
  telegramHelp:          document.getElementById("telegramHelp"),
  exportDataBtn:         document.getElementById("exportDataBtn"),
  deleteDataBtn:         document.getElementById("deleteDataBtn"),
  contactBtn:            document.getElementById("contactBtn"),

  /* Consent */
  consentModal:          document.getElementById("consentModal"),
  consentAcceptBtn:      document.getElementById("consentAcceptBtn"),
  consentDeclineBtn:     document.getElementById("consentDeclineBtn")
};

/* ── Consent ── */

function setupConsentHandlers() {
  els.consentAcceptBtn.addEventListener("click", async () => {
    await setStore({ sg_consent_given: true, sg_consent_date: new Date().toISOString() });
    hide(els.consentModal);
    location.reload();
  });
  els.consentDeclineBtn.addEventListener("click", async () => {
    await setStore({ sg_enabled: false, sg_consent_given: false });
    els.masterToggle.checked = false;
    chrome.runtime.sendMessage({ type: "SG_SET_ENABLED", value: false });
    hide(els.consentModal);
    window.close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !els.consentModal.classList.contains("hidden")) {
      els.consentDeclineBtn.click();
    }
  });
}

/* ── Tabs ── */

const TABS = [
  { btn: els.tabShifts, panel: els.panelShifts },
  { btn: els.tabControls, panel: els.panelControls },
  { btn: els.tabSettings, panel: els.panelSettings }
];

function showTab(index) {
  TABS.forEach((t, i) => {
    const isActive = i === index;
    t.btn.classList.toggle("active", isActive);
    t.btn.setAttribute("aria-selected", String(isActive));
    t.btn.setAttribute("tabindex", isActive ? "0" : "-1");
    t.panel.classList.toggle("active", isActive);
    t.panel.hidden = !isActive;
  });
}

function currentTabIndex() {
  return TABS.findIndex(t => t.btn.classList.contains("active"));
}

/* ── Device ID ── */

async function getDeviceId() {
  const key = (typeof SG_CONSTS !== "undefined" ? SG_CONSTS.KEYS.DEVICE_ID : "sg_device_id");
  return new Promise((resolve) => {
    chrome.storage.local.get({ [key]: "" }, (res) => {
      if (res[key]) {return resolve(res[key]);}
      const id = crypto.randomUUID();
      chrome.storage.local.set({ [key]: id }, () => resolve(id));
    });
  });
}

/* ── License verification ── */

let _lastVerifyTs = 0;
const VERIFY_COOLDOWN_MS = 3000;

function canVerify() {
  const now = Date.now();
  if (now - _lastVerifyTs < VERIFY_COOLDOWN_MS) {return false;}
  _lastVerifyTs = now;
  return true;
}

async function verifyLicense(key) {
  try {
    const result = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "SG_VERIFY_LICENSE", key }, (res) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, reason: "sw-unreachable" });
        } else {
          resolve(res || { ok: false, reason: "no-response" });
        }
      });
    });
    if (result.tier) {
      await setStore({ sg_tier: result.tier });
    }
    if (result.exp) {
      await setStore({ [KEYS.TOKEN_EXP]: result.exp });
    }
    return result;
  } catch (e) {
    return { ok: false, reason: "validation-error" };
  }
}

/* ── Telegram config ── */

async function storeTelegramConfig(botToken, chatId) {
  try {
    await chrome.runtime.sendMessage({
      type: "SG_STORE_TELEGRAM_CONFIG",
      botToken,
      chatId
    });
    updateTelegramUI(true);
    return true;
  } catch (e) {
    console.warn("[SG] Failed to store Telegram config:", e);
    return false;
  }
}

async function checkTelegramConfigured() {
  try {
    const data = await getStore({ sg_tg_bot_token_enc: "", sg_tg_chat_id_enc: "" });
    const hasCreds = !!(data.sg_tg_bot_token_enc && data.sg_tg_chat_id_enc);
    updateTelegramUI(hasCreds);
    return hasCreds;
  } catch (e) {
    updateTelegramUI(false);
    return false;
  }
}

async function loadTelegramInputs() {
  try {
    const data = await getStore({ sg_tg_bot_token_enc: "", sg_tg_chat_id_enc: "" });
    // We can't decrypt the stored values (only SW can), so inputs stay empty
    // unless user re-enters them. This is intentional for security.
    // The toggle and status still reflect whether credentials exist.
  } catch (e) {
    // ignore
  }
}

function updateTelegramUI(configured) {
  if (configured) {
    els.telegramStatus.textContent = "Connected to Telegram";
    els.telegramStatus.style.color = "var(--green)";
    els.tgOptOutToggle.disabled = false;
    els.telegramHelp.textContent = "Get shift grab confirmations sent to your Telegram.";
  } else {
    els.telegramStatus.textContent = "Not configured";
    els.telegramStatus.style.color = "var(--muted)";
    els.tgOptOutToggle.disabled = true;
    els.tgOptOutToggle.checked = false;
    els.telegramHelp.textContent = "Create a bot with @BotFather, paste the token and your chat ID above.";
  }
}

/* ── License Status UI ── */

async function refreshLicenseStatusRow() {
  const st = await getStore([KEYS.USER_KEY, KEYS.ACCESS_TOKEN, KEYS.TOKEN_EXP, "sg_tier", "sg_device_limit_reason", "sg_device_cooldown_days"]);
  const key = st[KEYS.USER_KEY];
  const tier = st.sg_tier || "basic";
  const exp = st[KEYS.TOKEN_EXP] || 0;
  const now = Math.floor(Date.now() / 1000);
  const deviceLimitReason = st.sg_device_limit_reason || null;
  const deviceCooldownDays = st.sg_device_cooldown_days || 0;

  setTierBadge(tier);

  if (!key) {
    setStatus(els.licenseStatusRow, "Enter a license key to activate.", "error");
    els.tierDetail.textContent = "";
    updateToggleDesc(false, false, false);
    return;
  }

  if (deviceLimitReason === "device-limit-exceeded") {
    setStatus(els.licenseStatusRow, "Device Limit Exceeded", "error");
    els.tierDetail.textContent = `This key is active on another device. Transfer available in ${deviceCooldownDays} day${deviceCooldownDays === 1 ? "" : "s"}.`;
    updateToggleDesc(false, true, false);
    return;
  }

  const isValid = exp && exp > now;

  if (isValid) {
    const days = exp ? Math.ceil((exp - now) / 86400) : "?";
    setStatus(els.licenseStatusRow, "License Active", "success");
    els.tierDetail.textContent = `${tier === "pro" ? "Pro Plan" : "Basic Plan"} · Expires in ${days} day${days === 1 ? "" : "s"}`;
  } else {
    setStatus(els.licenseStatusRow, "License expired or invalid — re-verify.", "error");
    els.tierDetail.textContent = "";
  }

  const enabledSt = await getStore([KEYS.ENABLED]);
  updateToggleDesc(!!enabledSt[KEYS.ENABLED], true, isValid);
}

function updateToggleDesc(isEnabled, hasKey, isValid) {
  if (!hasKey) {
    els.toggleDesc.textContent = "Enter key and turn on";
    return;
  }
  if (isEnabled && isValid) {
    els.toggleDesc.textContent = "Shift grabbing is active";
  } else if (isEnabled && !isValid) {
    els.toggleDesc.textContent = "Verifying license…";
  } else {
    els.toggleDesc.textContent = "Ready — flip to start";
  }
}

/* ── License status ── */

async function refreshLicenseStatusUI() {
  const st = await getStore([KEYS.USER_KEY, KEYS.ACCESS_TOKEN, KEYS.TOKEN_EXP]);
  const key = st[KEYS.USER_KEY];
  const token = st[KEYS.ACCESS_TOKEN];
  const exp = st[KEYS.TOKEN_EXP];
  const now = Math.floor(Date.now() / 1000);

  if (!key) {
    setStatus(els.licenseStatus, "Enter key and click Verify", "error");
    return;
  }
  if (exp && exp > now) {
    setStatus(els.licenseStatus, "License Active", "success");
  } else {
    setStatus(els.licenseStatus, "Invalid or expired — re-verify.", "error");
  }
}

/* ── Status badge ── */

async function updateStatusBadge() {
  const st = await getStore([KEYS.ENABLED, KEYS.PAUSED, KEYS.OVERRIDE, KEYS.TOKEN_EXP]);
  const badge = els.statusBadge;
  const nowSec = Math.floor(Date.now() / 1000);
  const hasToken = st[KEYS.TOKEN_EXP] && st[KEYS.TOKEN_EXP] > nowSec;

  badge.className = "badge";
  if (!st[KEYS.ENABLED]) {
    badge.textContent = "OFF";
    badge.classList.add("off");
  } else if (!hasToken) {
    badge.textContent = "NO KEY";
    badge.classList.add("off");
  } else if (st[KEYS.PAUSED]) {
    badge.textContent = "PAUSED";
    badge.classList.add("paused");
  } else if (st[KEYS.OVERRIDE]) {
    badge.textContent = "FAST";
    badge.classList.add("fast");
  } else {
    badge.textContent = "LIVE";
    badge.classList.add("live");
  }
}

/* ── Date lists ── */

function renderDates(dates) {
  const list = els.datesList;
  list.innerHTML = "";
  if (!dates || dates.length === 0) {
    list.classList.add("empty");
    list.textContent = "No dates selected";
    return;
  }
  list.classList.remove("empty");
  dates.forEach((d) => {
    const pill = document.createElement("div");
    pill.className = "date-pill";
    pill.innerHTML = `<span>${d}</span><button title="Remove" aria-label="Remove date ${d}">×</button>`;
    pill.querySelector("button").addEventListener("click", async () => {
      const st = await getStore([KEYS.DATES]);
      const arr = (st[KEYS.DATES] || []).filter((x) => x !== d);
      await setStore({ [KEYS.DATES]: arr });
      renderDates(arr);
    });
    list.appendChild(pill);
  });
}

function renderBlacklistDates(dates) {
  const list = els.blacklistDatesList;
  list.innerHTML = "";
  if (!dates || dates.length === 0) {
    list.classList.add("empty");
    list.textContent = "No blacklist (grab all)";
    return;
  }
  list.classList.remove("empty");
  dates.forEach((d) => {
    const pill = document.createElement("div");
    pill.className = "date-pill";
    pill.innerHTML = `<span>${d}</span><button title="Remove" aria-label="Remove blacklist date ${d}">×</button>`;
    pill.querySelector("button").addEventListener("click", async () => {
      const st = await getStore([KEYS.BLACKLIST_DATES]);
      const arr = (st[KEYS.BLACKLIST_DATES] || []).filter((x) => x !== d);
      await setStore({ [KEYS.BLACKLIST_DATES]: arr });
      renderBlacklistDates(arr);
    });
    list.appendChild(pill);
  });
}

function sendToAllAtoZ(message) {
  chrome.tabs.query({ url: "https://atoz.amazon.work/*" }, (tabs) => {
    tabs.forEach((t) => chrome.tabs.sendMessage(t.id, message, () => {}));
  });
}

/* ── Master toggle ── */

async function handleMasterToggle(checked) {
  const key = (els.licenseInput.value || "").trim();

  if (checked) {
    // Turning ON
    if (!key) {
      setStatus(els.licenseStatus, "Enter your license key first", "error");
      els.masterToggle.checked = false;
      return;
    }

    els.masterToggle.disabled = true;
    setStatus(els.licenseStatus, "Verifying…", "info");
    setLoading(els.licenseStatus, true);
    updateToggleDesc(false, true, false);

    await setStore({ [KEYS.USER_KEY]: key });
    const r = await verifyLicense(key);

    setLoading(els.licenseStatus, false);
    els.masterToggle.disabled = false;

    if (!r.ok) {
      setStatus(els.licenseStatus, (r.reason || "error").replace(/-/g, " "), "error");
      els.masterToggle.checked = false;
      refreshLicenseStatusRow();
      return;
    }

    setStatus(els.licenseStatus, "License Active — Shift Grabber ON", "success");
    els.licenseStatus.setAttribute("tabindex", "-1");
    els.licenseStatus.focus();
    await setStore({ [KEYS.ENABLED]: true });
    els.masterToggle.checked = true;
    chrome.runtime.sendMessage({ type: "SG_SET_ENABLED", value: true }, () => {
      chrome.runtime.sendMessage({ type: "SG_POKE_SCHEDULE" });
    });
    updateStatusBadge();
    refreshLicenseStatusRow();

  } else {
    // Turning OFF
    await setStore({ [KEYS.ENABLED]: false });
    els.masterToggle.checked = false;
    chrome.runtime.sendMessage({ type: "SG_SET_ENABLED", value: false });
    updateStatusBadge();
    refreshLicenseStatusRow();
  }
}

/* ── Verify button handler (verify only, don't enable) ── */

async function handleVerify() {
  if (!canVerify()) {
    setStatus(els.licenseStatus, "Please wait a moment…", "warning");
    return;
  }
  const key = (els.licenseInput.value || "").trim();
  if (!key) {
    setStatus(els.licenseStatus, "Enter a license key first", "error");
    return;
  }

  await setStore({ [KEYS.USER_KEY]: key });
  setStatus(els.licenseStatus, "Verifying…", "info");
  setLoading(els.licenseStatus, true);

  const r = await verifyLicense(key);

  setLoading(els.licenseStatus, false);
  if (r.ok) {
    setStatus(els.licenseStatus, "License Active", "success");
    els.licenseStatus.setAttribute("tabindex", "-1");
    els.licenseStatus.focus();
  } else {
    setStatus(els.licenseStatus, (r.reason || "error").replace(/-/g, " "), "error");
  }
  refreshLicenseStatusRow();
}

/* ── GDPR Export ── */

async function exportUserData() {
  try {
    const all = await chrome.storage.local.get(null);
    const exportPayload = {
      exportedAt: new Date().toISOString(),
      extensionName: "Shift Grabber V9",
      version: chrome.runtime.getManifest().version,
      data: all
    };
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `shift-grabber-data-export-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error("[SG] Data export failed:", e);
    alert("Data export failed. Please try again or contact support.");
  }
}

/* ── Event listeners ── */

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.type !== "SG_REQUEST_TOKEN_REFRESH") {return;}
  chrome.storage.local.get([KEYS.USER_KEY], async (st) => {
    const key = st[KEYS.USER_KEY];
    if (!key) {return;}
    await verifyLicense(key);
    refreshLicenseStatusUI();
  });
});

document.addEventListener("DOMContentLoaded", async () => {
  setupConsentHandlers();
  const consentSt = await getStore(["sg_consent_given"]);
  if (!consentSt.sg_consent_given) {
    show(els.consentModal);
    els.consentAcceptBtn.focus();
    return;
  }

  const st = await getStore([KEYS.ENABLED, KEYS.DATES, KEYS.BLACKLIST_DATES, KEYS.OVERRIDE, KEYS.PAUSED, KEYS.USER_KEY, "sg_tg_opt_out"]);
  let key = st[KEYS.USER_KEY] || "";

  // Migrate legacy uppercase key if present
  if (!key) {
    const legacy = await getStore(["SG_userKey"]);
    if (legacy.SG_userKey) {
      await setStore({ [KEYS.USER_KEY]: legacy.SG_userKey });
      chrome.storage.local.remove(["SG_userKey"]);
      key = legacy.SG_userKey;
    }
  }

  // Prefill license input
  els.licenseInput.value = key;

  // Sync toggle to stored state
  els.masterToggle.checked = !!st[KEYS.ENABLED];

  // Init UI
  renderDates(st[KEYS.DATES] || []);
  renderBlacklistDates(st[KEYS.BLACKLIST_DATES] || []);
  refreshLicenseStatusUI();
  refreshLicenseStatusRow();
  updateStatusBadge();
  checkTelegramConfigured();
  loadTelegramInputs();

  // Re-validate license on popup open if token expires within 5 min
  const nowSec = Math.floor(Date.now() / 1000);
  if (key && (!st[KEYS.TOKEN_EXP] || st[KEYS.TOKEN_EXP] - nowSec < 300)) {
    verifyLicense(key).then(() => {
      refreshLicenseStatusUI();
      refreshLicenseStatusRow();
      updateStatusBadge();
      checkTelegramConfigured();
      loadTelegramInputs();
    });
  }

  /* ── Tab navigation ── */
  els.tabShifts.addEventListener("click", () => showTab(0));
  els.tabControls.addEventListener("click", () => showTab(1));
  els.tabSettings.addEventListener("click", () => showTab(2));

  /* ── Master toggle ── */
  els.masterToggle.addEventListener("change", async (e) => {
    if (!canVerify()) {
      setStatus(els.licenseStatus, "Please wait a moment…", "warning");
      els.masterToggle.checked = !e.target.checked;
      return;
    }
    await handleMasterToggle(e.target.checked);
  });

  /* ── Verify button ── */
  els.verifyBtn.addEventListener("click", handleVerify);

  /* ── Enter in license input = verify + enable (zero-friction) ── */
  els.licenseInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      // Auto-enable flow: verify then toggle on
      handleVerify().then(() => {
        const status = els.licenseStatus.textContent;
        if (status.includes("Active")) {
          els.masterToggle.checked = true;
          handleMasterToggle(true);
        }
      });
    }
  });

  /* ── Billing buttons ── */


  /* ── Dates ── */
  els.addDateBtn.addEventListener("click", async () => {
    const v = els.dateInput.value;
    if (!v) {return;}
    const st = await getStore([KEYS.DATES]);
    const set = new Set(st[KEYS.DATES] || []);
    set.add(v);
    const next = Array.from(set).sort();
    await setStore({ [KEYS.DATES]: next });
    renderDates(next);
  });

  els.clearDatesBtn.addEventListener("click", async () => {
    if (!confirm("Clear all selected dates?")) {return;}
    await setStore({ [KEYS.DATES]: [] });
    renderDates([]);
  });

  els.openDatesNowBtn.addEventListener("click", async () => {
    const st = await getStore([KEYS.DATES]);
    const dates = st[KEYS.DATES] || [];
    for (const d of dates) {
      chrome.tabs.create({ url: `https://atoz.amazon.work/shifts/schedule/find?ref=hm_fs_qklink&date=${d}`, active: false });
    }
  });

  /* ── Blacklist ── */
  els.addBlacklistDateBtn.addEventListener("click", async () => {
    const v = els.blacklistDateInput.value;
    if (!v) {return;}
    const st = await getStore([KEYS.BLACKLIST_DATES]);
    const set = new Set(st[KEYS.BLACKLIST_DATES] || []);
    set.add(v);
    const next = Array.from(set).sort();
    await setStore({ [KEYS.BLACKLIST_DATES]: next });
    renderBlacklistDates(next);
    els.blacklistDateInput.value = "";
  });

  els.clearBlacklistDatesBtn.addEventListener("click", async () => {
    if (!confirm("Clear all blacklist dates?")) {return;}
    await setStore({ [KEYS.BLACKLIST_DATES]: [] });
    renderBlacklistDates([]);
  });

  els.applyBlacklistDatesBtn.addEventListener("click", async () => {
    const st = await getStore([KEYS.BLACKLIST_DATES]);
    const blacklist = st[KEYS.BLACKLIST_DATES] || [];
    chrome.tabs.query({ url: "https://atoz.amazon.work/*" }, (tabs) => {
      tabs.forEach((t) => {
        chrome.tabs.sendMessage(t.id, { type: "SG_SET_BLACKLIST_DATES", blacklist }, () => {});
      });
    });
    const dateStr = blacklist.length === 0 ? "no blacklist" : blacklist.join(", ");
    console.log(`[ShiftGrabber] Blacklist applied: ${dateStr}`);
  });

  /* ── Shortcuts ── */
  els.pauseToggleBtn.addEventListener("click", async () => {
    const st = await getStore([KEYS.PAUSED]);
    const next = !st[KEYS.PAUSED];
    await setStore({ [KEYS.PAUSED]: next });
    chrome.runtime.sendMessage({ type: "SG_SET_PAUSED", value: next });
    sendToAllAtoZ({ type: "SG_TOGGLE_PAUSE" });
    updateStatusBadge();
  });

  els.overrideToggleBtn.addEventListener("click", async () => {
    const st = await getStore([KEYS.OVERRIDE]);
    const next = !st[KEYS.OVERRIDE];
    await setStore({ [KEYS.OVERRIDE]: next });
    chrome.runtime.sendMessage({ type: "SG_SET_OVERRIDE", value: next });
    sendToAllAtoZ({ type: "SG_TOGGLE_OVERRIDE" });
    updateStatusBadge();
  });

  els.hideHudBtn.addEventListener("click", () => {
    sendToAllAtoZ({ type: "SG_TOGGLE_HUD" });
  });

  els.reloadNowBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "SG_RELOAD_ALL_NOW" });
  });

  /* ── Telegram save ── */
  els.tgSaveBtn.addEventListener("click", async () => {
    const botToken = (els.tgBotTokenInput.value || "").trim();
    const chatId = (els.tgChatIdInput.value || "").trim();
    if (!botToken || !chatId) {
      els.telegramStatus.textContent = "Enter both bot token and chat ID";
      els.telegramStatus.style.color = "var(--red)";
      return;
    }
    const ok = await storeTelegramConfig(botToken, chatId);
    if (ok) {
      els.telegramStatus.textContent = "Saved — Connected to Telegram";
      els.telegramStatus.style.color = "var(--green)";
      els.tgOptOutToggle.disabled = false;
    } else {
      els.telegramStatus.textContent = "Failed to save — try again";
      els.telegramStatus.style.color = "var(--red)";
    }
  });

  /* ── Telegram opt-out ── */
  els.tgOptOutToggle.addEventListener("change", async (e) => {
    await setStore({ sg_tg_opt_out: !e.target.checked });
  });

  /* ── Contact ── */
  els.contactBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: CONTACT_URL, active: true });
  });

  /* ── Data ── */
  els.exportDataBtn.addEventListener("click", exportUserData);

  els.deleteDataBtn.addEventListener("click", async () => {
    if (!confirm("Permanently delete ALL data stored by Shift Grabber? This cannot be undone.")) {return;}
    await new Promise((r) => chrome.storage.local.clear(r));
    alert("All data deleted. The extension will now reload.");
    window.close();
  });

  /* ── Keyboard navigation ── */
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!els.consentModal.classList.contains("hidden")) {
        els.consentDeclineBtn.click();
      } else {
        window.close();
      }
    }

    // Arrow keys switch tabs when focus is on tab nav
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      const tabs = [els.tabShifts, els.tabControls, els.tabSettings];
      const idx = tabs.indexOf(document.activeElement);
      if (idx !== -1) {
        e.preventDefault();
        const next = e.key === "ArrowRight"
          ? (idx + 1) % tabs.length
          : (idx - 1 + tabs.length) % tabs.length;
        showTab(next);
        tabs[next].focus();
      }
    }
  });

  /* ── Kill-switch listener ── */
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "SG_KILL") {
      console.warn("[SG Popup] Kill switch received:", msg.reason);
      els.masterToggle.checked = false;
      setStatus(els.licenseStatusRow, `Revoked: ${msg.reason || "killed-by-server"}`, "error");
      updateToggleDesc(false, true, false);
    }
  });

  /* ── Periodic refresh ── */
  setInterval(refreshLicenseStatusUI, 5000);
  setInterval(updateStatusBadge, 2000);
});
