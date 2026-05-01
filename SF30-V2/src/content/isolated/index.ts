/**
 * Isolated World Content Script — SF30 V2.0
 *
 * Responsibilities:
 * 1. HUD rendering (in closed Shadow DOM)
 * 2. DOM scanning for "Add Shift" buttons (backup claiming)
 * 3. Keyboard shortcuts
 * 4. Communication with MAIN world script via postMessage
 * 5. Communication with background via chrome.runtime.sendMessage
 *
 * This script is injected dynamically by the background service worker
 * only when the extension is enabled.
 */

import { MSG_TYPES, TIMING } from '@shared/constants';
// No security imports needed — token-based auth only

// ── Activation Gate ──

// Check if we should activate
void chrome.storage.local.get('sg_v2_state').then((result) => {
  const state = result.sg_v2_state;
  if (state?.enabled) {
    void activate();
  } else {
    console.log('[SF30 V2] Content script loaded but dormant (extension disabled)');
  }
});

// Listen for messages from background
chrome.runtime.onMessage.addListener((message) => {
  switch (message.type) {
    case MSG_TYPES.STATE_CHANGED: {
      const state = message.payload as { enabled: boolean; paused: boolean };
      if (state.enabled) {
        if (!isActive) {
          void activate();
        }
        // Sync pause state
        if (state.paused !== isPaused) {
          isPaused = state.paused;
        }
      } else {
        if (isActive) {
          deactivate();
        }
      }
      break;
    }
    case MSG_TYPES.TOGGLE_HUD:
      toggleHUD();
      break;
    case MSG_TYPES.SET_SPEED: {
      const p = message.payload as { interval?: number; turbo?: boolean };
      notifyMainWorld('SET_SPEED', p);
      break;
    }
    case MSG_TYPES.SET_BLACKLIST: {
      const p = message.payload as { blacklistDates?: string[] };
      notifyMainWorld('SET_BLACKLIST', p);
      break;
    }
    case MSG_TYPES.START_POLLING:
      notifyMainWorld('START_POLLING');
      break;
    case MSG_TYPES.STOP_POLLING:
      notifyMainWorld('STOP_POLLING');
      break;
  }
  return false;
});

// ── State ──

let isActive = false;
let isPaused = false;
let hudContainer: HTMLElement | null = null;
let hudShadow: ShadowRoot | null = null;
let hudTimer: ReturnType<typeof setInterval> | null = null;
let domScanTimer: ReturnType<typeof setInterval> | null = null;
let keyboardHandler: ((e: KeyboardEvent) => void) | null = null;
let claimedCount = 0;
let mainWorldToken: string | null = null;

// ── Activation / Deactivation ──

function activate(): void {
  if (isActive) {return;}
  if ((window as unknown as Record<string, unknown>).__sf30_v2_active) {return;}

  // Make dedup marker tamper-resistant
  try {
    Object.defineProperty(window, '__sf30_v2_active', {
      value: true,
      writable: false,
      configurable: false,
    });
  } catch {
    (window as unknown as Record<string, unknown>).__sf30_v2_active = true;
  }

  isActive = true;

  console.log('[SF30 V2] Content script activated');

  // Inject HUD
  injectHUD();

  // Start HUD updates
  startHUDUpdates();

  // Start DOM scanning (backup claim method)
  startDOMScanning();

  // Setup keyboard shortcuts
  setupKeyboardShortcuts();

  // Notify MAIN world script to start polling
  notifyMainWorld('START_POLLING');
}

function deactivate(): void {
  if (!isActive) {return;}
  isActive = false;

  console.log('[SF30 V2] Content script deactivated');

  // Stop timers
  if (hudTimer) {
    clearInterval(hudTimer);
    hudTimer = null;
  }
  if (domScanTimer) {
    clearInterval(domScanTimer);
    domScanTimer = null;
  }

  // Remove keyboard handler
  if (keyboardHandler) {
    window.removeEventListener('keydown', keyboardHandler);
    keyboardHandler = null;
  }

  // Remove HUD
  if (hudContainer) {
    hudContainer.remove();
    hudContainer = null;
    hudShadow = null;
  }

  // Notify MAIN world to stop
  notifyMainWorld('STOP_POLLING');
}

// ── HUD (Shadow DOM) ──

function injectHUD(): void {
  if (hudContainer) {return;}

  if (!document.body) {
    // Retry after a short delay when body is available
    setTimeout(() => injectHUD(), 100);
    return;
  }

  hudContainer = document.createElement('div');
  hudContainer.style.cssText = 'position:fixed;bottom:0;right:0;z-index:2147483646;';

  // Use closed Shadow DOM to prevent page scripts from inspecting
  hudShadow = hudContainer.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = `
    :host {
      all: initial;
    }
    .hud {
      position: fixed;
      bottom: 16px;
      right: 16px;
      background: rgba(15, 17, 23, 0.95);
      backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 12px 16px;
      color: #e8e8ed;
      font-family: ui-sans-serif, system-ui, sans-serif;
      font-size: 13px;
      min-width: 180px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
      user-select: none;
    }
    .hud-header {
      font-weight: 700;
      margin-bottom: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .hud-status {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      margin-right: 6px;
    }
    .hud-status.active { background: #4ade80; box-shadow: 0 0 6px #4ade80; }
    .hud-status.paused { background: #fbbf24; }
    .hud-status.error { background: #f87171; }
    .hud-row {
      display: flex;
      justify-content: space-between;
      margin: 4px 0;
      opacity: 0.8;
    }
    .hud-label { color: #9ca3af; }
    .hud-value { font-weight: 600; }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
    @media (prefers-contrast: more) {
      .hud-container { border: 2px solid CanvasText; }
      .hud-status { color: CanvasText; }
    }
  `;

  const hud = document.createElement('div');
  hud.className = 'hud hud-container';
  hud.setAttribute('role', 'region');
  hud.setAttribute('aria-label', 'SF30 HUD');
  hud.innerHTML = `
    <div class="hud-header">
      <span>SF30 <span style="opacity:0.5;font-size:11px;">V2.0</span></span>
      <span id="hud-status-dot" class="hud-status active" aria-label="Status: Active"></span>
    </div>
    <div class="hud-row" aria-live="polite"><span class="hud-label">Status</span><span class="hud-value" id="hud-status">Active</span></div>
    <div class="hud-row"><span class="hud-label">Polls</span><span class="hud-value" id="hud-polls">0</span></div>
    <div class="hud-row"><span class="hud-label">Claimed</span><span class="hud-value" id="hud-claimed">0</span></div>
    <div class="sr-only" aria-live="polite" id="hud-sr-announce"></div>
  `;

  hudShadow.appendChild(style);
  hudShadow.appendChild(hud);
  document.body.appendChild(hudContainer);
}

function startHUDUpdates(): void {
  if (hudTimer) {return;}

  const pollCount = 0;

  hudTimer = setInterval(() => {
    if (!hudShadow) {return;}

    const statusEl = hudShadow.getElementById('hud-status');
    const dotEl = hudShadow.getElementById('hud-status-dot');
    const pollsEl = hudShadow.getElementById('hud-polls');
    const claimedEl = hudShadow.getElementById('hud-claimed');

    if (statusEl && dotEl) {
      if (isPaused) {
        statusEl.textContent = 'Paused';
        dotEl.className = 'hud-status paused';
        dotEl.setAttribute('aria-label', 'Status: Paused');
      } else {
        statusEl.textContent = 'Active';
        dotEl.className = 'hud-status active';
        dotEl.setAttribute('aria-label', 'Status: Active');
      }
    }

    if (pollsEl) {pollsEl.textContent = String(pollCount);}
    if (claimedEl) {claimedEl.textContent = String(claimedCount);}
  }, TIMING.HUD_REFRESH_MS);
}

function announceToScreenReader(message: string): void {
  if (!hudShadow) {return;}
  const el = hudShadow.getElementById('hud-sr-announce');
  if (el) {el.textContent = message;}
}

// ── DOM Scanning (Backup Claim) ──

function startDOMScanning(): void {
  if (domScanTimer) {return;}

  domScanTimer = setInterval(() => {
    if (isPaused || !document.visibilityState || document.visibilityState === 'hidden') {
      return;
    }

    // Look for "Add Shift" buttons
    const buttons = document.querySelectorAll('button, [role="button"]');
    let stagger = 0;
    for (const btn of buttons) {
      const text = btn.textContent?.toLowerCase() || '';
      if (text.includes('add shift') || text.includes('pick up shift')) {
        stagger += TIMING.PER_SHIFT_STAGGER_MS;
        setTimeout(() => {
          if (!isPaused) {
            (btn as HTMLElement).click();
            claimedCount++;
          }
        }, stagger);
      }
    }
  }, TIMING.DOM_SCAN_MS);
}

// ── Keyboard Shortcuts ──

function setupKeyboardShortcuts(): void {
  if (keyboardHandler) {return;}

  keyboardHandler = (e: KeyboardEvent): void => {
    // Skip if user is typing in an input
    const target = e.target as HTMLElement;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
      return;
    }

    switch (e.code) {
      case 'KeyP':
        if (!e.shiftKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault();
          togglePause();
        }
        break;
      case 'KeyO':
        if (e.shiftKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault();
          toggleOverride();
        }
        break;
      case 'KeyH':
        if (e.shiftKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault();
          toggleHUD();
        }
        break;
      case 'KeyR':
        if (!e.shiftKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault();
          reloadTabs();
        }
        break;
    }
  };

  window.addEventListener('keydown', keyboardHandler);
}

function togglePause(): void {
  isPaused = !isPaused;
  announceToScreenReader(isPaused ? 'SF30 paused' : 'SF30 resumed');
  void chrome.runtime.sendMessage({
    type: MSG_TYPES.SET_PAUSED,
    payload: { value: isPaused },
  });
}

function toggleOverride(): void {
  announceToScreenReader('Override activated');
  void chrome.runtime.sendMessage({
    type: MSG_TYPES.SET_OVERRIDE,
    payload: { value: true },
  });
}

function toggleHUD(): void {
  if (hudContainer) {
    const hidden = hudContainer.style.display === 'none';
    hudContainer.style.display = hidden ? '' : 'none';
    announceToScreenReader(hidden ? 'HUD shown' : 'HUD hidden');
  }
}

function reloadTabs(): void {
  announceToScreenReader('Reloading tabs');
  void chrome.runtime.sendMessage({ type: MSG_TYPES.RELOAD_ALL });
}

// ── MAIN World Communication ──

function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function notifyMainWorld(action: 'START_POLLING' | 'STOP_POLLING' | 'SET_SPEED' | 'SET_BLACKLIST', payload?: unknown): void {
  if (action === 'START_POLLING' && !mainWorldToken) {
    mainWorldToken = generateToken();
  }
  if (action === 'STOP_POLLING') {
    mainWorldToken = null;
  }
  window.postMessage(
    {
      source: 'sf30-v2-isolated',
      action,
      payload,
      token: mainWorldToken,
    },
    window.location.origin
  );
}

// Listen for messages from MAIN world
window.addEventListener('message', (e) => {
  if (e.source !== window) {return;}
  if (e.data?.source !== 'sf30-v2-main') {return;}

  // Validate origin
  if (e.origin !== window.location.origin) {return;}

  // Validate token to prevent page-script spoofing
  if (e.data?.token !== mainWorldToken) {
    console.warn('[SF30 V2] Rejected unauthenticated message from MAIN world');
    return;
  }

  const { action, payload } = e.data as { action: string; payload?: unknown };

  switch (action) {
    case 'CLAIM_RESULT':
      // Relay to background
      void chrome.runtime.sendMessage({
        type: MSG_TYPES.CLAIM_RESULT,
        payload,
      });
      break;
    case 'EID_FOUND':
      void chrome.runtime.sendMessage({
        type: MSG_TYPES.EID_FOUND,
        payload,
      });
      break;
    case 'RATE_LIMITED':
      void chrome.runtime.sendMessage({
        type: MSG_TYPES.RATE_LIMITED,
        payload,
      });
      break;
  }
});

// ── Visibility Handling ──

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // Pause non-essential operations when tab is hidden
    if (domScanTimer) {
      clearInterval(domScanTimer);
      domScanTimer = null;
    }
  } else {
    if (isActive && !domScanTimer) {
      startDOMScanning();
    }
  }
});

console.log('[SF30 V2] Isolated content script loaded');

// ── Test Exports ──
export { injectHUD, setupKeyboardShortcuts, notifyMainWorld };
