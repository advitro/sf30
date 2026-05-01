/**
 * Popup UI — SF30 V2.0
 *
 * Responsibilities:
 * 1. Display current extension state
 * 2. License input and verification
 * 3. Settings management (dates, blacklist, Telegram)
 * 4. Toggle controls (enable, pause, override)
 * 5. Send actions to background via chrome.runtime.sendMessage
 *
 * Pure UI layer — all business logic is in the background service worker.
 */

import './styles.css';
import type { AppState } from '@core/store';
import { MSG_TYPES } from '@shared/constants';

// ── State ──

let currentState: AppState | null = null;
let focusTrapHandler: ((e: KeyboardEvent) => void) | null = null;

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ── DOM Elements (lazy-loaded) ──

function getApp(): HTMLElement {
  const el = document.getElementById('app');
  if (!el) {throw new Error('App element not found');}
  return el;
}

// ── Initialization ──

export function init(): void {
  renderInitialUI();
  void loadState();
  setupMessageListener();
  showConsentModalIfNeeded();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}

function renderInitialUI(): void {
  const app = getApp();
  app.innerHTML = `
    <div class="popup-container">
      <header class="popup-header" role="banner">
        <div class="brand">
          <span class="brand-name">SF30</span>
          <span class="brand-version">V2.0</span>
          <span id="tierBadge" class="tier-badge hidden" aria-hidden="true"></span>
        </div>
        <div id="statusBadge" class="status-badge off" role="status" aria-live="polite">OFF</div>
      </header>

      <!-- License Section -->
      <section class="section" aria-labelledby="licenseTitle">
        <h3 id="licenseTitle" class="section-title">License</h3>
        <div id="fingerprintRow" class="fingerprint-row">
          <label class="field-label">Device Fingerprint</label>
          <div class="fingerprint-box">
            <code id="fingerprintValue" class="fingerprint-value">—</code>
            <button id="copyFpBtn" class="btn ghost small" aria-label="Copy fingerprint">Copy</button>
          </div>
          <p class="field-hint">Copy this fingerprint to receive a device-bound license key.</p>
        </div>
        <div class="license-input-row">
          <input
            id="licenseInput"
            type="text"
            class="text-input"
            placeholder="Paste your license key"
            aria-label="License key"
            aria-describedby="licenseStatus"
            autocapitalize="off"
            autocomplete="off"
            spellcheck="false"
          />
          <button id="verifyBtn" class="btn primary" aria-label="Verify license">Verify</button>
        </div>
        <div id="licenseStatus" class="status-text" role="status" aria-live="polite">Enter a license key to activate</div>
      </section>

      <!-- Master Toggle -->
      <section class="section toggle-section" aria-labelledby="toggleTitle">
        <div class="toggle-row">
          <div class="toggle-labels">
            <span id="toggleTitle" class="toggle-title">Shift Grabber</span>
            <span id="toggleDesc" class="toggle-desc">Enter key and turn on</span>
          </div>
          <label class="switch switch-big" aria-label="Enable Shift Grabber">
            <input id="masterToggle" type="checkbox" role="switch" />
            <span class="slider"></span>
          </label>
        </div>
      </section>

      <!-- Tabs -->
      <nav class="tab-nav" role="tablist" aria-label="Extension sections">
        <button id="tabShifts" class="tab-btn active" role="tab" aria-selected="true" aria-controls="panelShifts" tabindex="0">Shifts</button>
        <button id="tabControls" class="tab-btn" role="tab" aria-selected="false" aria-controls="panelControls" tabindex="-1">Controls</button>
        <button id="tabSettings" class="tab-btn" role="tab" aria-selected="false" aria-controls="panelSettings" tabindex="-1">Settings</button>
      </nav>

      <!-- Tab Panels -->
      <div class="tab-panels">
        <!-- Shifts Panel -->
        <section id="panelShifts" class="tab-panel active" role="tabpanel" aria-labelledby="tabShifts">
          <div class="card">
            <h4 class="card-title">Target Dates</h4>
            <div class="input-row">
              <input id="dateInput" type="date" class="text-input" aria-label="Select date" min="${new Date().toISOString().split('T')[0]}" />
              <button id="addDateBtn" class="btn primary small" aria-label="Add date">Add</button>
            </div>
            <div id="datesList" class="tag-list empty" aria-label="Selected dates" aria-live="polite">No dates selected</div>
            <div class="card-actions">
              <button id="clearDatesBtn" class="btn ghost small">Clear</button>
              <button id="openDatesBtn" class="btn primary small">Open All</button>
            </div>
          </div>

          <div class="card">
            <h4 class="card-title">Blacklist Dates</h4>
            <div class="input-row">
              <input id="blacklistInput" type="date" class="text-input" aria-label="Select blacklist date" min="${new Date().toISOString().split('T')[0]}" />
              <button id="addBlacklistBtn" class="btn primary small" aria-label="Add blacklist date">Add</button>
            </div>
            <div id="blacklistList" class="tag-list empty" aria-label="Blacklisted dates" aria-live="polite">No blacklist</div>
            <div class="card-actions">
              <button id="clearBlacklistBtn" class="btn ghost small">Clear</button>
            </div>
          </div>
        </section>

        <!-- Controls Panel -->
        <section id="panelControls" class="tab-panel" role="tabpanel" aria-labelledby="tabControls" hidden>
          <div class="card">
            <h4 class="card-title">Quick Controls</h4>
            <div class="control-grid">
              <button id="pauseBtn" class="btn control" aria-label="Toggle pause (P)">
                <span class="control-icon">⏸</span>
                <span class="control-label">Pause</span>
                <span class="control-key">P</span>
              </button>
              <button id="overrideBtn" class="btn control" aria-label="Toggle override speed (Shift+O)">
                <span class="control-icon">⚡</span>
                <span class="control-label">Override</span>
                <span class="control-key">⇧O</span>
              </button>
              <button id="hideHudBtn" class="btn control ghost" aria-label="Toggle HUD (Shift+H)">
                <span class="control-icon">👁</span>
                <span class="control-label">HUD</span>
                <span class="control-key">⇧H</span>
              </button>
              <button id="reloadBtn" class="btn control ghost" aria-label="Reload all tabs (R)">
                <span class="control-icon">↻</span>
                <span class="control-label">Reload</span>
                <span class="control-key">R</span>
              </button>
            </div>
          </div>
        </section>

        <!-- Settings Panel -->
        <section id="panelSettings" class="tab-panel" role="tabpanel" aria-labelledby="tabSettings" hidden>
          <div class="card">
            <h4 class="card-title">Telegram Notifications</h4>
            <input id="tgBotToken" type="password" class="text-input" placeholder="Bot token from @BotFather" aria-label="Telegram bot token" />
            <input id="tgChatId" type="text" class="text-input" placeholder="Chat ID" aria-label="Telegram chat ID" />
            <button id="tgSaveBtn" class="btn primary full">Save Config</button>
            <div class="row-flex">
              <span id="tgStatus" class="status-text small">Not configured</span>
              <label class="switch small" aria-label="Enable Telegram alerts">
                <input id="tgToggle" type="checkbox" role="switch" />
                <span class="slider"></span>
              </label>
            </div>
          </div>

          <div class="card">
            <h4 class="card-title">Data &amp; Privacy</h4>
            <button id="exportBtn" class="btn primary full">Export My Data</button>
            <button id="deleteBtn" class="btn danger full">Delete All Data</button>
          </div>
        </section>
      </div>

      <footer class="popup-footer">
        <span>SF30 V2.0 · All tabs sync</span>
      </footer>
    </div>

    <!-- Consent Modal -->
    <div id="consentModal" class="modal-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="consentTitle">
      <div class="modal">
        <h2 id="consentTitle" class="modal-title">Privacy Notice</h2>
        <div class="modal-body">
          <p>SF30 operates primarily offline on your device.</p>
          <p>The following data may be transmitted to external services:</p>
          <ul>
            <li><strong>License Server (license.sf30.app):</strong> Device fingerprint and license key for activation and periodic validation.</li>
            <li><strong>Telegram API (optional):</strong> Shift claim notifications (date, time, site) if you configure Telegram.</li>
          </ul>
          <p>Your Telegram credentials are encrypted with AES-GCM-256 before storage.</p>
          <div class="consent-toggles">
            <div class="consent-toggle-row">
              <span class="consent-toggle-label">License Server checks</span>
              <label class="switch small" aria-label="License Server checks">
                <input id="consentLicense" type="checkbox" role="switch" checked disabled />
                <span class="slider"></span>
              </label>
            </div>
            <div class="consent-toggle-row">
              <span class="consent-toggle-label">Telegram Notifications</span>
              <label class="switch small" aria-label="Telegram Notifications">
                <input id="consentTelegram" type="checkbox" role="switch" />
                <span class="slider"></span>
              </label>
            </div>
            <div class="consent-toggle-row">
              <span class="consent-toggle-label">Error Reporting</span>
              <label class="switch small" aria-label="Error Reporting">
                <input id="consentErrors" type="checkbox" role="switch" checked />
                <span class="slider"></span>
              </label>
            </div>
          </div>
          <label class="checkbox-label">
            <input type="checkbox" id="ageCheck" />
            I am 16 years or older
          </label>
        </div>
        <div class="modal-actions">
          <button id="consentAcceptBtn" class="btn primary full" aria-label="Accept and continue" disabled>Accept &amp; Continue</button>
          <button id="consentDeclineBtn" class="btn ghost full" aria-label="Decline and close">Decline</button>
        </div>
      </div>
    </div>
  `;

  setupEventListeners();
}

// ── Event Listeners ──

function setupEventListeners(): void {
  // Consent
  document.getElementById('consentAcceptBtn')?.addEventListener('click', () => { void acceptConsent(); });
  document.getElementById('consentDeclineBtn')?.addEventListener('click', () => { void declineConsent(); });
  document.getElementById('ageCheck')?.addEventListener('change', (e) => {
    const btn = document.getElementById('consentAcceptBtn') as HTMLButtonElement | null;
    if (btn) {btn.disabled = !(e.target as HTMLInputElement).checked;}
  });

  // License
  document.getElementById('verifyBtn')?.addEventListener('click', () => { void verifyLicense(); });
  document.getElementById('licenseInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {void verifyLicense();}
  });
  document.getElementById('copyFpBtn')?.addEventListener('click', () => { void copyFingerprint(); });

  // Master toggle
  document.getElementById('masterToggle')?.addEventListener('change', (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    void setEnabled(checked);
  });

  // Tabs
  document.getElementById('tabShifts')?.addEventListener('click', () => showTab(0));
  document.getElementById('tabControls')?.addEventListener('click', () => showTab(1));
  document.getElementById('tabSettings')?.addEventListener('click', () => showTab(2));

  // Controls
  document.getElementById('pauseBtn')?.addEventListener('click', () => { void togglePause(); });
  document.getElementById('overrideBtn')?.addEventListener('click', () => { void toggleOverride(); });
  document.getElementById('hideHudBtn')?.addEventListener('click', () => { void toggleHUD(); });
  document.getElementById('reloadBtn')?.addEventListener('click', () => { void reloadAll(); });

  // Dates
  document.getElementById('addDateBtn')?.addEventListener('click', () => { void addDate(); });
  document.getElementById('clearDatesBtn')?.addEventListener('click', () => { void clearDates(); });
  document.getElementById('openDatesBtn')?.addEventListener('click', openDates);

  // Blacklist
  document.getElementById('addBlacklistBtn')?.addEventListener('click', () => { void addBlacklist(); });
  document.getElementById('clearBlacklistBtn')?.addEventListener('click', () => { void clearBlacklist(); });

  // Telegram
  document.getElementById('tgSaveBtn')?.addEventListener('click', () => { void saveTelegram(); });
  document.getElementById('tgToggle')?.addEventListener('change', () => { void toggleTelegram(); });

  // Data
  document.getElementById('exportBtn')?.addEventListener('click', () => { void exportData(); });
  document.getElementById('deleteBtn')?.addEventListener('click', () => { void deleteData(); });

  // Keyboard navigation for tabs
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modal = document.getElementById('consentModal');
      if (modal && !modal.classList.contains('hidden')) {
        e.preventDefault();
        hideConsentModal();
        document.getElementById('consentAcceptBtn')?.focus();
        return;
      }
      window.close();
    }
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const tabs = [
        document.getElementById('tabShifts'),
        document.getElementById('tabControls'),
        document.getElementById('tabSettings'),
      ];
      const idx = tabs.indexOf(document.activeElement as HTMLElement | null);
      if (idx !== -1) {
        e.preventDefault();
        const next = e.key === 'ArrowRight'
          ? (idx + 1) % tabs.length
          : (idx - 1 + tabs.length) % tabs.length;
        showTab(next);
        tabs[next]?.focus();
      }
    }
  });
}

// ── State Management ──

async function loadState(): Promise<void> {
  try {
    const response = await chrome.runtime.sendMessage({ type: MSG_TYPES.GET_STATE });
    if (response?.payload) {
      updateUI(response.payload as AppState);
    }
  } catch (_e) {
    // Background may not be ready
  }
}

function setupMessageListener(): void {
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === MSG_TYPES.STATE_CHANGED && message.payload) {
      updateUI(message.payload as AppState);
    }
    return false;
  });
}

// ── Consent Modal ──

function showConsentModalIfNeeded(): void {
  void chrome.storage.local.get('sg_v2_consent_given').then((result) => {
    if (!result.sg_v2_consent_given) {
      const modal = document.getElementById('consentModal');
      const popupContainer = document.querySelector('.popup-container');
      if (modal) {
        modal.classList.remove('hidden');
        popupContainer?.setAttribute('inert', '');
        trapFocusInModal(modal);
        document.getElementById('consentAcceptBtn')?.focus();
      }
    }
  });
}

function hideConsentModal(): void {
  const modal = document.getElementById('consentModal');
  const popupContainer = document.querySelector('.popup-container');
  if (modal) {
    modal.classList.add('hidden');
  }
  popupContainer?.removeAttribute('inert');
  releaseFocusTrap();
}

function trapFocusInModal(modal: HTMLElement): void {
  const focusableSelectors = [
    'button:not([disabled])',
    'a[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ');

  const focusables = Array.from(modal.querySelectorAll<HTMLElement>(focusableSelectors));
  const first = focusables[0];
  const last = focusables[focusables.length - 1];

  focusTrapHandler = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') {return;}
    if (focusables.length === 0) {return;}

    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
  };

  modal.addEventListener('keydown', focusTrapHandler);
}

function releaseFocusTrap(): void {
  const modal = document.getElementById('consentModal');
  if (modal && focusTrapHandler) {
    modal.removeEventListener('keydown', focusTrapHandler);
    focusTrapHandler = null;
  }
}

function updateUI(state: AppState): void {
  currentState = state;

  // Status badge
  const statusBadge = document.getElementById('statusBadge');
  if (statusBadge) {
    if (!state.enabled) {
      statusBadge.textContent = 'OFF';
      statusBadge.className = 'status-badge off';
    } else if (state.paused) {
      statusBadge.textContent = 'PAUSED';
      statusBadge.className = 'status-badge paused';
    } else if (state.override) {
      statusBadge.textContent = 'OVERRIDE';
      statusBadge.className = 'status-badge override';
    } else {
      statusBadge.textContent = 'ACTIVE';
      statusBadge.className = 'status-badge on';
    }
  }

  // Master toggle
  const masterToggle = document.getElementById('masterToggle') as HTMLInputElement | null;
  if (masterToggle) {
    masterToggle.checked = state.enabled;
    const licenseBlocked = !state.license.valid;
    masterToggle.disabled = licenseBlocked;
    const toggleDesc = document.getElementById('toggleDesc');
    if (toggleDesc) {
      if (licenseBlocked) {
        toggleDesc.textContent = 'Enter license key to enable';
      }
    }
  }

  // Toggle description
  const toggleDesc = document.getElementById('toggleDesc');
  if (toggleDesc) {
    const licenseBlocked = !state.license.valid;
    if (licenseBlocked) {
      toggleDesc.textContent = 'Enter license key to enable';
    } else if (!state.enabled) {
      toggleDesc.textContent = 'Enter key and turn on';
    } else if (state.paused) {
      toggleDesc.textContent = 'Paused — press P to resume';
    } else if (state.override) {
      toggleDesc.textContent = 'Override mode — fast polling';
    } else {
      toggleDesc.textContent = 'Running — monitoring for shifts';
    }
  }

  // Control button active states
  const pauseBtn = document.getElementById('pauseBtn');
  const overrideBtn = document.getElementById('overrideBtn');
  const hideHudBtn = document.getElementById('hideHudBtn');
  pauseBtn?.classList.toggle('active', state.paused);
  overrideBtn?.classList.toggle('active', state.override);
  hideHudBtn?.classList.toggle('active', state.settings.hudHidden);

  // Tier badge
  const tierBadge = document.getElementById('tierBadge');
  if (tierBadge) {
    if (state.license.tier) {
      tierBadge.textContent = state.license.tier.toUpperCase();
      tierBadge.className = 'tier-badge ' + state.license.tier;
      tierBadge.classList.remove('hidden');
      tierBadge.removeAttribute('aria-hidden');
    } else {
      tierBadge.classList.add('hidden');
      tierBadge.setAttribute('aria-hidden', 'true');
    }
  }

  // License status
  const licenseStatus = document.getElementById('licenseStatus');
  if (licenseStatus) {
    if (state.license.valid) {
      licenseStatus.textContent = `Active — ${state.license.tier ?? 'basic'} tier`;
      licenseStatus.className = 'status-text active';
    } else {
      licenseStatus.textContent = 'Enter a license key to activate';
      licenseStatus.className = 'status-text';
    }
  }

  // Fingerprint
  const fpValue = document.getElementById('fingerprintValue');
  if (fpValue) {
    const fullHash = state.device.fingerprintHash || '';
    fpValue.textContent = fullHash || '—';
    fpValue.dataset.fullFp = fullHash;
  }

  // Dates list
  renderDates(state.settings.dates);

  // Blacklist list
  renderBlacklist(state.settings.blacklistDates);

  // Telegram status
  const tgStatus = document.getElementById('tgStatus');
  const tgToggle = document.getElementById('tgToggle') as HTMLInputElement | null;
  if (tgStatus) {
    if (state.telegram.optOut) {
      tgStatus.textContent = 'Notifications disabled';
      tgStatus.className = 'status-text small muted';
    } else if (state.telegram.botToken && state.telegram.chatId) {
      tgStatus.textContent = 'Configured';
      tgStatus.className = 'status-text small active';
    } else {
      tgStatus.textContent = 'Not configured';
      tgStatus.className = 'status-text small';
    }
  }
  if (tgToggle) {
    tgToggle.checked = !state.telegram.optOut;
  }
}

// ── Actions ──

async function setEnabled(value: boolean): Promise<void> {
  const masterToggle = document.getElementById('masterToggle') as HTMLInputElement | null;
  masterToggle?.classList.add('loading');
  masterToggle?.setAttribute('disabled', 'true');
  try {
    await chrome.runtime.sendMessage({
      type: MSG_TYPES.SET_ENABLED,
      payload: { value },
    });
  } catch (e) {
    console.error('Failed to set enabled:', e);
  } finally {
    masterToggle?.classList.remove('loading');
    masterToggle?.removeAttribute('disabled');
  }
}

async function verifyLicense(): Promise<void> {
  const btn = document.getElementById('verifyBtn') as HTMLButtonElement | null;
  const input = document.getElementById('licenseInput') as HTMLInputElement | null;
  const key = input?.value.trim() || '';

  const statusEl = document.getElementById('licenseStatus');
  if (!key) {
    if (statusEl) {
      statusEl.textContent = 'Please enter a license key';
      statusEl.className = 'status-text error';
    }
    return;
  }

  btn?.classList.add('loading');
  btn?.setAttribute('disabled', 'true');
  if (statusEl) {
    statusEl.textContent = 'Verifying...';
    statusEl.className = 'status-text loading';
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: MSG_TYPES.VERIFY_LICENSE,
      payload: { key },
    });

    if (response?.ok) {
      if (input) {input.value = '';}
    } else {
      if (statusEl) {
        statusEl.textContent = response?.error || 'Verification failed';
        statusEl.className = 'status-text error';
      }
    }
  } catch (e) {
    if (statusEl) {
      statusEl.textContent = 'Network error — try again';
      statusEl.className = 'status-text error';
    }
  } finally {
    btn?.classList.remove('loading');
    btn?.removeAttribute('disabled');
  }
}



async function togglePause(): Promise<void> {
  const newValue = !currentState?.paused;
  try {
    await chrome.runtime.sendMessage({
      type: MSG_TYPES.SET_PAUSED,
      payload: { value: newValue },
    });
  } catch (e) {
    console.error('Failed to toggle pause:', e);
  }
}

async function toggleOverride(): Promise<void> {
  const newValue = !currentState?.override;
  try {
    await chrome.runtime.sendMessage({
      type: MSG_TYPES.SET_OVERRIDE,
      payload: { value: newValue },
    });
  } catch (e) {
    console.error('Failed to toggle override:', e);
  }
}

async function toggleHUD(): Promise<void> {
  try {
    await chrome.runtime.sendMessage({
      type: MSG_TYPES.TOGGLE_HUD,
      payload: {},
    });
  } catch (e) {
    console.error('Failed to toggle HUD:', e);
  }
}

async function reloadAll(): Promise<void> {
  try {
    await chrome.runtime.sendMessage({ type: MSG_TYPES.RELOAD_ALL });
  } catch (e) {
    console.error('Failed to reload:', e);
  }
}

// ── Consent ──

async function acceptConsent(): Promise<void> {
  const consentLicense = (document.getElementById('consentLicense') as HTMLInputElement | null)?.checked ?? true;
  const consentTelegram = (document.getElementById('consentTelegram') as HTMLInputElement | null)?.checked ?? false;
  const consentErrors = (document.getElementById('consentErrors') as HTMLInputElement | null)?.checked ?? true;

  await chrome.storage.local.set({
    sg_v2_consent_given: true,
    sg_v2_consent_date: Date.now(),
    sg_v2_consent_license: consentLicense,
    sg_v2_consent_telegram: consentTelegram,
    sg_v2_consent_errors: consentErrors,
  });
  hideConsentModal();
}

async function declineConsent(): Promise<void> {
  await chrome.storage.local.set({
    sg_v2_consent_given: false,
  });
  window.close();
}

// ── Dates ──

async function addDate(): Promise<void> {
  const btn = document.getElementById('addDateBtn') as HTMLButtonElement | null;
  const input = document.getElementById('dateInput') as HTMLInputElement | null;
  const date = input?.value;
  if (!date) {return;}

  const currentDates = currentState?.settings.dates ?? [];
  if (currentDates.includes(date)) {
    if (input) {input.value = '';}
    return;
  }

  btn?.classList.add('loading');
  btn?.setAttribute('disabled', 'true');
  const newDates = [...currentDates, date].sort();
  try {
    await chrome.runtime.sendMessage({
      type: MSG_TYPES.SET_SETTINGS,
      payload: { dates: newDates },
    });
    if (input) {input.value = '';}
  } catch (e) {
    console.error('Failed to add date:', e);
  } finally {
    btn?.classList.remove('loading');
    btn?.removeAttribute('disabled');
  }
}

async function clearDates(): Promise<void> {
  try {
    await chrome.runtime.sendMessage({
      type: MSG_TYPES.SET_SETTINGS,
      payload: { dates: [] },
    });
  } catch (e) {
    console.error('Failed to clear dates:', e);
  }
}

function openDates(): void {
  // Open each target date in AtoZ calendar view
  const dates = currentState?.settings.dates ?? [];
  if (dates.length === 0) {return;}

  for (const date of dates) {
    const url = `https://atoz.amazon.work/time/schedule?date=${date}`;
    void chrome.tabs.create({ url, active: false });
  }
}

async function addBlacklist(): Promise<void> {
  const input = document.getElementById('blacklistInput') as HTMLInputElement | null;
  const date = input?.value;
  if (!date) {return;}

  const currentBlacklist = currentState?.settings.blacklistDates ?? [];
  if (currentBlacklist.includes(date)) {
    if (input) {input.value = '';}
    return;
  }

  const newBlacklist = [...currentBlacklist, date].sort();
  try {
    await chrome.runtime.sendMessage({
      type: MSG_TYPES.SET_SETTINGS,
      payload: { blacklistDates: newBlacklist },
    });
    if (input) {input.value = '';}
  } catch (e) {
    console.error('Failed to add blacklist:', e);
  }
}

async function clearBlacklist(): Promise<void> {
  try {
    await chrome.runtime.sendMessage({
      type: MSG_TYPES.SET_SETTINGS,
      payload: { blacklistDates: [] },
    });
  } catch (e) {
    console.error('Failed to clear blacklist:', e);
  }
}

function renderDates(dates: readonly string[]): void {
  const datesList = document.getElementById('datesList');
  if (!datesList) {return;}
  if (dates.length > 0) {
    datesList.innerHTML = dates
      .map((d) => `<button class="tag-remove-btn" aria-label="Remove ${escapeHtml(d)}" data-value="${escapeHtml(d)}">${escapeHtml(d)} <span class="tag-x" aria-hidden="true">×</span></button>`)
      .join('');
    datesList.classList.remove('empty');
    datesList.querySelectorAll<HTMLButtonElement>('.tag-remove-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const value = btn.getAttribute('data-value');
        if (value) {void removeDate(value);}
      });
    });
  } else {
    datesList.textContent = 'No dates selected';
    datesList.classList.add('empty');
  }
}

function renderBlacklist(dates: readonly string[]): void {
  const blacklistList = document.getElementById('blacklistList');
  if (!blacklistList) {return;}
  if (dates.length > 0) {
    blacklistList.innerHTML = dates
      .map((d) => `<button class="tag-remove-btn" aria-label="Remove ${escapeHtml(d)}" data-value="${escapeHtml(d)}">${escapeHtml(d)} <span class="tag-x" aria-hidden="true">×</span></button>`)
      .join('');
    blacklistList.classList.remove('empty');
    blacklistList.querySelectorAll<HTMLButtonElement>('.tag-remove-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const value = btn.getAttribute('data-value');
        if (value) {void removeBlacklist(value);}
      });
    });
  } else {
    blacklistList.textContent = 'No blacklist';
    blacklistList.classList.add('empty');
  }
}

async function removeDate(date: string): Promise<void> {
  const currentDates = currentState?.settings.dates ?? [];
  const newDates = currentDates.filter((d) => d !== date);
  try {
    await chrome.runtime.sendMessage({
      type: MSG_TYPES.SET_SETTINGS,
      payload: { dates: newDates },
    });
  } catch (e) {
    console.error('Failed to remove date:', e);
  }
}

async function removeBlacklist(date: string): Promise<void> {
  const currentBlacklist = currentState?.settings.blacklistDates ?? [];
  const newBlacklist = currentBlacklist.filter((d) => d !== date);
  try {
    await chrome.runtime.sendMessage({
      type: MSG_TYPES.SET_SETTINGS,
      payload: { blacklistDates: newBlacklist },
    });
  } catch (e) {
    console.error('Failed to remove blacklist date:', e);
  }
}

// ── Telegram ──

async function saveTelegram(): Promise<void> {
  const btn = document.getElementById('tgSaveBtn') as HTMLButtonElement | null;
  const tokenInput = document.getElementById('tgBotToken') as HTMLInputElement | null;
  const chatInput = document.getElementById('tgChatId') as HTMLInputElement | null;

  const botToken = tokenInput?.value.trim() || undefined;
  const chatId = chatInput?.value.trim() || undefined;

  if (!botToken || !chatId) {
    const statusEl = document.getElementById('tgStatus');
    if (statusEl) {
      statusEl.textContent = 'Enter both bot token and chat ID';
      statusEl.className = 'status-text small error';
    }
    return;
  }

  btn?.classList.add('loading');
  btn?.setAttribute('disabled', 'true');
  try {
    await chrome.runtime.sendMessage({
      type: MSG_TYPES.SET_TELEGRAM,
      payload: { botToken, chatId },
    });

    const statusEl = document.getElementById('tgStatus');
    if (statusEl) {
      statusEl.textContent = 'Saved';
      statusEl.className = 'status-text small active';
    }
    if (tokenInput) {tokenInput.value = '';}
    if (chatInput) {chatInput.value = '';}
  } catch (e) {
    console.error('Failed to save Telegram config:', e);
    const statusEl = document.getElementById('tgStatus');
    if (statusEl) {
      statusEl.textContent = 'Save failed';
      statusEl.className = 'status-text small error';
    }
  } finally {
    btn?.classList.remove('loading');
    btn?.removeAttribute('disabled');
  }
}

async function toggleTelegram(): Promise<void> {
  const tgToggle = document.getElementById('tgToggle') as HTMLInputElement | null;
  const optOut = !tgToggle?.checked;

  try {
    await chrome.runtime.sendMessage({
      type: MSG_TYPES.SET_TELEGRAM,
      payload: { optOut },
    });
  } catch (e) {
    console.error('Failed to toggle Telegram:', e);
  }
}

// ── Data ──

async function exportData(): Promise<void> {
  try {
    const response = await chrome.runtime.sendMessage({ type: MSG_TYPES.EXPORT_DATA });
    if (response?.ok && response.data) {
      const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sf30-export-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  } catch (e) {
    console.error('Export failed:', e);
  }
}

function deleteData(): void {
  const deleteBtn = document.getElementById('deleteBtn');
  if (!deleteBtn) {return;}

  // Prevent duplicate choice panels
  if (document.getElementById('deleteChoiceWrapper')) {return;}

  const wrapper = document.createElement('div');
  wrapper.id = 'deleteChoiceWrapper';
  wrapper.innerHTML = `
    <div style="margin-top:8px;padding:10px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-card);">
      <p style="margin:0 0 10px;font-size:12px;color:var(--accent-error);font-weight:500;">Choose deletion mode:</p>
      <button id="deleteSettingsBtn" class="btn primary full" style="margin-bottom:8px;">Delete Settings Only</button>
      <button id="eraseEverythingBtn" class="btn danger full" style="margin-bottom:8px;">Erase Everything</button>
      <button id="cancelDeleteBtn" class="btn ghost full">Cancel</button>
    </div>
  `;

  deleteBtn.style.display = 'none';
  deleteBtn.insertAdjacentElement('afterend', wrapper);

  const cleanup = (): void => {
    wrapper.remove();
    deleteBtn.style.display = '';
  };

  document.getElementById('deleteSettingsBtn')?.addEventListener('click', () => {
    cleanup();
    void chrome.runtime
      .sendMessage({ type: MSG_TYPES.DELETE_DATA, payload: { mode: 'settings' } })
      .then(() => window.close())
      .catch((e) => console.error('Delete failed:', e));
  });

  document.getElementById('eraseEverythingBtn')?.addEventListener('click', () => {
    if (!confirm('WARNING: This will completely reset the extension to factory defaults. Continue?')) {
      return;
    }
    cleanup();
    void chrome.runtime
      .sendMessage({ type: MSG_TYPES.DELETE_DATA, payload: { mode: 'everything' } })
      .then(() => window.close())
      .catch((e) => console.error('Delete failed:', e));
  });

  document.getElementById('cancelDeleteBtn')?.addEventListener('click', cleanup);
}

// ─- Fingerprint ──

async function copyFingerprint(): Promise<void> {
  const fpEl = document.getElementById('fingerprintValue');
  const fp = fpEl?.dataset.fullFp || fpEl?.textContent || '';
  if (!fp || fp === '—') {return;}

  try {
    await navigator.clipboard.writeText(fp);
    const btn = document.getElementById('copyFpBtn');
    if (btn) {
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
    }
  } catch (_e) {
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = fp;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
}

// ── Tabs ──

function showTab(index: number): void {
  const tabs = ['tabShifts', 'tabControls', 'tabSettings'];
  const panels = ['panelShifts', 'panelControls', 'panelSettings'];

  tabs.forEach((id, i) => {
    const tab = document.getElementById(id);
    if (tab) {
      tab.classList.toggle('active', i === index);
      tab.setAttribute('aria-selected', String(i === index));
      tab.setAttribute('tabindex', i === index ? '0' : '-1');
    }
  });

  panels.forEach((id, i) => {
    const panel = document.getElementById(id);
    if (panel) {
      panel.classList.toggle('active', i === index);
      panel.hidden = i !== index;
    }
  });

  const activePanel = document.getElementById(panels[index]);
  activePanel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
