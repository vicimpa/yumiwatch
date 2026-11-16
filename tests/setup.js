import { beforeEach } from 'vitest';
import { resetMemoryCache } from '~/lib/cache-store';

beforeEach(() => {
  resetMemoryCache();
});

import { JSDOM } from 'jsdom';

// Node 26 exposes an unavailable native localStorage without a storage file.
// Use an actual DOM Storage implementation consistently on Node 22 and 26.
const storageWindow = new JSDOM('', { url: 'https://yumiwatch.test/' }).window;

Object.defineProperty(globalThis, 'localStorage', {
  value: storageWindow.localStorage,
  configurable: true,
  writable: true,
});
Object.defineProperty(globalThis, 'sessionStorage', {
  value: storageWindow.sessionStorage,
  configurable: true,
  writable: true,
});
Object.defineProperty(globalThis, 'Storage', {
  value: storageWindow.Storage,
  configurable: true,
  writable: true,
});
