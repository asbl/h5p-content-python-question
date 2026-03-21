import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  CanvasRuntimeManagerMock,
  canvasManagers,
} = vi.hoisted(() => {
  const canvasManagers = [];

  const CanvasRuntimeManagerMock = vi.fn().mockImplementation(() => {
    const instance = {
      setup: vi.fn(),
      attachCanvas: vi.fn(),
    };
    canvasManagers.push(instance);
    return instance;
  });

  return {
    CanvasRuntimeManagerMock,
    canvasManagers,
  };
});

vi.mock('../src/scripts/runtime/canvasruntimemanager', () => ({
  default: CanvasRuntimeManagerMock,
}));

vi.mock('../src/scripts/runtime/runtime-python', () => ({
  default: class PythonRuntimeMock {
    constructor(_resizeActionHandler, code, options = {}) {
      this.code = code;
      this.options = options;
      this.runnerType = options.runner || 'skulpt';
      this.runner = { name: 'runner' };
      this._basePrepared = false;
      this.codeContainer = null;
      this.codeTester = {
        view: { name: 'view' },
        testCaseIndex: 0,
      };
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

    containsCanvasCode() {
      return false;
    }
  },
}));

let PythonSolutionRuntime;

beforeEach(async () => {
  vi.clearAllMocks();
  canvasManagers.length = 0;

  globalThis.H5P = {
    ...(globalThis.H5P || {}),
    SolutionRuntimeMixin: (BaseClass) => class extends BaseClass {},
  };

  ({ default: PythonSolutionRuntime } = await import('../src/scripts/runtime/runtime-solution-python.js'));
});

/**
 * Creates a code-container stub that returns the author workspace snapshot.
 * @param {object|null} [defaultWorkspace] Workspace snapshot.
 * @returns {object} Code-container stub.
 */
function createCodeContainer(defaultWorkspace = null) {
  return {
    getDefaultWorkspaceSnapshot: vi.fn(() => defaultWorkspace),
  };
}

describe('PythonSolutionRuntime', () => {
  it('returns null project snapshot for non-pyodide runner', () => {
    const runtime = new PythonSolutionRuntime(vi.fn(), 'solution', { runner: 'skulpt' });
    runtime.setup(createCodeContainer({ files: [{ name: 'main.py', isEntry: true, code: 'author' }] }));

    expect(runtime.getProjectSnapshot()).toBeNull();
  });

  it('returns null when the default workspace has no files', () => {
    const runtime = new PythonSolutionRuntime(vi.fn(), 'solution', { runner: 'pyodide' });
    runtime.setup(createCodeContainer({ files: [] }));

    expect(runtime.getProjectSnapshot()).toBeNull();
  });

  it('clones the default workspace and replaces the entry file code with solution code', () => {
    const authorWorkspace = {
      entryFileName: 'main.py',
      files: [
        { name: 'main.py', isEntry: true, code: 'author-main' },
        { name: 'helper.py', isEntry: false, code: 'author-helper' },
      ],
    };
    const runtime = new PythonSolutionRuntime(vi.fn(), 'expected-main', { runner: 'pyodide' });
    runtime.setup(createCodeContainer(authorWorkspace));

    const snapshot = runtime.getProjectSnapshot();

    expect(snapshot).not.toBe(authorWorkspace);
    expect(snapshot.files[0]).not.toBe(authorWorkspace.files[0]);
    expect(snapshot.files[0].code).toBe('expected-main');
    expect(snapshot.files[1].code).toBe('author-helper');
    expect(authorWorkspace.files[0].code).toBe('author-main');
  });

  it('falls back to entryFileName when no file is explicitly marked as entry', () => {
    const authorWorkspace = {
      entryFileName: 'program.py',
      files: [
        { name: 'program.py', code: 'author-main' },
        { name: 'lib.py', code: 'author-lib' },
      ],
    };
    const runtime = new PythonSolutionRuntime(vi.fn(), 'expected-main', { runner: 'pyodide' });
    runtime.setup(createCodeContainer(authorWorkspace));

    const snapshot = runtime.getProjectSnapshot();

    expect(snapshot.files[0].code).toBe('expected-main');
    expect(snapshot.files[1].code).toBe('author-lib');
  });

  it('creates and caches a canvas manager bound to codeTester.view', () => {
    const runtime = new PythonSolutionRuntime(vi.fn(), 'solution', { runner: 'pyodide' });
    runtime.codeTester = {
      view: { type: 'expected-view' },
      session: { testCaseIndex: 2 },
    };

    const first = runtime.getCanvasManager();
    const second = runtime.getCanvasManager();

    expect(CanvasRuntimeManagerMock).toHaveBeenCalledTimes(1);
    expect(CanvasRuntimeManagerMock).toHaveBeenCalledWith(runtime.codeTester.view, runtime.runner);
    expect(first).toBe(second);
    expect(first.setup).toHaveBeenCalledTimes(1);
  });

  it('prepareForRun calls super and attaches the expected canvas when canvas code is present', () => {
    const runtime = new PythonSolutionRuntime(vi.fn(), 'solution', { runner: 'pyodide' });
    runtime.codeTester = {
      view: { type: 'expected-view' },
      testCaseIndex: 1,
      session: { testCaseIndex: 7 },
    };
    vi.spyOn(runtime, 'containsCanvasCode').mockReturnValue(true);

    runtime.prepareForRun();

    expect(runtime._basePrepared).toBe(true);
    expect(canvasManagers[0].attachCanvas).toHaveBeenCalledWith('expected', 7);
  });

  it('prepareForRun does not attach an expected canvas when no canvas code exists', () => {
    const runtime = new PythonSolutionRuntime(vi.fn(), 'solution', { runner: 'pyodide' });
    runtime.codeTester = {
      view: { type: 'expected-view' },
      session: { testCaseIndex: 1 },
    };
    vi.spyOn(runtime, 'containsCanvasCode').mockReturnValue(false);

    runtime.prepareForRun();

    expect(runtime._basePrepared).toBe(true);
    expect(canvasManagers).toHaveLength(0);
  });
});
