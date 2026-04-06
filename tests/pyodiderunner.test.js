import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  clearPyodideExecutionLimit: vi.fn(() => Promise.resolve()),
  getImportedPyodidePackages: vi.fn(() => []),
  hasPyodideBackgroundTask: vi.fn(() => Promise.resolve(false)),
  loadMissingPyodidePackages: vi.fn(() => Promise.resolve()),
  resetPyodideBackgroundTaskState: vi.fn(() => Promise.resolve()),
  setActivePyodideRuntime: vi.fn(),
  setActivePyodideSDLCanvas: vi.fn(),
  setPyodideExecutionLimit: vi.fn(() => Promise.resolve()),
  sharedPyodideRuntimeState: {
    sharedPyodidePromise: null,
    activeSDLCanvas: null,
  },
}));

vi.mock('../src/scripts/runtime/services/pyodide-package-service', () => ({
  getImportedPyodidePackages: mocks.getImportedPyodidePackages,
  loadMissingPyodidePackages: mocks.loadMissingPyodidePackages,
}));

vi.mock('../src/scripts/runtime/services/pyodide-image-service', () => ({
  default: class PyodideImageServiceMock {
    installRegistry() {
      return Promise.resolve();
    }
  },
}));

vi.mock('../src/scripts/runtime/services/pyodide-source-service', () => ({
  default: class PyodideSourceServiceMock {
    installSourceRegistry() {
      return Promise.resolve();
    }
  },
}));

vi.mock('../src/scripts/runtime/services/pyodide-sound-service', () => ({
  default: class PyodideSoundServiceMock {
    installRegistry() {
      return Promise.resolve();
    }
  },
}));

vi.mock('../src/scripts/runtime/services/pyodide-runtime-service', () => ({
  cancelPyodideBackgroundTask: vi.fn(() => Promise.resolve(false)),
  clearPyodideExecutionLimit: mocks.clearPyodideExecutionLimit,
  getSharedPyodide: vi.fn(() => Promise.resolve(null)),
  hasPyodideBackgroundTask: mocks.hasPyodideBackgroundTask,
  installPyodideInputOverride: vi.fn(() => Promise.resolve()),
  installPyodideRuntimeCompatibility: vi.fn(() => Promise.resolve()),
  resetPyodideBackgroundTaskState: mocks.resetPyodideBackgroundTaskState,
  setActivePyodideRuntime: mocks.setActivePyodideRuntime,
  setActivePyodideSDLCanvas: mocks.setActivePyodideSDLCanvas,
  setPyodideExecutionLimit: mocks.setPyodideExecutionLimit,
  sharedPyodideRuntimeState: mocks.sharedPyodideRuntimeState,
}));

const { default: PyodideRunner } = await import('../src/scripts/runtime/pyodiderunner.js');

/**
 * Creates a minimal runtime mock for Pyodide runner tests.
 * @returns {object} Runtime mock.
 */
function createRuntime() {
  const stateManager = {
    stop: vi.fn(),
  };
  const pageManager = {
    activePageName: 'canvas',
  };

  return {
    l10n: {},
    outputHandler: vi.fn(),
    inputHandler: vi.fn(),
    onSuccess: vi.fn(),
    onError: vi.fn(),
    containsCanvasCode: vi.fn(() => false),
    containsP5Code: vi.fn(() => false),
    containsSDLCode: vi.fn(() => false),
    getAnalysisCode: vi.fn(() => 'print(1)'),
    getLocalModuleNames: vi.fn(() => []),
    codeContainer: {
      getStateManager: () => stateManager,
      getPageManager: () => pageManager,
    },
  };
}

describe('PyodideRunner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sharedPyodideRuntimeState.sharedPyodidePromise = null;
    mocks.sharedPyodideRuntimeState.activeSDLCanvas = null;
  });

  it('applies and clears the execution limit around learner code execution', async () => {
    const runtime = createRuntime();
    const runner = new PyodideRunner(runtime, { executionLimit: 1600, packages: [] });

    runner.pyodide = {
      runPythonAsync: vi.fn(() => Promise.resolve('ok')),
    };
    runner._isInitialized = true;

    await runner.execute('print(1)');

    expect(mocks.setPyodideExecutionLimit).toHaveBeenCalledWith(
      runner.pyodide,
      1600,
      'Program exceeded the execution time limit.',
    );
    expect(runner.pyodide.runPythonAsync).toHaveBeenCalledWith('print(1)');
    expect(mocks.clearPyodideExecutionLimit).toHaveBeenCalledWith(runner.pyodide);
    expect(runtime.onSuccess).toHaveBeenCalledWith('ok');
  });

  it('surfaces execution limit failures as a localized timeout message', async () => {
    const runtime = createRuntime();
    const runner = new PyodideRunner(runtime, { executionLimit: 1600, packages: [] });

    runner.pyodide = {
      runPythonAsync: vi.fn(() => Promise.reject(new Error('TimeoutError: Program exceeded the execution time limit.'))),
    };
    runner._isInitialized = true;

    await runner.execute('while True:\n  pass');

    expect(runtime.onError).toHaveBeenCalledWith('Program exceeded the execution time limit.');
    expect(mocks.clearPyodideExecutionLimit).toHaveBeenCalledWith(runner.pyodide);
  });

  it('appends a student-friendly hint for known runtime errors', async () => {
    const runtime = createRuntime();
    const runner = new PyodideRunner(runtime, { executionLimit: 1600, packages: [] });

    runner.pyodide = {
      runPythonAsync: vi.fn(() => Promise.reject(new Error("NameError: name 'score' is not defined"))),
    };
    runner._isInitialized = true;

    await runner.execute('print(score)');

    expect(runtime.onError).toHaveBeenCalledWith(expect.stringContaining('Hint: This name is unknown.'));
  });

  it('stops the runtime state after a successful execution', async () => {
    const runtime = createRuntime();
    const stateManager = runtime.codeContainer.getStateManager();
    const runner = new PyodideRunner(runtime, { packages: [] });

    runner.pyodide = {
      runPythonAsync: vi.fn(() => Promise.resolve('ok')),
    };
    runner._isInitialized = true;

    await runner.execute('print(1)');

    expect(stateManager.stop).toHaveBeenCalledTimes(1);
  });

  it('resolves imported packages from the full project code and ignores local modules', async () => {
    const runtime = createRuntime();
    runtime.getAnalysisCode.mockReturnValue('import numpy\nimport helper');
    runtime.getLocalModuleNames.mockReturnValue(['helper']);

    const runner = new PyodideRunner(runtime, { packages: [] });
    runner.pyodide = {
      runPythonAsync: vi.fn(() => Promise.resolve('ok')),
    };
    runner._isInitialized = true;

    mocks.getImportedPyodidePackages.mockReturnValue(['numpy']);

    await runner.execute('from helper import VALUE');

    expect(mocks.getImportedPyodidePackages).toHaveBeenCalledWith(
      'import numpy\nimport helper',
      { localModuleNames: ['helper'] },
    );
    expect(mocks.loadMissingPyodidePackages).toHaveBeenCalledWith(runner.pyodide, ['numpy']);
  });

  it('executes input() code via the async input helper instead of regex rewriting', async () => {
    const runtime = createRuntime();
    const runner = new PyodideRunner(runtime, { packages: [] });
    const runPythonAsync = vi.fn(() => Promise.resolve('ok'));

    runner.pyodide = {
      runPythonAsync,
    };
    runner._isInitialized = true;

    await runner.execute('name = input("Name?")\nprint(name)');

    const [executedCode] = runPythonAsync.mock.calls[0];
    expect(executedCode).toContain('await _h5p_run_with_async_input(');
    expect(executedCode).not.toContain('await input(');
  });

  it('restores overridden p5 window globals when stopping the runner', () => {
    const runtime = createRuntime();
    const runner = new PyodideRunner(runtime, {});
    const canvasDiv = document.createElement('div');

    const originalSetup = window.setup;
    const originalDraw = window.draw;
    const hadSetup = Object.prototype.hasOwnProperty.call(window, 'setup');
    const hadDraw = Object.prototype.hasOwnProperty.call(window, 'draw');
    const hadTempP5Fn = Object.prototype.hasOwnProperty.call(window, 'h5pTempP5Fn');
    const originalTempP5Fn = window.h5pTempP5Fn;
    const previousP5 = window.p5;

    const remove = vi.fn();

    window.setup = vi.fn();
    window.draw = vi.fn();
    delete window.h5pTempP5Fn;

    window.p5 = class P5Mock {
      constructor(sketch) {
        const proto = {
          h5pTempP5Fn() {},
        };
        const instance = Object.create(proto);
        instance.noLoop = vi.fn();
        sketch(instance);
        this.remove = remove;
      }
    };

    runner.setupP5(canvasDiv);

    expect(typeof window.h5pTempP5Fn).toBe('function');

    runner.stop();

    expect(remove).toHaveBeenCalledTimes(1);
    expect(window.setup).toBe(originalSetup);
    expect(window.draw).toBe(originalDraw);
    expect(Object.prototype.hasOwnProperty.call(window, 'h5pTempP5Fn')).toBe(hadTempP5Fn);
    if (hadTempP5Fn) {
      expect(window.h5pTempP5Fn).toBe(originalTempP5Fn);
    }

    if (!hadSetup) {
      delete window.setup;
    }
    if (!hadDraw) {
      delete window.draw;
    }
    if (!hadTempP5Fn) {
      delete window.h5pTempP5Fn;
    }
    if (typeof previousP5 === 'undefined') {
      delete window.p5;
    }
    else {
      window.p5 = previousP5;
    }
  });

  it('rebinds SDL rendering to the visible canvas when acquiring input focus', () => {
    const runtime = createRuntime();
    const runner = new PyodideRunner(runtime, {});
    const canvas = document.createElement('canvas');
    const focus = vi.fn();

    canvas.focus = focus;
    document.body.appendChild(canvas);

    runner.sdlCanvas = canvas;
    runner.pyodide = {
      canvas: {
        setCanvas2D: vi.fn(),
      },
    };

    runner.acquireInputFocus();

    expect(runner.pyodide.canvas.setCanvas2D).toHaveBeenCalledWith(canvas);
    expect(mocks.setActivePyodideSDLCanvas).toHaveBeenCalledWith(canvas);
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('captures SDL arrow keys and prevents editor-side cursor movement in other instances', () => {
    const runtime = createRuntime();
    runtime.containsSDLCode.mockReturnValue(true);
    const runner = new PyodideRunner(runtime, {});
    const canvasWrapper = document.createElement('div');
    const canvas = document.createElement('canvas');
    const focus = vi.fn();

    canvas.focus = focus;
    canvasWrapper.appendChild(canvas);
    document.body.appendChild(canvasWrapper);

    const foreignEditor = document.createElement('div');
    foreignEditor.tabIndex = 0;
    document.body.appendChild(foreignEditor);
    foreignEditor.focus();

    runner.canvasWrapper = canvasWrapper;
    runner.canvasDiv = canvasWrapper;
    runner.sdlCanvas = canvas;
    mocks.sharedPyodideRuntimeState.activeSDLRunner = runner;

    runner.installSDLKeyboardCapture();

    const event = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true,
    });

    document.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(focus).toHaveBeenCalledTimes(1);

    runner.uninstallSDLKeyboardCapture();
    canvasWrapper.remove();
    foreignEditor.remove();
    mocks.sharedPyodideRuntimeState.activeSDLRunner = null;
  });

  it('allows SDL arrow keys to continue to the canvas when the canvas already has focus', () => {
    const runtime = createRuntime();
    runtime.containsSDLCode.mockReturnValue(true);
    const runner = new PyodideRunner(runtime, {});
    const canvasWrapper = document.createElement('div');
    const canvas = document.createElement('canvas');
    const stopPropagation = vi.fn();

    canvas.tabIndex = 0;
    canvasWrapper.appendChild(canvas);
    document.body.appendChild(canvasWrapper);

    runner.canvasWrapper = canvasWrapper;
    runner.canvasDiv = canvasWrapper;
    runner.sdlCanvas = canvas;
    mocks.sharedPyodideRuntimeState.activeSDLRunner = runner;

    runner.installSDLKeyboardCapture();
    canvas.focus();

    const event = new KeyboardEvent('keydown', {
      key: 'ArrowUp',
      bubbles: true,
      cancelable: true,
    });
    event.stopPropagation = stopPropagation;

    canvas.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(stopPropagation).not.toHaveBeenCalled();

    runner.uninstallSDLKeyboardCapture();
    canvasWrapper.remove();
    mocks.sharedPyodideRuntimeState.activeSDLRunner = null;
  });

  it('does not capture SDL arrow keys when the instance is not on canvas page', () => {
    const runtime = createRuntime();
    runtime.containsSDLCode.mockReturnValue(true);
    runtime.codeContainer.getPageManager().activePageName = 'code';

    const runner = new PyodideRunner(runtime, {});
    const canvas = document.createElement('canvas');
    document.body.appendChild(canvas);

    runner.sdlCanvas = canvas;
    mocks.sharedPyodideRuntimeState.activeSDLRunner = runner;
    runner.installSDLKeyboardCapture();

    const event = new KeyboardEvent('keydown', {
      key: 'ArrowLeft',
      bubbles: true,
      cancelable: true,
    });

    document.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);

    runner.uninstallSDLKeyboardCapture();
    canvas.remove();
    mocks.sharedPyodideRuntimeState.activeSDLRunner = null;
  });

  it('releases SDL input focus without rebinding canvas target', () => {
    const runtime = createRuntime();
    const runner = new PyodideRunner(runtime, {});
    const canvas = document.createElement('canvas');
    const blur = vi.fn();

    canvas.blur = blur;
    document.body.appendChild(canvas);
    canvas.focus();

    runner.sdlCanvas = canvas;
    runner.pyodide = {
      canvas: {
        setCanvas2D: vi.fn(),
      },
    };
    runner.releaseInputFocus();

    expect(blur).toHaveBeenCalledTimes(1);
    expect(runner.pyodide.canvas.setCanvas2D).not.toHaveBeenCalled();
    expect(mocks.setActivePyodideSDLCanvas).not.toHaveBeenCalled();
  });

  it('posts a synthetic pygame mouse button event for pointer input over the SDL canvas', () => {
    const runtime = createRuntime();
    const runner = new PyodideRunner(runtime, {});
    const wrapper = document.createElement('div');
    const canvas = document.createElement('canvas');
    const focus = vi.fn();

    canvas.width = 200;
    canvas.height = 100;
    canvas.focus = focus;
    canvas.getBoundingClientRect = () => ({
      left: 0,
      right: 200,
      top: 0,
      bottom: 100,
      width: 200,
      height: 100,
    });

    wrapper.appendChild(canvas);
    document.body.appendChild(wrapper);

    const bindSDLCanvasSpy = vi.spyOn(runner, 'bindSDLCanvas').mockImplementation(() => {});
    const runPythonAsync = vi.fn(() => Promise.resolve());

    runner.canvasWrapper = wrapper;
    runner.canvasDiv = wrapper;
    runner.sdlCanvas = canvas;
    runner.pyodide = {
      runPythonAsync,
      canvas: {
        setCanvas2D: vi.fn(),
      },
    };

    runner.installSDLMouseCapture();
    runner._sdlMouseCaptureBound({
      type: 'pointerdown',
      clientX: 80,
      clientY: 40,
      button: 0,
      buttons: 1,
    });

    expect(bindSDLCanvasSpy).toHaveBeenCalled();
    expect(focus).toHaveBeenCalledTimes(1);
    expect(runPythonAsync).toHaveBeenCalledWith(expect.stringContaining('pygame.MOUSEBUTTONDOWN'));

    runner.uninstallSDLMouseCapture();
    wrapper.remove();
  });

  it('ignores mouse fallback events when PointerEvent support exists', () => {
    const runtime = createRuntime();
    const runner = new PyodideRunner(runtime, {});
    const originalPointerEvent = window.PointerEvent;

    window.PointerEvent = function PointerEventMock() {};

    runner.sdlCanvas = { width: 200, height: 100 };
    runner.pyodide = {
      runPythonAsync: vi.fn(() => Promise.resolve()),
    };

    runner.postSyntheticPygameMouseEvent({
      type: 'mousedown',
      clientX: 50,
      clientY: 40,
      button: 0,
      buttons: 1,
    }, {
      left: 0,
      top: 0,
      width: 200,
      height: 100,
    });

    expect(runner.pyodide.runPythonAsync).not.toHaveBeenCalled();

    if (typeof originalPointerEvent === 'undefined') {
      delete window.PointerEvent;
    }
    else {
      window.PointerEvent = originalPointerEvent;
    }
  });

  it('scales SDL canvas aspect-ratio-correct into the container via CSS', () => {
    const runtime = createRuntime();
    const runner = new PyodideRunner(runtime, {});
    const canvasDiv = document.createElement('div');
    const canvas = document.createElement('canvas');

    Object.defineProperty(canvasDiv, 'clientWidth', { value: 960, configurable: true });
    Object.defineProperty(canvasDiv, 'clientHeight', { value: 540, configurable: true });

    // 320×240 = 4:3; container 960×540 is 16:9; height is the limiting dimension.
    canvas.width = 320;
    canvas.height = 240;
    runner.canvasDiv = canvasDiv;
    runner.sdlCanvas = canvas;

    runner.syncSDLCanvasSize();

    // Logical pixel dimensions are preserved so pygame coordinate mapping stays correct.
    expect(canvas.width).toBe(320);
    expect(canvas.height).toBe(240);
    // Canvas is scaled uniformly (no stretch): height limited → 720×540.
    expect(canvas.style.width).toBe('720px');
    expect(canvas.style.height).toBe('540px');
  });

  it('fills the container when canvas and container aspect ratios match exactly', () => {
    const runtime = createRuntime();
    const runner = new PyodideRunner(runtime, {});
    const canvasDiv = document.createElement('div');
    const canvas = document.createElement('canvas');

    Object.defineProperty(canvasDiv, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(canvasDiv, 'clientHeight', { value: 600, configurable: true });

    // 400×300 = 4:3; 800×600 = 4:3: scale = 2 → fills container exactly.
    canvas.width = 400;
    canvas.height = 300;
    runner.canvasDiv = canvasDiv;
    runner.sdlCanvas = canvas;

    runner.syncSDLCanvasSize();

    expect(canvas.style.width).toBe('800px');
    expect(canvas.style.height).toBe('600px');
  });

  it('falls back to container fill when canvas has zero dimensions', () => {
    const runtime = createRuntime();
    const runner = new PyodideRunner(runtime, {});
    const canvasDiv = document.createElement('div');
    const canvas = document.createElement('canvas');

    Object.defineProperty(canvasDiv, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(canvasDiv, 'clientHeight', { value: 600, configurable: true });

    canvas.width = 0;
    canvas.height = 0;
    runner.canvasDiv = canvasDiv;
    runner.sdlCanvas = canvas;

    runner.syncSDLCanvasSize();

    expect(canvas.style.width).toBe('800px');
    expect(canvas.style.height).toBe('600px');
  });

  it('re-syncs canvas CSS size automatically when pygame changes canvas dimensions', async () => {
    const runtime = createRuntime();
    const runner = new PyodideRunner(runtime, {});
    const canvasDiv = document.createElement('div');

    Object.defineProperty(canvasDiv, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(canvasDiv, 'clientHeight', { value: 600, configurable: true });

    document.body.appendChild(canvasDiv);

    runner.pyodide = { canvas: { setCanvas2D: vi.fn() }, _api: {} };
    const canvas = runner.setupSDLCanvas(canvasDiv);

    // Initially: canvas dimensions equal container (800×600 = 4:3), fills 800×600.
    expect(canvas.style.width).toBe('800px');
    expect(canvas.style.height).toBe('600px');

    // Simulate pygame.display.set_mode(400, 300): SDL sets canvas.width/height.
    canvas.width = 400;
    canvas.height = 300;

    // MutationObserver fires asynchronously; give it one microtask tick.
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Aspect-ratio-correct scaling: 800/400=2.0, 600/300=2.0 → fills 800×600.
    expect(canvas.style.width).toBe('800px');
    expect(canvas.style.height).toBe('600px');

    canvasDiv.remove();
  });

  it('disconnects the canvas dimension observer on releaseInputFocus', () => {
    const runtime = createRuntime();
    const runner = new PyodideRunner(runtime, {});
    const canvasDiv = document.createElement('div');
    document.body.appendChild(canvasDiv);

    runner.pyodide = { canvas: { setCanvas2D: vi.fn() }, _api: {} };
    runner.setupSDLCanvas(canvasDiv);

    expect(runner._canvasDimensionObserver).not.toBeNull();

    runner.releaseInputFocus();

    expect(runner._canvasDimensionObserver).toBeNull();

    canvasDiv.remove();
  });

  it('resizes before and during scheduled SDL canvas rebinds', () => {
    const runtime = createRuntime();
    const runner = new PyodideRunner(runtime, {});
    const syncSDLCanvasSize = vi.spyOn(runner, 'syncSDLCanvasSize').mockImplementation(() => {});
    const bindSDLCanvas = vi.spyOn(runner, 'bindSDLCanvas').mockImplementation(() => {});
    const originalRequestAnimationFrame = window.requestAnimationFrame;

    window.requestAnimationFrame = vi.fn((callback) => {
      callback();
      return 1;
    });

    runner.scheduleSDLCanvasRebind();

    expect(syncSDLCanvasSize).toHaveBeenCalledTimes(2);
    expect(bindSDLCanvas).toHaveBeenCalledTimes(2);

    window.requestAnimationFrame = originalRequestAnimationFrame;
  });

  it('binds the visible SDL canvas only once during setup', () => {
    const runtime = createRuntime();
    const runner = new PyodideRunner(runtime, {});
    const canvasDiv = document.createElement('div');

    document.body.appendChild(canvasDiv);

    runner.pyodide = {
      canvas: {
        setCanvas2D: vi.fn(),
      },
      _api: {},
    };

    const canvas = runner.setupSDLCanvas(canvasDiv);

    expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    expect(runner.pyodide.canvas.setCanvas2D).toHaveBeenCalledTimes(1);
    expect(mocks.setActivePyodideSDLCanvas).toHaveBeenCalledWith(canvas);

    canvasDiv.remove();
  });

  it('rebinds SDL canvas during execute to avoid stale inactive bindings', async () => {
    const runtime = createRuntime();
    runtime.containsCanvasCode.mockReturnValue(true);
    runtime.containsSDLCode.mockReturnValue(true);

    const runner = new PyodideRunner(runtime, {});
    const canvasDiv = document.createElement('div');
    document.body.appendChild(canvasDiv);

    runner.pyodide = {
      runPythonAsync: vi.fn(() => Promise.resolve('ok')),
      canvas: {
        setCanvas2D: vi.fn(),
      },
      _api: {},
    };
    runner._isInitialized = true;

    await runner.execute('print(1)', canvasDiv);

    expect(runner.pyodide.canvas.setCanvas2D.mock.calls.length).toBeGreaterThanOrEqual(2);

    canvasDiv.remove();
  });
});