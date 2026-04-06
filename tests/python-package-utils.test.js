import { describe, expect, it } from 'vitest';

import {
  extractWheelPackageName,
  getImportedPythonPackages,
  getPythonPackageDependencies,
  normalizePythonPackageEntries,
  splitPythonPackages,
} from '../src/scripts/services/python-package-utils.js';

describe('Python package utils', () => {
  it('normalizes and de-duplicates mixed package entries', () => {
    expect(normalizePythonPackageEntries([
      'numpy',
      'miniworlds',
      { package: 'pygame-ce' },
      { package: { value: 'sqlite3' } },
      { value: 'numpy' },
      { package: '   ' },
    ])).toEqual(['numpy', 'miniworlds', 'pygame-ce', 'sqlite3']);
  });

  it('detects installable packages from import statements', () => {
    expect(getImportedPythonPackages(`
import numpy
from pygame import display
from PIL import Image
import numpy.linalg
    `)).toEqual(['numpy', 'pygame-ce', 'pillow']);
  });

  it('ignores local modules when resolving installable packages', () => {
    expect(getImportedPythonPackages(`
import numpy
import helper
from helper import value
    `, {
      localModuleNames: ['helper'],
    })).toEqual(['numpy']);
  });

  it('splits packages by installer and exposes dependency packages', () => {
    expect(splitPythonPackages(['miniworlds'])).toEqual({
      pyodidePackages: ['numpy', 'pygame-ce'],
      micropipPackages: ['miniworlds'],
    });
    expect(getPythonPackageDependencies('miniworlds')).toEqual(['numpy', 'pygame-ce']);
  });

  describe('extractWheelPackageName', () => {
    it('extracts the distribution name from a wheel URL', () => {
      expect(extractWheelPackageName(
        'http://localhost:8081/miniworlds-3.5.0.3-py3-none-any.whl',
      )).toBe('miniworlds');
    });

    it('extracts the distribution name from a plain wheel filename', () => {
      expect(extractWheelPackageName('pygame_ce-2.5.6-cp313-cp313-emscripten_3_1_58_wasm32.whl')).toBe('pygame_ce');
    });

    it('returns null for a regular package name', () => {
      expect(extractWheelPackageName('miniworlds')).toBeNull();
    });

    it('returns null for an empty string', () => {
      expect(extractWheelPackageName('')).toBeNull();
    });

    it('returns null for a non-wheel URL', () => {
      expect(extractWheelPackageName('http://localhost:8081/miniworlds.tar.gz')).toBeNull();
    });
  });
});
