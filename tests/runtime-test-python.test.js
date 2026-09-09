import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  CanvasRuntimeManagerMock,
  PythonSolutionRuntimeMock,
  canvasManagers,
} = vi.hoisted(() => {
  const canvasManagers = [];

  const CanvasRuntimeManagerMock = vi.fn().mockImplementation(() => {
    const instance = {
      setup: vi.fn(),
      attachCanvas: vi.fn(),
      removeCanvas: vi.fn(),
    };
    canvasManagers.push(instance);
    return instance;
  });

  const PythonSolutionRuntimeMock = vi.fn();

  return {
    CanvasRuntimeManagerMock,
    PythonSolutionRuntimeMock,
    canvasManagers,
  };
});

vi.mock('../src/scripts/runtime/canvasruntimemanager', () => ({
  default: CanvasRuntimeManagerMock,
}));

vi.mock('../src/scripts/runtime/runtime-solution-python', () => ({
  default: PythonSolutionRuntimeMock,
}));

vi.mock('../src/scripts/runtime/runtime-python', () => ({
  default: class PythonRuntimeMock {
    constructor(_resizeActionHandler, code, options = {}) {
      this.code = code;
      this.options = options;
      this.runner = { name: 'runner' };
      this._basePrepared = false;
      this.codeContainer = null;
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

    createConsoleManager() {
      return { write: vi.fn(), clear: vi.fn() };
    }

    createCanvasManager() {
      return this.getCanvasManager();
    }
  },
}));

let PythonTestRuntime;

beforeEach(async () => {
  vi.clearAllMocks();
  canvasManagers.length = 0;

  globalThis.H5P = {
    ...(globalThis.H5P || {}),
    TestRuntimeMixin: (BaseClass) => class extends BaseClass {
      constructor(resizeActionHandler, solutionCode, codeTester, options = {}) {
        super(resizeActionHandler, solutionCode, options);
        this.solutionCode = solutionCode;
        this.codeTester = codeTester;
        this.options = options;
      }
    },
  };

  ({ default: PythonTestRuntime } = await import('../src/scripts/runtime/runtime-test-python.js'));
});

describe('PythonTestRuntime', () => {
  it('adds the active function-test harness to learner code', () => {
    const runtime = new PythonTestRuntime(
      vi.fn(),
      'solution',
      {
        getTestCode: vi.fn((code) => `${code}\n# test harness`),
      },
      {},
    );

    expect(runtime.getCode()).toBe('solution\n# test harness');
    expect(runtime.codeTester.getTestCode).toHaveBeenCalledWith('solution');
  });

  it('prepends the Pyodide-only constraint preflight before learner code', () => {
    const runtime = new PythonTestRuntime(vi.fn(), 'solution', {
      functionName: 'search',
      algorithmConstraints: { requiredLoop: 'while' },
      hasAlgorithmConstraints: vi.fn(() => true),
      setAlgorithmConstraintResult: vi.fn(),
      getTestCode: vi.fn((code) => `${code}\n# function test`),
    }, { runner: 'pyodide' });
    runtime.runnerType = 'pyodide';

    const code = runtime.getCode();

    expect(code.indexOf('import ast, json')).toBeLessThan(code.indexOf('solution'));
    expect(code).toContain("requiredLoop\":\"while");
    expect(runtime.codeTester.setAlgorithmConstraintResult).toHaveBeenCalledWith(null);
  });

  it('attaches testcase canvas using session test-case index', async () => {
    const runtime = new PythonTestRuntime(
      vi.fn(),
      'solution',
      {
        view: { type: 'view' },
        testCaseIndex: 1,
        session: { testCaseIndex: 4 },
      },
      {},
    );
    vi.spyOn(runtime, 'containsCanvasCode').mockReturnValue(true);

    await runtime.prepareForRun();

    expect(runtime._basePrepared).toBe(true);
    expect(canvasManagers[0].attachCanvas).toHaveBeenCalledWith('testcase', 4);
  });

  it('falls back to legacy tester testCaseIndex when session index is missing', async () => {
    const runtime = new PythonTestRuntime(
      vi.fn(),
      'solution',
      {
        view: { type: 'view' },
        testCaseIndex: 6,
      },
      {},
    );
    vi.spyOn(runtime, 'containsCanvasCode').mockReturnValue(true);

    await runtime.prepareForRun();

    expect(canvasManagers[0].attachCanvas).toHaveBeenCalledWith('testcase', 6);
  });

  describe('outputHandler', () => {
    const buildTestRuntime = () => {
      const runtime = new PythonTestRuntime(
        vi.fn(),
        'solution',
        {
          addOutput: vi.fn(),
          session: { testCaseIndex: 0 },
          l10n: { testCase: 'Test case' },
        },
        {},
      );
      runtime.setup({});
      return runtime;
    };

    it('records genuine program output for comparison', () => {
      const runtime = buildTestRuntime();

      runtime.outputHandler('180');

      expect(runtime.codeTester.addOutput).toHaveBeenCalledWith('180');
    });

    it('does not record Pyodide/package loading status messages as test output', () => {
      const runtime = buildTestRuntime();

      runtime.outputHandler('Pyodide wird geladen...', false);
      runtime.outputHandler('Loading numpy, pygame-ce, sqlite3', false);

      expect(runtime.codeTester.addOutput).not.toHaveBeenCalled();
      expect(runtime._consoleManager.write).toHaveBeenCalledWith(
        'Loading numpy, pygame-ce, sqlite3',
        'Test case 1',
      );
    });
  });
});
