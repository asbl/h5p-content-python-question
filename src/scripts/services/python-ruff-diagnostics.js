import { getOffsetFromLineColumn } from './python-diagnostics';
import {
  loadExternalDiagnosticsModule,
  normalizeRuffRuntimeUrl,
} from './python-external-diagnostics-runtime';
import { PYODIDE_PYTHON_VERSION } from './python-runtime-version';

export const DEFAULT_RUFF_SETTINGS = Object.freeze({
  'line-length': 88,
  'indent-width': 4,
  'target-version': `py${PYODIDE_PYTHON_VERSION.replace('.', '')}`,
  lint: {
    select: ['ANN'],
  },
});

const ruffRuntimePromises = new Map();
let ruffWorkspaceCache = new Map();

/**
 * Loads Ruff's browser-friendly WASM glue module from its CDN once per URL,
 * so contents with different CDN overrides each get their own runtime.
 * @param {string} [cdnUrl] Configured Ruff runtime URL or directory.
 * @returns {Promise<{Workspace: Function, PositionEncoding: object}>} Ruff runtime exports.
 */
async function loadRuffRuntime(cdnUrl = '') {
  const runtimeUrl = normalizeRuffRuntimeUrl(cdnUrl);

  if (!ruffRuntimePromises.has(runtimeUrl)) {
    const runtimePromise = loadExternalDiagnosticsModule(runtimeUrl)
      .then(async (runtime) => {
        await runtime.default();
        return runtime;
      });
    ruffRuntimePromises.set(runtimeUrl, runtimePromise);
    runtimePromise.catch(() => ruffRuntimePromises.delete(runtimeUrl));
  }

  return ruffRuntimePromises.get(runtimeUrl);
}

/**
 * Returns a Ruff workspace instance for the given settings and runtime URL,
 * reusing a previously created one for the same combination instead of always
 * returning whichever workspace happened to be built first.
 * @param {object} [settings] Ruff settings.
 * @param {string} [cdnUrl] Configured Ruff runtime URL or directory.
 * @returns {Promise<object>} Ruff workspace.
 */
async function getRuffWorkspace(settings = DEFAULT_RUFF_SETTINGS, cdnUrl = '') {
  const runtimeUrl = normalizeRuffRuntimeUrl(cdnUrl);
  const cacheKey = JSON.stringify([settings, runtimeUrl]);
  if (ruffWorkspaceCache.has(cacheKey)) {
    return ruffWorkspaceCache.get(cacheKey);
  }

  const { Workspace, PositionEncoding } = await loadRuffRuntime(cdnUrl);
  const encoding = PositionEncoding?.UTF16 ?? PositionEncoding?.Utf16 ?? 1;
  const workspace = new Workspace(settings, encoding);
  ruffWorkspaceCache.set(cacheKey, workspace);
  return workspace;
}

/**
 * Converts a 1-based Ruff row and 0-based UTF-16 column into a string offset.
 * @param {string} code Python source.
 * @param {{row: number, column: number}} location Ruff location.
 * @returns {number} Offset in code.
 */
export function getOffsetFromRuffLocation(code = '', location = {}) {
  return getOffsetFromLineColumn(
    code,
    { line: location.row, column: location.column },
    { zeroBasedColumn: true }
  );
}

/**
 * Filters noisy beginner-facing Ruff annotation diagnostics.
 * @param {object} diagnostic Ruff diagnostic.
 * @returns {boolean} True if the diagnostic should be shown.
 */
export function shouldShowRuffDiagnostic(diagnostic = {}) {
  const message = String(diagnostic.message || '');

  if (diagnostic.code === 'ANN001' && /function argument `(self|cls)`/.test(message)) {
    return false;
  }

  return true;
}

/**
 * Converts Ruff diagnostics to CodeMirror inline diagnostics.
 * @param {string} code Python source passed to Ruff.
 * @param {Array<object>} diagnostics Ruff diagnostics.
 * @param {number} [offset] Offset to add for fixed pre-code in the mounted editor.
 * @returns {Array<{from: number, to: number, severity: string, message: string}>} CodeMirror diagnostics.
 */
export function mapRuffDiagnosticsToInlineDiagnostics(code = '', diagnostics = [], offset = 0) {
  const source = String(code || '');
  const baseOffset = Math.max(0, Number(offset) || 0);

  return (Array.isArray(diagnostics) ? diagnostics : [])
    .filter(shouldShowRuffDiagnostic)
    .map((diagnostic) => {
      const from = getOffsetFromRuffLocation(source, diagnostic.start_location) + baseOffset;
      const to = getOffsetFromRuffLocation(source, diagnostic.end_location) + baseOffset;

      return {
        from,
        to: Math.max(to, from + 1),
        severity: 'warning',
        message: String(diagnostic.message || diagnostic.code || 'Python style warning'),
        source: 'ruff',
        code: diagnostic.code || '',
      };
    })
    .sort((left, right) => left.from - right.from || left.to - right.to);
}

/**
 * Runs Ruff against one Python source string and returns CodeMirror diagnostics.
 * @param {string} code Python source.
 * @param {object} [options] Analysis options.
 * @param {number} [options.offset] Offset to add to diagnostics.
 * @param {object} [options.settings] Ruff settings.
 * @param {string} [options.ruffCdnUrl] Configured Ruff runtime URL or directory.
 * @param {function} [options.getWorkspace] Test hook returning a Ruff-compatible workspace.
 * @returns {Promise<Array<object>>} Inline diagnostics.
 */
export async function getPythonRuffInlineDiagnostics(code = '', options = {}) {
  const workspace = typeof options.getWorkspace === 'function'
    ? await options.getWorkspace()
    : await getRuffWorkspace(options.settings || DEFAULT_RUFF_SETTINGS, options.ruffCdnUrl);
  const diagnostics = workspace.check(String(code || ''));

  return mapRuffDiagnosticsToInlineDiagnostics(code, diagnostics, options.offset || 0);
}

/**
 * Resets cached Ruff state. Intended for tests.
 * @returns {void}
 */
export function resetPythonRuffDiagnosticsForTests() {
  ruffRuntimePromises.clear();
  ruffWorkspaceCache = new Map();
}
