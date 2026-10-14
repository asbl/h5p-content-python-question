const DEFAULT_RUFF_SETTINGS = Object.freeze({
  'line-length': 88,
  'indent-width': 4,
  lint: {
    select: ['ANN'],
  },
});

let ruffRuntimePromise = null;
let ruffWorkspace = null;

/**
 * Loads Ruff's browser-friendly WASM bundle once.
 * @returns {Promise<{Workspace: Function, PositionEncoding: object}>} Ruff runtime exports.
 */
async function loadRuffRuntime() {
  if (!ruffRuntimePromise) {
    ruffRuntimePromise = import('@astral-sh/ruff-wasm-web').then(async (runtime) => {
      await runtime.default();
      return runtime;
    });
  }

  return ruffRuntimePromise;
}

/**
 * Returns a shared Ruff workspace instance.
 * @param {object} [settings] Ruff settings.
 * @returns {Promise<object>} Ruff workspace.
 */
async function getRuffWorkspace(settings = DEFAULT_RUFF_SETTINGS) {
  if (ruffWorkspace) {
    return ruffWorkspace;
  }

  const { Workspace, PositionEncoding } = await loadRuffRuntime();
  const encoding = PositionEncoding?.UTF16 ?? PositionEncoding?.Utf16 ?? 1;
  ruffWorkspace = new Workspace(settings, encoding);
  return ruffWorkspace;
}

/**
 * Converts a 1-based Ruff row and 0-based UTF-16 column into a string offset.
 * @param {string} code Python source.
 * @param {{row: number, column: number}} location Ruff location.
 * @returns {number} Offset in code.
 */
export function getOffsetFromRuffLocation(code = '', location = {}) {
  const source = String(code || '');
  const targetRow = Math.max(1, Number(location.row) || 1);
  const targetColumn = Math.max(0, Number(location.column) || 0);
  let row = 1;
  let offset = 0;

  while (row < targetRow && offset < source.length) {
    const char = source[offset];
    offset += 1;
    if (char === '\n') {
      row += 1;
    }
  }

  return Math.min(source.length, offset + targetColumn);
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
 * @param {function} [options.getWorkspace] Test hook returning a Ruff-compatible workspace.
 * @returns {Promise<Array<object>>} Inline diagnostics.
 */
export async function getPythonRuffInlineDiagnostics(code = '', options = {}) {
  const workspace = typeof options.getWorkspace === 'function'
    ? await options.getWorkspace()
    : await getRuffWorkspace(options.settings || DEFAULT_RUFF_SETTINGS);
  const diagnostics = workspace.check(String(code || ''));

  return mapRuffDiagnosticsToInlineDiagnostics(code, diagnostics, options.offset || 0);
}

/**
 * Resets cached Ruff state. Intended for tests.
 * @returns {void}
 */
export function resetPythonRuffDiagnosticsForTests() {
  ruffRuntimePromise = null;
  ruffWorkspace = null;
}
