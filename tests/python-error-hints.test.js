import { describe, expect, it } from 'vitest';
import { addPythonErrorHint, explainPythonError, parsePythonError } from '../src/scripts/services/python-error-hints.js';

describe('python error hints', () => {
  it.each([
    ['IndentationError: expected an indented block', 'Hint: Check indentation.'],
    ['NameError: name \'score\' is not defined', 'Hint: This name is unknown.'],
    ['TypeError: \'int\' object is not subscriptable', 'Hint: The operation does not match the data type.'],
    ['SyntaxError: expected \':\'', 'Hint: Check punctuation and brackets.'],
  ])('appends a localized hint for %s', (message, expectedHint) => {
    expect(addPythonErrorHint({}, message)).toContain(expectedHint);
  });

  it.each([
    ['ZeroDivisionError: division by zero', 'divided by zero'],
    ['IndexError: list index out of range', 'index is outside the list'],
    ['ValueError: invalid literal for int() with base 10: \'3\'', 'input() always returns a string'],
    ['TypeError: can only concatenate str (not "int") to str', 'combining text with a number'],
    ['KeyError: \'name\'', 'key does not exist in the dictionary'],
    ['AttributeError: \'list\' object has no attribute \'lowerr\'', 'does not have this attribute'],
    ['RecursionError: maximum recursion depth exceeded', 'recursion never reaches its base case'],
    ['ModuleNotFoundError: No module named \'numpi\'', 'cannot be imported'],
  ])('appends a misconception hint for %s', (message, expectedFragment) => {
    expect(addPythonErrorHint({}, message)).toContain(expectedFragment);
  });

  it('prefers the specific string/number misconception over the generic type hint', () => {
    expect(addPythonErrorHint({}, 'TypeError: unsupported operand type(s) for +: \'int\' and \'str\''))
      .toContain('combining text with a number');
  });

  it('keeps unknown and empty messages unchanged', () => {
    expect(addPythonErrorHint({}, 'ValueError: invalid literal')).toBe('ValueError: invalid literal');
    expect(addPythonErrorHint({}, '   ')).toBe('');
    expect(addPythonErrorHint({}, null)).toBe('');
  });

  it('uses explicit legacy l10n overrides before bundled defaults', () => {
    const message = addPythonErrorHint({
      pythonHintTemplate: 'Tipp: {hint}',
      pythonHintNameError: 'Pruefe den Namen.',
    }, 'NameError: name \'score\' is not defined');

    expect(message.split('\n').at(-1)).toBe('Tipp: Pruefe den Namen.');
  });

  describe('specific explanations', () => {
    const tb = (line, error) => `Traceback (most recent call last):\n  File "/lib/python312.zip/_pyodide/_base.py", line 5, in run\n  File "<exec>", line ${line}, in <module>\n${error}`;

    it('names the unknown variable, the line and the suggestion', () => {
      const text = addPythonErrorHint({}, tb(4, "NameError: name 'scor' is not defined. Did you mean: 'score'?"));
      expect(text).toContain('The name "scor" is used but does not exist');
      expect(text).toContain('Did you mean "score"?');
      expect(text).toContain('(line 4)');
    });

    it('ignores runtime-internal frames when finding the learner line', () => {
      expect(parsePythonError(tb(7, 'ZeroDivisionError: division by zero')).line).toBe(7);
    });

    it.each([
      ['SyntaxError: expected \':\'', 'colon ":" is missing'],
      ["SyntaxError: '(' was never closed", 'opening bracket "("'],
      ['SyntaxError: unterminated string literal (detected at line 2)', 'not closed'],
      ['SyntaxError: invalid syntax. Maybe you meant \'==\' or \':=\' instead of \'=\'?', 'use "=="'],
      ["IndentationError: expected an indented block after 'if' statement on line 3", 'needs an indented block'],
      ['TypeError: can only concatenate str (not "int") to str', 'cannot be joined with "+"'],
      ["TypeError: unsupported operand type(s) for -: 'str' and 'int'", 'cannot be joined with "+"'],
      ["TypeError: unsupported operand type(s) for /: 'list' and 'int'", 'types "list" and "int"'],
      ["TypeError: 'int' object is not callable", 'type "int" is called like a function'],
      ['TypeError: add() takes 2 positional arguments but 3 were given', 'expects 2 argument(s), but was called with 3'],
      ["TypeError: add() missing 1 required positional argument: 'b'", 'missing the argument(s): b'],
      ["AttributeError: 'NoneType' object has no attribute 'append'", 'is None'],
      ["AttributeError: 'list' object has no attribute 'push'", 'type "list" has no attribute or method "push"'],
      ["KeyError: 'name'", "key 'name' does not exist"],
      ["ValueError: invalid literal for int() with base 10: 'abc'", "text 'abc' cannot be converted"],
      ["UnboundLocalError: cannot access local variable 'x' where it is not associated with a value", 'variable "x"'],
    ])('explains %s', (error, fragment) => {
      expect(explainPythonError({}, error)).toContain(fragment);
    });

    it('adds no explanation for unknown errors', () => {
      expect(explainPythonError({}, 'ValueError: something odd')).toBeNull();
    });

    it('puts explanation before the tip', () => {
      const lines = addPythonErrorHint({}, "NameError: name 'x' is not defined").split('\n');
      expect(lines[1]).toMatch(/^What happened:/);
      expect(lines[2]).toMatch(/^Hint:/);
    });
  });
});
