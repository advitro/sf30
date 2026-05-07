// ===== Content — HUD, keep-signed-in, shift grabbing, pause/override =====

const CFG = {
  CONFIRM_WAIT_MS:      50,
  PER_SHIFT_STAGGER_MS: 30,
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
  USER_KEY:        "SG_userKey",
  BLACKLIST_DATES: "sg_blacklist_dates"
};

const VERSION = "GOD";


let hudEl        = null;
let dotEl        = null;
let isPaused     = false;
let overrideMode = false;
let hudTimer     = null;
let hudHidden    = false;
let turboMode    = false;
let rateLimited  = false;
let apiLayerFailed = false;
// Tracks whether we stopped API polling because the token expired.
// Used to auto-resume polling when SW refreshes the token in background.
let tokenExpiredPollingStopped = false;

// Track which API-claimed shifts we've already shown notifications for
const apiClaimNotified = {};

// Periodic cleanup to prevent unbounded memory growth
setInterval(function () {
  const keys = Object.keys(apiClaimNotified);
  if (keys.length > 500) {
    keys.slice(0, Math.floor(keys.length / 2)).forEach(function (k) { delete apiClaimNotified[k]; });
  }
}, 300000); // every 5 minutes

// Tracks buttons we've already clicked this page load — prevents repeat clicks
const clickedButtons = new WeakSet();

function log(...a) { if (CFG.LOG) {console.log("[ShiftGrabber]", ...a);} }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// --- Telegram logger ---------------------------------------------------------
function getPageDate() {
  const m = window.location.href.match(/date=(\d{4}-\d{2}-\d{2})/);
  if (!m) {return null;}
  try {
    return new Date(m[1] + "T12:00:00").toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric"
    });
  } catch { return m[1]; }
}

// Get tab's date from URL and calculate 7-day window
function getTabDateWindow() {
  const m = window.location.href.match(/date=(\d{4}-\d{2}-\d{2})/);
  if (!m) {return null;}
  const startDate = m[1]; // YYYY-MM-DD
  const start = new Date(startDate + "T04:00:00.000Z");
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return {
    start: startDate,
    windowStart: startDate + "T04:00:00.000Z",
    windowEnd: end.toISOString().split('T')[0] + "T03:59:59.999Z"
  };
}

async function sendTelegramLog() {
  try {
    const optOut = await new Promise(r => chrome.storage.local.get({ sg_tg_opt_out: false }, r));
    if (optOut.sg_tg_opt_out) {return;}
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
function showToast(msg, bg = "#22c55e", ms = 4000) {
  try {
    const d = document.createElement("div");
    d.textContent = msg;
    d.style.cssText = `
      position:fixed;top:16px;left:16px;z-index:2147483647;
      background:rgba(16,17,24,0.95);backdrop-filter:blur(16px);
      border:1px solid rgba(255,255,255,0.08);border-radius:12px;
      padding:12px 18px;font-size:13px;font-weight:700;
      color:#f0f0f5;box-shadow:0 8px 32px rgba(0,0,0,0.5);
      font-family:ui-sans-serif,system-ui,sans-serif;
      border-left:3px solid ${bg};
      animation:sgToastIn 0.35s cubic-bezier(0.16,1,0.3,1) both;
    `;
    document.body.appendChild(d);
    setTimeout(() => {
      d.style.animation = "sgToastOut 0.3s ease forwards";
      setTimeout(() => d.remove(), 350);
    }, ms);
  } catch { /* intentionally empty */ }
}

// Inject toast animations once
(function injectToastStyles() {
  if (document.getElementById("sg-toast-styles")) {return;}
  const s = document.createElement("style");
  s.id = "sg-toast-styles";
  s.textContent = `
    @keyframes sgToastIn { from { opacity:0; transform:translateX(-20px); } to { opacity:1; transform:translateX(0); } }
    @keyframes sgToastOut { from { opacity:1; transform:translateX(0); } to { opacity:0; transform:translateX(-20px); } }
  `;
  document.head.appendChild(s);
})();

function playAlert() {
  if (!CFG.BEEP) {return;}
  try {
    const a = document.createElement("audio");
    a.src = chrome.runtime.getURL("sounds/click.mp3");
    a.volume = 1.0;
    a.play().catch(() => {});
  } catch { /* intentionally empty */ }
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
  } catch { /* intentionally empty */ }
}

// --- HUD --------------------------------------------------------------------
function mmss(ms) {
  if (ms === null || ms === undefined || ms <= 0) {return "00:00";}
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2,"0")}:${String(s % 60).padStart(2,"0")}`;
}

function burstBars(remaining, total = 2) {
  let html = "";
  for (let i = 0; i < total; i++) {
    const active = i < remaining;
    html += `<span class="sg-hud-bar ${active ? "active" : "inactive"}"></span>`;
  }
  return html;
}

function ensureDot() {
  if (dotEl) {return;}
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
  const hasToken = st[K.TOKEN_EXP] && st[K.TOKEN_EXP] > nowSec;
  let color;
  if (rateLimited) {
    color = "#f59e0b"; // orange — rate limited
  } else if (st[K.PAUSED]) {
    color = "#f87171"; // red — paused
  } else if (!hasToken || !st[K.ENABLED]) {
    color = "#fbbf24"; // yellow — key issue / disabled
  } else {
    color = "#ef4444"; // red — GOD MODE running
  }
  dotEl.style.background   = color;
  dotEl.style.color        = color;
  dotEl.style.display      = hudHidden ? "block" : "none";
}

function injectHUDStyles() {
  if (document.getElementById("sg-hud-styles")) {return;}
  const style = document.createElement("style");
  style.id = "sg-hud-styles";
  style.textContent = `
    .sg-hud {
      position: fixed;
      bottom: 16px;
      right: 16px;
      z-index: 2147483646;
      background: rgba(16, 17, 24, 0.92);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 16px;
      padding: 16px 18px;
      width: 240px;
      font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
      font-size: 13px;
      color: #f0f0f5;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03);
      user-select: none;
      transition: opacity 0.3s ease, transform 0.3s ease;
    }
    .sg-hud-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }
    .sg-hud-brand {
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 2.5px;
      color: #f0f0f5;
    }
    .sg-hud-badge {
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 1.5px;
      padding: 3px 10px;
      border-radius: 999px;
      border: 1px solid;
      text-transform: uppercase;
    }
    .sg-hud-timer-wrap {
      text-align: center;
      margin-bottom: 4px;
    }
    .sg-hud-timer {
      font-size: 38px;
      font-weight: 700;
      letter-spacing: 2px;
      line-height: 1;
      font-variant-numeric: tabular-nums;
      font-family: "JetBrains Mono", "Fira Code", ui-monospace, monospace;
    }
    .sg-hud-timer-label {
      font-size: 9px;
      letter-spacing: 2px;
      font-weight: 700;
      opacity: 0.6;
      margin-top: 6px;
    }
    .sg-hud-divider {
      border: none;
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent);
      margin: 12px 0;
    }
    .sg-hud-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      margin-bottom: 6px;
    }
    .sg-hud-row:last-child { margin-bottom: 0; }
    .sg-hud-label {
      color: #6b7280;
      letter-spacing: 1px;
      font-weight: 700;
      font-size: 9px;
      text-transform: uppercase;
    }
    .sg-hud-value {
      display: flex;
      align-items: center;
      gap: 5px;
      font-weight: 600;
    }
    .sg-hud-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      display: inline-block;
    }
    .sg-hud-bar {
      display: inline-block;
      width: 22px;
      height: 4px;
      border-radius: 2px;
      margin-right: 4px;
    }
    .sg-hud-bar.active { background: currentColor; }
    .sg-hud-bar.inactive { background: rgba(255,255,255,0.1); }
    .sg-hud-warning {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.25);
      border-radius: 8px;
      padding: 6px 10px;
      margin-bottom: 10px;
      font-size: 11px;
      color: #fca5a5;
      text-align: center;
      font-weight: 600;
    }
    .sg-hud-enter {
      animation: sgHudEnter 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
    }
    @keyframes sgHudEnter {
      from { opacity: 0; transform: translateY(10px) scale(0.96); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
  `;
  document.head.appendChild(style);
}

function ensureHUD() {
  if (hudEl) {return;}
  injectHUDStyles();
  hudEl = document.createElement("div");
  hudEl.className = "sg-hud sg-hud-enter";
  document.body.appendChild(hudEl);
  // Restore saved position if available
  chrome.storage.local.get("sg_hud_pos", (res) => {
    if (res.sg_hud_pos) {
      hudEl.style.left = res.sg_hud_pos.left;
      hudEl.style.top = res.sg_hud_pos.top;
    }
  });
  makeHUDDraggable(hudEl);
}

function makeHUDDraggable(el) {
  let isDragging = false;
  let startX = 0, startY = 0, startLeft = 0, startTop = 0;
  el.addEventListener("mousedown", (e) => {
    if (e.target.closest("button, a, input")) {return;}
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const rect = el.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;
    el.style.transition = "none";
    el.style.cursor = "grabbing";
  });
  window.addEventListener("mousemove", (e) => {
    if (!isDragging) {return;}
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    el.style.left = Math.max(0, Math.min(window.innerWidth - el.offsetWidth, startLeft + dx)) + "px";
    el.style.top = Math.max(0, Math.min(window.innerHeight - el.offsetHeight, startTop + dy)) + "px";
    el.style.right = "auto";
    el.style.bottom = "auto";
  });
  window.addEventListener("mouseup", () => {
    if (!isDragging) {return;}
    isDragging = false;
    el.style.transition = "opacity 0.3s ease, transform 0.3s ease";
    el.style.cursor = "default";
    // Save position
    chrome.storage.local.set({ sg_hud_pos: { left: el.style.left, top: el.style.top } });
  });
}

function toggleHUD() {
  hudHidden = !hudHidden;
  if (hudEl) {hudEl.style.display = hudHidden ? "none" : "block";}
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

  // --- Token expiry guard — stop/restart api-layer polling automatically ---
  let nowSec   = Math.floor(Date.now() / 1000);
  let hasToken = st[K.TOKEN_EXP] && st[K.TOKEN_EXP] > nowSec;
  if (st[K.ENABLED] && !isPaused) {
    if (!hasToken && !tokenExpiredPollingStopped) {
      // Token just expired — suspend API polling to avoid 401/403 spam
      tokenExpiredPollingStopped = true;
      stopApiPolling();
      log("Token expired — API polling suspended. Waiting for SW refresh.");
    } else if (hasToken && tokenExpiredPollingStopped) {
      // SW refreshed the token in background — resume polling
      tokenExpiredPollingStopped = false;
      startApiPolling();
      log("Token refreshed — API polling resumed.");
    }
  }

  updateDot(st);
  if (hudHidden) {return;}

  nowSec   = Math.floor(Date.now() / 1000);
  hasToken = st[K.TOKEN_EXP] && st[K.TOKEN_EXP] > nowSec;
  const due      = st[K.NEXT_DUE];
  const remaining = st[K.BURST_REMAINING] || 0;
  const msLeft   = due ? due - Date.now() : null;
  const clock    = new Date().toLocaleTimeString();

  let modeLabel, badgeColor, timerColor, timerText, timerLabel, dotColor;

  if (rateLimited) {
    modeLabel  = "BACKED OFF";
    badgeColor = "#f59e0b";
    timerColor = "#f59e0b";
    timerText  = "5s";
    timerLabel = "RATE LIMITED";
    dotColor   = "#f59e0b";
  } else if (!hasToken) {
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
    <div class="sg-hud-header">
      <span class="sg-hud-brand">SG · ${VERSION}</span>
      <span class="sg-hud-badge" style="border-color:${badgeColor};color:${badgeColor};">${modeLabel}</span>
    </div>
    ${apiLayerFailed ? '<div class="sg-hud-warning">⚠️ API layer failed — claiming disabled</div>' : ''}
    <div class="sg-hud-timer-wrap">
      <div class="sg-hud-timer" style="color:${timerColor};">${timerText}</div>
      <div class="sg-hud-timer-label" style="color:${timerColor};">${timerLabel}</div>
    </div>
    <div class="sg-hud-divider"></div>
    <div>
      <div class="sg-hud-row">
        <span class="sg-hud-label">Status</span>
        <span class="sg-hud-value" style="color:${dotColor};">
          <span class="sg-hud-dot" style="background:${dotColor};box-shadow:0 0 6px ${dotColor};"></span>
          ${modeLabel}
        </span>
      </div>
      <div class="sg-hud-row">
        <span class="sg-hud-label">Clock</span>
        <span class="sg-hud-value" style="color:#f0f0f5;">${clock}</span>
      </div>
      <div class="sg-hud-row">
        <span class="sg-hud-label">Burst</span>
        <span class="sg-hud-value" style="color:${timerColor};">${burstBars(remaining)}</span>
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
  } catch { /* intentionally empty */ }
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
  if (isPaused) {return false;}

  // Only consider buttons we haven't clicked yet this page load
  const addButtons = findAddShiftButtons().filter(btn => !clickedButtons.has(btn));
  if (addButtons.length === 0) {return false;}

  const shifts = addButtons
    .map(btn => ({ btn, ...parseShiftInfo(btn) }))
    .sort((a, b) => b.total - a.total);

  for (let i = 0; i < shifts.length; i++) {
    if (i > 0) {await sleep(CFG.PER_SHIFT_STAGGER_MS);}
    const s = shifts[i];

    // Mark as clicked immediately so the loop never retries this button
    clickedButtons.add(s.btn);

    try {
      s.btn.click();
      log(`🖱️ Clicked Add: ${s.label}`);

      try {
        const beep = document.createElement("audio");
        beep.src = chrome.runtime.getURL("sounds/click.mp3");
        beep.volume = 0.8;
        beep.play().catch(() => {});
      } catch { /* intentionally empty */ }

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
// Uses setTimeout with random 600-1000ms intervals instead of fixed setInterval.
// Fixed-cadence DOM polling (every 800ms, always) is a detectable bot pattern.
// Random timing matches natural browser/human interaction variance.
let mainLoopTimer = null;
function startMainLoop() {
  if (mainLoopTimer) {return;}
  (function loop() {
    clickStayLoggedInIfPresent();
    tryToGrabShifts();
    // Random 600-1000ms — avoids fixed-interval fingerprinting
    mainLoopTimer = setTimeout(loop, 600 + Math.floor(Math.random() * 400));
  })();
}
function stopMainLoop() {
  if (mainLoopTimer) { clearTimeout(mainLoopTimer); mainLoopTimer = null; }
}

// --- message handlers --------------------------------------------------------
chrome.runtime.onMessage.addListener(async (msg) => {
  if (!msg || !msg.type) {return;}

  if (msg.type === "SG_SET_ENABLED") {
    const enabled = !!msg.value;
    if (!enabled) {
      stopMainLoop();
      stopApiPolling();
      log('Extension disabled — all polling stopped.');
    } else {
      startMainLoop();
      startApiPolling();
      log('Extension enabled — polling resumed.');
    }
  }

  if (msg.type === "SG_SET_BLACKLIST_DATES") {
    // Store blacklist dates and relay to api-layer
    const blacklist = msg.blacklist || [];
    await chrome.storage.local.set({ [K.BLACKLIST_DATES]: blacklist });
    window.postMessage({ sg: true, type: 'SG_SET_BLACKLIST_DATES', blacklist, secret: SG_CONSTS.MSG_SECRET }, '*');
    log('Blacklist updated:', blacklist.length === 0 ? 'no blacklist' : blacklist.join(', '));
  }

  if (msg.type === "SG_TOGGLE_HUD") {
    toggleHUD();
  }

  if (msg.type === "SG_TOGGLE_PAUSE") {
    const st   = await new Promise(r => chrome.storage.local.get({ [K.PAUSED]: false }, r));
    const next = !st[K.PAUSED];
    await new Promise(r => chrome.storage.local.set({ [K.PAUSED]: next }, r));
    chrome.runtime.sendMessage({ type: "SG_SET_PAUSED", value: next });
    isPaused = next;
    if (isPaused) {stopApiPolling();} else {startApiPolling();}
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
  if (e.code === "KeyP" && !e.shiftKey && !e.ctrlKey && !e.altKey) {
    // PAUSE — stop polling IMMEDIATELY, don't wait for service worker
    isPaused = !isPaused;
    if (isPaused) {stopApiPolling();} else {startApiPolling();}
    chrome.storage.local.set({ [K.PAUSED]: isPaused });
    chrome.runtime.sendMessage({ type: "SG_SET_PAUSED", value: isPaused });
    flashOverlay(isPaused ? "#f87171" : "#4ade80");
    updateHUD();
  }
  if (e.shiftKey && e.code === "KeyO" && !e.ctrlKey && !e.altKey) {
    // OVERRIDE — toggle immediately
    overrideMode = !overrideMode;
    chrome.storage.local.set({ [K.OVERRIDE]: overrideMode });
    chrome.runtime.sendMessage({ type: "SG_SET_OVERRIDE", value: overrideMode });
    flashOverlay(overrideMode ? "#fbbf24" : "#4ade80");
    updateHUD();
  }
  if (e.shiftKey && e.code === "KeyH" && !e.ctrlKey && !e.altKey)
    {toggleHUD();}
  if (e.code === "KeyR" && !e.shiftKey && !e.ctrlKey && !e.altKey)
    {chrome.runtime.sendMessage({ type: "SG_RELOAD_ALL_NOW" });}
  if (e.shiftKey && e.code === "KeyT" && !e.ctrlKey && !e.altKey) {
    turboMode = !turboMode;
    setApiSpeed(turboMode ? SG_CONSTS.TIMING.TURBO_POLL_INTERVAL_MS : SG_CONSTS.TIMING.POLL_INTERVAL_MS);
    console.log("[ShiftGrabber] TURBO MODE:", turboMode ? "ON - " + SG_CONSTS.TIMING.TURBO_POLL_INTERVAL_MS + "ms polling" : "OFF - " + SG_CONSTS.TIMING.POLL_INTERVAL_MS + "ms polling");
  }
});

// --- API claim listener (api-layer.js now handles polling + claiming directly) ---
// We only listen for CLAIM RESULTS and EID relay here

window.addEventListener('message', (e) => {
  if (e.source !== window || !e.data?.sg) {return;}
  // Validate secret on messages FROM api-layer.js to prevent spoofing
  if (e.data.secret !== SG_CONSTS.MSG_SECRET) {
    console.warn('[SG Main] Rejected message from api-layer with invalid secret');
    return;
  }

  // --- api-layer sends us the employee ID once ---
  if (e.data.type === 'SG_EID') {
    chrome.storage.local.set({ sg_eid: e.data.eid });
    chrome.runtime.sendMessage({ type: "SG_EID", eid: e.data.eid });
    log('Employee ID stored:', e.data.eid);
  }

  // --- Rate limit detection ---
  if (e.data.type === 'SG_RATE_LIMITED') {
    rateLimited = e.data.limited;
    if (rateLimited) {
      log('RATE LIMITED! Slowing down for 30s...');
      showToast('⚠️ Rate Limited — Slowing Down', '#f59e0b', 5000);
    } else {
      log('Rate limit recovered — back to normal speed');
      showToast('✅ Recovered — Normal Speed', '#4ade80', 3000);
    }
    updateHUD();
  }

  // --- Claim result from api-layer ---
  if (e.data.type === 'SG_CLAIM_RESULT') {
    const d = e.data;
    const oppId = d.oppId;

    // Check for errors
    if (d.data?.errors || d.data?.error) {
      log('Claim attempt #' + d.attempt + ':', d.data.errors || d.data.error);
      return;
    }

    // SUCCESS — but only notify once per oppId
    if (apiClaimNotified[oppId]) {return;}
    apiClaimNotified[oppId] = true;

    const shiftDate = d.shift?.start
      ? new Date(d.shift.start).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : getPageDate() || "unknown date";

    log('SHIFT CLAIMED via API! Attempt #' + d.attempt, oppId);
    showToast('Shift Grabbed! (' + shiftDate + ')', '#4ade80');
    playAlert();
    flashOverlay('#4ade80');

    // Telegram — ONLY on confirmed success (not on button click)
    sendTelegramLogForDate(shiftDate);
  }
});

// Telegram log with specific date (for API claims that may be for any date)
async function sendTelegramLogForDate(date) {
  try {
    const optOut = await new Promise(r => chrome.storage.local.get({ sg_tg_opt_out: false }, r));
    if (optOut.sg_tg_opt_out) {return;}
    const store   = await new Promise(r => chrome.storage.local.get({ [K.USER_KEY]: "unknown" }, r));
    const userKey = store[K.USER_KEY] || "unknown";
    const time    = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    const pending = await new Promise(r => chrome.storage.local.get({ sg_tg_queue: [] }, r));
    const queue   = pending.sg_tg_queue || [];
    queue.push({ userKey, date, time });
    await new Promise(r => chrome.storage.local.set({ sg_tg_queue: queue }, r));
  } catch (e) {
    log("Telegram queue failed:", e);
  }
}

// --- control api-layer polling from main.js ---
function startApiPolling() {
  // Tell api-layer to start polling at GOD mode speed
  const interval = turboMode ? SG_CONSTS.TIMING.TURBO_POLL_INTERVAL_MS : SG_CONSTS.TIMING.POLL_INTERVAL_MS;
  const tabWindow = getTabDateWindow(); // Get 7-day window from this tab's date
  window.postMessage({ sg: true, type: 'SG_START_POLLING', interval, tabWindow, secret: SG_CONSTS.MSG_SECRET }, '*');
}

function stopApiPolling() {
  window.postMessage({ sg: true, type: 'SG_STOP_POLLING', secret: SG_CONSTS.MSG_SECRET }, '*');
}

function setApiSpeed(interval) {
  window.postMessage({ sg: true, type: 'SG_SET_SPEED', interval, secret: SG_CONSTS.MSG_SECRET }, '*');
}

// --- init --------------------------------------------------------------------
(async function init() {
  const st = await new Promise(r => chrome.storage.local.get({
    [K.ENABLED]: false, [K.OVERRIDE]: false, [K.PAUSED]: false, sg_hud_hidden: false,
    [K.NEXT_DUE]: null, [K.BLACKLIST_DATES]: [], sg_hud_pos: null
  }, r));

  if (!st[K.ENABLED]) {
    console.log("[ShiftGrabber] Loaded but DISABLED — enable from popup.");
    return;
  }

  isPaused     = !!st[K.PAUSED];
  overrideMode = !!st[K.OVERRIDE];
  hudHidden    = !!st.sg_hud_hidden;

  console.log("[ShiftGrabber] V9 Active — all 14 days, instant claim.");

  // If no valid next reload is scheduled, poke the service worker to reschedule now
  const due = st[K.NEXT_DUE];
  if (!due || due <= Date.now()) {
    chrome.runtime.sendMessage({ type: "SG_POKE_SCHEDULE" });
  }

  updateHUD();
  if (hudTimer) {clearInterval(hudTimer);}
  hudTimer = setInterval(updateHUD, 500);

  // Pause HUD updates when tab is hidden to save CPU/battery
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (hudTimer) { clearInterval(hudTimer); hudTimer = null; }
    } else {
      if (!hudTimer) {hudTimer = setInterval(updateHUD, 500);}
      updateHUD();
    }
  });

  startMainLoop();

  // Send blacklist to api-layer on load
  const blacklist = st[K.BLACKLIST_DATES] || [];
  if (blacklist.length > 0) {
    window.postMessage({ sg: true, type: 'SG_SET_BLACKLIST_DATES', blacklist, secret: SG_CONSTS.MSG_SECRET }, '*');
  }

  // Wait for api-layer.js (MAIN world) to register its message listener before posting.
  // Polls __sg_api_v3 every 100ms up to 1.5s, then sends anyway as a fallback.
  // This eliminates the race where a fixed 800ms delay could under- or over-shoot.
  (function waitForApiLayer(tries) {
    if (window.__sg_api_v3) {
      if (!isPaused) {startApiPolling();}
    } else if (tries < 15) {
      setTimeout(() => waitForApiLayer(tries + 1), 100);
    } else {
      // api-layer didn't signal ready in 1.5s — claiming disabled
      apiLayerFailed = true;
      showToast('⚠️ API layer failed — claiming disabled', '#f87171', 5000);
      log("api-layer load wait timed out — claiming disabled");
    }
  })(0);
})();
