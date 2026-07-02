import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  loadMissingPyodidePackages,
  resetLoadedPyodidePackages,
} from '../src/scripts/runtime/services/pyodide-package-service.js';
import {
  getLoadedPyodidePackages,
  resetSharedPyodideRuntimeState,
} from '../src/scripts/runtime/services/pyodide-runtime-service.js';

describe('Pyodide package service', () => {
  beforeEach(() => {
    resetSharedPyodideRuntimeState();
    resetLoadedPyodidePackages();
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
      install: vi.fn(async () => {}),
      destroy: vi.fn(),
    };
    const pyodide = {
      loadPackage: vi.fn(async () => {}),
      pyimport: vi.fn(() => micropip),
    };

    await loadMissingPyodidePackages(pyodide, ['numpy', 'miniworlds', 'numpy']);

    expect(pyodide.loadPackage).toHaveBeenNthCalledWith(1, ['numpy', 'pygame-ce']);
    expect(pyodide.loadPackage).toHaveBeenNthCalledWith(2, ['micropip']);
    expect(micropip.install).toHaveBeenCalledWith([
      'https://files.pythonhosted.org/packages/miniworlds-3.6.0-py3-none-any.whl',
    ]);
    expect(getLoadedPyodidePackages(pyodide).has('numpy')).toBe(true);
    expect(getLoadedPyodidePackages(pyodide).has('micropip')).toBe(true);
    expect(getLoadedPyodidePackages(pyodide).has('miniworlds')).toBe(true);
    expect(getLoadedPyodidePackages(pyodide).has('pygame-ce')).toBe(true);

    await loadMissingPyodidePackages(pyodide, ['numpy', 'miniworlds']);

    expect(pyodide.loadPackage).toHaveBeenCalledTimes(2);
    expect(micropip.install).toHaveBeenCalledTimes(1);
    window.fetch = originalFetch;
  });

  it('installs Miniworlds extension packages through resolved PyPI wheels', async () => {
    const originalFetch = window.fetch;
    window.fetch = vi.fn(async (url) => {
      const packageName = String(url).match(/\/pypi\/([^/]+)\/json/)?.[1] || 'unknown';

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
      install: vi.fn(async () => {}),
      destroy: vi.fn(),
    };
    const pyodide = {
      loadPackage: vi.fn(async () => {}),
      pyimport: vi.fn(() => micropip),
    };

    await loadMissingPyodidePackages(pyodide, ['miniworlds-robot', 'miniworlds-turtle']);

    expect(pyodide.loadPackage).toHaveBeenNthCalledWith(1, ['numpy', 'pygame-ce']);
    expect(pyodide.loadPackage).toHaveBeenNthCalledWith(2, ['micropip']);
    expect(micropip.install).toHaveBeenCalledWith([
      'https://files.pythonhosted.org/packages/miniworlds-robot-0.1.0-py3-none-any.whl',
      'https://files.pythonhosted.org/packages/miniworlds-0.1.0-py3-none-any.whl',
      'https://files.pythonhosted.org/packages/miniworlds-turtle-0.1.0-py3-none-any.whl',
    ]);
    expect(getLoadedPyodidePackages(pyodide).has('miniworlds-robot')).toBe(true);
    expect(getLoadedPyodidePackages(pyodide).has('miniworlds-turtle')).toBe(true);
    expect(getLoadedPyodidePackages(pyodide).has('miniworlds')).toBe(true);
    window.fetch = originalFetch;
  });

  it('does not reuse the loaded package registry across Pyodide instances', async () => {
    const createMicropip = () => ({
      install: vi.fn(async () => {}),
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
