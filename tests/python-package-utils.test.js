import { describe, expect, it } from 'vitest';

import {
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
import miniworlds_robot
import miniworlds_turtle as turtle
import miniworlds_data
    `)).toEqual(['numpy', 'pygame-ce', 'pillow', 'miniworlds-robot', 'miniworlds-turtle', 'miniworlds-data']);
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
    expect(splitPythonPackages(['miniworlds-robot', 'miniworlds-turtle'])).toEqual({
      pyodidePackages: ['numpy', 'pygame-ce'],
      micropipPackages: ['miniworlds-robot', 'miniworlds', 'miniworlds-turtle'],
    });
    expect(splitPythonPackages(['miniworlds-data'])).toEqual({
      pyodidePackages: ['numpy', 'pygame-ce'],
      micropipPackages: ['miniworlds-data', 'miniworlds'],
    });
    expect(getPythonPackageDependencies('miniworlds-robot')).toEqual(['miniworlds']);
    expect(getPythonPackageDependencies('miniworlds-turtle')).toEqual(['miniworlds']);
    expect(getPythonPackageDependencies('miniworlds-data')).toEqual(['miniworlds']);
    expect(getPythonPackageDependencies('miniworlds')).toEqual(['numpy', 'pygame-ce']);
  });
});
