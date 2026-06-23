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
  resetSharedPyodideRuntimeState,
  resolveLatestMiniworldsWheel,
  setPyodideExecutionLimit,
  setActivePyodideRuntime,
  setActivePyodideSDLCanvas,
  sharedPyodideRuntimeState,
  shouldCachePyodideFetch,
  writePyodideRuntimeOutput,
} from '../src/scripts/runtime/services/pyodide-runtime-service.js';

describe('Pyodide runtime service', () => {
  beforeEach(() => {
    resetSharedPyodideRuntimeState();
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

  it('precaches the core runtime and configured Pyodide package wheels', async () => {
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
      return {
        ok: true,
        clone: () => ({ json: async () => lock }),
      };
    });

    await precachePyodideAssets({
      pyodideCdnUrl: 'https://static.example.com/pyodide/',
      packages: ['numpy', 'pygame-ce'],
      persistentPyodideCache: false,
    });

    expect(fetchedUrls).toEqual(expect.arrayContaining([
      'https://static.example.com/pyodide/pyodide.js',
      'https://static.example.com/pyodide/pyodide.asm.wasm',
      'https://static.example.com/pyodide/python_stdlib.zip',
      'https://static.example.com/pyodide/numpy-test.whl',
      'https://static.example.com/pyodide/pygame-test.whl',
    ]));
    window.fetch = originalFetch;
  });

  it('resolves the newest versioned Miniworlds wheel without caching PyPI metadata', async () => {
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
    expect(window.fetch).toHaveBeenCalledWith(
      'https://pypi.org/pypi/miniworlds/json',
      { cache: 'no-store' },
    );
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
});
