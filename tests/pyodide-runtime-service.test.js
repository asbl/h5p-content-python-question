import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearPyodideExecutionLimit,
  ensurePyodideScript,
  getLoadedPyodidePackages,
  getPyodideRuntimeInput,
  getSharedPyodide,
  installPyodideRuntimeCompatibility,
  normalizePyodideScriptUrl,
  precachePyodideAssets,
  queuePyodideExecution,
  resetSharedPyodideRuntimeState,
  resolveLatestMiniworldsWheel,
  setPyodideExecutionLimit,
  setActivePyodideRuntime,
  setActivePyodideSDLCanvas,
  sharedPyodideRuntimeState,
  shouldCachePyodideFetch,
  warmPyodidePackageImports,
  writePyodideRuntimeOutput,
} from '../src/scripts/runtime/services/pyodide-runtime-service.js';

describe('Pyodide runtime service', () => {
  beforeEach(() => {
    resetSharedPyodideRuntimeState();
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
    window.loadPyodide = undefined;
  });

  it('routes output and input through the active runtime handlers', async () => {
    const outputHandler = vi.fn();
    const inputHandler = vi.fn(() => '42');

    setActivePyodideRuntime({
      l10n: { pythonInputPrompt: 'Input:' },
      outputHandler,
      inputHandler,
    });

    writePyodideRuntimeOutput('ready');

    expect(outputHandler).toHaveBeenCalledWith('ready', true);
    expect(await getPyodideRuntimeInput()).toBe('42');
    expect(inputHandler).toHaveBeenCalledWith('Input:');
  });

  it('returns an empty string when no runtime input handler exists', async () => {
    expect(await getPyodideRuntimeInput('Prompt')).toBe('');
  });

  it('converts non-null runtime input values to strings', async () => {
    const inputHandler = vi.fn(() => 42);

    setActivePyodideRuntime({
      l10n: { pythonInputPrompt: 'Input:' },
      inputHandler,
    });

    expect(await getPyodideRuntimeInput()).toBe('42');
  });

  it('keeps nullish runtime input values as an empty string', async () => {
    setActivePyodideRuntime({
      l10n: { pythonInputPrompt: 'Input:' },
      inputHandler: vi.fn(() => null),
    });

    expect(await getPyodideRuntimeInput()).toBe('');
  });

  it('keeps only one SDL canvas bound to the shared canvas id', () => {
    const firstCanvas = document.createElement('canvas');
    const secondCanvas = document.createElement('canvas');

    setActivePyodideSDLCanvas(firstCanvas);
    setActivePyodideSDLCanvas(secondCanvas);

    expect(firstCanvas.id).toMatch(/^canvas-inactive-/);
    expect(secondCanvas.id).toBe('canvas');
    expect(sharedPyodideRuntimeState.activeSDLCanvas).toBe(secondCanvas);
  });

  it('releases the active SDL canvas binding when cleared', () => {
    const canvas = document.createElement('canvas');

    setActivePyodideSDLCanvas(canvas);
    setActivePyodideSDLCanvas(null);

    expect(canvas.id).toMatch(/^canvas-inactive-/);
    expect(sharedPyodideRuntimeState.activeSDLCanvas).toBeNull();
  });

  it('installs and clears the execution-limit trace helpers', async () => {
    const pyodide = {
      runPythonAsync: vi.fn().mockResolvedValue(undefined),
    };

    await setPyodideExecutionLimit(pyodide, 1200.8, 'Program exceeded the execution time limit.');

    expect(pyodide.runPythonAsync).toHaveBeenNthCalledWith(
      2,
      '_h5p_set_execution_limit(1200, "Program exceeded the execution time limit.")',
    );

    await clearPyodideExecutionLimit(pyodide);

    expect(pyodide.runPythonAsync).toHaveBeenLastCalledWith('_h5p_clear_execution_limit()');
  });

  it('clears execution-limit helpers instead of installing a non-positive limit', async () => {
    const pyodide = {
      runPythonAsync: vi.fn().mockResolvedValue(undefined),
    };

    await setPyodideExecutionLimit(pyodide, 'invalid', 'Program exceeded the execution time limit.');

    expect(pyodide.runPythonAsync).toHaveBeenNthCalledWith(
      2,
      '_h5p_clear_execution_limit()',
    );
  });

  it('hides the pygame support prompt during compatibility bootstrap', async () => {
    const pyodide = {
      runPythonAsync: vi.fn().mockResolvedValue(undefined),
    };

    await installPyodideRuntimeCompatibility(pyodide);

    expect(pyodide.runPythonAsync).toHaveBeenCalledTimes(1);
    expect(pyodide.runPythonAsync.mock.calls[0][0]).toContain("_h5p_os.environ['PYGAME_HIDE_SUPPORT_PROMPT'] = '1'");
  });

  it('scopes pygame-ce\'s native SDL keyboard capture to the active canvas', async () => {
    // Regression test: pygame-ce's emscripten SDL2 build binds its own
    // keyboard listener to the whole document by default, which swallows
    // keystrokes meant for an unrelated input() dialog no matter where DOM
    // focus actually is. SDL_EMSCRIPTEN_KEYBOARD_ELEMENT must be set before
    // the first pygame.init() to scope that listener to the canvas.
    const pyodide = {
      runPythonAsync: vi.fn().mockResolvedValue(undefined),
    };

    await installPyodideRuntimeCompatibility(pyodide);

    expect(pyodide.runPythonAsync.mock.calls[0][0]).toContain(
      "_h5p_os.environ['SDL_EMSCRIPTEN_KEYBOARD_ELEMENT'] = '#h5p-pyodide-sdl-canvas'",
    );
  });

  it('asyncifies sync helper functions that call input() in the Pyodide input transformer', async () => {
    const pyodide = {
      runPythonAsync: vi.fn().mockResolvedValue(undefined),
    };

    await installPyodideRuntimeCompatibility(pyodide);

    const compatibilityCode = pyodide.runPythonAsync.mock.calls[0][0];
    expect(compatibilityCode).toContain('discovered_async_function_names');
    expect(compatibilityCode).toContain('visit_FunctionDef');
    expect(compatibilityCode).toContain('_h5p_ast.AsyncFunctionDef');
    expect(compatibilityCode).toContain('node.func.id in self.async_function_names');
  });

  it('reuses one shared Pyodide instance and routes output through the active runtime', async () => {
    const runtimeA = { outputHandler: vi.fn(), inputHandler: vi.fn(() => 'A'), l10n: {} };
    const runtimeB = { outputHandler: vi.fn(), inputHandler: vi.fn(() => 'B'), l10n: {} };

    window.loadPyodide = vi
      .fn()
      .mockImplementation(({ stdout, stderr }) => Promise.resolve({
        globals: { set: vi.fn() },
        runPythonAsync: vi.fn().mockResolvedValue(undefined),
        _stdout: stdout,
        _stderr: stderr,
      }));

    const firstPyodide = await getSharedPyodide({}, runtimeA);
    const secondPyodide = await getSharedPyodide({}, runtimeB);

    expect(firstPyodide).toBe(secondPyodide);
    setActivePyodideRuntime(runtimeA);
    firstPyodide._stdout('first');
    setActivePyodideRuntime(runtimeB);
    secondPyodide._stdout('second');

    expect(runtimeA.outputHandler).toHaveBeenCalledWith('first', true);
    expect(runtimeB.outputHandler).toHaveBeenCalledWith('second', true);
  });

  it('serializes Pyodide execution and binds IO to the owning runtime', async () => {
    const events = [];
    const runtimeA = { outputHandler: vi.fn(), inputHandler: vi.fn(() => 'A'), l10n: {} };
    const runtimeB = { outputHandler: vi.fn(), inputHandler: vi.fn(() => 'B'), l10n: {} };
    const pyodide = {
      globals: { set: vi.fn() },
      runPythonAsync: vi.fn().mockResolvedValue(undefined),
    };
    let releaseFirst;

    const first = queuePyodideExecution(pyodide, runtimeA, async () => {
      events.push('first:start');
      writePyodideRuntimeOutput('A');
      await new Promise((resolve) => {
        releaseFirst = resolve;
      });
      events.push('first:end');
    });
    const second = queuePyodideExecution(pyodide, runtimeB, async () => {
      events.push('second:start');
      writePyodideRuntimeOutput('B');
      events.push('second:end');
    });

    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    releaseFirst();
    await Promise.all([first, second]);

    expect(events).toEqual(['first:start', 'first:end', 'second:start', 'second:end']);
    expect(runtimeA.outputHandler).toHaveBeenCalledWith('A', true);
    expect(runtimeB.outputHandler).toHaveBeenCalledWith('B', true);
    expect(pyodide.globals.set).toHaveBeenCalledWith('input_handler', expect.any(Function));
  });

  it('tracks loaded packages per Pyodide instance', () => {
    const firstPyodide = {};
    const secondPyodide = {};

    getLoadedPyodidePackages(firstPyodide).add('numpy');

    expect(getLoadedPyodidePackages(firstPyodide).has('numpy')).toBe(true);
    expect(getLoadedPyodidePackages(secondPyodide).has('numpy')).toBe(false);
  });

  it('normalizes custom Pyodide script URLs and derived index directories', () => {
    expect(normalizePyodideScriptUrl('https://static.example.com/pyodide/')).toEqual({
      scriptUrl: 'https://static.example.com/pyodide/pyodide.js',
      indexURL: 'https://static.example.com/pyodide/',
    });

    expect(normalizePyodideScriptUrl('https://static.example.com/pyodide/pyodide.js')).toEqual({
      scriptUrl: 'https://static.example.com/pyodide/pyodide.js',
      indexURL: 'https://static.example.com/pyodide/',
    });
  });

  it('caches concrete wheels but leaves PyPI release metadata fresh', () => {
    const pyodideUrl = 'https://cdn.example.com/pyodide/pyodide.js';

    expect(shouldCachePyodideFetch(
      'https://files.pythonhosted.org/packages/aa/bb/miniworlds-3.6.0-py3-none-any.whl',
      pyodideUrl,
    )).toBe(true);
    expect(shouldCachePyodideFetch(
      'https://content.example.com/packages/miniworlds-3.6.0-py3-none-any.whl',
      pyodideUrl,
    )).toBe(true);
    expect(shouldCachePyodideFetch('https://pypi.org/simple/miniworlds/', pyodideUrl)).toBe(false);
    expect(shouldCachePyodideFetch('https://pypi.org/pypi/miniworlds/json', pyodideUrl)).toBe(false);
  });

  it('updates the persistent fetch cache filter for every configured Pyodide CDN origin', async () => {
    const originalFetch = window.fetch;
    const originalCaches = window.caches;
    const nativeFetch = vi.fn(async () => new Response('ok', { status: 200 }));
    const cache = {
      match: vi.fn(async () => null),
      put: vi.fn(async () => undefined),
    };

    window.fetch = nativeFetch;
    window.caches = {
      open: vi.fn(async () => cache),
    };
    window.loadPyodide = vi.fn().mockResolvedValue({
      globals: { set: vi.fn() },
      runPythonAsync: vi.fn().mockResolvedValue(undefined),
    });

    await getSharedPyodide({ pyodideCdnUrl: 'https://cdn-a.example.com/pyodide/' }, { l10n: {} });
    await getSharedPyodide({ pyodideCdnUrl: 'https://cdn-b.example.com/pyodide/' }, { l10n: {} });
    await window.fetch('https://cdn-b.example.com/pyodide/python_stdlib.zip');

    expect(window.caches.open).toHaveBeenCalled();
    expect(cache.match).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://cdn-b.example.com/pyodide/python_stdlib.zip',
    }));

    window.fetch = originalFetch;
    window.caches = originalCaches;
  });

  it('deduplicates concurrent persistent-cache misses for the same Pyodide asset', async () => {
    const originalFetch = window.fetch;
    const originalCaches = window.caches;
    const nativeFetch = vi.fn(async () => new Response('runtime asset', { status: 200 }));
    const cache = {
      match: vi.fn(async () => null),
      put: vi.fn(async () => undefined),
    };

    window.fetch = nativeFetch;
    window.caches = {
      open: vi.fn(async () => cache),
    };
    window.loadPyodide = vi.fn().mockResolvedValue({
      globals: { set: vi.fn() },
      runPythonAsync: vi.fn().mockResolvedValue(undefined),
    });

    await getSharedPyodide({ pyodideCdnUrl: 'https://cdn.example.com/pyodide/' }, { l10n: {} });

    const url = 'https://cdn.example.com/pyodide/python_stdlib.zip';
    const [first, second] = await Promise.all([
      window.fetch(url).then((response) => response.text()),
      window.fetch(url).then((response) => response.text()),
    ]);

    expect(first).toBe('runtime asset');
    expect(second).toBe('runtime asset');
    expect(nativeFetch).toHaveBeenCalledTimes(1);
    expect(cache.put).toHaveBeenCalledTimes(1);

    window.fetch = originalFetch;
    window.caches = originalCaches;
  });

  it('precaches core runtime companions, Pyodide package wheels, and Miniworlds family wheels', async () => {
    const originalFetch = window.fetch;
    const fetchedUrls = [];
    const lock = {
      packages: {
        numpy: { file_name: 'numpy-test.whl' },
        'pygame-ce': { file_name: 'pygame-test.whl' },
      },
    };
    window.fetch = vi.fn(async (url) => {
      fetchedUrls.push(String(url));

      if (String(url).includes('/pypi/miniworlds-robot/json')) {
        return {
          ok: true,
          json: async () => ({
            info: { version: '0.1.0' },
            releases: {
              '0.1.0': [{
                packagetype: 'bdist_wheel',
                filename: 'miniworlds_robot-0.1.0-py3-none-any.whl',
                url: 'https://files.pythonhosted.org/packages/miniworlds_robot-0.1.0-py3-none-any.whl',
              }],
            },
          }),
        };
      }

      if (String(url).includes('/pypi/miniworlds/json')) {
        return {
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
        };
      }

      return {
        ok: true,
        clone: () => ({ json: async () => lock }),
      };
    });

    await precachePyodideAssets({
      pyodideCdnUrl: 'https://static.example.com/pyodide/',
      packages: ['numpy', 'pygame-ce', 'miniworlds-robot'],
      persistentPyodideCache: false,
    });

    expect(fetchedUrls).toEqual(expect.arrayContaining([
      'https://static.example.com/pyodide/pyodide.asm.wasm',
      'https://static.example.com/pyodide/python_stdlib.zip',
      'https://static.example.com/pyodide/numpy-test.whl',
      'https://static.example.com/pyodide/pygame-test.whl',
      'https://files.pythonhosted.org/packages/miniworlds-3.6.0-py3-none-any.whl',
      'https://files.pythonhosted.org/packages/miniworlds_robot-0.1.0-py3-none-any.whl',
    ]));
    expect(fetchedUrls).not.toContain('https://static.example.com/pyodide/pyodide.js');
    window.fetch = originalFetch;
  });

  it('reuses a fresh cached Miniworlds wheel URL without another PyPI metadata request', async () => {
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

    await expect(resolveLatestMiniworldsWheel()).resolves.toBe(
      'https://files.pythonhosted.org/packages/miniworlds-3.6.0-py3-none-any.whl',
    );
    resetSharedPyodideRuntimeState();
    await expect(resolveLatestMiniworldsWheel()).resolves.toBe(
      'https://files.pythonhosted.org/packages/miniworlds-3.6.0-py3-none-any.whl',
    );
    expect(window.fetch).toHaveBeenCalledWith(
      'https://pypi.org/pypi/miniworlds/json',
      { cache: 'no-store' },
    );
    expect(window.fetch).toHaveBeenCalledTimes(1);
    window.fetch = originalFetch;
  });

  it('loads a custom Pyodide script URL exactly once', async () => {
    const appendSpy = vi.spyOn(document.head, 'appendChild').mockImplementation((node) => {
      queueMicrotask(() => {
        window.loadPyodide = vi.fn();
        node.onload?.();
      });

      return node;
    });

    await ensurePyodideScript('https://static.example.com/pyodide/pyodide.js');

    expect(appendSpy).toHaveBeenCalledTimes(1);
    expect(appendSpy.mock.calls[0][0].src).toBe('https://static.example.com/pyodide/pyodide.js');

    appendSpy.mockRestore();
  });

  it('rejects and resets the script-load promise when Pyodide script loading fails', async () => {
    const appendSpy = vi.spyOn(document.head, 'appendChild').mockImplementation((node) => {
      queueMicrotask(() => {
        node.onerror?.();
      });

      return node;
    });

    await expect(ensurePyodideScript('https://static.example.com/missing/pyodide.js'))
      .rejects.toThrow('Failed to load Pyodide script: https://static.example.com/missing/pyodide.js');

    expect(sharedPyodideRuntimeState.loadPyodidePromise).toBeNull();
    appendSpy.mockRestore();
  });

  it('rejects and resets the script-load promise when the script does not expose loadPyodide', async () => {
    const appendSpy = vi.spyOn(document.head, 'appendChild').mockImplementation((node) => {
      queueMicrotask(() => {
        node.onload?.();
      });

      return node;
    });

    await expect(ensurePyodideScript('https://static.example.com/pyodide/pyodide.js'))
      .rejects.toThrow('Pyodide script loaded but loadPyodide() was not found.');

    expect(sharedPyodideRuntimeState.loadPyodidePromise).toBeNull();
    appendSpy.mockRestore();
  });

  it('passes the derived indexURL when creating a shared Pyodide instance', async () => {
    const runtime = { outputHandler: vi.fn(), inputHandler: vi.fn(() => 'A'), l10n: {} };

    window.loadPyodide = vi
      .fn()
      .mockImplementation(({ stdout, stderr }) => Promise.resolve({
        globals: { set: vi.fn() },
        runPythonAsync: vi.fn().mockResolvedValue(undefined),
        _stdout: stdout,
        _stderr: stderr,
      }));

    await getSharedPyodide({ pyodideCdnUrl: 'https://static.example.com/pyodide/' }, runtime);

    expect(window.loadPyodide).toHaveBeenCalledWith(expect.objectContaining({
      indexURL: 'https://static.example.com/pyodide/',
    }));
  });

  it('keeps shared Pyodide instances separated by indexURL', async () => {
    const runtime = { outputHandler: vi.fn(), inputHandler: vi.fn(() => 'A'), l10n: {} };
    const first = {
      globals: { set: vi.fn() },
      runPythonAsync: vi.fn().mockResolvedValue(undefined),
    };
    const second = {
      globals: { set: vi.fn() },
      runPythonAsync: vi.fn().mockResolvedValue(undefined),
    };

    window.loadPyodide = vi
      .fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);

    await expect(getSharedPyodide({ pyodideCdnUrl: 'https://cdn-a.example.com/pyodide/' }, runtime))
      .resolves.toBe(first);
    await expect(getSharedPyodide({ pyodideCdnUrl: 'https://cdn-b.example.com/pyodide/' }, runtime))
      .resolves.toBe(second);

    expect(window.loadPyodide).toHaveBeenCalledTimes(2);
  });

  it('warms Python imports for safe loaded packages, mapping installable names back to import names', async () => {
    const pyodide = { runPythonAsync: vi.fn().mockResolvedValue(undefined) };

    await warmPyodidePackageImports(pyodide, ['numpy', { package: 'pygame-ce' }, 'miniworlds-data']);

    expect(pyodide.runPythonAsync).toHaveBeenCalledTimes(1);
    const code = pyodide.runPythonAsync.mock.calls[0][0];
    expect(code).toContain('import numpy');
    expect(code).not.toContain('import pygame');
    expect(code).not.toContain('import miniworlds');
  });

  it('skips warming when no configured package maps to a known Python import', async () => {
    const pyodide = { runPythonAsync: vi.fn().mockResolvedValue(undefined) };

    await warmPyodidePackageImports(pyodide, []);

    expect(pyodide.runPythonAsync).not.toHaveBeenCalled();
  });
});
