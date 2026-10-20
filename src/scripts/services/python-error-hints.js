import { tPython } from './python-l10n';

/**
 * Misconception catalog: maps typical beginner runtime errors to short
 * didactic hints that address the underlying misconception instead of just
 * repeating the error text. Ordered from most specific to most generic; the
 * first matching entry wins.
 */
const MISCONCEPTION_PATTERNS = [
  {
    hintKey: 'pythonHintZeroDivision',
    matches: [
      'zerodivisionerror',
      'division by zero',
    ],
  },
  {
    // Classic off-by-one: learners index one element too far or loop one
    // step too often.
    hintKey: 'pythonHintIndexError',
    matches: [
      'indexerror',
      'index out of range',
      'list index out of range',
      'tuple index out of range',
      'string index out of range',
    ],
  },
  {
    // input() always returns a string; converting to int/float was skipped.
    hintKey: 'pythonHintIntConversion',
    matches: [
      'invalid literal for int()',
      'invalid literal for float()',
    ],
  },
  {
    // Mixing str and int, usually caused by unconverted input() values.
    hintKey: 'pythonHintStringConcat',
    matches: [
      'can only concatenate str',
      '\'str\' and \'int\'',
      '\'int\' and \'str\'',
      '\'str\' object cannot be interpreted',
      'not supported between instances of \'str\' and \'int\'',
      'not supported between instances of \'int\' and \'str\'',
    ],
  },
  {
    hintKey: 'pythonHintKeyError',
    matches: [
      'keyerror',
    ],
  },
  {
    hintKey: 'pythonHintAttributeError',
    matches: [
      'attributeerror',
      'has no attribute',
    ],
  },
  {
    // Missing or unreachable base case is the usual cause.
    hintKey: 'pythonHintRecursion',
    matches: [
      'recursionerror',
      'maximum recursion depth exceeded',
    ],
  },
  {
    hintKey: 'pythonHintImport',
    matches: [
      'modulenotfounderror',
      'importerror',
      'cannot import name',
    ],
  },
];

/**
 * Normalizes runtime error text for pattern matching.
 * @param {string} message - Raw runtime error text.
 * @returns {string} Lower-cased normalized text.
 */
function normalizeErrorMessage(message) {
  return String(message || '').toLowerCase();
}

/**
 * Resolves a localized hint key for known Python error patterns.
 * @param {string} message - Runtime error text.
 * @returns {string|null} Hint key or null when no match exists.
 */
function resolveHintKey(message) {
  const normalized = normalizeErrorMessage(message);

  for (const pattern of MISCONCEPTION_PATTERNS) {
    if (pattern.matches.some((needle) => normalized.includes(needle))) {
      return pattern.hintKey;
    }
  }

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
    || normalized.includes('expected \':\'')
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
