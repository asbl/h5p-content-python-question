import { PYODIDE_PYTHON_VERSION } from './python-runtime-version';

const DEFAULT_PYREFLY_PYTHON_VERSION = PYODIDE_PYTHON_VERSION;
const PYREFLY_DEFAULT_FILENAME = 'main.py';

let pyreflyRuntimePromise = null;
let pyreflyState = null;

/**
 * Loads Pyrefly's browser-friendly WASM bundle once.
 * @returns {Promise<{State: Function}>} Pyrefly runtime exports.
 */
async function loadPyreflyRuntime() {
  if (!pyreflyRuntimePromise) {
    pyreflyRuntimePromise = import('pyrefly-wasm').then(async (runtime) => {
      await runtime.default();
      return runtime;
    });
  }

  return pyreflyRuntimePromise;
}

/**
 * Returns a shared Pyrefly state instance.
 * @param {string} [pythonVersion] Python version Pyrefly should type-check against.
 * @returns {Promise<object>} Pyrefly state.
 */
async function getPyreflyState(pythonVersion = DEFAULT_PYREFLY_PYTHON_VERSION) {
  if (pyreflyState) {
    return pyreflyState;
  }

  const { State } = await loadPyreflyRuntime();
  pyreflyState = new State(pythonVersion);
  return pyreflyState;
}

/**
 * Converts a 1-based Pyrefly line and 1-based column into a string offset.
 * @param {string} code Python source.
 * @param {{line: number, column: number}} location Pyrefly location.
 * @returns {number} Offset in code.
 */
export function getOffsetFromPyreflyLocation(code = '', location = {}) {
  const source = String(code || '');
  const targetLine = Math.max(1, Number(location.line) || 1);
  const targetColumn = Math.max(1, Number(location.column) || 1);
  let line = 1;
  let offset = 0;

  while (line < targetLine && offset < source.length) {
    const char = source[offset];
    offset += 1;
    if (char === '\n') {
      line += 1;
    }
  }

  return Math.min(source.length, offset + (targetColumn - 1));
}

/**
 * Filters noisy Pyrefly diagnostics:
 * - Pyrefly's own "ignore" severity (1) covers hints like unused-import/
 *   unused-parameter, including ones it only infers because an import could
 *   not be resolved in the first place; these read as false positives here.
 * - missing-import/missing-module-attribute are real (severity "error")
 *   findings, but packages like miniworlds can't resolve against Pyrefly's
 *   bundled typeshed stubs alone, so they'd otherwise fire on every program.
 * @param {object} diagnostic Pyrefly diagnostic.
 * @returns {boolean} True if the diagnostic should be shown.
 */
export function shouldShowPyreflyDiagnostic(diagnostic = {}) {
  if (Number(diagnostic.severity) === 1) {
    return false;
  }

  return diagnostic.kind !== 'missing-import' && diagnostic.kind !== 'missing-module-attribute';
}

/**
 * Maps Pyrefly's Monaco-style numeric severity to a CodeMirror severity label.
 * @param {number} severity Pyrefly severity (8 error, 4 warn, 2 info, 1 ignore).
 * @returns {string} CodeMirror severity label.
 */
function mapPyreflySeverity(severity) {
  return Number(severity) === 8 ? 'error' : 'warning';
}

/**
 * Converts Pyrefly diagnostics to CodeMirror inline diagnostics.
 * @param {string} code Python source passed to Pyrefly.
 * @param {Array<object>} diagnostics Pyrefly diagnostics.
 * @param {number} [offset] Offset to add for fixed pre-code in the mounted editor.
 * @returns {Array<{from: number, to: number, severity: string, message: string}>} CodeMirror diagnostics.
 */
export function mapPyreflyDiagnosticsToInlineDiagnostics(code = '', diagnostics = [], offset = 0) {
  const source = String(code || '');
  const baseOffset = Math.max(0, Number(offset) || 0);

  return (Array.isArray(diagnostics) ? diagnostics : [])
    .filter(shouldShowPyreflyDiagnostic)
    .map((diagnostic) => {
      const from = getOffsetFromPyreflyLocation(source, {
        line: diagnostic.startLineNumber,
        column: diagnostic.startColumn,
      }) + baseOffset;
      const to = getOffsetFromPyreflyLocation(source, {
        line: diagnostic.endLineNumber,
        column: diagnostic.endColumn,
      }) + baseOffset;

      return {
        from,
        to: Math.max(to, from + 1),
        severity: mapPyreflySeverity(diagnostic.severity),
        message: String(diagnostic.message_header || diagnostic.kind || 'Python type warning'),
        source: 'pyrefly',
        code: diagnostic.kind || '',
      };
    })
    .sort((left, right) => left.from - right.from || left.to - right.to);
}

/**
 * Builds the sandbox file map Pyrefly should type-check: sibling workspace
 * files (so cross-file imports resolve) plus the active file's live code,
 * which always wins over any stale snapshot of the same file.
 * @param {string} code Live source of the active file.
 * @param {string} activeFileName Name of the active file.
 * @param {Array<{name: string, code: string}>} [workspaceFiles] Other files in the workspace.
 * @returns {{[key: string]: string}} Filename-to-source map for Pyrefly.
 */
function buildPyreflySandboxFiles(code, activeFileName, workspaceFiles) {
  const files = {};

  if (Array.isArray(workspaceFiles)) {
    for (const file of workspaceFiles) {
      if (file?.name && file.name !== activeFileName) {
        files[file.name] = String(file.code || '');
      }
    }
  }

  files[activeFileName] = String(code || '');
  return files;
}

/**
 * Runs Pyrefly against one Python source string and returns CodeMirror diagnostics.
 * @param {string} code Python source of the active file.
 * @param {object} [options] Analysis options.
 * @param {number} [options.offset] Offset to add to diagnostics.
 * @param {string} [options.pythonVersion] Python version Pyrefly should type-check against.
 * @param {string} [options.activeFileName] Name of the file being analyzed.
 * @param {Array<{name: string, code: string}>} [options.workspaceFiles] Sibling workspace files, so cross-file imports resolve.
 * @param {function} [options.getState] Test hook returning a Pyrefly-compatible state.
 * @returns {Promise<Array<object>>} Inline diagnostics.
 */
export async function getPythonPyreflyInlineDiagnostics(code = '', options = {}) {
  const state = typeof options.getState === 'function'
    ? await options.getState()
    : await getPyreflyState(options.pythonVersion);

  const activeFileName = options.activeFileName || PYREFLY_DEFAULT_FILENAME;
  const files = buildPyreflySandboxFiles(code, activeFileName, options.workspaceFiles);

  state.updateSandboxFiles(files, true);
  state.setActiveFile(activeFileName);
  // getErrors() returns diagnostics for every sandboxed file, not just the
  // active one; sibling-file diagnostics would otherwise get mapped against
  // the wrong source text and land at garbage offsets in this editor.
  const diagnostics = state.getErrors().filter((diagnostic) => diagnostic.filename === activeFileName);

  return mapPyreflyDiagnosticsToInlineDiagnostics(code, diagnostics, options.offset || 0);
}

/**
 * Resets cached Pyrefly state. Intended for tests.
 * @returns {void}
 */
export function resetPythonPyreflyDiagnosticsForTests() {
  pyreflyRuntimePromise = null;
  pyreflyState = null;
}
