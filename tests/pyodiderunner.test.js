import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  clearPyodideExecutionLimit: vi.fn(() => Promise.resolve()),
  getImportedPyodidePackages: vi.fn(() => []),
  hasPyodideBackgroundTask: vi.fn(() => Promise.resolve(false)),
  loadMissingPyodidePackages: vi.fn(() => Promise.resolve()),
  resetPyodideBackgroundTaskState: vi.fn(() => Promise.resolve()),
  setActivePyodideRuntime: vi.fn(),
  setPyodideExecutionLimit: vi.fn(() => Promise.resolve()),
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
  setActivePyodideSDLCanvas: vi.fn(),
  setPyodideExecutionLimit: mocks.setPyodideExecutionLimit,
  sharedPyodideRuntimeState: {
    sharedPyodidePromise: null,
  },
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
    },
  };
}

describe('PyodideRunner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    } else {
      window.p5 = previousP5;
    }
  });
});