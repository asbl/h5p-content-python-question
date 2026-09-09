import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PYODIDE_LIBRARY_VERSION,
  ensureFreshPyodideMiniworldsCache,
  purgeOutdatedPyodideWheelCacheEntries,
  readPyodideCacheState,
  shouldRunPyodideFreshnessCheck,
  writePyodideCacheState,
} from '../src/scripts/runtime/services/pyodide-cache-freshness.js';

/**
 * jsdom in this project's Node/vitest combination does not expose a working
 * window.localStorage, so tests provide a minimal in-memory stand-in.
 */
function createMemoryStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => {
      store.set(key, String(value)); 
    },
    removeItem: (key) => {
      store.delete(key); 
    },
    clear: () => {
      store.clear(); 
    },
  };
}

describe('Pyodide cache freshness', () => {
  beforeEach(() => {
    window.localStorage = createMemoryStorage();
  });

  it('bakes in the library version from library.json', () => {
    expect(PYODIDE_LIBRARY_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('round-trips state through localStorage', () => {
    expect(readPyodideCacheState()).toBeNull();

    const state = { libraryVersion: '1.0.0', packageVersions: { miniworlds: 'url-1' }, lastCheckedAt: 123 };
    writePyodideCacheState(state);

    expect(readPyodideCacheState()).toEqual(state);
  });

  it('requires a check when no state, a version change, or an elapsed interval is present', () => {
    const now = Date.parse('2026-08-18T00:00:00Z');

    expect(shouldRunPyodideFreshnessCheck(null, '1.0.0', now)).toBe(true);
    expect(shouldRunPyodideFreshnessCheck({ libraryVersion: '0.9.0', lastCheckedAt: now }, '1.0.0', now)).toBe(true);
    expect(shouldRunPyodideFreshnessCheck(
      { libraryVersion: '1.0.0', lastCheckedAt: now - (8 * 24 * 60 * 60 * 1000) },
      '1.0.0',
      now,
    )).toBe(true);
    expect(shouldRunPyodideFreshnessCheck(
      { libraryVersion: '1.0.0', lastCheckedAt: now - (6 * 24 * 60 * 60 * 1000) },
      '1.0.0',
      now,
    )).toBe(false);
  });

  it('removes only outdated wheel entries for the given package', async () => {
    const currentUrl = 'https://files.pythonhosted.org/packages/miniworlds-3.7.0-py3-none-any.whl';
    const requests = [
      { url: 'https://files.pythonhosted.org/packages/miniworlds-3.6.0-py3-none-any.whl' },
      { url: currentUrl },
      { url: 'https://files.pythonhosted.org/packages/miniworlds_robot-0.1.0-py3-none-any.whl' },
    ];
    const cache = {
      keys: vi.fn(async () => requests),
      delete: vi.fn(async () => true),
    };
    window.caches = { open: vi.fn(async () => cache) };

    await purgeOutdatedPyodideWheelCacheEntries('test-cache', 'miniworlds', currentUrl);

    expect(cache.delete).toHaveBeenCalledTimes(1);
    expect(cache.delete).toHaveBeenCalledWith(requests[0]);

    delete window.caches;
  });

  it('skips the check when not due yet', async () => {
    const now = Date.parse('2026-08-18T00:00:00Z');
    writePyodideCacheState({ libraryVersion: '1.0.0', packageVersions: {}, lastCheckedAt: now });
    const resolveWheelUrl = vi.fn();

    await ensureFreshPyodideMiniworldsCache({
      cacheName: 'test-cache',
      trackedPackageNames: ['miniworlds'],
      resolveWheelUrl,
      libraryVersion: '1.0.0',
      now,
    });

    expect(resolveWheelUrl).not.toHaveBeenCalled();
  });

  it('purges and persists new versions when a tracked package changed on PyPI', async () => {
    const now = Date.parse('2026-08-18T00:00:00Z');
    writePyodideCacheState({
      libraryVersion: '1.0.0',
      packageVersions: { miniworlds: 'https://files.pythonhosted.org/packages/miniworlds-3.6.0-py3-none-any.whl' },
      lastCheckedAt: now - (8 * 24 * 60 * 60 * 1000),
    });
    const cache = {
      keys: vi.fn(async () => [
        { url: 'https://files.pythonhosted.org/packages/miniworlds-3.6.0-py3-none-any.whl' },
      ]),
      delete: vi.fn(async () => true),
    };
    window.caches = { open: vi.fn(async () => cache) };
    const resolveWheelUrl = vi.fn(async () => 'https://files.pythonhosted.org/packages/miniworlds-3.7.0-py3-none-any.whl');

    await ensureFreshPyodideMiniworldsCache({
      cacheName: 'test-cache',
      trackedPackageNames: ['miniworlds'],
      resolveWheelUrl,
      libraryVersion: '1.0.0',
      now,
    });

    expect(cache.delete).toHaveBeenCalledTimes(1);
    expect(readPyodideCacheState()).toEqual({
      libraryVersion: '1.0.0',
      packageVersions: { miniworlds: 'https://files.pythonhosted.org/packages/miniworlds-3.7.0-py3-none-any.whl' },
      lastCheckedAt: now,
    });

    delete window.caches;
  });

  it('invalidates immediately on a plugin update even within the check interval', async () => {
    const now = Date.parse('2026-08-18T00:00:00Z');
    writePyodideCacheState({
      libraryVersion: '0.9.0',
      packageVersions: { miniworlds: 'https://files.pythonhosted.org/packages/miniworlds-3.6.0-py3-none-any.whl' },
      lastCheckedAt: now,
    });
    const resolveWheelUrl = vi.fn(async () => 'https://files.pythonhosted.org/packages/miniworlds-3.7.0-py3-none-any.whl');

    await ensureFreshPyodideMiniworldsCache({
      cacheName: 'test-cache',
      trackedPackageNames: ['miniworlds'],
      resolveWheelUrl,
      libraryVersion: '1.0.0',
      now,
    });

    expect(resolveWheelUrl).toHaveBeenCalledWith('miniworlds');
    expect(readPyodideCacheState().libraryVersion).toBe('1.0.0');
  });
});
