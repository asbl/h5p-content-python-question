import { describe, expect, it } from 'vitest';
import { addPythonErrorHint } from '../src/scripts/services/python-error-hints.js';

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

    expect(message).toBe('NameError: name \'score\' is not defined\nTipp: Pruefe den Namen.');
  });
});
