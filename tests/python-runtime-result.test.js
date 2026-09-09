import { describe, expect, it } from 'vitest';

import {
  createPythonRuntimeError,
  createPythonRuntimeResult,
  formatPythonRuntimeError,
} from '../src/scripts/runtime/python-runtime-result.js';

describe('Python runtime result exports', () => {
  it('re-exports the shared runtime result helpers under Python-specific names', () => {
    expect(createPythonRuntimeResult({
      stdout: 'ok',
      exitCode: '0',
    })).toEqual(expect.objectContaining({
      stdout: 'ok',
      exitCode: 0,
    }));

    const error = createPythonRuntimeError({
      message: 'NameError',
      diagnostics: ['line 2'],
    });

    expect(error).toEqual(expect.objectContaining({
      message: 'NameError',
      exitCode: 1,
    }));
    expect(formatPythonRuntimeError(error)).toBe('NameError\nline 2');
  });
});
