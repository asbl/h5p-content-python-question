import { describe, expect, it, vi } from 'vitest';

import {
  getOffsetFromPyreflyLocation,
  getPythonPyreflyInlineDiagnostics,
  mapPyreflyDiagnosticsToInlineDiagnostics,
  shouldShowPyreflyDiagnostic,
} from '../src/scripts/services/python-pyrefly-diagnostics.js';

describe('Python Pyrefly diagnostics', () => {
  it('converts Pyrefly locations to string offsets', () => {
    const code = 'first\nsecond\nthird';

    expect(getOffsetFromPyreflyLocation(code, { line: 1, column: 3 })).toBe(2);
    expect(getOffsetFromPyreflyLocation(code, { line: 2, column: 4 })).toBe('first\n'.length + 3);
    expect(getOffsetFromPyreflyLocation(code, { line: 99, column: 5 })).toBe(code.length);
  });

  it('filters unresolved-import noise but keeps real type errors', () => {
    expect(shouldShowPyreflyDiagnostic({
      kind: 'missing-import',
      severity: 8,
      message_header: 'Cannot find module `miniworlds`',
    })).toBe(false);

    expect(shouldShowPyreflyDiagnostic({
      kind: 'missing-module-attribute',
      severity: 8,
      message_header: 'No attribute `foo` in module `bar`',
    })).toBe(false);

    expect(shouldShowPyreflyDiagnostic({
      kind: 'bad-return',
      severity: 8,
      message_header: 'Returned type `str` is not assignable to declared return type `int`',
    })).toBe(true);
  });

  it('filters Pyrefly "ignore"-severity hints, e.g. unused-import cascading from an unresolved import', () => {
    // Confirmed against the real compiled pyrefly_wasm: an unresolved import
    // also produces a severity-1 "may be unused" hint, which is misleading
    // here since the import is in fact used, just not resolvable.
    expect(shouldShowPyreflyDiagnostic({
      kind: 'unused-import',
      severity: 1,
      message_header: 'Import `miniworlds` may be unused',
    })).toBe(false);

    expect(shouldShowPyreflyDiagnostic({
      kind: 'unused-parameter',
      severity: 1,
      message_header: 'Parameter `guess` is unused',
    })).toBe(false);
  });

  it('maps Pyrefly diagnostics to CodeMirror inline diagnostics with an offset', () => {
    const code = 'def check(guess: str) -> int:\n    return guess\n';
    const diagnostics = mapPyreflyDiagnosticsToInlineDiagnostics(code, [
      {
        startLineNumber: 2,
        startColumn: 12,
        endLineNumber: 2,
        endColumn: 17,
        message_header: 'Returned type `str` is not assignable to declared return type `int`',
        kind: 'bad-return',
        severity: 8,
        filename: 'main.py',
      },
    ], 7);

    expect(diagnostics).toEqual([
      expect.objectContaining({
        from: 48,
        to: 53,
        severity: 'error',
        message: 'Returned type `str` is not assignable to declared return type `int`',
        source: 'pyrefly',
        code: 'bad-return',
      }),
    ]);
  });

  it('maps non-error severities to the warning label', () => {
    const code = 'x = 1\n';
    const diagnostics = mapPyreflyDiagnosticsToInlineDiagnostics(code, [
      {
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 2,
        message_header: 'Some informational note',
        kind: 'some-kind',
        severity: 2,
      },
    ]);

    expect(diagnostics).toEqual([
      expect.objectContaining({ severity: 'warning' }),
    ]);
  });

  it('sorts mapped diagnostics by editor position for CodeMirror decorations', () => {
    const code = 'def check(guess):\n    return guess\n';
    const diagnostics = mapPyreflyDiagnosticsToInlineDiagnostics(code, [
      {
        startLineNumber: 2,
        startColumn: 12,
        endLineNumber: 2,
        endColumn: 17,
        message_header: 'second',
        kind: 'bad-return',
        severity: 8,
      },
      {
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 4,
        message_header: 'first',
        kind: 'bad-function-definition',
        severity: 8,
      },
    ]);

    expect(diagnostics.map((diagnostic) => diagnostic.message)).toEqual(['first', 'second']);
  });

  it('uses an injected Pyrefly-compatible state for async analysis', async () => {
    const state = {
      updateSandboxFiles: () => {},
      setActiveFile: () => {},
      getErrors: () => [{
        startLineNumber: 1,
        startColumn: 5,
        endLineNumber: 1,
        endColumn: 10,
        message_header: 'Bad argument type',
        kind: 'bad-argument-type',
        severity: 8,
        filename: 'main.py',
      }],
    };

    const diagnostics = await getPythonPyreflyInlineDiagnostics('def check():\n    pass\n', {
      offset: 3,
      getState: () => state,
    });

    expect(diagnostics).toEqual([
      expect.objectContaining({
        from: 3 + 4,
        to: 3 + 9,
        message: 'Bad argument type',
      }),
    ]);
  });

  it('sends sibling workspace files into the sandbox so cross-file imports resolve', async () => {
    const state = {
      updateSandboxFiles: vi.fn(),
      setActiveFile: vi.fn(),
      getErrors: () => [],
    };

    await getPythonPyreflyInlineDiagnostics('from helper import add\n', {
      getState: () => state,
      activeFileName: 'main.py',
      workspaceFiles: [
        { name: 'main.py', code: 'stale snapshot, live code param should win' },
        { name: 'helper.py', code: 'def add(a: int, b: int) -> int:\n    return a + b\n' },
      ],
    });

    expect(state.updateSandboxFiles).toHaveBeenCalledWith({
      'helper.py': 'def add(a: int, b: int) -> int:\n    return a + b\n',
      'main.py': 'from helper import add\n',
    }, true);
    expect(state.setActiveFile).toHaveBeenCalledWith('main.py');
  });

  it('filters out diagnostics Pyrefly reports for sibling files, not the active one', async () => {
    // getErrors() returns diagnostics for every sandboxed file; a sibling
    // file's diagnostic must not get mapped against the active file's source.
    const state = {
      updateSandboxFiles: () => {},
      setActiveFile: () => {},
      getErrors: () => [
        {
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: 1,
          endColumn: 2,
          message_header: 'Error in helper.py',
          kind: 'bad-return',
          severity: 8,
          filename: 'helper.py',
        },
        {
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: 1,
          endColumn: 2,
          message_header: 'Error in main.py',
          kind: 'bad-return',
          severity: 8,
          filename: 'main.py',
        },
      ],
    };

    const diagnostics = await getPythonPyreflyInlineDiagnostics('x\n', {
      getState: () => state,
      activeFileName: 'main.py',
      workspaceFiles: [{ name: 'helper.py', code: 'y\n' }],
    });

    expect(diagnostics.map((diagnostic) => diagnostic.message)).toEqual(['Error in main.py']);
  });
});
