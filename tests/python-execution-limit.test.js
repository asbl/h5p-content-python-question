import { describe, expect, it } from 'vitest';

import { normalizePythonExecutionLimit } from '../src/scripts/services/python-execution-limit.js';

describe('Python execution limit normalization', () => {
  it('returns 0 for undefined, null, empty, or non-numeric values', () => {
    expect(normalizePythonExecutionLimit(undefined)).toBe(0);
    expect(normalizePythonExecutionLimit(null)).toBe(0);
    expect(normalizePythonExecutionLimit('')).toBe(0);
    expect(normalizePythonExecutionLimit('abc')).toBe(0);
  });

  it('returns 0 for zero and negative values', () => {
    expect(normalizePythonExecutionLimit(0)).toBe(0);
    expect(normalizePythonExecutionLimit(-1)).toBe(0);
    expect(normalizePythonExecutionLimit('-5')).toBe(0);
  });

  it('floors positive numeric values', () => {
    expect(normalizePythonExecutionLimit(1234.9)).toBe(1234);
    expect(normalizePythonExecutionLimit('999.8')).toBe(999);
  });

  it('preserves large finite integers', () => {
    expect(normalizePythonExecutionLimit(5000)).toBe(5000);
  });

  it('returns 0 for infinite values', () => {
    expect(normalizePythonExecutionLimit(Infinity)).toBe(0);
    expect(normalizePythonExecutionLimit(-Infinity)).toBe(0);
  });
});
