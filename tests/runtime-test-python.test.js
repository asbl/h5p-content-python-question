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
  it('attaches testcase canvas using session test-case index', () => {
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

    runtime.prepareForRun();

    expect(runtime._basePrepared).toBe(true);
    expect(canvasManagers[0].attachCanvas).toHaveBeenCalledWith('testcase', 4);
  });

  it('falls back to legacy tester testCaseIndex when session index is missing', () => {
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

    runtime.prepareForRun();

    expect(canvasManagers[0].attachCanvas).toHaveBeenCalledWith('testcase', 6);
  });
});
