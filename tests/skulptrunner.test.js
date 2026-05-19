import { beforeEach, describe, expect, it, vi } from 'vitest';

const serviceMocks = vi.hoisted(() => ({
  ensureP5Script: vi.fn(() => Promise.resolve()),
  ensureSkulptRuntime: vi.fn(() => Promise.resolve(globalThis.Sk)),
}));

vi.mock('../src/scripts/runtime/services/p5-runtime-service', () => ({
  ensureP5Script: serviceMocks.ensureP5Script,
}));

vi.mock('../src/scripts/runtime/services/skulpt-runtime-service', () => ({
  ensureSkulptRuntime: serviceMocks.ensureSkulptRuntime,
}));

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
    vi.clearAllMocks();
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

  it('loads hosted Skulpt and p5 runtimes before executing p5 code', async () => {
    const runtime = createRuntime();
    runtime.containsP5Code.mockReturnValue(true);
    const runner = new SkulptRunner(runtime, {
      p5CdnUrl: 'https://static.example.com/p5/p5.min.js',
      skulptCdnUrl: 'https://static.example.com/skulpt/skulpt.min.js',
    });
    const canvasDiv = document.createElement('div');
    const previousP5 = window.p5;

    function P5Mock(sketch) {
      const proto = {
        circle() {},
      };
      const instance = Object.create(proto);
      instance.noLoop = vi.fn();
      sketch(instance);
    }
    P5Mock.prototype.map = () => {};
    P5Mock.prototype.registerMethod = vi.fn();
    window.p5 = P5Mock;

    await runner.execute('print(1)', canvasDiv);

    expect(serviceMocks.ensureSkulptRuntime).toHaveBeenCalledWith('https://static.example.com/skulpt/skulpt.min.js');
    expect(serviceMocks.ensureP5Script).toHaveBeenCalledWith('https://static.example.com/p5/p5.min.js');
    expect(globalThis.Sk.p5.instance).toBeTruthy();

    if (typeof previousP5 === 'undefined') {
      delete window.p5;
    }
    else {
      window.p5 = previousP5;
    }
  });

  it('uses the default hosted Skulpt and p5 runtimes when no override is configured', async () => {
    const runtime = createRuntime();
    runtime.containsP5Code.mockReturnValue(true);
    const runner = new SkulptRunner(runtime, {});
    const previousP5 = window.p5;

    function P5Mock(sketch) {
      const proto = {
        circle() {},
      };
      const instance = Object.create(proto);
      instance.noLoop = vi.fn();
      sketch(instance);
    }
    P5Mock.prototype.map = () => {};
    P5Mock.prototype.registerMethod = vi.fn();
    window.p5 = P5Mock;

    await runner.execute('print(1)', document.createElement('div'));

    expect(serviceMocks.ensureSkulptRuntime).toHaveBeenCalledWith(undefined);
    expect(serviceMocks.ensureP5Script).toHaveBeenCalledWith(undefined);

    if (typeof previousP5 === 'undefined') {
      delete window.p5;
    }
    else {
      window.p5 = previousP5;
    }
  });

  it('loads hosted Skulpt before binding turtle canvases', async () => {
    const runtime = createRuntime();
    runtime.containsTurtleCode = vi.fn(() => true);
    const runner = new SkulptRunner(runtime, {
      skulptCdnUrl: 'https://static.example.com/skulpt/skulpt.min.js',
    });
    const canvasDiv = document.createElement('div');
    canvasDiv.id = 'turtle-canvas';

    runner.addCanvas(document.createElement('div'), canvasDiv);
    await Promise.resolve();
    await Promise.resolve();

    expect(serviceMocks.ensureSkulptRuntime).toHaveBeenCalledWith('https://static.example.com/skulpt/skulpt.min.js');
    expect(globalThis.Sk.canvas).toBe('turtle-canvas');
    expect(globalThis.Sk.TurtleGraphics.target).toBe('turtle-canvas');
  });

  it('sets up a fresh turtle target for each independent canvas div', async () => {
    const runtime = createRuntime();
    runtime.containsTurtleCode = vi.fn(() => true);
    const runner = new SkulptRunner(runtime, {});

    const divA = document.createElement('div');
    divA.id = 'turtle-block-a';
    runner.addCanvas(document.createElement('div'), divA);
    await Promise.resolve();
    await Promise.resolve();
    expect(globalThis.Sk.TurtleGraphics.target).toBe('turtle-block-a');

    const divB = document.createElement('div');
    divB.id = 'turtle-block-b';
    runner.addCanvas(document.createElement('div'), divB);
    await Promise.resolve();
    await Promise.resolve();
    expect(globalThis.Sk.TurtleGraphics.target).toBe('turtle-block-b');
  });

  it('updates turtle target via setupTurtleDiv during execute', async () => {
    const runtime = createRuntime();
    runtime.containsTurtleCode = vi.fn(() => true);
    const runner = new SkulptRunner(runtime, {});

    const canvasDiv = document.createElement('div');
    canvasDiv.id = 'turtle-exec-canvas';

    await runner.execute('import turtle\nt1 = turtle.Turtle()\nt2 = turtle.Turtle()', canvasDiv);

    expect(globalThis.Sk.TurtleGraphics.target).toBe('turtle-exec-canvas');
  });

  it('setupTurtleDiv always targets the most recently provided canvas, not a previous one', () => {
    const runtime = createRuntime();
    const runner = new SkulptRunner(runtime, {});
    runner.Sk = globalThis.Sk;

    const first = document.createElement('div');
    first.id = 'turtle-first';
    runner.setupTurtleDiv(first);
    expect(globalThis.Sk.TurtleGraphics.target).toBe('turtle-first');

    const second = document.createElement('div');
    second.id = 'turtle-second';
    runner.setupTurtleDiv(second);
    expect(globalThis.Sk.TurtleGraphics.target).toBe('turtle-second');

    const third = document.createElement('div');
    third.id = 'turtle-third';
    runner.setupTurtleDiv(third);
    expect(globalThis.Sk.TurtleGraphics.target).toBe('turtle-third');
  });
});
