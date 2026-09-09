/**
 * Writes a diagnostic warning only when the author enabled it.
 * @param {object} options Runtime or content options.
 * @param {...*} args Arguments forwarded to console.warn.
 * @returns {void}
 */
export function logPythonDiagnostic(options, ...args) {
  if (options?.enableDiagnosticLogs === true) {
    console.warn(...args);
  }
}
