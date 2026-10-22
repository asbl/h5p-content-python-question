import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import compatPreambleSource from '../src/scripts/runtime/assets/h5p_runtime_compat.py';

/**
 * Builds a self-contained Python driver that installs the compatibility
 * preamble (with the SDL placeholder neutralized) and runs learner code
 * through _h5p_run_with_async_input() with a fake async input().
 * @param {string} body - Python statements executed after the run.
 * @param {string} learnerCode - Learner source to transform and execute.
 * @returns {string} Python driver source.
 */
function buildDriver(learnerCode, body = '') {
  return [
    'import asyncio, ast, sys',
    `preamble = ${JSON.stringify(compatPreambleSource.replace('#__H5P_SDL_KEYBOARD_ELEMENT_ID__', 'none'))}`,
    'namespace = {"__name__": "compat_test"}',
    'exec(compile(preamble, "<asset>", "exec"), namespace)',
    '',
    'async def fake_input(prompt=""):',
    '    return "42"',
    '',
    'import builtins',
    'builtins.input = fake_input',
    '',
    'async def main():',
    `    return await namespace["_h5p_run_with_async_input"](${JSON.stringify(String(learnerCode || ''))})`,
    '',
    'result = asyncio.run(main())',
    body,
    'sys.exit(0)',
  ].join('\n');
}

/**
 * Runs learner code through the transform and returns the driver's exit
 * status, expecting a SyntaxError for invalid transformed code.
 * @param {string} learnerCode - Learner source to transform.
 * @returns {boolean} True when the transformed code compiles.
 */
function transformedCodeCompiles(learnerCode) {
  const driver = [
    'import ast, sys',
    `preamble = ${JSON.stringify(compatPreambleSource.replace('#__H5P_SDL_KEYBOARD_ELEMENT_ID__', 'none'))}`,
    'namespace = {"__name__": "compat_test"}',
    'exec(compile(preamble, "<asset>", "exec"), namespace)',
    `module = namespace["_h5p_build_async_input_module"](${JSON.stringify(String(learnerCode || ''))})`,
    'compile(module, "<learner>", "exec", flags=ast.PyCF_ALLOW_TOP_LEVEL_AWAIT)',
    'sys.exit(0)',
  ].join('\n');

  try {
    execFileSync('python3', ['-c', driver], { encoding: 'utf8', stdio: 'pipe' });
    return true;
  }
  catch (error) {
    return error.status !== 0 && /SyntaxError/.test(String(error.stderr));
  }
}

describe('pyodide async-input transform', () => {
  it('awaits input() in nested functions and returns the value', () => {
    const driver = buildDriver(
      'def outer():\n    def helper():\n        return input()\n    return helper()\nresult = outer()\n',
      'assert namespace["result"] == "42", namespace.get("result")',
    );

    expect(() => execFileSync('python3', ['-c', driver], { encoding: 'utf8', stdio: 'pipe' })).not.toThrow();
  });

  it('keeps input() in class methods, lambdas and class bodies compilable', () => {
    expect(transformedCodeCompiles('class Game:\n    def ask(self):\n        return input()\n')).toBe(true);
    expect(transformedCodeCompiles('f = lambda: input()\n')).toBe(true);
    expect(transformedCodeCompiles('class A:\n    x = input()\n')).toBe(true);
  });

  it('converts top-level input() functions to async and keeps them global', () => {
    const driver = buildDriver(
      'def ask():\n    return input()\n',
      [
        'import inspect',
        'assert "ask" in namespace, "top-level def must land in globals"',
        'assert inspect.iscoroutinefunction(namespace["ask"]), "ask must be async"',
      ].join('\n'),
    );

    expect(() => execFileSync('python3', ['-c', driver], { encoding: 'utf8', stdio: 'pipe' })).not.toThrow();
  });

  it('supports mutual recursion through input()-calling functions', () => {
    const driver = buildDriver(
      [
        'def a(n):',
        '    if n <= 0:',
        '        return input()',
        '    return b(n - 1)',
        'def b(n):',
        '    return a(n - 1)',
        'result = a(3)',
      ].join('\n'),
      'assert namespace["result"] == "42", namespace.get("result")',
    );

    expect(() => execFileSync('python3', ['-c', driver], { encoding: 'utf8', stdio: 'pipe' })).not.toThrow();
  });

  it('returns the last top-level expression and None for statement-only code', () => {
    const expressionDriver = buildDriver('1 + 2', 'assert result == 3, result');
    const statementDriver = buildDriver('x = 5', 'assert result is None, result');

    expect(() => execFileSync('python3', ['-c', expressionDriver], { encoding: 'utf8', stdio: 'pipe' })).not.toThrow();
    expect(() => execFileSync('python3', ['-c', statementDriver], { encoding: 'utf8', stdio: 'pipe' })).not.toThrow();
  });

  it('propagates syntax errors with line information', () => {
    const driver = buildDriver('x = 1\ny = \n');

    try {
      execFileSync('python3', ['-c', driver], { encoding: 'utf8', stdio: 'pipe' });
      throw new Error('Expected a SyntaxError');
    }
    catch (error) {
      expect(String(error.stderr)).toMatch(/line 2/);
    }
  });
});
