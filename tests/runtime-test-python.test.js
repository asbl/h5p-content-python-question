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
    expect(code).toContain('json.loads');
    expect(code).toContain('requiredLoop\\":\\"while');
    expect(runtime.codeTester.setAlgorithmConstraintResult).toHaveBeenCalledWith(null);
  });

  it('reuses the same constraint token across repeated getCode() calls for one test case', () => {
    // getCode() is queried from several unrelated call sites (canvas
    // detection, multi-file listings, the actual run() call, ...) for the
    // same test case. Each call used to mint a fresh random token and reset
    // codeTester state as a side effect, so whichever call happened last
    // would desync the token from the one embedded in the Python source
    // that was actually executed by an earlier call, and the constraint
    // result printed by that running code could then never be matched back
    // up - see the "algorithm constraint" grading regression this guards.
    const runtime = new PythonTestRuntime(vi.fn(), 'solution', {
      functionName: 'search',
      algorithmConstraints: { requiredLoop: 'while' },
      hasAlgorithmConstraints: vi.fn(() => true),
      setAlgorithmConstraintResult: vi.fn(),
      getTestCode: vi.fn((code) => `${code}\n# function test`),
    }, { runner: 'pyodide' });
    runtime.runnerType = 'pyodide';

    const firstCode = runtime.getCode();
    const firstToken = runtime.algorithmConstraintToken;
    const secondCode = runtime.getCode();
    const thirdCode = runtime.getCode();

    expect(runtime.algorithmConstraintToken).toBe(firstToken);
    expect(secondCode).toBe(firstCode);
    expect(thirdCode).toBe(firstCode);
    expect(runtime.codeTester.setAlgorithmConstraintResult).toHaveBeenCalledTimes(1);
  });

  it('does not prepend a constraint preflight when constraints are inactive', () => {
    const runtime = new PythonTestRuntime(vi.fn(), 'print("ok")', {
      functionName: '',
      algorithmConstraints: {
        requiredClassNames: 'Person',
        requireObjectInstantiation: true,
      },
      hasAlgorithmConstraints: vi.fn(() => false),
      setAlgorithmConstraintResult: vi.fn(),
    }, { runner: 'pyodide' });
    runtime.runnerType = 'pyodide';

    const code = runtime.getCode();

    expect(code).toBe('print("ok")');
    expect(code).not.toContain('__H5P_ALGORITHM_CONSTRAINTS__');
    expect(runtime.codeTester.setAlgorithmConstraintResult).not.toHaveBeenCalled();
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

    it('records multiline Pyodide stdout chunks as separate comparison lines', () => {
      const runtime = buildTestRuntime();

      runtime.outputHandler('Robotik\n2\n');

      expect(runtime.codeTester.addOutput).toHaveBeenNthCalledWith(1, 'Robotik');
      expect(runtime.codeTester.addOutput).toHaveBeenNthCalledWith(2, '2');
      expect(runtime.codeTester.addOutput).toHaveBeenCalledTimes(2);
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

    it('records function-test result markers without echoing them as learner output', () => {
      const runtime = buildTestRuntime();
      const marker = '__H5P_FUNCTION_TEST_RESULT__:token:passed:3';

      runtime.outputHandler(marker);

      expect(runtime.codeTester.addOutput).toHaveBeenCalledWith(marker);
      expect(runtime._consoleManager.write).not.toHaveBeenCalled();
    });

    it('processes mixed runtime markers from one Pyodide output chunk line by line', () => {
      const runtime = buildTestRuntime();
      runtime.algorithmConstraintToken = 'constraints';
      runtime.algorithmTraceToken = 'trace';
      runtime.codeTester.setAlgorithmConstraintResult = vi.fn();
      runtime.codeTester.addAlgorithmTraceEvent = vi.fn();

      runtime.outputHandler([
        '__H5P_ALGORITHM_CONSTRAINTS__:constraints:{"passed":true,"violations":[]}',
        '__H5P_ALGORITHM_TRACE__:trace:{"type":"watch","step":1,"snapshot":[1,2]}',
        '__H5P_FUNCTION_TEST_RESULT__:token:passed:3',
      ].join('\n'));

      expect(runtime.codeTester.setAlgorithmConstraintResult).toHaveBeenCalledWith({
        passed: true,
        violations: [],
      });
      expect(runtime.codeTester.addAlgorithmTraceEvent).toHaveBeenCalledWith({
        type: 'watch',
        step: 1,
        snapshot: [1, 2],
      });
      expect(runtime.codeTester.addOutput).toHaveBeenCalledWith(
        '__H5P_FUNCTION_TEST_RESULT__:token:passed:3',
      );
    });
  });
});
