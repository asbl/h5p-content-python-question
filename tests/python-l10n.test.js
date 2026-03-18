import { beforeEach, describe, expect, it } from 'vitest';

import {
  createPythonL10n,
  getPythonL10nValue,
  tPython,
} from '../src/scripts/services/python-l10n.js';

describe('Python localization', () => {
  beforeEach(() => {
    H5P.t.mockImplementation((key, _params, library) => `[Missing translation ${library}:${key}]`);
  });

  it('prefers explicit overrides over fallback translations', () => {
    const l10n = createPythonL10n({ pyodideReady: 'Pyodide bereit.' }, { pyodideReady: 'Fallback' });

    expect(l10n.pyodideReady).toBe('Pyodide bereit.');
  });

  it('uses H5P library translations when they are available', () => {
    H5P.t.mockImplementation((key, _params, library) => (
      key === 'pyodideReady'
        ? 'Library ready'
        : `[Missing translation ${library}:${key}]`
    ));

    expect(getPythonL10nValue({}, 'pyodideReady')).toBe('Library ready');
  });

  it('falls back to parent localization when neither override nor library string exists', () => {
    const l10n = createPythonL10n({}, { customKey: 'From parent' });

    expect(l10n.customKey).toBe('From parent');
  });

  it('formats placeholders in localized strings', () => {
    expect(tPython(
      { pyodideScriptLoadFailed: 'Failed to load {url}' },
      'pyodideScriptLoadFailed',
      { url: 'https://example.test/pyodide.js' },
    )).toBe('Failed to load https://example.test/pyodide.js');
  });
});