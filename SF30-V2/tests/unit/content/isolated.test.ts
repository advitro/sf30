/**
 * Isolated Content Script Tests — SF30 V2.0
 */

import { MSG_TYPES } from '@shared/constants';

jest.spyOn(console, 'log').mockImplementation(() => {});
jest.spyOn(console, 'warn').mockImplementation(() => {});

describe('Isolated Content Script', () => {
  const originalAddEventListener = window.addEventListener.bind(window);
  const originalRemoveEventListener = window.removeEventListener.bind(window);
  const addedListeners: Array<{ type: string; listener: EventListener }> = [];

  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
    delete (window as unknown as Record<string, unknown>).__sf30_v2_active;
    addedListeners.length = 0;

    window.addEventListener = jest.fn((type, listener) => {
      addedListeners.push({ type: String(type), listener: listener as EventListener });
      originalAddEventListener(type, listener as EventListener);
    }) as unknown as typeof window.addEventListener;
  });

  afterEach(() => {
    for (const { type, listener } of addedListeners) {
      originalRemoveEventListener(type, listener);
    }
    window.addEventListener = originalAddEventListener;
    jest.restoreAllMocks();
  });

  describe('injectHUD', () => {
    it('should create a closed Shadow DOM', async () => {
      jest.spyOn(chrome.storage.local, 'get').mockImplementation(() =>
        Promise.resolve({ sg_v2_state: { enabled: false } })
      );
      const { injectHUD } = await import('../../../src/content/isolated/index');

      injectHUD();

      expect(document.body.children.length).toBeGreaterThan(0);
      const container = document.body.lastElementChild as HTMLElement;
      expect(container.shadowRoot).toBeNull();
      // HUD content should not be directly accessible in the light DOM
      expect(document.body.querySelector('.hud')).toBeNull();
    });
  });

  describe('keyboard shortcuts', () => {
    it('should send SET_PAUSED on KeyP', async () => {
      const sendMessageSpy = jest.spyOn(chrome.runtime, 'sendMessage').mockResolvedValue({});
      jest.spyOn(chrome.storage.local, 'get').mockImplementation(() =>
        Promise.resolve({ sg_v2_state: { enabled: false } })
      );

      const { setupKeyboardShortcuts } = await import('../../../src/content/isolated/index');
      setupKeyboardShortcuts();

      window.dispatchEvent(
        new KeyboardEvent('keydown', { code: 'KeyP', shiftKey: false, ctrlKey: false, altKey: false })
      );

      expect(sendMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MSG_TYPES.SET_PAUSED,
          payload: expect.objectContaining({ value: true }),
        })
      );
    });

    it('should send SET_OVERRIDE on Shift+KeyO', async () => {
      const sendMessageSpy = jest.spyOn(chrome.runtime, 'sendMessage').mockResolvedValue({});
      jest.spyOn(chrome.storage.local, 'get').mockImplementation(() =>
        Promise.resolve({ sg_v2_state: { enabled: false } })
      );

      const { setupKeyboardShortcuts } = await import('../../../src/content/isolated/index');
      setupKeyboardShortcuts();

      window.dispatchEvent(
        new KeyboardEvent('keydown', { code: 'KeyO', shiftKey: true, ctrlKey: false, altKey: false })
      );

      expect(sendMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MSG_TYPES.SET_OVERRIDE,
          payload: expect.objectContaining({ value: true }),
        })
      );
    });

    it('should ignore shortcuts when typing in input', async () => {
      const sendMessageSpy = jest.spyOn(chrome.runtime, 'sendMessage').mockResolvedValue({});
      jest.spyOn(chrome.storage.local, 'get').mockImplementation(() =>
        Promise.resolve({ sg_v2_state: { enabled: false } })
      );

      const { setupKeyboardShortcuts } = await import('../../../src/content/isolated/index');
      setupKeyboardShortcuts();

      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();

      input.dispatchEvent(
        new KeyboardEvent('keydown', { code: 'KeyP', shiftKey: false, ctrlKey: false, altKey: false, bubbles: true })
      );

      expect(sendMessageSpy).not.toHaveBeenCalled();
      document.body.removeChild(input);
    });
  });

  describe('postMessage bridge', () => {
    it('should send correct payload via notifyMainWorld', async () => {
      jest.spyOn(chrome.storage.local, 'get').mockImplementation(() =>
        Promise.resolve({ sg_v2_state: { enabled: false } })
      );
      const { notifyMainWorld } = await import('../../../src/content/isolated/index');

      const postMessageSpy = jest.spyOn(window, 'postMessage').mockImplementation(() => {});

      notifyMainWorld('SET_SPEED', { interval: 500, turbo: true });

      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'sf30-v2-isolated',
          action: 'SET_SPEED',
          payload: { interval: 500, turbo: true },
        }),
        expect.any(String)
      );

      postMessageSpy.mockRestore();
    });
  });
});
