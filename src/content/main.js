// ===== Content — HUD, keep-signed-in, shift grabbing, pause/override =====

const CFG = {
  CONFIRM_WAIT_MS:      120,
  PER_SHIFT_STAGGER_MS: 100,
  BEEP: true,
  LOG:  true
};

const K = {
  ENABLED:         "sg_enabled",
  OVERRIDE:        "sg_override",
  PAUSED:          "sg_paused",
  NEXT_DUE:        "sg_next_due",
  BURST_REMAINING: "sg_burst_left",
  ACCESS_TOKEN:    "sg_access_token",
  TOKEN_EXP:       "sg_token_exp",
  USER_KEY:        "SG_userKey"
};

const VERSION = "V7";


let hudEl        = null;
let dotEl        = null;
let isPaused     = false;
let overrideMode = false;
let hudTimer     = null;
let hudHidden    = false;

// Tracks buttons we've already clicked this page load — prevents repeat clicks
const clickedButtons = new WeakSet();

function log(...a) { if (CFG.LOG) console.log("[ShiftGrabber]", ...a); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// --- Telegram logger ---------------------------------------------------------
function getPageDate() {
  const m = window.location.href.match(/date=(\d{4}-\d{2}-\d{2})/);
  if (!m) return null;
  try {
    return new Date(m[1] + "T12:00:00").toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric"
    });
  } catch { return m[1]; }
}

async function sendTelegramLog() {
  try {
    const store   = await new Promise(r => chrome.storage.local.get({ [K.USER_KEY]: "unknown" }, r));
    const userKey = store[K.USER_KEY] || "unknown";
    const date    = getPageDate() || "unknown date";
    const time    = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    // Write to storage — service worker reads and sends it on next wake
    const pending = await new Promise(r => chrome.storage.local.get({ sg_tg_queue: [] }, r));
    const queue   = pending.sg_tg_queue || [];
    queue.push({ userKey, date, time });
    await new Promise(r => chrome.storage.local.set({ sg_tg_queue: queue }, r));
  } catch (e) {
    log("Telegram queue failed:", e);
  }
}

// --- visual helpers ----------------------------------------------------------
function showToast(msg, bg = "#4ade80", ms = 4000) {
  try {
    const d = document.createElement("div");
    d.textContent = msg;
    d.style.cssText = `
      position:fixed;top:12px;left:12px;background:${bg};
      color:#000;padding:8px 14px;font-size:13px;font-weight:600;
      border-radius:8px;z-index:2147483646;
      box-shadow:0 4px 16px rgba(0,0,0,.4);
      font-family:ui-sans-serif,system-ui,sans-serif;
    `;
    document.body.appendChild(d);
    setTimeout(() => d.remove(), ms);
  } catch {}
}

function playAlert() {
  if (!CFG.BEEP) return;
  try {
    const a = document.createElement("audio");
    a.src = chrome.runtime.getURL("sounds/click.mp3.mp3");
    a.volume = 1.0;
    a.play().catch(() => {});
  } catch {}
}

function flashOverlay(color) {
  try {
    const ov = document.createElement("div");
    ov.style.cssText = `
      position:fixed;inset:0;background:${color};opacity:0;
      z-index:2147483647;pointer-events:none;
      transition:opacity 150ms ease-in-out;
    `;
    document.body.appendChild(ov);
    setTimeout(() => { ov.style.opacity = "0.6"; }, 10);
    setTimeout(() => { ov.style.opacity = "0"; }, 160);
    setTimeout(() => ov.remove(), 320);
  } catch {}
}

// --- HUD --------------------------------------------------------------------
function mmss(ms) {
  if (ms == null || ms <= 0) return "00:00";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2,"0")}:${String(s % 60).padStart(2,"0")}`;
}

function burstBars(remaining, total = 2) {
  let html = "";
  for (let i = 0; i < total; i++) {
    const active = i < remaining;
    html += `<span style="
      display:inline-block;width:22px;height:4px;border-radius:2px;
      background:${active ? "currentColor" : "rgba(255,255,255,0.12)"};
      margin-right:4px;
    "></span>`;
  }
  return html;
}

function ensureDot() {
  if (dotEl) return;
  dotEl = document.createElement("div");
  dotEl.style.cssText = `
    position:fixed;bottom:18px;right:18px;z-index:2147483647;
    width:10px;height:10px;border-radius:50%;
    box-shadow:0 0 6px 2px currentColor;
    pointer-events:none;display:none;
  `;
  document.body.appendChild(dotEl);
}

function updateDot(st) {
  ensureDot();
  const nowSec   = Math.floor(Date.now() / 1000);
  const hasToken = st[K.ACCESS_TOKEN] && st[K.TOKEN_EXP] && st[K.TOKEN_EXP] > nowSec;
  let color;
  if (st[K.PAUSED]) {
    color = "#f87171"; // red — paused
  } else if (!hasToken || !st[K.ENABLED]) {
    color = "#fbbf24"; // yellow — key issue / disabled
  } else {
    color = "#4ade80"; // green — running
  }
  dotEl.style.background   = color;
  dotEl.style.color        = color;
  dotEl.style.display      = hudHidden ? "block" : "none";
}

function ensureHUD() {
  if (hudEl) return;
  hudEl = document.createElement("div");
  hudEl.style.cssText = `
    position:fixed;bottom:14px;right:14px;z-index:2147483646;
    background:#0d0d0f;border:1px solid #242428;
    padding:14px 16px;border-radius:14px;width:230px;
    font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;
    box-shadow:0 8px 32px rgba(0,0,0,.6);
    user-select:none;
  `;
  document.body.appendChild(hudEl);
}

function toggleHUD() {
  hudHidden = !hudHidden;
  if (hudEl) hudEl.style.display = hudHidden ? "none" : "block";
  ensureDot();
  chrome.storage.local.set({ sg_hud_hidden: hudHidden });
}

async function updateHUD() {
  ensureHUD();
  hudEl.style.display = hudHidden ? "none" : "block";

  const st = await new Promise(r => chrome.storage.local.get({
    [K.ENABLED]: false,
    [K.OVERRIDE]: false,
    [K.PAUSED]: false,
    [K.NEXT_DUE]: null,
    [K.BURST_REMAINING]: 0,
    [K.ACCESS_TOKEN]: null,
    [K.TOKEN_EXP]: 0
  }, r));

  isPaused     = !!st[K.PAUSED];
  overrideMode = !!st[K.OVERRIDE];

  updateDot(st);
  if (hudHidden) return;

  const nowSec   = Math.floor(Date.now() / 1000);
  const hasToken = st[K.ACCESS_TOKEN] && st[K.TOKEN_EXP] && st[K.TOKEN_EXP] > nowSec;
  const due      = st[K.NEXT_DUE];
  const remaining = st[K.BURST_REMAINING] || 0;
  const msLeft   = due ? due - Date.now() : null;
  const clock    = new Date().toLocaleTimeString();

  let modeLabel, badgeColor, timerColor, timerText, timerLabel, dotColor;

  if (!hasToken) {
    modeLabel  = "NO KEY";
    badgeColor = "#5a5a6a";
    timerColor = "#5a5a6a";
    timerText  = "--:--";
    timerLabel = "NO KEY DETECTED";
    dotColor   = "#5a5a6a";
  } else if (isPaused) {
    modeLabel  = "PAUSED";
    badgeColor = "#f87171";
    timerColor = "#f87171";
    timerText  = "--:--";
    timerLabel = "PAUSED";
    dotColor   = "#f87171";
  } else if (overrideMode) {
    modeLabel  = "FAST";
    badgeColor = "#fbbf24";
    timerColor = "#fbbf24";
    timerText  = mmss(msLeft);
    timerLabel = "NEXT RELOAD";
    dotColor   = "#fbbf24";
  } else {
    modeLabel  = "LIVE";
    badgeColor = "#4ade80";
    timerColor = "#4ade80";
    timerText  = mmss(msLeft);
    timerLabel = "NEXT BURST";
    dotColor   = "#4ade80";
  }

  hudEl.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
      <span style="font-size:12px;font-weight:700;letter-spacing:2px;color:#f0f0f0;">SG · ${VERSION}</span>
      <span style="font-size:9px;font-weight:700;letter-spacing:1.5px;padding:2px 9px;border-radius:999px;border:1px solid ${badgeColor};color:${badgeColor};">${modeLabel}</span>
    </div>
    <div style="text-align:center;margin-bottom:4px;">
      <div style="font-size:36px;font-weight:700;letter-spacing:2px;color:${timerColor};line-height:1;font-variant-numeric:tabular-nums;">${timerText}</div>
      <div style="font-size:9px;letter-spacing:2px;font-weight:600;color:${timerColor};opacity:0.7;margin-top:6px;">${timerLabel}</div>
    </div>
    <div style="border-top:1px solid #242428;margin:12px 0;"></div>
    <div style="display:flex;flex-direction:column;gap:6px;font-size:11px;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span style="color:#5a5a6a;letter-spacing:1px;font-weight:600;">STATUS</span>
        <span style="color:${dotColor};font-weight:600;display:flex;align-items:center;gap:5px;">
          <span style="width:6px;height:6px;border-radius:50%;background:${dotColor};display:inline-block;"></span>
          ${modeLabel}
        </span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span style="color:#5a5a6a;letter-spacing:1px;font-weight:600;">CLOCK</span>
        <span style="color:#f0f0f0;">${clock}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span style="color:#5a5a6a;letter-spacing:1px;font-weight:600;">BURST</span>
        <span style="color:${timerColor};">${burstBars(remaining)}</span>
      </div>
    </div>
  `;
}

// --- keep-alive --------------------------------------------------------------
function clickStayLoggedInIfPresent() {
  try {
    const nodes = document.querySelectorAll("button,[role='button'],a");
    for (const n of nodes) {
      const t = (n.textContent || "").trim().toLowerCase();
      if (t && t.includes("stay") && (t.includes("logged") || t.includes("signed"))) {
        n.click();
        log("🔒 Clicked Stay Logged In");
        return true;
      }
    }
  } catch {}
  return false;
}

// --- shift grabbing ----------------------------------------------------------
function findAddShiftButtons() {
  return [...document.querySelectorAll("button,[role='button']")]
    .filter(n => (n.textContent || "").toLowerCase().includes("add shift"));
}

function parseShiftInfo(btn) {
  const txt = (btn.closest("[data-test-component],[data-testid],div")?.innerText || "").toLowerCase();
  const mh  = txt.match(/(\d+)\s*hrs?/);
  const mm  = txt.match(/(\d+)\s*mins?/);
  const H   = mh ? parseInt(mh[1], 10) : 0;
  const M   = mm ? parseInt(mm[1], 10) : 0;
  return { total: H * 60 + M, label: (H ? `${H}h ` : "") + (M ? `${M}m` : "") || "shift" };
}

function findConfirmButton() {
  return [...document.querySelectorAll("button,[role='button']")]
    .find(n => {
      const t = (n.textContent || "").trim().toLowerCase();
      return t === "confirm" || t === "accept" || t === "done" || t.includes("confirm") || t.includes("accept");
    });
}

async function tryToGrabShifts() {
  if (isPaused) return false;

  // Only consider buttons we haven't clicked yet this page load
  const addButtons = findAddShiftButtons().filter(btn => !clickedButtons.has(btn));
  if (addButtons.length === 0) return false;

  const shifts = addButtons
    .map(btn => ({ btn, ...parseShiftInfo(btn) }))
    .sort((a, b) => b.total - a.total);

  for (let i = 0; i < shifts.length; i++) {
    if (i > 0) await sleep(CFG.PER_SHIFT_STAGGER_MS);
    const s = shifts[i];

    // Mark as clicked immediately so the loop never retries this button
    clickedButtons.add(s.btn);

    try {
      s.btn.click();
      log(`🖱️ Clicked Add: ${s.label}`);

      try {
        const beep = document.createElement("audio");
        beep.src = chrome.runtime.getURL("sounds/click.mp3.mp3");
        beep.volume = 0.8;
        beep.play().catch(() => {});
      } catch {}

      await sleep(CFG.CONFIRM_WAIT_MS);
      const c = findConfirmButton();
      if (c) {
        // confirm/accept/done dialog found — click it
        c.click();
        log(`✅ Confirmed ${s.label}`);
      } else {
        // no dialog — Amazon added it directly
        log(`✅ Added directly: ${s.label}`);
      }
      // fire toast, sound and Telegram regardless of dialog
      showToast(`Grabbed ${s.label}`);
      playAlert();
      sendTelegramLog();
    } catch (e) {
      log("Error clicking shift:", e);
    }
  }
  return true;
}

// --- main loop ---------------------------------------------------------------
// Uses setInterval instead of requestAnimationFrame so it keeps running
// even when the tab is in the background (rAF gets frozen by Chrome)
let mainLoopTimer = null;
function startMainLoop() {
  if (mainLoopTimer) return;
  mainLoopTimer = setInterval(() => {
    clickStayLoggedInIfPresent();
    tryToGrabShifts();
  }, 800);
}

// --- message handlers --------------------------------------------------------
chrome.runtime.onMessage.addListener(async (msg) => {
  if (!msg || !msg.type) return;

  if (msg.type === "SG_TOGGLE_HUD") {
    toggleHUD();
  }

  if (msg.type === "SG_TOGGLE_PAUSE") {
    const st   = await new Promise(r => chrome.storage.local.get({ [K.PAUSED]: false }, r));
    const next = !st[K.PAUSED];
    await new Promise(r => chrome.storage.local.set({ [K.PAUSED]: next }, r));
    chrome.runtime.sendMessage({ type: "SG_SET_PAUSED", value: next });
    isPaused = next;
    flashOverlay(isPaused ? "#f87171" : "#4ade80");
    updateHUD();
  }

  if (msg.type === "SG_TOGGLE_OVERRIDE") {
    const st   = await new Promise(r => chrome.storage.local.get({ [K.OVERRIDE]: false }, r));
    const next = !st[K.OVERRIDE];
    await new Promise(r => chrome.storage.local.set({ [K.OVERRIDE]: next }, r));
    chrome.runtime.sendMessage({ type: "SG_SET_OVERRIDE", value: next });
    overrideMode = next;
    flashOverlay(overrideMode ? "#fbbf24" : "#4ade80");
    updateHUD();
  }
});

// --- keyboard shortcuts ------------------------------------------------------
window.addEventListener("keydown", (e) => {
  if (e.code === "KeyP" && !e.shiftKey && !e.ctrlKey && !e.altKey)
    chrome.runtime.sendMessage({ type: "SG_SET_PAUSED", value: !isPaused });
  if (e.shiftKey && e.code === "KeyO" && !e.ctrlKey && !e.altKey)
    chrome.runtime.sendMessage({ type: "SG_SET_OVERRIDE", value: !overrideMode });
  if (e.shiftKey && e.code === "KeyH" && !e.ctrlKey && !e.altKey)
    toggleHUD();
  if (e.code === "KeyR" && !e.shiftKey && !e.ctrlKey && !e.altKey)
    chrome.runtime.sendMessage({ type: "SG_RELOAD_ALL_NOW" });
});

// --- init --------------------------------------------------------------------
(async function init() {
  const st = await new Promise(r => chrome.storage.local.get({
    [K.ENABLED]: false, [K.OVERRIDE]: false, [K.PAUSED]: false, sg_hud_hidden: false,
    [K.NEXT_DUE]: null
  }, r));

  if (!st[K.ENABLED]) {
    console.log("[ShiftGrabber] Loaded but DISABLED — enable from popup.");
    return;
  }

  isPaused     = !!st[K.PAUSED];
  overrideMode = !!st[K.OVERRIDE];
  hudHidden    = !!st.sg_hud_hidden;

  console.log("[ShiftGrabber] ✅ Active — loop starting.");

  // If no valid next reload is scheduled, poke the service worker to reschedule now
  const due = st[K.NEXT_DUE];
  if (!due || due <= Date.now()) {
    chrome.runtime.sendMessage({ type: "SG_POKE_SCHEDULE" });
  }

  updateHUD();
  if (hudTimer) clearInterval(hudTimer);
  hudTimer = setInterval(updateHUD, 500);

  startMainLoop();
})();
