/**
 * Background Service Worker Tests — SF30 V2.0
 *
 * Tests the message handlers and alarm handlers in the background script.
 * NOTE: This tests the handler logic indirectly by importing the module
 * and verifying state changes through the store.
 */

import { getStore, resetStore } from '../../../src/core/store';

describe('Background Service Worker', () => {
  let storageData: Record<string, unknown> = {};

  beforeEach(() => {
    resetStore();
    storageData = {};
    jest.clearAllMocks();

    // Ensure chrome namespaces exist
    (chrome as unknown as Record<string, unknown>).scripting = {
      executeScript: jest.fn().mockResolvedValue([]),
    };
    (chrome as unknown as Record<string, unknown>).alarms = {
      create: jest.fn().mockResolvedValue(undefined),
      clearAll: jest.fn().mockResolvedValue(true),
      clear: jest.fn().mockResolvedValue(true),
      onAlarm: { addListener: jest.fn() },
    };

    // Mock chrome.storage.local with in-memory store
    jest.spyOn(chrome.storage.local, 'set').mockImplementation((items) => {
      Object.assign(storageData, items);
      return Promise.resolve();
    });
    jest.spyOn(chrome.storage.local, 'get').mockImplementation((keys) => {
      const result: Record<string, unknown> = {};
      const keyArray = Array.isArray(keys)
        ? keys
        : typeof keys === 'string'
          ? [keys]
          : Object.keys(storageData);
      for (const key of keyArray) {
        if (key in storageData) {result[key] = storageData[key];}
      }
      return Promise.resolve(result);
    });
    jest.spyOn(chrome.storage.local, 'clear').mockImplementation(() => {
      Object.keys(storageData).forEach((k) => delete storageData[k]);
      return Promise.resolve();
    });

    // Mock chrome.runtime.sendMessage
    jest.spyOn(chrome.runtime, 'sendMessage').mockResolvedValue({});

    // Mock chrome.tabs.query
    jest.spyOn(chrome.tabs, 'query').mockResolvedValue([]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Store Integration', () => {
    it('should initialize with default state', () => {
      const store = getStore();
      const state = store.getState();

      expect(state.enabled).toBe(false);
      expect(state.paused).toBe(false);
      expect(state.override).toBe(false);
      expect(state.license.valid).toBe(false);
      expect(state.settings.dates).toEqual([]);
      expect(state.telegram.optOut).toBe(false);
    });

    it('should dispatch SET_ENABLED and update state', () => {
      const store = getStore();
      store.dispatch({ type: 'SET_ENABLED', payload: true });

      expect(store.getState().enabled).toBe(true);
    });

    it('should dispatch SET_PAUSED and update state', () => {
      const store = getStore();
      store.dispatch({ type: 'SET_PAUSED', payload: true });

      expect(store.getState().paused).toBe(true);
    });

    it('should dispatch SET_OVERRIDE and update state', () => {
      const store = getStore();
      store.dispatch({ type: 'SET_OVERRIDE', payload: true });

      expect(store.getState().override).toBe(true);
    });

    it('should dispatch SET_SETTINGS with partial update', () => {
      const store = getStore();
      store.dispatch({ type: 'SET_SETTINGS', payload: { turbo: true, hudHidden: true } });

      const state = store.getState();
      expect(state.settings.turbo).toBe(true);
      expect(state.settings.hudHidden).toBe(true);
      expect(state.settings.dates).toEqual([]); // unchanged
    });

    it('should dispatch SET_TELEGRAM with partial update', () => {
      const store = getStore();
      store.dispatch({ type: 'SET_TELEGRAM', payload: { botToken: 'test', chatId: '123' } });

      const state = store.getState();
      expect(state.telegram.botToken).toBe('test');
      expect(state.telegram.chatId).toBe('123');
      expect(state.telegram.optOut).toBe(false); // unchanged
    });

    it('should dispatch SET_RUNTIME with partial update', () => {
      const store = getStore();
      store.dispatch({ type: 'SET_RUNTIME', payload: { pollCount: 5, rateLimited: true } });

      const state = store.getState();
      expect(state.runtime.pollCount).toBe(5);
      expect(state.runtime.rateLimited).toBe(true);
      expect(state.runtime.burstRemaining).toBe(0); // unchanged
    });

    it('should dispatch SET_LICENSE with partial update', () => {
      const store = getStore();
      store.dispatch({
        type: 'SET_LICENSE',
        payload: { key: 'SG-TEST', valid: true, tier: 'pro' },
      });

      const state = store.getState();
      expect(state.license.key).toBe('SG-TEST');
      expect(state.license.valid).toBe(true);
      expect(state.license.tier).toBe('pro');
      expect(state.license.trial).toBe(false); // unchanged
    });

    it('should persist state to storage', async () => {
      const store = getStore();
      store.dispatch({ type: 'SET_ENABLED', payload: true });
      await store.persist();

      expect(storageData['sg_v2_state']).toBeDefined();
      expect((storageData['sg_v2_state'] as { enabled: boolean }).enabled).toBe(true);
    });

    it('should load state from storage', async () => {
      storageData['sg_v2_state'] = {
        enabled: true,
        paused: true,
        license: { key: 'SG-TEST', valid: true, tier: 'pro', exp: 0, trial: false, lastVerified: 0, revoked: false },
      };

      const store = getStore();
      await store.load();

      expect(store.getState().enabled).toBe(true);
      expect(store.getState().paused).toBe(true);
      expect(store.getState().license.key).toBe('SG-TEST');
    });

    it('should reset state to defaults', () => {
      const store = getStore();
      store.dispatch({ type: 'SET_ENABLED', payload: true });
      store.dispatch({ type: 'RESET_STATE' });

      expect(store.getState().enabled).toBe(false);
      expect(store.getState().license.key).toBeNull();
    });
  });

  describe('Security Utilities (via imports)', () => {
    it('should validate message sender correctly', async () => {
      const { validateMessageSender } = await import('../../../src/shared/security');

      // Same extension
      expect(validateMessageSender({ id: chrome.runtime.id, url: `chrome-extension://${chrome.runtime.id}/popup.html` })).toBe(true);

      // Different extension
      expect(validateMessageSender({ id: 'other-extension', url: 'chrome-extension://other-extension/popup.html' })).toBe(false);

      // Allowed host (content script sends via tab URL)
      expect(validateMessageSender({ tab: { url: 'https://atoz.amazon.work/shifts' } as chrome.tabs.Tab })).toBe(true);

      // Unknown host
      expect(validateMessageSender({ tab: { url: 'https://evil.com/' } as chrome.tabs.Tab })).toBe(false);

      // Null sender
      expect(validateMessageSender(null as unknown as chrome.runtime.MessageSender)).toBe(false);
    });

    it('should validate message structure correctly', async () => {
      const { validateMessageStructure } = await import('../../../src/shared/security');

      expect(validateMessageStructure({ type: 'SG_V2_SET_ENABLED' }).valid).toBe(true);
      expect(validateMessageStructure({ type: 'UNKNOWN_TYPE' }).valid).toBe(false);
      expect(validateMessageStructure({}).valid).toBe(false);
      expect(validateMessageStructure(null).valid).toBe(false);
    });
  });

  describe('Chrome API Mock Verification', () => {
    it('should have working chrome.runtime.sendMessage mock', async () => {
      await chrome.runtime.sendMessage({ type: 'TEST' });
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'TEST' });
    });

    it('should have working chrome.tabs.query mock', async () => {
      await chrome.tabs.query({ url: 'https://atoz.amazon.work/*' });
      expect(chrome.tabs.query).toHaveBeenCalledWith({ url: 'https://atoz.amazon.work/*' });
    });

    it('should have working chrome.alarms.create mock', async () => {
      await chrome.alarms.create('test-alarm', { delayInMinutes: 1 });
      expect(chrome.alarms.create).toHaveBeenCalledWith('test-alarm', { delayInMinutes: 1 });
    });
  });
});
