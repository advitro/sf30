/**
 * Store Unit Tests — SF30 V2.0
 */

import { Store, getStore, resetStore } from '@core/store';

describe('Store', () => {
  let store: Store;

  beforeEach(() => {
    resetStore();
    store = new Store();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with default state', () => {
      const state = store.getState();
      expect(state.enabled).toBe(false);
      expect(state.paused).toBe(false);
      expect(state.override).toBe(false);
      expect(state.license.valid).toBe(false);
      expect(state.license.tier).toBeNull();
      expect(state.license.key).toBeNull();
      expect(state.settings.dates).toEqual([]);
      expect(state.telegram.optOut).toBe(false);
    });

    it('should accept initial state override', () => {
      const customStore = new Store({
        enabled: true,
        license: { tier: 'pro', valid: true, key: null, exp: 0, trial: false, lastVerified: 0, revoked: false },
      });
      const state = customStore.getState();
      expect(state.enabled).toBe(true);
      expect(state.license.tier).toBe('pro');
      expect(state.license.valid).toBe(true);
      expect(state.paused).toBe(false);
    });
  });

  describe('dispatch', () => {
    it('should update enabled state', () => {
      store.dispatch({ type: 'SET_ENABLED', payload: true });
      expect(store.getState().enabled).toBe(true);
    });

    it('should update paused state', () => {
      store.dispatch({ type: 'SET_PAUSED', payload: true });
      expect(store.getState().paused).toBe(true);
    });

    it('should update override state', () => {
      store.dispatch({ type: 'SET_OVERRIDE', payload: true });
      expect(store.getState().override).toBe(true);
    });

    it('should update license state partially', () => {
      store.dispatch({ type: 'SET_LICENSE', payload: { tier: 'pro' } });
      const state = store.getState();
      expect(state.license.tier).toBe('pro');
      expect(state.license.valid).toBe(false);
    });

    it('should update settings partially', () => {
      store.dispatch({ type: 'SET_SETTINGS', payload: { dates: ['2024-01-01'], turbo: true } });
      const state = store.getState();
      expect(state.settings.dates).toEqual(['2024-01-01']);
      expect(state.settings.turbo).toBe(true);
      expect(state.settings.hudHidden).toBe(false);
    });

    it('should handle RESET_STATE', () => {
      store.dispatch({ type: 'SET_ENABLED', payload: true });
      store.dispatch({ type: 'SET_LICENSE', payload: { tier: 'pro', valid: true } });
      store.dispatch({ type: 'RESET_STATE' });
      const state = store.getState();
      expect(state.enabled).toBe(false);
      expect(state.license.tier).toBeNull();
      expect(state.license.valid).toBe(false);
    });
  });

  describe('subscriptions', () => {
    it('should notify subscribers on state change', () => {
      const listener = jest.fn();
      store.subscribe(listener);
      store.dispatch({ type: 'SET_ENABLED', payload: true });
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: true }),
        expect.objectContaining({ enabled: false })
      );
    });

    it('should not notify when state unchanged', () => {
      const listener = jest.fn();
      store.subscribe(listener);
      store.dispatch({ type: 'SET_ENABLED', payload: false });
      expect(listener).not.toHaveBeenCalled();
    });

    it('should allow unsubscribing', () => {
      const listener = jest.fn();
      const unsubscribe = store.subscribe(listener);
      unsubscribe();
      store.dispatch({ type: 'SET_ENABLED', payload: true });
      expect(listener).not.toHaveBeenCalled();
    });

    it('should handle listener errors gracefully', () => {
      const badListener = jest.fn().mockImplementation(() => { throw new Error('fail'); });
      const goodListener = jest.fn();
      store.subscribe(badListener);
      store.subscribe(goodListener);
      expect(() => store.dispatch({ type: 'SET_ENABLED', payload: true })).not.toThrow();
      expect(goodListener).toHaveBeenCalled();
    });
  });

  describe('persistence', () => {
    it('should load from storage', async () => {
      const mockStorage = { sg_v2_state: { enabled: true, license: { tier: 'pro', valid: true } } };
      (chrome.storage.local.get as jest.Mock).mockImplementation((_keys: string[], callback?: (res: typeof mockStorage) => void) => {
        if (callback) {callback(mockStorage);}
        return Promise.resolve(mockStorage);
      });
      const newStore = new Store();
      await newStore.load();
      expect(newStore.getState().enabled).toBe(true);
      expect(newStore.getState().license.tier).toBe('pro');
    });

    it('should handle storage load errors', async () => {
      (chrome.storage.local.get as jest.Mock).mockRejectedValue(new Error('Storage error'));
      const newStore = new Store();
      await expect(newStore.load()).resolves.not.toThrow();
      expect(newStore.getState().enabled).toBe(false);
    });
  });

  describe('sync', () => {
    it('should sync from external storage', () => {
      const listener = jest.fn();
      store.subscribe(listener);
      store.syncFromStorage({ enabled: true, paused: true });
      expect(store.getState().enabled).toBe(true);
      expect(store.getState().paused).toBe(true);
      expect(listener).toHaveBeenCalled();
    });
  });

  describe('singleton', () => {
    it('should return same instance', () => {
      const s1 = getStore();
      const s2 = getStore();
      expect(s1).toBe(s2);
    });

    it('should create new after reset', () => {
      const s1 = getStore();
      resetStore();
      const s2 = getStore();
      expect(s1).not.toBe(s2);
    });
  });
});
