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

/**
 * Converts a 1-based line and a linter-specific column into a string offset.
 * Shared by Ruff (1-based row, 0-based UTF-16 column) and Pyrefly (1-based
 * line and column) diagnostics mapping, which only differ in whether their
 * column numbering starts at 0 or 1.
 * @param {string} code Source text.
 * @param {{line: number, column: number}} location 1-based line plus column.
 * @param {object} [options] Column numbering options.
 * @param {boolean} [options.zeroBasedColumn] True if column is 0-based.
 * @returns {number} Offset in code.
 */
export function getOffsetFromLineColumn(code = '', location = {}, options = {}) {
  const source = String(code || '');
  const minColumn = options.zeroBasedColumn ? 0 : 1;
  const targetLine = Math.max(1, Number(location.line) || 1);
  const targetColumn = Math.max(minColumn, Number(location.column) || minColumn);
  let line = 1;
  let offset = 0;

  while (line < targetLine && offset < source.length) {
    const char = source[offset];
    offset += 1;
    if (char === '\n') {
      line += 1;
    }
  }

  return Math.min(source.length, offset + (targetColumn - minColumn));
}
