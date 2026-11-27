import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
 * Creates a runtime stub with observable console and state managers.
 * @param {object} [overrides] - Runtime properties to replace.
 * @returns {object} Runtime stub.
 */
function createRuntime(overrides = {}) {
  const consoleManager = { write: vi.fn() };
  const stateManager = { stop: vi.fn() };

  return {
    l10n: {},
    outputHandler: vi.fn(),
    inputHandler: vi.fn(),
    onSuccess: vi.fn(),
    onError: vi.fn(),
    containsP5Code: vi.fn(() => false),
    containsTurtleCode: vi.fn(() => false),
    codeContainer: { getStateManager: () => stateManager },
    getConsoleManager: () => consoleManager,
    ...overrides,
  };
}

describe('SkulptRunner lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    globalThis.Sk = {
      configure: vi.fn(),
      importMainWithBody: vi.fn(() => 'ok'),
      misceval: { asyncToPromise: vi.fn(async (callback) => callback()) },
      python3: {},
      builtins: {},
      builtinFiles: { files: { 'lib/math.js': 'source' } },
      ffi: { remapToPy: vi.fn((value) => ({ py: value })) },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete globalThis.Sk;
    delete window.p5;
    delete window.setup;
    delete window.draw;
    delete window.circle;
  });

  it('stops sleeping code, turtle and p5, and resets the run state', () => {
    const runtime = createRuntime();
    const runner = new SkulptRunner(runtime);
    Object.assign(globalThis.Sk, {
      rejectSleep: vi.fn(),
      TurtleGraphics: { stop: vi.fn() },
      p5: { kill: vi.fn() },
    });

    expect(runner.stop()).toBe(true);
    expect(globalThis.Sk.shouldStop).toBe(true);
    expect(globalThis.Sk.rejectSleep).toHaveBeenCalledWith('Interrupted execution');
    expect(globalThis.Sk.TurtleGraphics.stop).toHaveBeenCalled();
    expect(globalThis.Sk.p5.kill).toHaveBeenCalled();
    expect(runtime.codeContainer.getStateManager().stop).toHaveBeenCalled();
  });

  it.each([
    ['turtle', { TurtleGraphics: { stop: () => { throw new Error('busy'); } } }],
    ['p5', { p5: { kill: () => { throw new Error('busy'); } } }],
  ])('reports a failed stop when %s cannot be stopped', (_name, extension) => {
    Object.assign(globalThis.Sk, extension);

    expect(new SkulptRunner(createRuntime()).stop()).toBe(false);
  });

  it('can be stopped before Skulpt is loaded', () => {
    delete globalThis.Sk;
    const runner = new SkulptRunner(createRuntime());

    expect(runner.stop()).toBe(true);
    expect(runner.stopped).toBe(true);
  });

  it('suspends running code only after a stop request', () => {
    const runner = new SkulptRunner(createRuntime());

    expect(() => runner.suspension['*']()).not.toThrow();
    runner.stop();
    expect(() => runner.suspension['*']()).toThrow('Program suspended');
  });

  it.each([
    'Interrupted execution',
    'Program suspended',
    { toString: () => 'ExternalError: Interrupted execution' },
  ])('writes an abort notice instead of an error for %s', (error) => {
    const runtime = createRuntime();

    new SkulptRunner(runtime).onError(error);

    expect(runtime.getConsoleManager().write).toHaveBeenCalledTimes(1);
    expect(runtime.onError).not.toHaveBeenCalled();
  });

  it('still reports errors without a traceback', () => {
    const runtime = createRuntime();
    const runner = new SkulptRunner(runtime);

    runner.onError({});

    expect(runner.errorLineNumber).toBeNull();
    expect(runtime.onError).toHaveBeenCalledWith(expect.objectContaining({ line: null, diagnostics: [] }));
  });

  it('serves Skulpt builtin files and rejects unknown ones', () => {
    const runner = new SkulptRunner(createRuntime());

    expect(runner._readHandler('lib/math.js')).toBe('source');
    expect(() => runner._readHandler('lib/missing.py')).toThrow();
  });

  it('passes output and input through to the runtime', async () => {
    const runtime = createRuntime();
    await new SkulptRunner(runtime).setup();
    const configuration = globalThis.Sk.configure.mock.calls[0][0];

    configuration.output('hello');
    configuration.inputfun('Name?');

    expect(runtime.outputHandler).toHaveBeenCalledWith('hello');
    expect(runtime.inputHandler).toHaveBeenCalledWith('Name?');
    expect(configuration.read('lib/math.js')).toBe('source');
  });

  it('fails clearly when Skulpt cannot be loaded', async () => {
    delete globalThis.Sk;
    serviceMocks.ensureSkulptRuntime.mockResolvedValueOnce(undefined);

    await expect(new SkulptRunner(createRuntime()).setup()).rejects.toThrow('Skulpt runtime is not loaded.');
  });

  it('exposes only enabled uploads to Python', () => {
    const images = [{ name: 'cat.png', data: 'data:image/png;base64,AA==' }];
    const runtime = createRuntime();
    runtime.codeContainer.getImageManager = () => ({ isEnabled: () => true, getImages: () => images });
    runtime.codeContainer.getSoundManager = () => ({ isEnabled: () => false, getSounds: () => images });
    const runner = new SkulptRunner(runtime);

    expect(runner.getUploadedImages()).toBe(images);
    expect(runner.getUploadedSounds()).toEqual([]);

    runner.installImageRegistry();
    runner.installSoundRegistry();

    expect(globalThis.Sk.builtins.h5p_images).toEqual({ py: runner.buildImageRegistry() });
    expect(globalThis.Sk.builtins.h5p_sounds).toEqual({ py: runner.buildSoundRegistry() });
  });

  it('mirrors p5 sketch functions and stops the draw loop on request', async () => {
    const circle = vi.fn();
    let instance;
    window.setup = vi.fn();
    window.draw = vi.fn();
    window.p5 = function P5Mock(sketch) {
      instance = Object.create({ circle });
      instance.noLoop = vi.fn();
      sketch(instance);
      return instance;
    };
    window.p5.prototype.registerMethod = vi.fn();
    const runner = new SkulptRunner(createRuntime({ containsP5Code: vi.fn(() => true) }));

    await runner.execute('print(1)', document.createElement('div'));
    instance.setup();
    instance.draw();
    window.circle(1, 2, 3);

    expect(window.setup).toHaveBeenCalled();
    expect(window.draw).toHaveBeenCalledTimes(1);
    expect(circle).toHaveBeenCalledWith(1, 2, 3);

    runner.stopped = true;
    instance.draw();

    expect(instance.noLoop).toHaveBeenCalled();
    expect(window.draw).toHaveBeenCalledTimes(1);
  });

  it('replaces the previous p5 sketch and copies instance members to the prototype', () => {
    let initHook;
    window.p5 = function P5Mock() {};
    window.p5.prototype.registerMethod = (_name, hook) => { initHook = hook; };
    const runner = new SkulptRunner(createRuntime());
    const remove = vi.fn();
    const canvasDiv = document.createElement('div');
    canvasDiv.innerHTML = '<canvas></canvas>';
    runner.p5Instance = { remove };

    runner.setupP5(canvasDiv);
    initHook.call({ loadThing: 'value' });

    expect(remove).toHaveBeenCalled();
    expect(canvasDiv.innerHTML).toBe('');
    expect(window.p5.prototype.loadThing).toBe('value');
  });

  it('leaves the canvas untouched when p5 is missing', () => {
    const canvasDiv = document.createElement('div');
    canvasDiv.innerHTML = '<canvas></canvas>';

    new SkulptRunner(createRuntime()).setupP5(canvasDiv);

    expect(canvasDiv.innerHTML).toBe('<canvas></canvas>');
  });

  it('reports a loading failure while preparing the canvas', async () => {
    serviceMocks.ensureSkulptRuntime.mockRejectedValueOnce(new Error('offline'));
    const runtime = createRuntime();

    new SkulptRunner(runtime).addCanvas(document.createElement('div'), document.createElement('div'));

    await vi.waitFor(() => expect(runtime.onError).toHaveBeenCalledWith('offline'));
  });
});
