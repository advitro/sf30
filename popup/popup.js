// popup.js

const CONTACT_URL = "https://t.me/shift_grabber";

const KEYS = {
  ENABLED:      "sg_enabled",
  DATES:        "sg_dates",
  OVERRIDE:     "sg_override",
  PAUSED:       "sg_paused",
  USER_KEY:     "SG_userKey",
  ACCESS_TOKEN: "sg_access_token",
  TOKEN_EXP:    "sg_token_exp"
};

const els = {
  enableToggle:    document.getElementById("enableToggle"),
  dateInput:       document.getElementById("dateInput"),
  addDateBtn:      document.getElementById("addDateBtn"),
  datesList:       document.getElementById("datesList"),
  clearDatesBtn:   document.getElementById("clearDatesBtn"),
  openDatesNowBtn: document.getElementById("openDatesNowBtn"),
  pauseToggleBtn:  document.getElementById("pauseToggleBtn"),
  overrideToggleBtn: document.getElementById("overrideToggleBtn"),
  hideHudBtn:        document.getElementById("hideHudBtn"),
  reloadNowBtn:      document.getElementById("reloadNowBtn"),
  licenseInput:    document.getElementById("licenseInput"),
  saveKeyBtn:      document.getElementById("saveKeyBtn"),
  licenseStatus:   document.getElementById("licenseStatus"),
  statusBadge:     document.getElementById("statusBadge"),
  contactBtn:      document.getElementById("contactBtn")
};

const SERVER = "https://shift-grabber.vercel.app";

const getStore = (keys) => new Promise((res) => chrome.storage.local.get(keys, res));
const setStore = (obj)  => new Promise((res) => chrome.storage.local.set(obj, res));

async function getDeviceId() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["SG_deviceId"], (res) => {
      if (res.SG_deviceId) return resolve(res.SG_deviceId);
      const id = crypto.randomUUID();
      chrome.storage.local.set({ SG_deviceId: id }, () => resolve(id));
    });
  });
}

async function verifyWithServer(key) {
  try {
    const deviceId = await getDeviceId();
    const resp = await fetch(`${SERVER}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, deviceId })
    });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      await setStore({ [KEYS.ACCESS_TOKEN]: null, [KEYS.TOKEN_EXP]: 0 });
      chrome.runtime.sendMessage({ type: "SG_LICENSE_VERIFIED", value: false });
      return { ok: false, reason: data?.reason || `http ${resp.status}` };
    }
    const data = await resp.json();
    if (!data.authorized) {
      await setStore({ [KEYS.ACCESS_TOKEN]: null, [KEYS.TOKEN_EXP]: 0 });
      chrome.runtime.sendMessage({ type: "SG_LICENSE_VERIFIED", value: false });
      return { ok: false, reason: data.reason || "not authorized" };
    }
    const token = data.accessToken || crypto.randomUUID();
    const exp   = data.expiresAt   || Math.floor(Date.now() / 1000) + 600;
    await setStore({ [KEYS.ACCESS_TOKEN]: token, [KEYS.TOKEN_EXP]: exp, [KEYS.USER_KEY]: key });
    chrome.runtime.sendMessage({ type: "SG_LICENSE_VERIFIED", value: true });
    return { ok: true, token, exp };
  } catch (e) {
    return { ok: false, reason: "network" };
  }
}

async function refreshLicenseStatusUI() {
  const st    = await getStore([KEYS.USER_KEY, KEYS.ACCESS_TOKEN, KEYS.TOKEN_EXP]);
  const key   = st[KEYS.USER_KEY];
  const token = st[KEYS.ACCESS_TOKEN];
  const exp   = st[KEYS.TOKEN_EXP];
  const now   = Math.floor(Date.now() / 1000);

  if (!key) {
    els.licenseStatus.textContent  = "No key saved — enter a key and click Verify.";
    els.licenseStatus.style.color  = "#ff4d4d";
    return;
  }
  if (token && exp && exp > now) {
    els.licenseStatus.textContent  = "✅ License Active";
    els.licenseStatus.style.color  = "#00e5a0";
  } else {
    els.licenseStatus.textContent  = "❌ Invalid or expired — click Verify.";
    els.licenseStatus.style.color  = "#ff4d4d";
  }
}

async function updateStatusBadge() {
  const st = await getStore([KEYS.ENABLED, KEYS.PAUSED, KEYS.OVERRIDE]);
  const b  = els.statusBadge;
  b.className = "badge";
  if (!st[KEYS.ENABLED]) {
    b.textContent = "OFF";  b.classList.add("off");
  } else if (st[KEYS.PAUSED]) {
    b.textContent = "PAUSED"; b.classList.add("paused");
  } else if (st[KEYS.OVERRIDE]) {
    b.textContent = "FAST";   b.classList.add("fast");
  } else {
    b.textContent = "LIVE";   b.classList.add("live");
  }
}

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
    pill.innerHTML = `<span>${d}</span><button title="Remove">×</button>`;
    pill.querySelector("button").addEventListener("click", async () => {
      const st  = await getStore([KEYS.DATES]);
      const arr = (st[KEYS.DATES] || []).filter((x) => x !== d);
      await setStore({ [KEYS.DATES]: arr });
      renderDates(arr);
    });
    list.appendChild(pill);
  });
}

function sendToAllAtoZ(message) {
  chrome.tabs.query({ url: "https://atoz.amazon.work/*" }, (tabs) => {
    tabs.forEach((t) => chrome.tabs.sendMessage(t.id, message, () => {}));
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  const st = await getStore([KEYS.ENABLED, KEYS.DATES, KEYS.OVERRIDE, KEYS.PAUSED, KEYS.USER_KEY]);
  els.enableToggle.checked  = !!st[KEYS.ENABLED];
  els.licenseInput.value    = st[KEYS.USER_KEY] || "";
  renderDates(st[KEYS.DATES] || []);
  refreshLicenseStatusUI();
  updateStatusBadge();

  els.saveKeyBtn.addEventListener("click", async () => {
    const key = (els.licenseInput.value || "").trim();
    if (!key) return;
    await setStore({ [KEYS.USER_KEY]: key }); // save whatever was typed immediately
    els.licenseStatus.textContent = "Checking...";
    els.licenseStatus.style.color = "#3b82f6";
    const r = await verifyWithServer(key);
    if (r.ok) {
      els.licenseStatus.textContent = "✅ License Active";
      els.licenseStatus.style.color = "#00e5a0";
    } else {
      els.licenseStatus.textContent = "❌ " + (r.reason || "error");
      els.licenseStatus.style.color = "#ff4d4d";
    }
    setTimeout(refreshLicenseStatusUI, 300);
  });

  els.enableToggle.addEventListener("change", async (e) => {
    const val = e.target.checked;
    await setStore({ [KEYS.ENABLED]: val });
    chrome.runtime.sendMessage({ type: "SG_SET_ENABLED", value: val }, () => {
      chrome.runtime.sendMessage({ type: "SG_POKE_SCHEDULE" });
    });
    updateStatusBadge();
  });

  els.addDateBtn.addEventListener("click", async () => {
    const v = els.dateInput.value;
    if (!v) return;
    const st  = await getStore([KEYS.DATES]);
    const set = new Set(st[KEYS.DATES] || []);
    set.add(v);
    const next = Array.from(set).sort();
    await setStore({ [KEYS.DATES]: next });
    renderDates(next);
  });

  els.clearDatesBtn.addEventListener("click", async () => {
    await setStore({ [KEYS.DATES]: [] });
    renderDates([]);
  });

  els.openDatesNowBtn.addEventListener("click", async () => {
    const st    = await getStore([KEYS.DATES]);
    const dates = st[KEYS.DATES] || [];
    for (const d of dates) {
      chrome.tabs.create({ url: `https://atoz.amazon.work/shifts/schedule/find?ref=hm_fs_qklink&date=${d}`, active: false });
    }
  });

  els.pauseToggleBtn.addEventListener("click", async () => {
    const st   = await getStore([KEYS.PAUSED]);
    const next = !st[KEYS.PAUSED];
    await setStore({ [KEYS.PAUSED]: next });
    chrome.runtime.sendMessage({ type: "SG_SET_PAUSED", value: next });
    sendToAllAtoZ({ type: "SG_TOGGLE_PAUSE" });
    updateStatusBadge();
  });

  els.overrideToggleBtn.addEventListener("click", async () => {
    const st   = await getStore([KEYS.OVERRIDE]);
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

  els.contactBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: CONTACT_URL, active: true });
  });

  setInterval(refreshLicenseStatusUI, 5000);
  setInterval(updateStatusBadge, 2000);
});
