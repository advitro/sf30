/**
 * Alarm Handlers — SF30 V2.0 Background Context
 *
 * All alarm-related handlers extracted from the main background script.
 */

import { getStore } from '@core/store';
import {
  ALARMS,
  MSG_TYPES,
  REASONS,
  TIMING,
  STORAGE_KEYS,
  checkConsent,
} from '@shared/constants';
import { getInstallSecret } from '@shared/security';
import { getDeviceFingerprint } from '@shared/fingerprint';
import { flushTelegramQueue } from '@shared/telegram';
import { validateLicense } from '@shared/license-api';
import { broadcastState, broadcastToTabs } from './index';

const store = getStore();

export async function setupAlarms(): Promise<void> {
  await chrome.alarms.clearAll();

  // Token check every 2 minutes
  await chrome.alarms.create(ALARMS.TOKEN_CHECK, {
    delayInMinutes: 1,
    periodInMinutes: 2,
  });

  // Heartbeat every 10 minutes
  await chrome.alarms.create(ALARMS.HEARTBEAT, {
    delayInMinutes: 2,
    periodInMinutes: 10,
  });

  // Cleanup every hour
  await chrome.alarms.create(ALARMS.CLEANUP, {
    delayInMinutes: 5,
    periodInMinutes: 60,
  });

  // Telegram queue flush every minute
  await chrome.alarms.create(ALARMS.TELEGRAM_FLUSH, {
    delayInMinutes: 0.5,
    periodInMinutes: 1,
  });

  // Revocation sync every 6 hours
  await chrome.alarms.create(ALARMS.REVOCATION_SYNC, {
    delayInMinutes: 10,
    periodInMinutes: 360,
  });
}

export async function handleTokenCheck(): Promise<void> {
  if (!(await checkConsent('license'))) {
    console.warn('[SF30 V2] Token check skipped — license server consent not granted');
    return;
  }
  const state = store.getState();
  const nowSec = Math.floor(Date.now() / 1000);

  // Check if license is expired
  if (!state.license.exp || state.license.exp < nowSec) {
    store.dispatch({ type: 'SET_ENABLED', payload: false });
    store.dispatch({
      type: 'SET_LICENSE',
      payload: { valid: false, revoked: false },
    });
    await store.persist();
    broadcastState();

    // Notify all contexts
    void chrome.runtime
      .sendMessage({
        type: MSG_TYPES.KILL_SWITCH,
        payload: { reason: REASONS.OFFLINE_EXPIRED },
      })
      .catch((e) => {
        console.error('[SF30 V2] Error in handleTokenCheck:', e);
      });

    console.warn('[SF30 V2] License expired — extension disabled');
  }
}

export async function handleHeartbeat(): Promise<void> {
  if (!(await checkConsent('license'))) {
    console.warn('[SF30 V2] Heartbeat skipped — license server consent not granted');
    return;
  }
  const state = store.getState();

  // Periodically regenerate fingerprint if missing
  if (!state.device.fingerprint) {
    const { fingerprint, fingerprintHash } = await getDeviceFingerprint();
    store.dispatch({ type: 'SET_DEVICE', payload: { fingerprint, fingerprintHash } });
    await store.persist();
    broadcastState();
  }

  // Validate license if we have a key and it's been >1 hour since last check
  const nowSec = Math.floor(Date.now() / 1000);
  if (
    state.license.key &&
    state.license.key !== 'TRIAL' &&
    state.license.valid &&
    nowSec - state.license.lastVerified > 3600
  ) {
    if (state.device.fingerprintHash) {
      const validation = await validateLicense({
        key: state.license.key,
        fingerprintHash: state.device.fingerprintHash,
      });

      if (!validation.ok) {
        console.warn('[SF30 V2] License validation failed:', validation.error);
      } else {
        const validationData = validation.data;
        if (validationData.revoked) {
          store.dispatch({ type: 'SET_ENABLED', payload: false });
          store.dispatch({
            type: 'SET_LICENSE',
            payload: { valid: false, revoked: true },
          });
          await store.persist();
          broadcastState();

          void chrome.runtime
            .sendMessage({
              type: MSG_TYPES.KILL_SWITCH,
              payload: { reason: REASONS.REVOKED },
            })
            .catch((e) => {
              console.error('[SF30 V2] Error in handleHeartbeat:', e);
            });
        } else {
          store.dispatch({
            type: 'SET_LICENSE',
            payload: {
              valid: true,
              tier: validationData.tier || state.license.tier,
              exp: validationData.exp || state.license.exp,
              lastVerified: nowSec,
              revoked: false,
            },
          });
          await store.persist();
          broadcastState();
        }
      }
    }
  }
}

export async function handleTelegramFlush(): Promise<void> {
  if (!(await checkConsent('telegram'))) {
    console.warn('[SF30 V2] Telegram flush skipped — telegram consent not granted');
    return;
  }
  const secret = await getInstallSecret();
  if (!secret) {return;}

  try {
    const result = await flushTelegramQueue(secret);
    if (result.sent > 0 || result.failed > 0) {
      console.log(`[SF30 V2] Telegram flush: ${result.sent} sent, ${result.failed} failed`);
    }
  } catch (e) {
    console.error('[SF30 V2] Error in handleTelegramFlush:', e);
  }
}

export async function handleRevocationSync(): Promise<void> {
  // Revocation sync is no longer supported (serverless model).
  // Revocation is handled by keypair rotation in new extension builds.
  return;
}

export async function handleBurstStart(): Promise<void> {
  const consent = await chrome.storage.local.get('sg_v2_consent_given');
  if (consent.sg_v2_consent_given !== true) {
    return;
  }
  const state = store.getState();
  if (!state.enabled || state.paused) {return;}

  // Enter burst mode: content scripts poll at turbo speed for 10 seconds
  store.dispatch({ type: 'SET_RUNTIME', payload: { burstRemaining: 10 } });
  await store.persist();
  broadcastState();

  await broadcastToTabs({
    type: MSG_TYPES.SET_SPEED,
    payload: { interval: TIMING.TURBO_POLL_INTERVAL_MS, turbo: true },
  });

  // Restore normal speed after 10 seconds
  setTimeout(() => {
    void (async (): Promise<void> => {
      store.dispatch({ type: 'SET_RUNTIME', payload: { burstRemaining: 0 } });
      await store.persist();
      broadcastState();
      await broadcastToTabs({
        type: MSG_TYPES.SET_SPEED,
        payload: {
          interval: state.settings.turbo ? TIMING.TURBO_POLL_INTERVAL_MS : TIMING.POLL_INTERVAL_MS,
          turbo: state.settings.turbo,
        },
      });
    })();
  }, 10000);
}

export async function handleCleanup(): Promise<void> {
  // Clean up old error logs (older than 7 days)
  const result = await chrome.storage.local.get(STORAGE_KEYS.ERROR_LOG);
  const logs = (result[STORAGE_KEYS.ERROR_LOG] as Array<{ timestamp: number }>) || [];
  const cutoff = Date.now() - TIMING.ERROR_LOG_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  const filtered = logs.filter((log) => log.timestamp > cutoff);

  if (filtered.length < logs.length) {
    await chrome.storage.local.set({ [STORAGE_KEYS.ERROR_LOG]: filtered });
    console.log(`[SF30 V2] Cleaned up ${logs.length - filtered.length} old error logs`);
  }
}
