/**
 * Service Worker — SF30 V2.0 Background Context
 *
 * Responsibilities:
 * 1. License validation and refresh (with server fallback)
 * 2. Alarm scheduling for polling bursts and token checks
 * 3. Cross-context message routing with sender validation
 * 4. Telegram queue flushing
 * 5. Content script injection management
 * 6. State synchronization across all contexts
 * 7. Install secret generation (per-install, not per-build)
 * 8. Runtime integrity verification
 */

import { getStore, type AppState } from '@core/store';
import {
  ALARMS,
  MSG_TYPES,
  REASONS,
  TIMING,
  STORAGE_KEYS,
} from '@shared/constants';
import {
  validateMessageSender,
  validateMessageStructure,
  generateInstallSecret,
  getInstallSecret,
  verifyServiceWorkerIntegrity,
} from '@shared/security';
import { getDeviceFingerprint } from '@shared/fingerprint';
import { queueTelegramMessage, setTelegramConfig } from '@shared/telegram';
import { handleVerifyLicense } from './license-handler';
import {
  setupAlarms,
  handleTokenCheck,
  handleHeartbeat,
  handleTelegramFlush,
  handleRevocationSync,
  handleBurstStart,
  handleCleanup,
} from './alarms';

// ── Integrity Hash (injected at build time) ──
declare const __SW_INTEGRITY_HASH__: string | undefined;

// ── Initialization ──

const store = getStore();

// Track tabs that already have content scripts injected to prevent duplicates
const injectedTabs = new Set<number>();

// ── Integrity Check ──

async function performIntegrityCheck(): Promise<void> {
  const expectedHash = typeof __SW_INTEGRITY_HASH__ !== 'undefined'
    ? __SW_INTEGRITY_HASH__
    : null;

  if (!expectedHash) {
    // Debug build — skip integrity check
    return;
  }

  const isValid = await verifyServiceWorkerIntegrity(expectedHash);
  if (!isValid) {
    console.error('[SF30 V2] INTEGRITY CHECK FAILED — Service worker may have been tampered with');
    // Kill switch: disable extension
    store.dispatch({ type: 'SET_ENABLED', payload: false });
    store.dispatch({
      type: 'SET_LICENSE',
      payload: { valid: false, revoked: false },
    });
    await store.persist();

    void chrome.runtime.sendMessage({
      type: MSG_TYPES.KILL_SWITCH,
      payload: { reason: REASONS.TAMPER_DETECTED },
    }).catch((e) => {
      console.error('[SF30 V2] Error in performIntegrityCheck:', e);
    });
  }
}

// ── Message Handling ──

interface MessagePayload {
  readonly type: string;
  readonly payload?: unknown;
}

export async function handleMessage(
  message: MessagePayload,
  _sender: chrome.runtime.MessageSender
): Promise<Record<string, unknown>> {
  const { type, payload } = message;

  switch (type) {
    case MSG_TYPES.VERIFY_LICENSE:
      return handleVerifyLicense(payload as { key: string });

    case MSG_TYPES.SET_ENABLED: {
      const p = payload as { value: boolean };
      store.dispatch({ type: 'SET_ENABLED', payload: p.value });
      await store.persist();
      if (p.value) {
        await injectContentScripts();
        // Schedule burst alarm when enabled
        await chrome.alarms.create(ALARMS.BURST_START, {
          delayInMinutes: 0.5,
          periodInMinutes: 5,
        });
      } else {
        await chrome.alarms.clear(ALARMS.BURST_START);
        await chrome.alarms.clear(ALARMS.BURST_STEP);
        await chrome.alarms.clear(ALARMS.OVERRIDE_TICK);
      }
      broadcastState();
      return { ok: true };
    }

    case MSG_TYPES.SET_PAUSED: {
      const p = payload as { value: boolean };
      store.dispatch({ type: 'SET_PAUSED', payload: p.value });
      await store.persist();
      broadcastState();
      return { ok: true };
    }

    case MSG_TYPES.SET_OVERRIDE: {
      const p = payload as { value: boolean };
      store.dispatch({ type: 'SET_OVERRIDE', payload: p.value });
      await store.persist();
      // Immediately propagate speed change to content scripts
      await broadcastToTabs({
        type: MSG_TYPES.SET_SPEED,
        payload: {
          interval: p.value ? TIMING.TURBO_POLL_INTERVAL_MS : TIMING.POLL_INTERVAL_MS,
          turbo: p.value,
        },
      });
      broadcastState();
      return { ok: true };
    }

    case MSG_TYPES.TOGGLE_HUD:
      await broadcastToTabs({ type: MSG_TYPES.TOGGLE_HUD });
      return { ok: true };

    case MSG_TYPES.RELOAD_ALL:
      await reloadAllAtoZTabs();
      return { ok: true };

    case MSG_TYPES.EXPORT_DATA:
      return handleExportData();

    case MSG_TYPES.DELETE_DATA:
      return handleDeleteData(payload as { mode?: 'settings' | 'everything' });

    case MSG_TYPES.GET_STATE:
      return { ok: true, payload: store.getState() };

    case MSG_TYPES.CLAIM_RESULT:
      return handleClaimResult(payload as {
        oppId: string;
        success: boolean;
        shift?: { start: string; end: string; duration: number; site: string };
        error?: string;
      });

    case MSG_TYPES.EID_FOUND:
      return handleEidFound(payload as { eid: string });

    case MSG_TYPES.RATE_LIMITED:
      return handleRateLimited(payload as { limited: boolean; retryAfter?: number });

    case MSG_TYPES.SET_SETTINGS: {
      const p = payload as { turbo?: boolean; hudHidden?: boolean; dates?: string[]; blacklistDates?: string[] };
      store.dispatch({ type: 'SET_SETTINGS', payload: p });
      await store.persist();
      // Propagate runtime-relevant settings to content scripts
      if (p.blacklistDates !== undefined) {
        await broadcastToTabs({
          type: MSG_TYPES.SET_BLACKLIST,
          payload: { blacklistDates: p.blacklistDates },
        });
      }
      if (p.turbo !== undefined) {
        await broadcastToTabs({
          type: MSG_TYPES.SET_SPEED,
          payload: { turbo: p.turbo, interval: p.turbo ? TIMING.TURBO_POLL_INTERVAL_MS : TIMING.POLL_INTERVAL_MS },
        });
      }
      broadcastState();
      return { ok: true };
    }

    case MSG_TYPES.SET_TELEGRAM: {
      const p = payload as { botToken?: string; chatId?: string; optOut?: boolean };
      const secret = await getInstallSecret();
      if (secret) {
        await setTelegramConfig(p, secret);
      }
      store.dispatch({ type: 'SET_TELEGRAM', payload: p });
      await store.persist();
      broadcastState();
      return { ok: true };
    }

    default:
      return { ok: false, error: 'unknown-message-type' };
  }
}

// ── Content Script Event Handlers ──

async function handleClaimResult(payload: {
  oppId: string;
  success: boolean;
  shift?: { start: string; end: string; duration: number; site: string };
  error?: string;
}): Promise<Record<string, unknown>> {
  const state = store.getState();

  if (payload.success && payload.shift) {
    // Queue Telegram notification
    const secret = await getInstallSecret();
    if (secret) {
      const date = new Date(payload.shift.start).toLocaleDateString();
      const time = `${new Date(payload.shift.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${new Date(payload.shift.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      await queueTelegramMessage({
        userKey: state.license.key || state.device.fingerprintHash || 'unknown',
        date,
        time,
        status: 'claimed',
      }, secret);
    }
  } else if (payload.error) {
    // Log error
    await logError('claim-failed', payload.error, payload.oppId);
  }

  return { ok: true };
}

async function handleEidFound(payload: { eid: string }): Promise<Record<string, unknown>> {
  // EID is used for device fingerprint enhancement
  const state = store.getState();
  if (!state.device.fingerprint) {
    const { fingerprint, fingerprintHash } = await getDeviceFingerprint();
    store.dispatch({ type: 'SET_DEVICE', payload: { fingerprint, fingerprintHash } });
    await store.persist();
    broadcastState();
  }
  return { ok: true, eid: payload.eid };
}

async function handleRateLimited(payload: { limited: boolean; retryAfter?: number }): Promise<Record<string, unknown>> {
  store.dispatch({
    type: 'SET_RUNTIME',
    payload: {
      rateLimited: payload.limited,
      nextDue: payload.limited
        ? Date.now() + (payload.retryAfter || TIMING.RATE_LIMIT_DURATION_MS)
        : null,
    },
  });
  await store.persist();
  broadcastState();
  return { ok: true };
}

async function logError(category: string, message: string, detail?: string): Promise<void> {
  try {
    const consent = await chrome.storage.local.get('sg_v2_consent_errors');
    if (consent.sg_v2_consent_errors !== true) {
      return;
    }
    const result = await chrome.storage.local.get(STORAGE_KEYS.ERROR_LOG);
    const logs = (result[STORAGE_KEYS.ERROR_LOG] as Array<{
      timestamp: number;
      category: string;
      message: string;
      detail?: string;
    }>) || [];

    logs.push({
      timestamp: Date.now(),
      category,
      message,
      detail,
    });

    // Keep last 100 errors
    if (logs.length > 100) {
      logs.splice(0, logs.length - 100);
    }

    await chrome.storage.local.set({ [STORAGE_KEYS.ERROR_LOG]: logs });
  } catch (e) {
    console.error('[SF30 V2] Error in logError:', e);
  }
}

// ── Data Handlers ──

export async function handleExportData(): Promise<Record<string, unknown>> {
  const allData = await chrome.storage.local.get(null);

  // Redact sensitive fields for GDPR-compliant export
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(allData)) {
    if (key.includes('_enc') || key === 'sg_v2_user_key' || key === 'sg_v2_install_secret') {
      redacted[key] = '[REDACTED]';
    } else {
      redacted[key] = value;
    }
  }

  return {
    ok: true,
    data: redacted,
    exportedAt: new Date().toISOString(),
  };
}

export async function handleDeleteData(
  payload?: { mode?: 'settings' | 'everything' }
): Promise<Record<string, unknown>> {
  const mode = payload?.mode ?? 'settings';

  if (mode === 'everything') {
    // GDPR-compliant complete erasure — wipes ALL data including install secret and consent
    await chrome.storage.local.clear();
    store.dispatch({ type: 'RESET_STATE' });

    // Regenerate a fresh install secret so the extension can still function
    await generateInstallSecret();

    // Regenerate fingerprint since cache was cleared
    const { fingerprint, fingerprintHash } = await getDeviceFingerprint();
    store.dispatch({ type: 'SET_DEVICE', payload: { fingerprint, fingerprintHash } });
    await store.persist();
    broadcastState();

    return { ok: true };
  }

  // 'settings' mode: functional reset — preserve install secret and consent records
  const installSecret = await getInstallSecret();

  // Preserve consent so user doesn't have to re-accept
  const consentResult = await chrome.storage.local.get([
    STORAGE_KEYS.CONSENT_GIVEN,
    STORAGE_KEYS.CONSENT_DATE,
  ]);
  const consentGiven = consentResult[STORAGE_KEYS.CONSENT_GIVEN];
  const consentDate = consentResult[STORAGE_KEYS.CONSENT_DATE];

  await chrome.storage.local.clear();
  store.dispatch({ type: 'RESET_STATE' });

  // Restore preserved values
  const restore: Record<string, unknown> = {};
  if (installSecret) {
    restore[STORAGE_KEYS.INSTALL_SECRET] = installSecret;
  }
  if (consentGiven === true) {
    restore[STORAGE_KEYS.CONSENT_GIVEN] = true;
    restore[STORAGE_KEYS.CONSENT_DATE] = consentDate;
  }
  if (Object.keys(restore).length > 0) {
    await chrome.storage.local.set(restore);
  }

  // Regenerate fingerprint since cache was cleared
  const { fingerprint, fingerprintHash } = await getDeviceFingerprint();
  store.dispatch({ type: 'SET_DEVICE', payload: { fingerprint, fingerprintHash } });
  await store.persist();
  broadcastState();

  return { ok: true };
}

// ── State Broadcasting ──

export function broadcastState(): void {
  const state = store.getState();
  void chrome.runtime
    .sendMessage({
      type: MSG_TYPES.STATE_CHANGED,
      payload: state,
    })
    .catch((e) => {
      console.error('[SF30 V2] Error in broadcastState:', e);
    });
}

/**
 * Broadcasts a message to all content scripts in AtoZ tabs.
 * Used for HUD toggle, speed changes, and blacklist updates.
 */
export async function broadcastToTabs(message: Record<string, unknown>): Promise<void> {
  const tabs = await chrome.tabs.query({
    url: ['https://atoz.amazon.work/*', 'https://atoz-apps.amazon.work/*'],
  });

  for (const tab of tabs) {
    if (!tab.id) {continue;}
    try {
      await chrome.tabs.sendMessage(tab.id, message);
    } catch (e) {
      console.error('[SF30 V2] Error in broadcastToTabs:', e);
    }
  }
}

// ── Content Script Injection ──

async function injectContentScripts(): Promise<void> {
  const tabs = await chrome.tabs.query({
    url: ['https://atoz.amazon.work/*', 'https://atoz-apps.amazon.work/*'],
  });

  for (const tab of tabs) {
    if (!tab.id) {continue;}

    // Tab dedup guard — skip if already injected this session
    if (injectedTabs.has(tab.id)) {continue;}

    try {
      // Inject isolated world script
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['src/content/isolated/index.js'],
      });

      // Inject main world script (for cookie access)
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['src/content/main/index.js'],
        world: 'MAIN',
      });

      injectedTabs.add(tab.id);
    } catch (e) {
      console.warn('[SF30 V2] Failed to inject into tab', tab.id, e);
    }
  }
}

// ── Tab Reload (no tabs permission needed) ──

async function reloadAllAtoZTabs(): Promise<void> {
  const tabs = await chrome.tabs.query({
    url: ['https://atoz.amazon.work/*', 'https://atoz-apps.amazon.work/*'],
  });

  for (const tab of tabs) {
    if (!tab.id) {continue;}
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (): void => {
          location.reload();
        },
      });
    } catch (e) {
      console.warn('[SF30 V2] Failed to reload tab', tab.id, e);
    }
  }
}

export function initializeBackground(): void {
  chrome.runtime.onInstalled.addListener((details) => {
    void handleInstalled(details);
  });

  async function handleInstalled(details: chrome.runtime.InstalledDetails): Promise<void> {
    if ((details.reason as string) === 'install') {
      // 1. Generate per-install secret (replaces vulnerable per-build MSG_SECRET)
      await generateInstallSecret();

      // 2. Generate device fingerprint
      const { fingerprint, fingerprintHash } = await getDeviceFingerprint();
      store.dispatch({ type: 'SET_DEVICE', payload: { fingerprint, fingerprintHash } });

      // 3. Initialize default state
      await store.load();
      await store.persist();

      // 3. Set up alarms
      await setupAlarms();

      // 4. Inject content scripts into existing AtoZ tabs
      await injectContentScripts();

      console.log('[SF30 V2] Installed. Install secret generated.');
    } else if ((details.reason as string) === 'update') {
      // Ensure install secret exists (migration from V1)
      let installSecret = await getInstallSecret();
      if (!installSecret) {
        installSecret = await generateInstallSecret();
      }

      // Ensure device fingerprint exists
      const state = store.getState();
      if (!state.device.fingerprint) {
        const { fingerprint, fingerprintHash } = await getDeviceFingerprint();
        store.dispatch({ type: 'SET_DEVICE', payload: { fingerprint, fingerprintHash } });
      }

      await store.load();
      await store.persist();
      await setupAlarms();
      await injectContentScripts();
      console.log('[SF30 V2] Updated from', details.previousVersion);
    }
  }

  chrome.runtime.onStartup.addListener(() => {
    void handleStartup();
  });

  async function handleStartup(): Promise<void> {
    await store.load();

    // Verify service worker integrity on startup
    await performIntegrityCheck();

    await setupAlarms();

    // Inject content scripts into existing AtoZ tabs
    await injectContentScripts();

    // Restore burst/override alarms based on current state
    const state = store.getState();
    if (state.enabled) {
      await chrome.alarms.create(ALARMS.BURST_START, {
        delayInMinutes: 0.5,
        periodInMinutes: 5,
      });
    }

    console.log('[SF30 V2] Browser started');
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Validate sender identity
    if (!validateMessageSender(sender)) {
      console.warn('[SF30 V2] Rejected message from untrusted sender:', sender.id || sender.url);
      sendResponse({ ok: false, error: 'untrusted-sender' });
      return false;
    }

    // Validate message structure
    const structCheck = validateMessageStructure(message);
    if (!structCheck.valid) {
      sendResponse({ ok: false, error: structCheck.error });
      return false;
    }

    // Handle asynchronously
    handleMessage(message, sender)
      .then(sendResponse)
      .catch((err: Error) => {
        console.error('[SF30 V2] Message handler error:', err);
        sendResponse({ ok: false, error: 'internal-error' });
      });

    return true; // Indicates async response
  });

  // Sync state changes from storage (triggered by other contexts)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.sg_v2_state) {
      const newValue = changes.sg_v2_state.newValue as Partial<AppState> | undefined;
      if (newValue) {
        store.syncFromStorage(newValue);
      }
    }
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    void handleAlarm(alarm);
  });

  async function handleAlarm(alarm: chrome.alarms.Alarm): Promise<void> {
    switch (alarm.name) {
      case ALARMS.TOKEN_CHECK:
        await handleTokenCheck();
        break;
      case ALARMS.HEARTBEAT:
        await handleHeartbeat();
        break;
      case ALARMS.CLEANUP:
        await handleCleanup();
        break;
      case ALARMS.TELEGRAM_FLUSH:
        await handleTelegramFlush();
        break;
      case ALARMS.REVOCATION_SYNC:
        await handleRevocationSync();
        break;
      case ALARMS.BURST_START:
        await handleBurstStart();
        break;
    }
  }

  // Clear injected tab tracking when tabs are closed
  chrome.tabs.onRemoved.addListener((tabId) => {
    injectedTabs.delete(tabId);
  });

  chrome.runtime.onSuspend?.addListener(() => {
    void handleSuspend();
  });

  async function handleSuspend(): Promise<void> {
    // Force immediate state persistence before SW terminates
    await store.persist();

    // Flush any pending Telegram messages
    try {
      await handleTelegramFlush();
    } catch (e) {
      console.error('[SF30 V2] Error in onSuspend handler:', e);
    }

    console.log('[SF30 V2] Service worker suspending');
  }

  chrome.runtime.onUpdateAvailable?.addListener(() => {
    // Apply update immediately when available
    console.log('[SF30 V2] Update available — applying on next wake');
  });

  console.log('[SF30 V2] Service worker initialized');
}

// Re-export moved handlers so existing imports don't break
export { handleVerifyLicense } from './license-handler';
export {
  setupAlarms,
  handleTokenCheck,
  handleHeartbeat,
  handleTelegramFlush,
  handleRevocationSync,
  handleBurstStart,
  handleCleanup,
} from './alarms';

if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
  initializeBackground();
}
