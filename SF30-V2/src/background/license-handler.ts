/**
 * License Handlers — SF30 V2.0 Background Context
 *
 * License-related handlers extracted from the main background script.
 */

import { getStore } from '@core/store';
import { getInstallSecret } from '@shared/security';
import { getDeviceFingerprint } from '@shared/fingerprint';
import { activateLicense } from '@shared/license-api';
import { broadcastState } from './index';

const store = getStore();

export async function handleVerifyLicense(payload: { key: string }): Promise<Record<string, unknown>> {
  const consent = await chrome.storage.local.get(['sg_v2_consent_given', 'sg_v2_consent_license']);
  if (consent.sg_v2_consent_given !== true) {
    return { ok: false, error: 'Please accept the privacy notice first' };
  }
  if (consent.sg_v2_consent_license !== true) {
    return { ok: false, error: 'License server consent not granted' };
  }
  const state = store.getState();
  const installSecret = await getInstallSecret();

  if (!installSecret) {
    return { ok: false, error: 'install-secret-missing' };
  }

  if (!payload?.key) {
    return { ok: false, error: 'Please enter a license key' };
  }

  // Validate/activate provided key
  const fingerprint = state.device.fingerprint;
  const fingerprintHash = state.device.fingerprintHash;

  if (!fingerprint || !fingerprintHash) {
    // Generate fingerprint if missing
    const fp = await getDeviceFingerprint();
    store.dispatch({
      type: 'SET_DEVICE',
      payload: { fingerprint: fp.fingerprint, fingerprintHash: fp.fingerprintHash },
    });
  }

  const activationResult = await activateLicense({
    key: payload.key,
    fingerprint: state.device.fingerprint || '',
    fingerprintHash: state.device.fingerprintHash || '',
  });

  if (!activationResult.ok) {
    return { ok: false, error: activationResult.error || 'activation-failed' };
  }

  const activationData = activationResult.data;
  store.dispatch({
    type: 'SET_LICENSE',
    payload: {
      key: payload.key,
      valid: true,
      tier: activationData.tier || 'basic',
      exp: activationData.exp || 0,
      lastVerified: Math.floor(Date.now() / 1000),
    },
  });
  await store.persist();
  broadcastState();

  return {
    ok: true,
    tier: activationData.tier || 'basic',
  };
}
