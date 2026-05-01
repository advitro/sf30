/**
 * Telegram Tests — SF30 V2.0
 */

import {
  queueTelegramMessage,
  sendTelegramNotification,
  getTelegramConfig,
  setTelegramConfig,
} from '../../../src/shared/telegram';

describe('Telegram', () => {
  const installSecret = 'test-install-secret-1234';
  let storageData: Record<string, unknown> = {};

  beforeEach(() => {
    storageData = {};
    jest.clearAllMocks();

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
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('queueTelegramMessage', () => {
    it('should silently drop when opted out', async () => {
      storageData['sg_v2_tg_opt_out'] = true;

      await queueTelegramMessage(
        { userKey: 'test', date: '2024-01-01', time: '08:00', status: 'claimed' },
        installSecret
      );

      expect(storageData['sg_v2_tg_queue']).toBeUndefined();
    });

    it('should silently drop when not configured', async () => {
      await queueTelegramMessage(
        { userKey: 'test', date: '2024-01-01', time: '08:00', status: 'claimed' },
        installSecret
      );

      expect(storageData['sg_v2_tg_queue']).toBeUndefined();
    });
  });

  describe('sendTelegramNotification', () => {
    it('should return true on successful API call', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue('{"ok":true}'),
      });

      const result = await sendTelegramNotification('Test message', {
        botToken: '123456:ABC-DEF',
        chatId: '123456789',
      });

      expect(result).toBe(true);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('api.telegram.org/bot123456:ABC-DEF/sendMessage'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should return false on API error', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: jest.fn().mockResolvedValue('Bad Request'),
      });

      const result = await sendTelegramNotification('Test', {
        botToken: 'token',
        chatId: 'id',
      });

      expect(result).toBe(false);
    });

    it('should return false on network error', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      const result = await sendTelegramNotification('Test', {
        botToken: 'token',
        chatId: 'id',
      });

      expect(result).toBe(false);
    });
  });

  describe('getTelegramConfig', () => {
    it('should return default config when nothing stored', async () => {
      const config = await getTelegramConfig(installSecret);
      expect(config).toEqual({ botToken: null, chatId: null, optOut: false });
    });

    it('should return optOut when set', async () => {
      storageData['sg_v2_tg_opt_out'] = true;
      const config = await getTelegramConfig(installSecret);
      expect(config.optOut).toBe(true);
    });
  });

  describe('setTelegramConfig', () => {
    it('should store optOut flag', async () => {
      await setTelegramConfig({ optOut: true }, installSecret);
      expect(storageData['sg_v2_tg_opt_out']).toBe(true);
    });

    it('should encrypt and store bot token', async () => {
      await setTelegramConfig({ botToken: 'test-token' }, installSecret);
      expect(storageData['sg_v2_tg_bot_token_enc']).toBeDefined();
      expect(storageData['sg_v2_tg_bot_token_enc']).toHaveProperty('ciphertext');
      expect(storageData['sg_v2_tg_bot_token_enc']).toHaveProperty('salt');
      expect(storageData['sg_v2_tg_bot_token_enc']).toHaveProperty('iv');
    });

    it('should encrypt and store chat ID', async () => {
      await setTelegramConfig({ chatId: 'test-chat' }, installSecret);
      expect(storageData['sg_v2_tg_chat_id_enc']).toBeDefined();
      expect(storageData['sg_v2_tg_chat_id_enc']).toHaveProperty('ciphertext');
    });
  });
});
