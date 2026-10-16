import { describe, expect, it } from 'vitest';

import {
  DEFAULT_RUFF_SETTINGS,
  getOffsetFromRuffLocation,
  getPythonRuffInlineDiagnostics,
  mapRuffDiagnosticsToInlineDiagnostics,
  shouldShowRuffDiagnostic,
} from '../src/scripts/services/python-ruff-diagnostics.js';
import { PYODIDE_PYTHON_VERSION } from '../src/scripts/services/python-runtime-version.js';

describe('Python Ruff diagnostics', () => {
  it('targets the same Python version Pyodide actually runs', () => {
    expect(DEFAULT_RUFF_SETTINGS['target-version']).toBe(`py${PYODIDE_PYTHON_VERSION.replace('.', '')}`);
  });

  it('converts Ruff locations to string offsets', () => {
    const code = 'first\nsecond\nthird';

    expect(getOffsetFromRuffLocation(code, { row: 1, column: 2 })).toBe(2);
    expect(getOffsetFromRuffLocation(code, { row: 2, column: 3 })).toBe('first\n'.length + 3);
    expect(getOffsetFromRuffLocation(code, { row: 99, column: 5 })).toBe(code.length);
  });

  it('filters self and cls annotation noise', () => {
    expect(shouldShowRuffDiagnostic({
      code: 'ANN001',
      message: 'Missing type annotation for function argument `self`',
    })).toBe(false);

    expect(shouldShowRuffDiagnostic({
      code: 'ANN001',
      message: 'Missing type annotation for function argument `guess`',
    })).toBe(true);
  });

  it('maps Ruff diagnostics to CodeMirror inline diagnostics with an offset', () => {
    const code = 'def check(self, guess):\n    return True\n';
    const diagnostics = mapRuffDiagnosticsToInlineDiagnostics(code, [
      {
        code: 'ANN001',
        message: 'Missing type annotation for function argument `self`',
        start_location: { row: 1, column: 10 },
        end_location: { row: 1, column: 14 },
      },
      {
        code: 'ANN001',
        message: 'Missing type annotation for function argument `guess`',
        start_location: { row: 1, column: 16 },
        end_location: { row: 1, column: 21 },
      },
    ], 7);

    expect(diagnostics).toEqual([
      expect.objectContaining({
        from: 23,
        to: 28,
        severity: 'warning',
        message: 'Missing type annotation for function argument `guess`',
        source: 'ruff',
        code: 'ANN001',
      }),
    ]);
  });

  it('sorts mapped diagnostics by editor position for CodeMirror decorations', () => {
    const code = 'def check(guess):\n    return True\n';
    const diagnostics = mapRuffDiagnosticsToInlineDiagnostics(code, [
      {
        code: 'ANN001',
        message: 'Missing type annotation for function argument `guess`',
        start_location: { row: 1, column: 11 },
        end_location: { row: 1, column: 16 },
      },
      {
        code: 'ANN201',
        message: 'Missing return type annotation for public function `check`',
        start_location: { row: 1, column: 5 },
        end_location: { row: 1, column: 10 },
      },
    ]);

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual(['ANN201', 'ANN001']);
  });

  it('uses an injected Ruff-compatible workspace for async analysis', async () => {
    const workspace = {
      check: (code) => [{
        code: 'ANN201',
        message: 'Missing return type annotation for public function `check`',
        start_location: { row: 1, column: 4 },
        end_location: { row: 1, column: 9 },
      }],
    };

    const diagnostics = await getPythonRuffInlineDiagnostics('def check():\n    pass\n', {
      offset: 3,
      getWorkspace: () => workspace,
    });

    expect(diagnostics).toEqual([
      expect.objectContaining({
        from: 7,
        to: 12,
        message: 'Missing return type annotation for public function `check`',
      }),
    ]);
  });
});
