import { beforeEach, describe, expect, it, vi } from 'vitest';

const { default: SkulptRunner } = await import('../src/scripts/runtime/skulptrunner.js');

/**
 * Creates a minimal runtime stub for SkulptRunner tests.
 * @returns {object} Runtime stub.
 */
function createRuntime() {
  const consoleManager = {
    write: vi.fn(),
  };
  const stateManager = {
    stop: vi.fn(),
  };

  return {
    l10n: {},
    outputHandler: vi.fn(),
    inputHandler: vi.fn(),
    onSuccess: vi.fn(),
    onError: vi.fn(),
    containsP5Code: vi.fn(() => false),
    codeContainer: {
      getConsoleManager: () => consoleManager,
      getStateManager: () => stateManager,
      getImageManager: () => ({ isEnabled: () => false }),
      getSoundManager: () => ({ isEnabled: () => false }),
    },
    getConsoleManager: () => consoleManager,
  };
}

describe('SkulptRunner', () => {
  beforeEach(() => {
    globalThis.Sk = {
      configure: vi.fn(),
      importMainWithBody: vi.fn(() => 'ok'),
      misceval: {
        asyncToPromise: vi.fn(async (callback) => callback()),
      },
      python3: {},
      builtinFiles: { files: {} },
      builtin: {
        TimeoutError: class TimeoutError extends Error {},
      },
      TurtleGraphics: null,
      p5: null,
      shouldStop: false,
    };
  });

  it('passes the normalized execution limit to Skulpt and resets execStart on execute', async () => {
    const runtime = createRuntime();
    const runner = new SkulptRunner(runtime, { executionLimit: 1500.8 });

    runner.setup();

    expect(globalThis.Sk.configure).toHaveBeenCalledWith(expect.objectContaining({
      execLimit: 1500,
    }));

    await runner.execute('print(1)');

    expect(typeof globalThis.Sk.execStart).toBe('number');
    expect(runtime.onSuccess).toHaveBeenCalledWith('ok');
  });

  it('disables execution limiting when the configured limit is invalid', () => {
    const runtime = createRuntime();
    const runner = new SkulptRunner(runtime, { executionLimit: 'invalid' });

    runner.setup();

    expect(runner.hasExecutionLimit()).toBe(false);
    expect(globalThis.Sk.configure).toHaveBeenCalledWith(expect.objectContaining({
      execLimit: null,
    }));
  });

  it('surfaces execution limit errors as a localized timeout message', async () => {
    const runtime = createRuntime();
    const timeoutError = {
      tp$name: 'TimeoutError',
      toString: () => 'TimeoutError: Program exceeded run time limit.',
    };

    globalThis.Sk.importMainWithBody = vi.fn(() => {
      throw timeoutError;
    });

    const runner = new SkulptRunner(runtime, { executionLimit: 900 });

    await runner.execute('while True:\n  pass');

    expect(runtime.onError).toHaveBeenCalledWith('Program exceeded the execution time limit.');
  });

  it('stops the runtime state after a successful non-p5 run', async () => {
    const runtime = createRuntime();
    const stateManager = runtime.codeContainer.getStateManager();
    const runner = new SkulptRunner(runtime, {});

    await runner.execute('print(1)');

    expect(stateManager.stop).toHaveBeenCalled();
  });

  it('appends a student-friendly hint for NameError runtime failures', () => {
    const runtime = createRuntime();
    const runner = new SkulptRunner(runtime, {});

    runner.onError({
      args: {
        v: [{ $mangled: "NameError: name 'total' is not defined" }],
      },
      traceback: [{ lineno: 4, colno: 3 }],
    });

    expect(runtime.onError).toHaveBeenCalledWith(expect.stringContaining('Hint: This name is unknown.'));
  });
});