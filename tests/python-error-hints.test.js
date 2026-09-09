import { describe, expect, it } from 'vitest';
import { addPythonErrorHint } from '../src/scripts/services/python-error-hints.js';

describe('python error hints', () => {
  it.each([
    ['IndentationError: expected an indented block', 'Hint: Check indentation.'],
    ["NameError: name 'score' is not defined", 'Hint: This name is unknown.'],
    ["TypeError: 'int' object is not subscriptable", 'Hint: The operation does not match the data type.'],
    ["SyntaxError: expected ':'", 'Hint: Check punctuation and brackets.'],
  ])('appends a localized hint for %s', (message, expectedHint) => {
    expect(addPythonErrorHint({}, message)).toContain(expectedHint);
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
    }, "NameError: name 'score' is not defined");

    expect(message).toBe("NameError: name 'score' is not defined\nTipp: Pruefe den Namen.");
  });
});
