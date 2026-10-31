import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BUNDLED_MINIWORLDS_WHEEL_URL,
  installBundledMiniworldsWheel,
} from '../src/scripts/runtime/services/pyodide-bundled-miniworlds-service';

afterEach(() => vi.unstubAllGlobals());

describe('bundled Miniworlds wheel', () => {
  it('stages the shipped wheel under its valid micropip filename', async () => {
    const bytes = new Uint8Array([80, 75, 3, 4]);
    const fetchMock = vi.fn(async () => ({ ok: true, arrayBuffer: async () => bytes.buffer }));
    vi.stubGlobal('fetch', fetchMock);
    const pyodide = { FS: { writeFile: vi.fn(), analyzePath: () => ({ exists: false }) } };
    const options = { packageUrls: { miniworlds: BUNDLED_MINIWORLDS_WHEEL_URL } };

    await installBundledMiniworldsWheel(pyodide, options, ['miniworlds']);

    expect(fetchMock).toHaveBeenCalledWith(BUNDLED_MINIWORLDS_WHEEL_URL);
    expect(pyodide.FS.writeFile).toHaveBeenCalledWith('/tmp/miniworlds-4.4.0.7-py3-none-any.whl', bytes);
    expect(options.packageUrls.miniworlds).toBe('emfs:/tmp/miniworlds-4.4.0.7-py3-none-any.whl');
  });

  it('reuses a wheel already staged in the shared runtime', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const pyodide = { FS: { writeFile: vi.fn(), analyzePath: () => ({ exists: true }) } };
    const options = { packageUrls: { miniworlds: BUNDLED_MINIWORLDS_WHEEL_URL } };

    await installBundledMiniworldsWheel(pyodide, options, ['miniworlds-robot']);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(pyodide.FS.writeFile).not.toHaveBeenCalled();
    expect(options.packageUrls.miniworlds).toMatch(/^emfs:.*\.whl$/);
  });

  it('preserves an explicitly configured wheel', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const pyodide = { FS: { writeFile: vi.fn() } };
    const options = { packageUrls: { miniworlds: 'https://example.com/custom.whl' } };

    await installBundledMiniworldsWheel(pyodide, options, ['miniworlds']);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(options.packageUrls.miniworlds).toBe('https://example.com/custom.whl');
  });

  it('reports missing wheel assets without falling back to an older release', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })));
    const pyodide = { FS: { writeFile: vi.fn() } };
    const options = { packageUrls: { miniworlds: BUNDLED_MINIWORLDS_WHEEL_URL } };

    await expect(installBundledMiniworldsWheel(pyodide, options, ['miniworlds'])).rejects.toThrow('404');
    expect(pyodide.FS.writeFile).not.toHaveBeenCalled();
    expect(options.packageUrls.miniworlds).toBe(BUNDLED_MINIWORLDS_WHEEL_URL);
  });

  it('does not download Miniworlds for unrelated Python programs', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const pyodide = { FS: { writeFile: vi.fn() } };
    const options = { packageUrls: { miniworlds: BUNDLED_MINIWORLDS_WHEEL_URL } };

    await installBundledMiniworldsWheel(pyodide, options, ['numpy']);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(options.packageUrls.miniworlds).toBe(BUNDLED_MINIWORLDS_WHEEL_URL);
  });
});
