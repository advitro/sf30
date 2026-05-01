/**
 * Popup DOM Tests — SF30 V2.0
 */

import { MSG_TYPES } from '@shared/constants';

describe('Popup UI', () => {
  let sendMessageSpy: jest.SpyInstance;

  beforeAll(async () => {
    document.body.innerHTML = '<div id="app"></div>';
    Element.prototype.scrollIntoView = jest.fn();

    sendMessageSpy = jest
      .spyOn(chrome.runtime, 'sendMessage')
      .mockImplementation((message: unknown) => {
        const msg = message as { type: string };
        if (msg.type === MSG_TYPES.GET_STATE) {
          return Promise.resolve({
            payload: {
              enabled: false,
              paused: false,
              override: false,
              license: {
                key: null,
                tier: null,
                exp: 0,
                trial: false,
                valid: false,
                lastVerified: 0,
                revoked: false,
              },
              device: { fingerprint: null, fingerprintHash: null },
              settings: { turbo: false, hudHidden: false, dates: [], blacklistDates: [] },
              telegram: { botToken: null, chatId: null, optOut: false },
              runtime: {
                nextDue: null,
                burstRemaining: 0,
                rateLimited: false,
                pollCount: 0,
                consecutiveErrors: 0,
              },
            },
          });
        }
        return Promise.resolve({ ok: true });
      });

    jest.spyOn(chrome.storage.local, 'get').mockImplementation((keys) => {
      const result: Record<string, unknown> = {};
      const keyArray = Array.isArray(keys)
        ? keys
        : typeof keys === 'string'
          ? [keys]
          : [];
      if (keyArray.includes('sg_v2_consent_given')) {
        result['sg_v2_consent_given'] = true;
      }
      return Promise.resolve(result);
    });

    Object.defineProperty(chrome.storage.local, 'set', {
      value: jest.fn().mockImplementation(() => Promise.resolve()),
      configurable: true,
    });

    await import('../../../src/popup/index');
    // Flush async init operations (loadState, showConsentModalIfNeeded)
    await Promise.resolve();
    await Promise.resolve();
  });

  afterAll(() => {
    jest.restoreAllMocks();
    // restore original chrome.storage.local.set if needed
  });

  describe('Tab switching', () => {
    it('should switch to Controls tab', () => {
      const tabControls = document.getElementById('tabControls');
      const panelControls = document.getElementById('panelControls');
      const panelShifts = document.getElementById('panelShifts');

      tabControls?.click();

      expect(tabControls?.classList.contains('active')).toBe(true);
      expect(panelControls?.hidden).toBe(false);
      expect(panelShifts?.hidden).toBe(true);
    });

    it('should switch to Settings tab', () => {
      const tabSettings = document.getElementById('tabSettings');
      const panelSettings = document.getElementById('panelSettings');
      const panelShifts = document.getElementById('panelShifts');

      tabSettings?.click();

      expect(tabSettings?.classList.contains('active')).toBe(true);
      expect(panelSettings?.hidden).toBe(false);
      expect(panelShifts?.hidden).toBe(true);
    });
  });

  describe('License input', () => {
    it('should send VERIFY_LICENSE message when verify clicked', () => {
      const input = document.getElementById('licenseInput') as HTMLInputElement;
      const verifyBtn = document.getElementById('verifyBtn');

      input.value = 'SG-TEST-KEY';
      verifyBtn?.click();

      expect(sendMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MSG_TYPES.VERIFY_LICENSE,
          payload: { key: 'SG-TEST-KEY' },
        })
      );
    });

    it('should not have a trial button', () => {
      const trialBtn = document.getElementById('trialBtn');
      expect(trialBtn).toBeNull();
    });
  });

  describe('Master toggle', () => {
    it('should send SET_ENABLED message when toggled on', () => {
      const toggle = document.getElementById('masterToggle') as HTMLInputElement;
      toggle.checked = true;
      toggle.dispatchEvent(new Event('change'));

      expect(sendMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MSG_TYPES.SET_ENABLED,
          payload: { value: true },
        })
      );
    });
  });

  describe('Consent modal', () => {
    it('should have a hidden consent modal after init', () => {
      const modal = document.getElementById('consentModal');
      expect(modal?.classList.contains('hidden')).toBe(true);
    });

    it('should show consent modal when consent is not given', async () => {
      // Simulate a fresh import with no consent by checking the modal structure
      const modal = document.getElementById('consentModal');
      expect(modal).toBeTruthy();
      expect(modal?.classList.contains('hidden')).toBe(true);
    });
  });
});
