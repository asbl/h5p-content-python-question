import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  SkulptRunnerMock,
  PyodideRunnerMock,
  CanvasRuntimeManagerMock,
  getPythonL10nValueMock,
  canvasManagers,
} = vi.hoisted(() => {
  const canvasManagers = [];

  const SkulptRunnerMock = vi.fn().mockImplementation(() => ({
    setup: vi.fn(async () => {}),
  }));

  const PyodideRunnerMock = vi.fn().mockImplementation(() => ({
    setup: vi.fn(async () => {}),
  }));

  const CanvasRuntimeManagerMock = vi.fn().mockImplementation(() => {
    const instance = {
      setup: vi.fn(),
      attachCanvas: vi.fn(),
    };
    canvasManagers.push(instance);
    return instance;
  });

  const getPythonL10nValueMock = vi.fn(() => 'Python runtime');

  return {
    SkulptRunnerMock,
    PyodideRunnerMock,
    CanvasRuntimeManagerMock,
    getPythonL10nValueMock,
    canvasManagers,
  };
});

vi.mock('../src/scripts/runtime/skulptrunner', () => ({
  default: SkulptRunnerMock,
}));

vi.mock('../src/scripts/runtime/pyodiderunner', () => ({
  default: PyodideRunnerMock,
}));

vi.mock('../src/scripts/runtime/canvasruntimemanager', () => ({
  default: CanvasRuntimeManagerMock,
}));

vi.mock('../src/scripts/services/python-l10n', () => ({
  getPythonL10nValue: getPythonL10nValueMock,
}));

let PythonRuntime;

/**
 * Creates a runtime code-container stub.
 * @param {object|null} [workspaceSnapshot] Workspace snapshot returned by the container.
 * @returns {object} Code-container stub.
 */
function createCodeContainer(workspaceSnapshot = null) {
  return {
    getCanvasManager: vi.fn(() => ({ type: 'canvas-manager' })),
    getWorkspaceSnapshot: vi.fn(() => workspaceSnapshot),
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  canvasManagers.length = 0;

  class RuntimeBase {
    constructor(resizeActionHandler, code, options = {}) {
      this.resizeActionHandler = resizeActionHandler;
      this.code = code;
      this.options = options;
      this.codeContainer = null;
      this._basePrepared = false;
    }

    setup(codeContainer) {
      this.codeContainer = codeContainer;
    }

    prepareForRun() {
      this._basePrepared = true;
    }

    getCode() {
      return this.code;
    }

    onError(message) {
      this._error = message;
    }
  }

  globalThis.H5P = {
    ...(globalThis.H5P || {}),
    Runtime: RuntimeBase,
  };

  ({ default: PythonRuntime } = await import('../src/scripts/runtime/runtime-python.js'));
});

describe('PythonRuntime', () => {
  it('initializes with localized runtime type and configured runner type', () => {
    const runtime = new PythonRuntime(vi.fn(), 'print(1)', { runner: 'pyodide', l10n: {} });

    expect(runtime.type).toBe('Python runtime');
    expect(runtime.runnerType).toBe('pyodide');
    expect(getPythonL10nValueMock).toHaveBeenCalledWith({}, 'pythonRuntime');
  });

  it('creates and caches the skulpt runner by default', () => {
    const runtime = new PythonRuntime(vi.fn(), 'print(1)');

    const first = runtime.getRunner();
    const second = runtime.getRunner();

    expect(SkulptRunnerMock).toHaveBeenCalledTimes(1);
    expect(PyodideRunnerMock).not.toHaveBeenCalled();
    expect(first).toBe(second);
  });

  it('creates the pyodide runner when configured', () => {
    const runtime = new PythonRuntime(vi.fn(), 'print(1)', { runner: 'pyodide' });

    runtime.getRunner();

    expect(PyodideRunnerMock).toHaveBeenCalledTimes(1);
    expect(SkulptRunnerMock).not.toHaveBeenCalled();
  });

  it('creates and caches a canvas manager', () => {
    const runtime = new PythonRuntime(vi.fn(), 'print(1)');
    runtime.setup(createCodeContainer());

    const first = runtime.getCanvasManager();
    const second = runtime.getCanvasManager();

    expect(CanvasRuntimeManagerMock).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
    expect(first.setup).toHaveBeenCalledTimes(1);
  });

  it('returns null project snapshot for non-pyodide runner', () => {
    const workspace = { files: [{ name: 'main.py', isEntry: true, code: 'x=1' }] };
    const runtime = new PythonRuntime(vi.fn(), 'print(1)', { runner: 'skulpt' });
    runtime.setup(createCodeContainer(workspace));

    expect(runtime.getProjectSnapshot()).toBeNull();
  });

  it('returns workspace snapshot for pyodide runner', () => {
    const workspace = { files: [{ name: 'main.py', isEntry: true, code: 'x=1' }] };
    const runtime = new PythonRuntime(vi.fn(), 'print(2)', { runner: 'pyodide' });
    runtime.setup(createCodeContainer(workspace));

    expect(runtime.getProjectSnapshot()).toBe(workspace);
  });

  it('builds analysis code from project files and replaces the entry with current code', () => {
    const workspace = {
      files: [
        { name: 'main.py', isEntry: true, code: 'author code' },
        { name: 'helper.py', isEntry: false, code: 'import math' },
      ],
    };
    const runtime = new PythonRuntime(vi.fn(), 'learner code', { runner: 'pyodide' });
    runtime.setup(createCodeContainer(workspace));

    expect(runtime.getAnalysisCode()).toBe('learner code\nimport math');
  });

  it('falls back to getCode() when no project files exist', () => {
    const runtime = new PythonRuntime(vi.fn(), 'print("hello")', { runner: 'pyodide' });
    runtime.setup(createCodeContainer({ files: [] }));

    expect(runtime.getAnalysisCode()).toBe('print("hello")');
  });

  it('derives local module names from non-entry files', () => {
    const workspace = {
      files: [
        { name: 'main.py', isEntry: true, code: 'print(1)' },
        { name: 'helper.py', isEntry: false, code: '' },
        { name: 'UTILS.PY', isEntry: false, code: '' },
        { name: 'notes.txt', isEntry: false, code: '' },
      ],
    };
    const runtime = new PythonRuntime(vi.fn(), 'print(2)', { runner: 'pyodide' });
    runtime.setup(createCodeContainer(workspace));

    expect(runtime.getLocalModuleNames()).toEqual(['helper', 'UTILS', 'notes.txt']);
  });

  it('detects turtle imports in analysis code', () => {
    const runtime = new PythonRuntime(vi.fn(), 'from turtle import *');
    vi.spyOn(runtime, 'getAnalysisCode').mockReturnValue('from turtle import *');

    expect(runtime.containsTurtleCode()).toBe(true);
    expect(runtime.containsCanvasCode()).toBe(true);
  });

  it('detects SDL-related imports (pygame/miniworlds)', () => {
    const runtime = new PythonRuntime(vi.fn(), 'import pygame');
    vi.spyOn(runtime, 'getAnalysisCode').mockReturnValue('import pygame');

    expect(runtime.containsPygameCode()).toBe(true);
    expect(runtime.containsSDLCode()).toBe(true);
    expect(runtime.containsCanvasCode()).toBe(true);
  });

  it('returns false for canvas detection when analysis code is empty', () => {
    const runtime = new PythonRuntime(vi.fn(), '');
    vi.spyOn(runtime, 'getAnalysisCode').mockReturnValue('');

    expect(runtime.containsCanvasCode()).toBe(false);
    expect(runtime.containsTurtleCode()).toBe(false);
    expect(runtime.containsP5Code()).toBe(false);
    expect(runtime.containsPygameCode()).toBe(false);
    expect(runtime.containsMiniworldsCode()).toBe(false);
  });

  it('prepareForRun calls base prepare for skulpt and attaches canvas when needed', () => {
    const runtime = new PythonRuntime(vi.fn(), 'import turtle', { runner: 'skulpt' });
    runtime.setup(createCodeContainer());
    vi.spyOn(runtime, 'containsCanvasCode').mockReturnValue(true);

    runtime.prepareForRun();

    expect(runtime._basePrepared).toBe(true);
    expect(canvasManagers[0].attachCanvas).toHaveBeenCalledWith('manual');
  });

  it('prepareForRun triggers pyodide setup and forwards setup errors to onError', async () => {
    const runtime = new PythonRuntime(vi.fn(), 'print(1)', { runner: 'pyodide' });
    runtime.runner = {
      setup: vi.fn(() => Promise.reject(new Error('boom'))),
    };
    runtime._canvasManager = {
      attachCanvas: vi.fn(),
    };
    vi.spyOn(runtime, 'containsCanvasCode').mockReturnValue(false);
    const onErrorSpy = vi.spyOn(runtime, 'onError');

    runtime.prepareForRun();
    await Promise.resolve();

    expect(runtime.runner.setup).toHaveBeenCalledTimes(1);
    expect(onErrorSpy).toHaveBeenCalledWith('Error: boom');
    expect(runtime._basePrepared).toBe(false);
  });
});
