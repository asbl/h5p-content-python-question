import { describe, expect, it } from 'vitest';

import {
  PYTHON_PACKAGE_SETS,
  getPythonPackageSetPackages,
  normalizePythonPackageSetName,
} from '../src/scripts/services/python-package-sets';

describe('python package sets', () => {
  it('normalizes known and unknown set names', () => {
    expect(normalizePythonPackageSetName('science')).toBe('science');
    expect(normalizePythonPackageSetName('none')).toBe('none');
    expect(normalizePythonPackageSetName('everything')).toBe('none');
    expect(normalizePythonPackageSetName(undefined)).toBe('none');
    expect(normalizePythonPackageSetName(null)).toBe('none');
  });

  it('returns the packages of each curated set', () => {
    expect(getPythonPackageSetPackages('basic')).toEqual(['numpy']);
    expect(getPythonPackageSetPackages('data')).toEqual(['numpy', 'pandas']);
    expect(getPythonPackageSetPackages('science')).toEqual(['numpy', 'scipy', 'sympy']);
    expect(getPythonPackageSetPackages('graphics')).toEqual(['numpy', 'pillow', 'matplotlib']);
    expect(getPythonPackageSetPackages('games')).toEqual(['pygame-ce', 'miniworlds']);
    expect(getPythonPackageSetPackages('none')).toEqual([]);
    expect(getPythonPackageSetPackages('bogus')).toEqual([]);
  });

  it('keeps the set definitions immutable', () => {
    expect(Object.isFrozen(PYTHON_PACKAGE_SETS)).toBe(true);
    Object.values(PYTHON_PACKAGE_SETS).forEach((packages) => {
      expect(Object.isFrozen(packages)).toBe(true);
    });
    expect(() => { PYTHON_PACKAGE_SETS.basic.push('x'); }).toThrow();
  });
});
