// popup.js — Zero-Friction Control Panel for Shift Grabber V9
// Simple Mode (default): enter key → flip ON → forget.
// Advanced Mode: full controls for power users.

const CONTACT_URL = (typeof SG_CONSTS !== "undefined" ? SG_CONSTS.URLS.CONTACT_URL : "__SG_CONTACT_URL__");

const KEYS = {
  ENABLED:         "sg_enabled",
  DATES:           "sg_dates",
  BLACKLIST_DATES: "sg_blacklist_dates",
  OVERRIDE:        "sg_override",
  PAUSED:          "sg_paused",
  USER_KEY:        "sg_userKey",
  ACCESS_TOKEN:    "sg_access_token",
  TOKEN_EXP:       "sg_token_exp"
};

/** Export all extension data as a GDPR-compliant JSON download. */
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

/* ── Consent ── */

function setupConsentHandlers() {
  els.consentAcceptBtn.addEventListener("click", async () => {
    await setStore({ sg_consent_given: true, sg_consent_date: new Date().toISOString() });
    hide(els.consentModal);
    location.reload();
  });
  els.consentDeclineBtn.addEventListener("click", async () => {
    await setStore({ sg_enabled: false, sg_consent_given: false });
    syncEnableToggles(false);
    chrome.runtime.sendMessage({ type: "SG_SET_ENABLED", value: false });
    updateStatusBadge();
    hide(els.consentModal);
    window.close();
  });
  // Allow Escape to decline consent when modal is visible (before main keydown listener is attached)
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !els.consentModal.classList.contains("hidden")) {
      els.consentDeclineBtn.click();
    }
  });
}

/* ── Element refs ── */

const els = {
  /* Panels */
  simplePanel:             document.getElementById("simplePanel"),
  advancedPanel:           document.getElementById("advancedPanel"),
  advancedToggleLink:      document.getElementById("advancedToggleLink"),
  simpleToggleLink:        document.getElementById("simpleToggleLink"),

  /* Simple panel */
  masterToggle:            document.getElementById("masterToggle"),
  simpleToggleDesc:        document.getElementById("simpleToggleDesc"),
  licenseInput:            document.getElementById("licenseInput"),
  licenseStatus:           document.getElementById("licenseStatus"),
  statusBadge:             document.getElementById("statusBadge"),
  subscriptionStatus:      document.getElementById("subscriptionStatus"),
  subscriptionDetail:      document.getElementById("subscriptionDetail"),
  manageBillingBtn:        document.getElementById("manageBillingBtn"),
  upgradeBtn:              document.getElementById("upgradeBtn"),
  tierBadge:               document.getElementById("tierBadge"),
  contactBtn:              document.getElementById("contactBtn"),

  /* Advanced panel */
  enableToggle:            document.getElementById("enableToggle"),
  statusBadgeAdvanced:     document.getElementById("statusBadgeAdvanced"),
  licenseInputAdvanced:    document.getElementById("licenseInputAdvanced"),
  licenseStatusAdvanced:   document.getElementById("licenseStatusAdvanced"),
  subscriptionStatusAdvanced: document.getElementById("subscriptionStatusAdvanced"),
  subscriptionDetailAdvanced: document.getElementById("subscriptionDetailAdvanced"),
  manageBillingBtnAdvanced: document.getElementById("manageBillingBtnAdvanced"),
  upgradeBtnAdvanced:      document.getElementById("upgradeBtnAdvanced"),
  contactBtnAdvanced:      document.getElementById("contactBtnAdvanced"),
  tgOptOutToggle:          document.getElementById("tgOptOutToggle"),

  /* Shared / advanced only */
  dateInput:               document.getElementById("dateInput"),
  addDateBtn:              document.getElementById("addDateBtn"),
  datesList:               document.getElementById("datesList"),
  clearDatesBtn:           document.getElementById("clearDatesBtn"),
  openDatesNowBtn:         document.getElementById("openDatesNowBtn"),
  blacklistDateInput:      document.getElementById("blacklistDateInput"),
  addBlacklistDateBtn:     document.getElementById("addBlacklistDateBtn"),
  blacklistDatesList:      document.getElementById("blacklistDatesList"),
  clearBlacklistDatesBtn:  document.getElementById("clearBlacklistDatesBtn"),
  applyBlacklistDatesBtn:  document.getElementById("applyBlacklistDatesBtn"),
  pauseToggleBtn:          document.getElementById("pauseToggleBtn"),
  overrideToggleBtn:       document.getElementById("overrideToggleBtn"),
  hideHudBtn:              document.getElementById("hideHudBtn"),
  reloadNowBtn:            document.getElementById("reloadNowBtn"),
  saveKeyBtn:              document.getElementById("saveKeyBtn"),
  deleteDataBtn:           document.getElementById("deleteDataBtn"),
  consentModal:            document.getElementById("consentModal"),
  consentAcceptBtn:        document.getElementById("consentAcceptBtn"),
  consentDeclineBtn:       document.getElementById("consentDeclineBtn")
};

const SERVER = (typeof SG_CONSTS !== "undefined" ? SG_CONSTS.URLS.SERVER : "__SG_SERVER_URL__");
const BILLING_PORTAL_URL = `${SERVER}/billing-portal`;

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
  if (isLoading) el.classList.add("loading");
  else el.classList.remove("loading");
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

function showPanel(name) {
  if (name === "simple") {
    show(els.simplePanel);
    hide(els.advancedPanel);
  } else {
    hide(els.simplePanel);
    show(els.advancedPanel);
  }
}

/* Sync helpers: keep simple ↔ advanced in sync */
function syncLicenseInputs(val) {
  els.licenseInput.value = val;
  els.licenseInputAdvanced.value = val;
}

function syncEnableToggles(val) {
  els.masterToggle.checked = val;
  els.enableToggle.checked = val;
}

function updateSimpleToggleDesc(isEnabled, hasKey, isValid) {
  if (!hasKey) {
    els.simpleToggleDesc.textContent = "Enter key and turn on";
    return;
  }
  if (isEnabled && isValid) {
    els.simpleToggleDesc.textContent = "Shift grabbing is active";
  } else if (isEnabled && !isValid) {
    els.simpleToggleDesc.textContent = "Verifying license…";
  } else {
    els.simpleToggleDesc.textContent = "Ready — flip to start";
  }
}

/* ── Device ID ── */

async function getDeviceId() {
  const key = (typeof SG_CONSTS !== "undefined" ? SG_CONSTS.KEYS.DEVICE_ID : "sg_device_id");
  return new Promise((resolve) => {
    chrome.storage.local.get({ [key]: "" }, (res) => {
      if (res[key]) return resolve(res[key]);
      const id = crypto.randomUUID();
      chrome.storage.local.set({ [key]: id }, () => resolve(id));
    });
  });
}

/* ── License ── */

// Simple rate limiter for verify button — prevent server spam
let _lastVerifyTs = 0;
const VERIFY_COOLDOWN_MS = 3000;

function canVerify() {
  const now = Date.now();
  if (now - _lastVerifyTs < VERIFY_COOLDOWN_MS) return false;
  _lastVerifyTs = now;
  return true;
}

async function verifyWithServer(key) {
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
    if (result.subscription) {
      await setStore({
        sg_subscription_status: result.subscription.status || "unknown",
        sg_tier: result.subscription.tier || "basic"
      });
    }
    if (!result.ok) {
      await setStore({ [KEYS.ACCESS_TOKEN]: null, [KEYS.TOKEN_EXP]: 0, sg_subscription_status: "expired" });
    }
    return result;
  } catch (e) {
    return { ok: false, reason: "network" };
  }
}

async function refreshLicenseStatusUI() {
  const st = await getStore([KEYS.USER_KEY, KEYS.ACCESS_TOKEN, KEYS.TOKEN_EXP]);
  const key = st[KEYS.USER_KEY];
  const token = st[KEYS.ACCESS_TOKEN];
  const exp = st[KEYS.TOKEN_EXP];
  const now = Math.floor(Date.now() / 1000);

  if (!key) {
    setStatus(els.licenseStatus, "Enter key and turn on", "error");
    setStatus(els.licenseStatusAdvanced, "No key saved — enter a key and click Verify.", "error");
    return;
  }
  if (exp && exp > now) {
    setStatus(els.licenseStatus, "License Active", "success");
    setStatus(els.licenseStatusAdvanced, "License Active", "success");
  } else {
    setStatus(els.licenseStatus, "Invalid or expired — re-verify.", "error");
    setStatus(els.licenseStatusAdvanced, "Invalid or expired — click Verify.", "error");
  }
}

/* ── Subscription ── */

async function refreshSubscriptionUI() {
  const st = await getStore([KEYS.USER_KEY, KEYS.ACCESS_TOKEN, KEYS.TOKEN_EXP, "sg_subscription_status", "sg_tier", "sg_device_limit_reason", "sg_device_cooldown_days"]);
  const key = st[KEYS.USER_KEY];
  const status = st.sg_subscription_status || "unknown";
  const tier = st.sg_tier || "basic";
  const exp = st[KEYS.TOKEN_EXP] || 0;
  const now = Math.floor(Date.now() / 1000);
  const deviceLimitReason = st.sg_device_limit_reason || null;
  const deviceCooldownDays = st.sg_device_cooldown_days || 0;

  setTierBadge(tier);

  function renderSimple(enabled) {
    if (!key) {
      setStatus(els.subscriptionStatus, "Enter a license key to activate.", "error");
      els.subscriptionDetail.textContent = "";
      hide(els.manageBillingBtn);
      hide(els.upgradeBtn);
      updateSimpleToggleDesc(enabled, false, false);
      return;
    }

    // Device limit takes precedence over other statuses
    if (deviceLimitReason === "device-limit-exceeded") {
      setStatus(els.subscriptionStatus, "Device Limit Exceeded", "error");
      els.subscriptionDetail.textContent = `This key is active on another device. Transfer available in ${deviceCooldownDays} day${deviceCooldownDays === 1 ? "" : "s"}.`;
      hide(els.manageBillingBtn);
      hide(els.upgradeBtn);
      updateSimpleToggleDesc(false, true, false);
      return;
    }

    const isValid = status === "active" || (exp && exp > now);

    if (isValid) {
      const days = exp ? Math.ceil((exp - now) / 86400) : "?";
      setStatus(els.subscriptionStatus, "Subscription Active", "success");
      els.subscriptionDetail.textContent = `Renews in ${days} day${days === 1 ? "" : "s"} · ${tier === "pro" ? "Pro Plan" : "Basic Plan"}`;
      show(els.manageBillingBtn);
      tier === "pro" ? hide(els.upgradeBtn) : show(els.upgradeBtn);
    } else if (status === "past_due") {
      setStatus(els.subscriptionStatus, "Payment Failed", "warning");
      els.subscriptionDetail.textContent = "Update your payment method to continue.";
      show(els.manageBillingBtn);
      hide(els.upgradeBtn);
    } else if (status === "cancelled" || status === "expired") {
      setStatus(els.subscriptionStatus, "Subscription Expired", "error");
      els.subscriptionDetail.textContent = "Renew to continue using Shift Grabber.";
      hide(els.manageBillingBtn);
      show(els.upgradeBtn);
    } else {
      setStatus(els.subscriptionStatus, "Checking subscription…", "info");
      els.subscriptionDetail.textContent = "";
      hide(els.manageBillingBtn);
      hide(els.upgradeBtn);
    }
    updateSimpleToggleDesc(enabled, true, isValid);
  }

  function renderAdvanced() {
    if (!key) {
      setStatus(els.subscriptionStatusAdvanced, "Enter a license key to activate.", "error");
      els.subscriptionDetailAdvanced.textContent = "";
      hide(els.manageBillingBtnAdvanced);
      hide(els.upgradeBtnAdvanced);
      return;
    }

    if (deviceLimitReason === "device-limit-exceeded") {
      setStatus(els.subscriptionStatusAdvanced, "Device Limit Exceeded", "error");
      els.subscriptionDetailAdvanced.textContent = `This key is active on another device. Transfer available in ${deviceCooldownDays} day${deviceCooldownDays === 1 ? "" : "s"}. Contact support if you changed devices.`;
      hide(els.manageBillingBtnAdvanced);
      hide(els.upgradeBtnAdvanced);
      return;
    }

    if (status === "active" || (exp && exp > now)) {
      const days = exp ? Math.ceil((exp - now) / 86400) : "?";
      setStatus(els.subscriptionStatusAdvanced, "Subscription Active", "success");
      els.subscriptionDetailAdvanced.textContent = `Renews in ${days} day${days === 1 ? "" : "s"} · ${tier === "pro" ? "Pro Plan" : "Basic Plan"}`;
      show(els.manageBillingBtnAdvanced);
      tier === "pro" ? hide(els.upgradeBtnAdvanced) : show(els.upgradeBtnAdvanced);
    } else if (status === "past_due") {
      setStatus(els.subscriptionStatusAdvanced, "Payment Failed", "warning");
      els.subscriptionDetailAdvanced.textContent = "Update your payment method to continue.";
      show(els.manageBillingBtnAdvanced);
      hide(els.upgradeBtnAdvanced);
    } else if (status === "cancelled" || status === "expired") {
      setStatus(els.subscriptionStatusAdvanced, "Subscription Expired", "error");
      els.subscriptionDetailAdvanced.textContent = "Renew to continue using Shift Grabber.";
      hide(els.manageBillingBtnAdvanced);
      show(els.upgradeBtnAdvanced);
    } else {
      setStatus(els.subscriptionStatusAdvanced, "Checking subscription…", "info");
      els.subscriptionDetailAdvanced.textContent = "";
      hide(els.manageBillingBtnAdvanced);
      hide(els.upgradeBtnAdvanced);
    }
  }

  const enabledSt = await getStore([KEYS.ENABLED]);
  renderSimple(!!enabledSt[KEYS.ENABLED]);
  renderAdvanced();
}

/* ── Status badge ── */

async function updateStatusBadge() {
  const st = await getStore([KEYS.ENABLED, KEYS.PAUSED, KEYS.OVERRIDE, KEYS.TOKEN_EXP]);
  const badgeSimple = els.statusBadge;
  const badgeAdvanced = els.statusBadgeAdvanced;
  const nowSec = Math.floor(Date.now() / 1000);
  const hasToken = st[KEYS.TOKEN_EXP] && st[KEYS.TOKEN_EXP] > nowSec;

  function apply(badge) {
    if (!badge) return;
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
  apply(badgeSimple);
  apply(badgeAdvanced);
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

/* ── Master toggle logic (Simple Mode) ── */

async function handleMasterToggle(checked) {
  const key = (els.licenseInput.value || "").trim();

  if (checked) {
    // Turning ON
    if (!key) {
      setStatus(els.licenseStatus, "Enter your license key first", "error");
      syncEnableToggles(false);
      return;
    }

    // Disable toggle during verification to prevent double-clicks
    els.masterToggle.disabled = true;
    if (els.enableToggle) els.enableToggle.disabled = true;
    setStatus(els.licenseStatus, "Verifying…", "info");
    setLoading(els.licenseStatus, true);
    updateSimpleToggleDesc(false, true, false);

    await setStore({ [KEYS.USER_KEY]: key });
    const r = await verifyWithServer(key);

    setLoading(els.licenseStatus, false);
    els.masterToggle.disabled = false;
    if (els.enableToggle) els.enableToggle.disabled = false;

    if (!r.ok) {
      setStatus(els.licenseStatus, (r.reason || "error").replace(/-/g, " "), "error");
      syncEnableToggles(false);
      refreshSubscriptionUI();
      return;
    }

    // Valid — enable extension
    setStatus(els.licenseStatus, "License Active — Shift Grabber ON", "success");
    els.licenseStatus.setAttribute("tabindex", "-1");
    els.licenseStatus.focus();
    await setStore({ [KEYS.ENABLED]: true });
    syncEnableToggles(true);
    chrome.runtime.sendMessage({ type: "SG_SET_ENABLED", value: true }, () => {
      chrome.runtime.sendMessage({ type: "SG_POKE_SCHEDULE" });
    });
    updateStatusBadge();
    refreshSubscriptionUI();

  } else {
    // Turning OFF
    await setStore({ [KEYS.ENABLED]: false });
    syncEnableToggles(false);
    chrome.runtime.sendMessage({ type: "SG_SET_ENABLED", value: false });
    updateStatusBadge();
    refreshSubscriptionUI();
  }
}

/* ── Event listeners ── */

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.type !== "SG_REQUEST_TOKEN_REFRESH") return;
  chrome.storage.local.get([KEYS.USER_KEY], async (st) => {
    const key = st[KEYS.USER_KEY];
    if (!key) return;
    await verifyWithServer(key);
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
  const key = st[KEYS.USER_KEY] || "";

  // Migrate legacy uppercase key if present
  if (!key) {
    const legacy = await getStore(["SG_userKey"]);
    if (legacy.SG_userKey) {
      await setStore({ [KEYS.USER_KEY]: legacy.SG_userKey });
      chrome.storage.local.remove(["SG_userKey"]);
      syncLicenseInputs(legacy.SG_userKey);
    }
  }

  // Prefill license inputs
  syncLicenseInputs(key);

  // Sync toggles to stored state
  syncEnableToggles(!!st[KEYS.ENABLED]);
  if (els.tgOptOutToggle) els.tgOptOutToggle.checked = !st.sg_tg_opt_out;

  // Init UI
  renderDates(st[KEYS.DATES] || []);
  renderBlacklistDates(st[KEYS.BLACKLIST_DATES] || []);
  refreshLicenseStatusUI();
  refreshSubscriptionUI();
  updateStatusBadge();

  // Re-validate license on popup open if token expires within 5 min
  const nowSec = Math.floor(Date.now() / 1000);
  if (key && (!st[KEYS.TOKEN_EXP] || st[KEYS.TOKEN_EXP] - nowSec < 300)) {
    verifyWithServer(key).then(() => {
      refreshLicenseStatusUI();
      refreshSubscriptionUI();
      updateStatusBadge();
    });
  }

  /* ── Panel navigation ── */
  els.advancedToggleLink.addEventListener("click", () => showPanel("advanced"));
  els.simpleToggleLink.addEventListener("click", () => showPanel("simple"));

  /* ── Master toggle (Simple Mode) ── */
  els.masterToggle.addEventListener("change", async (e) => {
    if (!canVerify()) {
      setStatus(els.licenseStatus, "Please wait a moment…", "warning");
      syncEnableToggles(!e.target.checked);
      return;
    }
    await handleMasterToggle(e.target.checked);
  });

  /* ── License input change (sync both panels) ── */
  els.licenseInput.addEventListener("input", (e) => {
    els.licenseInputAdvanced.value = e.target.value;
  });
  els.licenseInputAdvanced.addEventListener("input", (e) => {
    els.licenseInput.value = e.target.value;
  });

  /* ── License verify (Advanced only button) ── */
  els.saveKeyBtn.addEventListener("click", async () => {
    if (!canVerify()) {
      setStatus(els.licenseStatusAdvanced, "Please wait a moment…", "warning");
      return;
    }
    const key = (els.licenseInputAdvanced.value || "").trim();
    if (!key) return;
    await setStore({ [KEYS.USER_KEY]: key });
    syncLicenseInputs(key);
    setStatus(els.licenseStatusAdvanced, "Verifying…", "info");
    setLoading(els.licenseStatusAdvanced, true);
    setStatus(els.subscriptionStatusAdvanced, "Checking subscription…", "info");
    setLoading(els.subscriptionStatusAdvanced, true);

    const r = await verifyWithServer(key);

    setLoading(els.licenseStatusAdvanced, false);
    setLoading(els.subscriptionStatusAdvanced, false);

    if (r.ok) {
      setStatus(els.licenseStatusAdvanced, "License Active", "success");
      setStatus(els.licenseStatus, "License Active", "success");
      els.licenseStatusAdvanced.setAttribute("tabindex", "-1");
      els.licenseStatusAdvanced.focus();
    } else {
      setStatus(els.licenseStatusAdvanced, (r.reason || "error").replace(/-/g, " "), "error");
      setStatus(els.licenseStatus, (r.reason || "error").replace(/-/g, " "), "error");
    }
    refreshSubscriptionUI();
    setTimeout(refreshLicenseStatusUI, 300);
  });

  /* ── Billing buttons (both panels) ── */
  els.manageBillingBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: BILLING_PORTAL_URL, active: true });
  });
  els.manageBillingBtnAdvanced.addEventListener("click", () => {
    chrome.tabs.create({ url: BILLING_PORTAL_URL, active: true });
  });

  els.upgradeBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: `${SERVER}/upgrade`, active: true });
  });
  els.upgradeBtnAdvanced.addEventListener("click", () => {
    chrome.tabs.create({ url: `${SERVER}/upgrade`, active: true });
  });

  /* ── Enable toggle (Advanced) ── */
  els.enableToggle.addEventListener("change", async (e) => {
    const val = e.target.checked;
    await setStore({ [KEYS.ENABLED]: val });
    els.masterToggle.checked = val;
    chrome.runtime.sendMessage({ type: "SG_SET_ENABLED", value: val }, () => {
      chrome.runtime.sendMessage({ type: "SG_POKE_SCHEDULE" });
    });
    updateStatusBadge();
    refreshSubscriptionUI();
  });

  /* ── Dates ── */
  els.addDateBtn.addEventListener("click", async () => {
    const v = els.dateInput.value;
    if (!v) return;
    const st = await getStore([KEYS.DATES]);
    const set = new Set(st[KEYS.DATES] || []);
    set.add(v);
    const next = Array.from(set).sort();
    await setStore({ [KEYS.DATES]: next });
    renderDates(next);
  });

  els.clearDatesBtn.addEventListener("click", async () => {
    if (!confirm("Clear all selected dates?")) return;
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
    if (!v) return;
    const st = await getStore([KEYS.BLACKLIST_DATES]);
    const set = new Set(st[KEYS.BLACKLIST_DATES] || []);
    set.add(v);
    const next = Array.from(set).sort();
    await setStore({ [KEYS.BLACKLIST_DATES]: next });
    renderBlacklistDates(next);
    els.blacklistDateInput.value = "";
  });

  els.clearBlacklistDatesBtn.addEventListener("click", async () => {
    if (!confirm("Clear all blacklist dates?")) return;
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

  /* ── Telegram opt-out ── */
  if (els.tgOptOutToggle) {
    els.tgOptOutToggle.addEventListener("change", async (e) => {
      await setStore({ sg_tg_opt_out: !e.target.checked });
    });
  }

  /* ── Contact ── */
  els.contactBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: CONTACT_URL, active: true });
  });
  els.contactBtnAdvanced.addEventListener("click", () => {
    chrome.tabs.create({ url: CONTACT_URL, active: true });
  });

  document.getElementById("exportDataBtn").addEventListener("click", exportUserData);

  /* ── Delete data ── */
  els.deleteDataBtn.addEventListener("click", async () => {
    if (!confirm("Permanently delete ALL data stored by Shift Grabber? This cannot be undone.")) return;
    await new Promise((r) => chrome.storage.local.clear(r));
    alert("All data deleted. The extension will now reload.");
    window.close();
  });

  /* ── Keyboard navigation ── */
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!els.consentModal.classList.contains("hidden")) {
        els.consentDeclineBtn.click();
      } else if (!els.advancedPanel.classList.contains("hidden")) {
        showPanel("simple");
        els.advancedToggleLink.focus();
      } else {
        window.close();
      }
    }
    if (e.key === "Enter") {
      if (document.activeElement === els.licenseInput) {
        els.masterToggle.checked = true;
        handleMasterToggle(true);
      }
      if (document.activeElement === els.licenseInputAdvanced) {
        els.saveKeyBtn.click();
      }
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const toggles = [els.enableToggle, els.tgOptOutToggle];
      const idx = toggles.indexOf(document.activeElement);
      if (idx !== -1) {
        e.preventDefault();
        const next = e.key === "ArrowDown"
          ? toggles[(idx + 1) % toggles.length]
          : toggles[(idx - 1 + toggles.length) % toggles.length];
        next.focus();
      }
    }
  });

  /* ── Kill-switch listener ── */
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "SG_KILL") {
      console.warn("[SG Popup] Kill switch received:", msg.reason);
      els.masterToggle.checked = false;
      els.enableToggle.checked = false;
      setStatus(els.subscriptionStatus, `Revoked: ${msg.reason || "killed-by-server"}`, "error");
      setStatus(els.subscriptionStatusAdvanced, `Revoked: ${msg.reason || "killed-by-server"}`, "error");
      updateSimpleToggleDesc(false, true, false);
    }
  });

  /* ── Periodic refresh ── */
  setInterval(refreshLicenseStatusUI, 5000);
  setInterval(updateStatusBadge, 2000);
});
