import { describe, expect, it } from 'vitest';

import {
  getImportedPythonPackages,
  getPythonPackageUrlMap,
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

  it('extracts direct package URLs from package entries and maps', () => {
    expect(getPythonPackageUrlMap([
      { package: 'miniworlds', url: ' https://static.example.com/miniworlds.whl ' },
      { package: { value: 'miniworlds-robot', wheelUrl: 'https://static.example.com/robot.whl' } },
      { value: 'numpy', url: 'https://static.example.com/ignored.whl' },
      { package: 'pygame-ce' },
    ], {
      'miniworlds-turtle': 'https://static.example.com/turtle.whl',
    })).toEqual({
      miniworlds: 'https://static.example.com/miniworlds.whl',
      'miniworlds-robot': 'https://static.example.com/robot.whl',
      numpy: 'https://static.example.com/ignored.whl',
      'miniworlds-turtle': 'https://static.example.com/turtle.whl',
    });
  });

  it('detects installable packages from import statements', () => {
    expect(getImportedPythonPackages(`
import numpy
import pandas as pd, scipy.stats
from pygame import display
from PIL import Image
import numpy.linalg
import miniworlds_robot
import miniworlds_turtle as turtle
import miniworlds_data
    `)).toEqual(['numpy', 'pandas', 'scipy', 'pygame-ce', 'pillow', 'miniworlds-robot', 'miniworlds-turtle', 'miniworlds-data']);
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

  it('ignores import-looking text in comments and strings', () => {
    expect(getImportedPythonPackages(`
# import pandas
text = """import scipy"""
print("from pygame import display")
import numpy
    `)).toEqual(['numpy']);
  });

  it('continues scanning the sanitized source after the first real import', () => {
    expect(getImportedPythonPackages(`
import numpy
text = """
import pandas
from pygame import display
"""
    `)).toEqual(['numpy']);
  });

  it('splits packages by installer and exposes dependency packages', () => {
    expect(splitPythonPackages(['miniworlds-robot', 'miniworlds-turtle'])).toEqual({
      pyodidePackages: ['numpy', 'pygame-ce', 'sqlite3'],
      micropipPackages: ['miniworlds-robot', 'miniworlds', 'miniworlds-turtle'],
    });
    expect(splitPythonPackages(['miniworlds-data'])).toEqual({
      pyodidePackages: ['numpy', 'pygame-ce', 'sqlite3'],
      micropipPackages: ['miniworlds-data', 'miniworlds'],
    });
    expect(getPythonPackageDependencies('miniworlds-robot')).toEqual(['miniworlds']);
    expect(getPythonPackageDependencies('miniworlds-turtle')).toEqual(['miniworlds']);
    expect(getPythonPackageDependencies('miniworlds-data')).toEqual(['miniworlds']);
    expect(getPythonPackageDependencies('miniworlds')).toEqual(['numpy', 'pygame-ce', 'sqlite3']);
  });
});
