/**
 * Jest Test Setup — SF30 V2.0
 *
 * Configures the test environment with:
 * 1. WebExtension API mocks (jest-webextension-mock)
 * 2. Custom chrome API enhancements
 * 3. Global test utilities
 */

import 'jest-webextension-mock';
import { webcrypto } from 'node:crypto';
import { TextEncoder, TextDecoder } from 'util';

// ── Polyfills for JSDOM ──

// TextEncoder / TextDecoder
if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = TextEncoder as unknown as typeof global.TextEncoder;
}
if (typeof global.TextDecoder === 'undefined') {
  global.TextDecoder = TextDecoder as unknown as typeof global.TextDecoder;
}

// Web Crypto API (subtle is missing in JSDOM)
const nodeCrypto = webcrypto as unknown as Crypto;
Object.defineProperty(global, 'crypto', {
  value: nodeCrypto,
  writable: true,
  configurable: true,
});

// crypto.randomUUID (polyfill for older Node versions)
if (!nodeCrypto.randomUUID) {
  Object.defineProperty(nodeCrypto, 'randomUUID', {
    value: () => {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    },
    configurable: true,
  });
}

// ── Global Test Configuration ──

beforeAll(() => {
  // Set up any global test state
});

afterEach(() => {
  // Clean up mocks after each test
  jest.clearAllMocks();
});

// ── Custom Matchers ──

expect.extend({
  toBeWithinRange(received: number, floor: number, ceiling: number) {
    const pass = received >= floor && received <= ceiling;
    if (pass) {
      return {
        message: () => `expected ${received} not to be within range ${floor} - ${ceiling}`,
        pass: true,
      };
    }
    return {
      message: () => `expected ${received} to be within range ${floor} - ${ceiling}`,
      pass: false,
    };
  },
});

// ── Type Augmentations ──

declare global {
  namespace jest {
    interface Matchers<R> {
      toBeWithinRange(floor: number, ceiling: number): R;
    }
  }
}
