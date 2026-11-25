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
 * Extracts exception type, detail text, learner line and a possible
 * "Did you mean" suggestion from a raw Python error message.
 * @param {string} message - Raw runtime error text.
 * @returns {{type: string, detail: string, line: number|null, suggestion: string|null}} Parsed error.
 */
export function parsePythonError(message) {
  const text = String(message || '');
  const lines = text.split('\n');

  let type = '';
  let detail = '';
  lines.forEach((line) => {
    const match = line.match(/^\s*([A-Za-z_][\w.]*(?:Error|Exception))(?::\s*(.*))?$/);
    if (match) {
      type = match[1].split('.').pop();
      detail = (match[2] || '').trim();
    }
  });

  let line = null;
  const frameRegex = /File "([^"]*)", line (\d+)/g;
  let frame = frameRegex.exec(text);
  while (frame) {
    if (!/^\/lib\/|_pyodide/.test(frame[1])) {
      line = Number(frame[2]);
    }
    frame = frameRegex.exec(text);
  }
  if (line === null) {
    const onLine = detail.match(/\bon line (\d+)/);
    line = onLine ? Number(onLine[1]) : null;
  }

  const suggestion = text.match(/Did you mean:\s*'([^']+)'/);
  return { type, detail, line, suggestion: suggestion ? suggestion[1] : null };
}

/**
 * Builds the specific explanation key and replacements for a parsed error.
 * @param {{type: string, detail: string}} parsed - Parsed error.
 * @returns {{key: string, values: object}|null} Explanation descriptor.
 */
function resolveExplanation({ type, detail }) {
  let m;

  switch (type) {
    case 'NameError':
      m = detail.match(/name '(.+?)' is not defined/);
      return m ? { key: 'pythonExplainNameError', values: { name: m[1] } } : null;
    case 'UnboundLocalError':
      m = detail.match(/local variable '(.+?)'/);
      return m ? { key: 'pythonExplainUnboundLocal', values: { name: m[1] } } : null;
    case 'IndentationError':
      if (/expected an indented block/.test(detail)) {
        return { key: 'pythonExplainExpectedIndent', values: {} };
      }
      if (/unexpected indent/.test(detail)) {
        return { key: 'pythonExplainUnexpectedIndent', values: {} };
      }
      if (/unindent does not match/.test(detail)) {
        return { key: 'pythonExplainUnindent', values: {} };
      }
      return null;
    case 'SyntaxError':
    case 'TabError':
      if (/expected ':'/.test(detail)) {
        return { key: 'pythonExplainMissingColon', values: {} };
      }
      m = detail.match(/'([([{])' was never closed/);
      if (m) {
        return { key: 'pythonExplainUnclosedBracket', values: { bracket: m[1] } };
      }
      m = detail.match(/unmatched '([)\]}])'/);
      if (m) {
        return { key: 'pythonExplainUnmatchedBracket', values: { bracket: m[1] } };
      }
      if (/unterminated string literal|unterminated triple-quoted|EOL while scanning/.test(detail)) {
        return { key: 'pythonExplainUnterminatedString', values: {} };
      }
      if (/Maybe you meant '=='|cannot assign to .* here/.test(detail)) {
        return { key: 'pythonExplainAssignVsCompare', values: {} };
      }
      if (/Missing parentheses in call to 'print'/.test(detail)) {
        return { key: 'pythonExplainPrintParens', values: {} };
      }
      if (/Perhaps you forgot a comma/.test(detail)) {
        return { key: 'pythonExplainMissingComma', values: {} };
      }
      return { key: 'pythonExplainSyntaxGeneric', values: {} };
    case 'TypeError':
      if (/can only concatenate str \(not "(\w+)"\) to str/.test(detail)) {
        return { key: 'pythonExplainTextNumber', values: {} };
      }
      m = detail.match(/unsupported operand type\(s\) for ([^:]+): '(\w+)' and '(\w+)'/);
      if (m) {
        const mixesText = m[2] === 'str' || m[3] === 'str';
        return mixesText
          ? { key: 'pythonExplainTextNumber', values: {} }
          : { key: 'pythonExplainOperandTypes', values: { operator: m[1], left: m[2], right: m[3] } };
      }
      m = detail.match(/'(\w+)' object is not subscriptable/);
      if (m) {
        return m[1] === 'NoneType'
          ? { key: 'pythonExplainNoneValue', values: {} }
          : { key: 'pythonExplainNotSubscriptable', values: { type: m[1] } };
      }
      m = detail.match(/'(\w+)' object is not callable/);
      if (m) {
        return { key: 'pythonExplainNotCallable', values: { type: m[1] } };
      }
      m = detail.match(/(\w+)\(\) takes (\d+) positional arguments? but (\d+) (?:was|were) given/);
      if (m) {
        return { key: 'pythonExplainTooManyArguments', values: { function: m[1], expected: m[2], given: m[3] } };
      }
      m = detail.match(/(\w+)\(\) missing (\d+) required positional arguments?: (.+)$/);
      if (m) {
        return { key: 'pythonExplainMissingArguments', values: { function: m[1], arguments: m[3].replace(/'/g, '') } };
      }
      m = detail.match(/'(\w+)' object is not iterable/);
      if (m) {
        return m[1] === 'NoneType'
          ? { key: 'pythonExplainNoneValue', values: {} }
          : { key: 'pythonExplainNotIterable', values: { type: m[1] } };
      }
      return null;
    case 'AttributeError':
      m = detail.match(/'(\w+)' object has no attribute '(\w+)'/);
      if (m) {
        return m[1] === 'NoneType'
          ? { key: 'pythonExplainNoneValue', values: {} }
          : { key: 'pythonExplainAttributeError', values: { type: m[1], attribute: m[2] } };
      }
      m = detail.match(/module '([\w.]+)' has no attribute '(\w+)'/);
      return m ? { key: 'pythonExplainModuleAttribute', values: { module: m[1], attribute: m[2] } } : null;
    case 'ZeroDivisionError':
      return { key: 'pythonExplainZeroDivision', values: {} };
    case 'IndexError':
      return { key: 'pythonExplainIndexError', values: {} };
    case 'KeyError':
      return { key: 'pythonExplainKeyError', values: { key: detail } };
    case 'ValueError':
      m = detail.match(/invalid literal for (int|float)\(\).*?: (.+)$/);
      return m ? { key: 'pythonExplainInvalidNumber', values: { value: m[2] } } : null;
    case 'RecursionError':
      return { key: 'pythonExplainRecursion', values: {} };
    case 'ModuleNotFoundError':
      m = detail.match(/No module named '([\w.]+)'/);
      return m ? { key: 'pythonExplainModuleNotFound', values: { name: m[1] } } : null;
    default:
      return null;
  }
}

/**
 * Builds a plain-language explanation naming the concrete cause and line.
 * @param {object} l10n - Localization map.
 * @param {string} message - Raw runtime error text.
 * @returns {string|null} Explanation line or null when nothing specific is known.
 */
export function explainPythonError(l10n, message) {
  const parsed = parsePythonError(message);
  const explanation = resolveExplanation(parsed);
  if (!explanation) {
    return null;
  }

  let text = tPython(l10n, explanation.key, explanation.values);
  if (parsed.suggestion) {
    text += ` ${tPython(l10n, 'pythonExplainDidYouMean', { suggestion: parsed.suggestion })}`;
  }
  if (parsed.line) {
    text += ` ${tPython(l10n, 'pythonExplainLineSuffix', { line: parsed.line })}`;
  }

  return tPython(l10n, 'pythonExplainTemplate', { explanation: text });
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

  const explanationLine = explainPythonError(l10n, normalizedMessage);
  const hintKey = resolveHintKey(normalizedMessage);
  const hintLine = hintKey
    ? tPython(l10n, 'pythonHintTemplate', { hint: tPython(l10n, hintKey) })
    : null;

  return [normalizedMessage, explanationLine, hintLine].filter(Boolean).join('\n');
}
