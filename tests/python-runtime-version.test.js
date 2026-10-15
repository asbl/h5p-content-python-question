import { describe, expect, it } from 'vitest';

import { PYODIDE_PYTHON_VERSION } from '../src/scripts/services/python-runtime-version.js';
import { normalizePyodideScriptUrl } from '../src/scripts/runtime/services/pyodide-runtime-service.js';

describe('Python runtime version', () => {
  it('matches the CPython version bundled by the pinned Pyodide release', () => {
    // Pyodide 0.29.x bundles CPython 3.13. If the Pyodide CDN URL below is
    // ever bumped to a release bundling a different CPython version,
    // PYODIDE_PYTHON_VERSION must be updated alongside it, or Pyrefly will
    // type-check against the wrong Python version.
    const { scriptUrl } = normalizePyodideScriptUrl();
    expect(scriptUrl).toContain('/pyodide/v0.29.');
    expect(PYODIDE_PYTHON_VERSION).toBe('3.13');
  });
});
