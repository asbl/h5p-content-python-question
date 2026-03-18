import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  loadMissingPyodidePackages,
  resetLoadedPyodidePackages,
} from '../src/scripts/runtime/services/pyodide-package-service.js';
import { sharedPyodideRuntimeState } from '../src/scripts/runtime/services/pyodide-runtime-service.js';

describe('Pyodide package service', () => {
  beforeEach(() => {
    resetLoadedPyodidePackages();
  });

  it('loads pyodide and micropip packages only when missing', async () => {
    const micropip = {
      install: vi.fn(async () => {}),
      destroy: vi.fn(),
    };
    const pyodide = {
      loadPackage: vi.fn(async () => {}),
      pyimport: vi.fn(() => micropip),
    };

    await loadMissingPyodidePackages(pyodide, ['numpy', 'miniworlds', 'numpy']);

    expect(pyodide.loadPackage).toHaveBeenNthCalledWith(1, ['numpy']);
    expect(pyodide.loadPackage).toHaveBeenNthCalledWith(2, ['micropip']);
    expect(micropip.install).toHaveBeenCalledWith(['miniworlds']);
    expect(sharedPyodideRuntimeState.loadedPackages.has('numpy')).toBe(true);
    expect(sharedPyodideRuntimeState.loadedPackages.has('micropip')).toBe(true);
    expect(sharedPyodideRuntimeState.loadedPackages.has('miniworlds')).toBe(true);
    expect(sharedPyodideRuntimeState.loadedPackages.has('pygame-ce')).toBe(true);

    await loadMissingPyodidePackages(pyodide, ['numpy', 'miniworlds']);

    expect(pyodide.loadPackage).toHaveBeenCalledTimes(2);
    expect(micropip.install).toHaveBeenCalledTimes(1);
  });
});