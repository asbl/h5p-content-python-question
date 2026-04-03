import { tPython } from './python-l10n';

function normalizeErrorMessage(message) {
  return String(message || '').toLowerCase();
}

function resolveHintKey(message) {
  const normalized = normalizeErrorMessage(message);

  if (
    normalized.includes('indentationerror')
    || normalized.includes('unexpected indent')
    || normalized.includes('unindent does not match')
    || normalized.includes('expected an indented block')
  ) {
    return 'pythonHintIndentation';
  }

  if (
    normalized.includes('nameerror')
    || normalized.includes(' is not defined')
  ) {
    return 'pythonHintNameError';
  }

  if (
    normalized.includes('typeerror')
    || normalized.includes('is not subscriptable')
    || normalized.includes('unsupported operand type')
    || normalized.includes('required positional argument')
  ) {
    return 'pythonHintTypeError';
  }

  if (
    normalized.includes('syntaxerror')
    || normalized.includes('invalid syntax')
    || normalized.includes("expected ':'")
    || normalized.includes('unterminated string literal')
    || normalized.includes('eol while scanning string literal')
  ) {
    return 'pythonHintSyntax';
  }

  return null;
}

/**
 * Appends a short student-friendly hint to known Python runtime errors.
 * @param {object} l10n - Localization map.
 * @param {string} message - Runtime error message.
 * @returns {string} Message including optional hint.
 */
export function addPythonErrorHint(l10n, message) {
  const normalizedMessage = String(message || '').trim();
  if (!normalizedMessage) {
    return normalizedMessage;
  }

  const hintKey = resolveHintKey(normalizedMessage);
  if (!hintKey) {
    return normalizedMessage;
  }

  const hintText = tPython(l10n, hintKey);
  const hintLine = tPython(l10n, 'pythonHintTemplate', { hint: hintText });
  return `${normalizedMessage}\n${hintLine}`;
}
