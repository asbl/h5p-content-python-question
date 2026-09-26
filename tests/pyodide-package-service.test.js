import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  installPyodideMicropipPackages,
  loadMissingPyodidePackages,
  resetLoadedPyodidePackages,
} from '../src/scripts/runtime/services/pyodide-package-service.js';
import {
  getLoadedPyodidePackages,
  resetSharedPyodideRuntimeState,
  sharedPyodideRuntimeState,
} from '../src/scripts/runtime/services/pyodide-runtime-service.js';

/**
 * Creates a runtime mock with a spy-able outputHandler.
 * @returns {object} Runtime mock.
 */
function createRuntime() {
  return {
    l10n: {},
    outputHandler: vi.fn(),
  };
}

describe('Pyodide package service', () => {
  beforeEach(() => {
    resetSharedPyodideRuntimeState();
    resetLoadedPyodidePackages();
    if (!window.localStorage) {
      const storage = new Map();
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: {
          getItem: vi.fn((key) => storage.get(key) || null),
          setItem: vi.fn((key, value) => storage.set(key, String(value))),
          removeItem: vi.fn((key) => storage.delete(key)),
          clear: vi.fn(() => storage.clear()),
        },
      });
    }
    window.localStorage.clear();
  });

  it('loads pyodide and micropip packages only when missing', async () => {
    const originalFetch = window.fetch;
    window.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        info: { version: '3.6.0' },
        releases: {
          '3.6.0': [{
            packagetype: 'bdist_wheel',
            filename: 'miniworlds-3.6.0-py3-none-any.whl',
            url: 'https://files.pythonhosted.org/packages/miniworlds-3.6.0-py3-none-any.whl',
          }],
        },
      }),
    }));
    const micropip = {
      install: Object.assign(vi.fn(), {
        callKwargs: vi.fn(async () => {}),
      }),
      destroy: vi.fn(),
    };
    const pyodide = {
      loadPackage: vi.fn(async () => {}),
      pyimport: vi.fn(() => micropip),
    };

    await loadMissingPyodidePackages(pyodide, ['numpy', 'miniworlds', 'numpy']);

    expect(pyodide.loadPackage).toHaveBeenNthCalledWith(1, ['numpy', 'pygame-ce', 'sqlite3']);
    expect(pyodide.loadPackage).toHaveBeenNthCalledWith(2, ['micropip']);
    expect(micropip.install.callKwargs).toHaveBeenCalledWith([
      'https://files.pythonhosted.org/packages/miniworlds-3.6.0-py3-none-any.whl',
    ], { deps: false });
    expect(getLoadedPyodidePackages(pyodide).has('numpy')).toBe(true);
    expect(getLoadedPyodidePackages(pyodide).has('micropip')).toBe(true);
    expect(getLoadedPyodidePackages(pyodide).has('miniworlds')).toBe(true);
    expect(getLoadedPyodidePackages(pyodide).has('pygame-ce')).toBe(true);
    expect(getLoadedPyodidePackages(pyodide).has('sqlite3')).toBe(true);

    await loadMissingPyodidePackages(pyodide, ['numpy', 'miniworlds']);

    expect(pyodide.loadPackage).toHaveBeenCalledTimes(2);
    expect(micropip.install.callKwargs).toHaveBeenCalledTimes(1);
    window.fetch = originalFetch;
  });

  it('loads Miniworlds Pyodide dependencies before micropip when called directly', async () => {
    const originalFetch = window.fetch;
    window.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        info: { version: '3.6.0' },
        releases: {
          '3.6.0': [{
            packagetype: 'bdist_wheel',
            filename: 'miniworlds-3.6.0-py3-none-any.whl',
            url: 'https://files.pythonhosted.org/packages/miniworlds-3.6.0-py3-none-any.whl',
          }],
        },
      }),
    }));
    const micropip = {
      install: Object.assign(vi.fn(), {
        callKwargs: vi.fn(async () => {}),
      }),
      destroy: vi.fn(),
    };
    const pyodide = {
      loadPackage: vi.fn(async () => {}),
      pyimport: vi.fn(() => micropip),
    };

    resetLoadedPyodidePackages(pyodide);
    await installPyodideMicropipPackages(pyodide, ['miniworlds']);

    expect(pyodide.loadPackage).toHaveBeenCalledWith(['numpy', 'pygame-ce', 'sqlite3']);
    expect(micropip.install.callKwargs).toHaveBeenCalledWith([
      'https://files.pythonhosted.org/packages/miniworlds-3.6.0-py3-none-any.whl',
    ], { deps: false });
    window.fetch = originalFetch;
  });

  it('uses configured Miniworlds wheel URLs without resolving PyPI metadata', async () => {
    const originalFetch = window.fetch;
    window.fetch = vi.fn(async () => {
      throw new Error('PyPI should not be fetched for pinned wheels.');
    });
    const micropip = {
      install: Object.assign(vi.fn(), {
        callKwargs: vi.fn(async () => {}),
      }),
      destroy: vi.fn(),
    };
    const pyodide = {
      loadPackage: vi.fn(async () => {}),
      pyimport: vi.fn(() => micropip),
    };

    await loadMissingPyodidePackages(pyodide, ['miniworlds'], {
      packageUrls: {
        miniworlds: 'https://static.example.com/wheels/miniworlds-3.6.0-py3-none-any.whl',
      },
    });

    expect(window.fetch).not.toHaveBeenCalled();
    expect(micropip.install.callKwargs).toHaveBeenCalledWith([
      'https://static.example.com/wheels/miniworlds-3.6.0-py3-none-any.whl',
    ], { deps: false });
    window.fetch = originalFetch;
  });

  it('reports the installed Miniworlds version as a non-captured status message', async () => {
    const originalFetch = window.fetch;
    window.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        info: { version: '3.6.0' },
        releases: {
          '3.6.0': [{
            packagetype: 'bdist_wheel',
            filename: 'miniworlds-3.6.0-py3-none-any.whl',
            url: 'https://files.pythonhosted.org/packages/miniworlds-3.6.0-py3-none-any.whl',
          }],
        },
      }),
    }));
    const micropip = {
      install: Object.assign(vi.fn(), {
        callKwargs: vi.fn(async () => {}),
      }),
      destroy: vi.fn(),
    };
    const pyodide = {
      loadPackage: vi.fn(async () => {}),
      pyimport: vi.fn(() => micropip),
      runPythonAsync: vi.fn(async (code) => (
        code.includes('find_spec') ? false : '3.6.0'
      )),
    };
    const runtime = createRuntime();
    sharedPyodideRuntimeState.activeRuntime = runtime;

    await loadMissingPyodidePackages(pyodide, ['miniworlds']);

    expect(runtime.outputHandler).toHaveBeenCalledWith('Miniworlds version: 3.6.0', false);
    window.fetch = originalFetch;
  });

  it('does not report a Miniworlds version when it cannot be determined', async () => {
    const originalFetch = window.fetch;
    window.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        info: { version: '3.6.0' },
        releases: {
          '3.6.0': [{
            packagetype: 'bdist_wheel',
            filename: 'miniworlds-3.6.0-py3-none-any.whl',
            url: 'https://files.pythonhosted.org/packages/miniworlds-3.6.0-py3-none-any.whl',
          }],
        },
      }),
    }));
    const micropip = {
      install: Object.assign(vi.fn(), {
        callKwargs: vi.fn(async () => {}),
      }),
      destroy: vi.fn(),
    };
    const pyodide = {
      loadPackage: vi.fn(async () => {}),
      pyimport: vi.fn(() => micropip),
    };
    const runtime = createRuntime();
    sharedPyodideRuntimeState.activeRuntime = runtime;

    await loadMissingPyodidePackages(pyodide, ['miniworlds']);

    expect(runtime.outputHandler).not.toHaveBeenCalled();
    window.fetch = originalFetch;
  });

  it('skips micropip installation when a Miniworlds module is already importable', async () => {
    const originalFetch = window.fetch;
    window.fetch = vi.fn(async () => {
      throw new Error('PyPI should not be fetched for already importable packages.');
    });
    const micropip = {
      install: Object.assign(vi.fn(), {
        callKwargs: vi.fn(async () => {}),
      }),
      destroy: vi.fn(),
    };
    const pyodide = {
      loadPackage: vi.fn(async () => {}),
      pyimport: vi.fn(() => micropip),
      runPythonAsync: vi.fn(async (code) => code.includes('find_spec("miniworlds")')),
    };

    await installPyodideMicropipPackages(pyodide, ['miniworlds']);

    expect(window.fetch).not.toHaveBeenCalled();
    expect(pyodide.pyimport).not.toHaveBeenCalled();
    expect(micropip.install.callKwargs).not.toHaveBeenCalled();
    expect(getLoadedPyodidePackages(pyodide).has('miniworlds')).toBe(true);
    expect(getLoadedPyodidePackages(pyodide).has('pygame-ce')).toBe(true);
    expect(getLoadedPyodidePackages(pyodide).has('sqlite3')).toBe(true);
    window.fetch = originalFetch;
  });

  it('falls back to package names when Miniworlds wheel resolution fails', async () => {
    const originalFetch = window.fetch;
    window.fetch = vi.fn(async () => ({
      ok: false,
      status: 503,
    }));
    const micropip = {
      install: Object.assign(vi.fn(), {
        callKwargs: vi.fn(async () => {}),
      }),
      destroy: vi.fn(),
    };
    const pyodide = {
      loadPackage: vi.fn(async () => {}),
      pyimport: vi.fn(() => micropip),
    };

    await loadMissingPyodidePackages(pyodide, ['miniworlds']);

    expect(micropip.install.callKwargs).toHaveBeenCalledWith(['miniworlds'], { deps: false });
    window.fetch = originalFetch;
  });

  it('invalidates a stale cached Miniworlds wheel URL and retries installation once', async () => {
    const originalFetch = window.fetch;
    window.localStorage.setItem('h5p-pythonquestion-miniworlds-wheel-cache-v1', JSON.stringify({
      miniworlds: {
        url: 'https://files.pythonhosted.org/packages/miniworlds-stale-py3-none-any.whl',
        checkedAt: Date.now(),
        version: '4.3.1.16',
      },
    }));
    window.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        info: { version: '4.3.1.16' },
        urls: [{
          packagetype: 'bdist_wheel',
          filename: 'miniworlds-4.3.1.16-py3-none-any.whl',
          url: 'https://files.pythonhosted.org/packages/miniworlds-4.3.1.16-py3-none-any.whl',
        }],
      }),
    }));
    const micropip = {
      install: Object.assign(vi.fn(), {
        callKwargs: vi
          .fn()
          .mockRejectedValueOnce(new Error('stale wheel missing'))
          .mockResolvedValueOnce(undefined),
      }),
      destroy: vi.fn(),
    };
    const pyodide = {
      loadPackage: vi.fn(async () => {}),
      pyimport: vi.fn(() => micropip),
    };

    await loadMissingPyodidePackages(pyodide, ['miniworlds']);

    expect(micropip.install.callKwargs).toHaveBeenNthCalledWith(1, [
      'https://files.pythonhosted.org/packages/miniworlds-stale-py3-none-any.whl',
    ], { deps: false });
    expect(micropip.install.callKwargs).toHaveBeenNthCalledWith(2, [
      'https://files.pythonhosted.org/packages/miniworlds-4.3.1.16-py3-none-any.whl',
    ], { deps: false });
    expect(window.fetch).toHaveBeenCalledWith(
      'https://pypi.org/pypi/miniworlds/4.3.1.16/json',
      { cache: 'no-store' },
    );
    expect(getLoadedPyodidePackages(pyodide).has('miniworlds')).toBe(true);
    window.fetch = originalFetch;
  });

  it('destroys micropip and restores package-load depth when installation fails', async () => {
    const originalFetch = window.fetch;
    window.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        info: { version: '3.6.0' },
        releases: {
          '3.6.0': [{
            packagetype: 'bdist_wheel',
            filename: 'miniworlds-3.6.0-py3-none-any.whl',
            url: 'https://files.pythonhosted.org/packages/miniworlds-3.6.0-py3-none-any.whl',
          }],
        },
      }),
    }));
    const micropip = {
      install: Object.assign(vi.fn(), {
        callKwargs: vi.fn(async () => {
          throw new Error('install failed');
        }),
      }),
      destroy: vi.fn(),
    };
    const pyodide = {
      loadPackage: vi.fn(async () => {}),
      pyimport: vi.fn(() => micropip),
    };

    await expect(loadMissingPyodidePackages(pyodide, ['miniworlds']))
      .rejects.toThrow('install failed');

    expect(micropip.destroy).toHaveBeenCalledTimes(1);
    expect(sharedPyodideRuntimeState.packageLoadDepth).toBe(0);
    expect(getLoadedPyodidePackages(pyodide).has('miniworlds')).toBe(false);
    window.fetch = originalFetch;
  });

  it('installs Miniworlds extension packages through resolved PyPI wheels', async () => {
    const originalFetch = window.fetch;
    window.fetch = vi.fn(async (url) => {
      const packageName = String(url).match(/\/pypi\/([^/]+)(?:\/[^/]+)?\/json/)?.[1] || 'unknown';

      return {
        ok: true,
        json: async () => ({
          info: { version: '0.1.0' },
          releases: {
            '0.1.0': [{
              packagetype: 'bdist_wheel',
              filename: `${packageName.replaceAll('-', '_')}-0.1.0-py3-none-any.whl`,
              url: `https://files.pythonhosted.org/packages/${packageName}-0.1.0-py3-none-any.whl`,
            }],
          },
        }),
      };
    });
    const micropip = {
      install: Object.assign(vi.fn(), {
        callKwargs: vi.fn(async () => {}),
      }),
      destroy: vi.fn(),
    };
    const pyodide = {
      loadPackage: vi.fn(async () => {}),
      pyimport: vi.fn(() => micropip),
    };

    await loadMissingPyodidePackages(pyodide, ['miniworlds-robot', 'miniworlds-turtle']);

    expect(pyodide.loadPackage).toHaveBeenNthCalledWith(1, ['numpy', 'pygame-ce', 'sqlite3']);
    expect(pyodide.loadPackage).toHaveBeenNthCalledWith(2, ['micropip']);
    expect(micropip.install.callKwargs).toHaveBeenCalledWith([
      'https://files.pythonhosted.org/packages/miniworlds-robot-0.1.0-py3-none-any.whl',
      'https://files.pythonhosted.org/packages/miniworlds-0.1.0-py3-none-any.whl',
      'https://files.pythonhosted.org/packages/miniworlds-turtle-0.1.0-py3-none-any.whl',
    ], { deps: false });
    expect(getLoadedPyodidePackages(pyodide).has('miniworlds-robot')).toBe(true);
    expect(getLoadedPyodidePackages(pyodide).has('miniworlds-turtle')).toBe(true);
    expect(getLoadedPyodidePackages(pyodide).has('miniworlds')).toBe(true);
    window.fetch = originalFetch;
  });

  it('serializes concurrent requests so the same package is never loaded twice', async () => {
    let resolveFirstLoad;
    const loadPackage = vi.fn((names) => {
      if (names.includes('pygame-ce') && !resolveFirstLoad) {
        return new Promise((resolve) => {
          resolveFirstLoad = resolve;
        });
      }
      return Promise.resolve();
    });
    const pyodide = { loadPackage, pyimport: vi.fn() };

    // Two callers (e.g. the editor's speculative preload and a learner's
    // Run click) request the same still-missing package around the same
    // time. Without serialization both would call pyodide.loadPackage()
    // concurrently, which can corrupt native extension state.
    const firstCall = loadMissingPyodidePackages(pyodide, ['pygame-ce']);
    const secondCall = loadMissingPyodidePackages(pyodide, ['pygame-ce']);

    await Promise.resolve();
    await Promise.resolve();
    expect(loadPackage).toHaveBeenCalledTimes(1);

    resolveFirstLoad();
    await firstCall;
    await secondCall;

    expect(loadPackage).toHaveBeenCalledTimes(1);
    expect(getLoadedPyodidePackages(pyodide).has('pygame-ce')).toBe(true);
  });

  it('does not reuse the loaded package registry across Pyodide instances', async () => {
    const createMicropip = () => ({
      install: Object.assign(vi.fn(), {
        callKwargs: vi.fn(async () => {}),
      }),
      destroy: vi.fn(),
    });
    const firstPyodide = {
      loadPackage: vi.fn(async () => {}),
      pyimport: vi.fn(() => createMicropip()),
    };
    const secondPyodide = {
      loadPackage: vi.fn(async () => {}),
      pyimport: vi.fn(() => createMicropip()),
    };

    await loadMissingPyodidePackages(firstPyodide, ['numpy']);
    await loadMissingPyodidePackages(secondPyodide, ['numpy']);

    expect(firstPyodide.loadPackage).toHaveBeenCalledWith(['numpy']);
    expect(secondPyodide.loadPackage).toHaveBeenCalledWith(['numpy']);
  });
});
