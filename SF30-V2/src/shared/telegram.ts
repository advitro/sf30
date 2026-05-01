/**
 * Telegram Integration — SF30 V2.0
 *
 * Queue-based Telegram notification system:
 * - Messages are queued to chrome.storage.local (survives SW termination)
 * - Background alarm flushes the queue periodically
 * - Rate-limited to avoid Telegram API bans
 * - Supports opt-out
 */

import { TIMING, STORAGE_KEYS, URLS } from './constants';
import { encrypt, decrypt } from './crypto';
import type { TelegramMessage } from '../types';

// ── Types ──

interface QueuedMessage extends TelegramMessage {
  readonly timestamp: number;
  readonly retryCount: number;
}

interface TelegramConfig {
  readonly botToken: string | null;
  readonly chatId: string | null;
  readonly optOut: boolean;
}

// ── HTML Escape Helper ──

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Queue Operations ──

/**
 * Queues a Telegram notification for later delivery.
 * Safe to call from any context — storage persists across SW restarts.
 */
export async function queueTelegramMessage(
  message: TelegramMessage,
  installSecret: string
): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {return;}

  const config = await getTelegramConfig(installSecret);
  if (config.optOut || !config.botToken || !config.chatId) {
    return; // Silently drop if not configured or opted out
  }

  const queue = await getQueue();
  const queued: QueuedMessage = {
    ...message,
    timestamp: Date.now(),
    retryCount: 0,
  };

  queue.push(queued);

  // Trim old messages (older than 30 days)
  const cutoff = Date.now() - TIMING.TELEGRAM_QUEUE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  const trimmed = queue.filter((m) => m.timestamp > cutoff);

  await chrome.storage.local.set({ [STORAGE_KEYS.TG_QUEUE]: trimmed });
}

/**
 * Flushes the Telegram message queue.
 * Called by background alarm handler.
 */
export async function flushTelegramQueue(installSecret: string): Promise<{
  sent: number;
  failed: number;
}> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return { sent: 0, failed: 0 };
  }

  const config = await getTelegramConfig(installSecret);
  if (config.optOut || !config.botToken || !config.chatId) {
    return { sent: 0, failed: 0 };
  }

  const queue = await getQueue();
  if (queue.length === 0) {
    return { sent: 0, failed: 0 };
  }

  const remaining: QueuedMessage[] = [];
  let sent = 0;
  let failed = 0;

  for (const message of queue) {
    const success = await sendTelegramMessage(message, config);
    if (success) {
      sent++;
    } else if (message.retryCount < 3) {
      remaining.push({ ...message, retryCount: message.retryCount + 1 });
      failed++;
    } else {
      // Max retries exceeded — drop the message
      failed++;
    }
  }

  await chrome.storage.local.set({ [STORAGE_KEYS.TG_QUEUE]: remaining });
  return { sent, failed };
}

/**
 * Sends a single Telegram message directly (bypasses queue).
 * Use for high-priority notifications only.
 */
export async function sendTelegramNotification(
  text: string,
  config: { botToken: string; chatId: string }
): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const url = `${URLS.TELEGRAM_API}/bot${config.botToken}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const err = await response.text();
      console.warn('[Telegram] API error:', response.status, err);
      return false;
    }

    return true;
  } catch (e) {
    console.warn('[Telegram] Network error:', e);
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ── Config Management ──

/**
 * Retrieves decrypted Telegram config from storage.
 */
export async function getTelegramConfig(
  installSecret: string
): Promise<TelegramConfig> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return { botToken: null, chatId: null, optOut: false };
  }

  try {
    const result = await chrome.storage.local.get([
      STORAGE_KEYS.TG_BOT_TOKEN_ENC,
      STORAGE_KEYS.TG_CHAT_ID_ENC,
      STORAGE_KEYS.TG_OPT_OUT,
    ]);

    const optOut = result[STORAGE_KEYS.TG_OPT_OUT] === true;

    let botToken: string | null = null;
    let chatId: string | null = null;

    if (result[STORAGE_KEYS.TG_BOT_TOKEN_ENC]) {
      try {
        botToken = await decrypt(result[STORAGE_KEYS.TG_BOT_TOKEN_ENC], installSecret);
      } catch (e) {
        console.error('[SF30 V2] Error in getTelegramConfig (decrypt botToken):', e);
        botToken = null;
      }
    }

    if (result[STORAGE_KEYS.TG_CHAT_ID_ENC]) {
      try {
        chatId = await decrypt(result[STORAGE_KEYS.TG_CHAT_ID_ENC], installSecret);
      } catch (e) {
        console.error('[SF30 V2] Error in getTelegramConfig (decrypt chatId):', e);
        chatId = null;
      }
    }

    return { botToken, chatId, optOut };
  } catch (e) {
    console.error('[SF30 V2] Error in getTelegramConfig:', e);
    return { botToken: null, chatId: null, optOut: false };
  }
}

/**
 * Encrypts and stores Telegram config.
 */
export async function setTelegramConfig(
  config: Partial<TelegramConfig>,
  installSecret: string
): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {return;}

  const updates: Record<string, unknown> = {};

  if (config.optOut !== undefined) {
    updates[STORAGE_KEYS.TG_OPT_OUT] = config.optOut;
  }

  if (config.botToken !== undefined) {
    if (config.botToken) {
      updates[STORAGE_KEYS.TG_BOT_TOKEN_ENC] = await encrypt(config.botToken, installSecret);
    } else {
      updates[STORAGE_KEYS.TG_BOT_TOKEN_ENC] = null;
    }
  }

  if (config.chatId !== undefined) {
    if (config.chatId) {
      updates[STORAGE_KEYS.TG_CHAT_ID_ENC] = await encrypt(config.chatId, installSecret);
    } else {
      updates[STORAGE_KEYS.TG_CHAT_ID_ENC] = null;
    }
  }

  await chrome.storage.local.set(updates);
}

// ── Private Helpers ──

async function getQueue(): Promise<QueuedMessage[]> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {return [];}
  const result = await chrome.storage.local.get(STORAGE_KEYS.TG_QUEUE);
  return (result[STORAGE_KEYS.TG_QUEUE] as QueuedMessage[]) || [];
}

async function sendTelegramMessage(
  message: TelegramMessage,
  config: Required<TelegramConfig>
): Promise<boolean> {
  const statusEmoji = message.status === 'claimed' ? '✅' : '❌';
  const safeDate = escapeHtml(message.date);
  const safeTime = escapeHtml(message.time);
  const text = `${statusEmoji} <b>Shift ${message.status.toUpperCase()}</b>\n` +
    `📅 ${safeDate}\n` +
    `⏰ ${safeTime}`;

  if (!config.botToken || !config.chatId) {
    return false;
  }

  return sendTelegramNotification(text, {
    botToken: config.botToken,
    chatId: config.chatId,
  });
}
