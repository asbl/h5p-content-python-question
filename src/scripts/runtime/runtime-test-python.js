import CanvasRuntimeManager from './canvasruntimemanager';
import PythonRuntime from './runtime-python';
import PythonSolutionRuntime from './runtime-solution-python';
import { getAlgorithmConstraintHarness, RESULT_PREFIX } from '../services/python-algorithm-constraints';
import { getOpsCounterPreamble, usesOpsCounter } from '../services/python-ops-counter';
import { getAlgorithmTracePreamble, getAlgorithmTraceNoopPreamble, TRACE_PREFIX } from '../services/python-algorithm-trace';
import { logPythonDiagnostic } from '../services/python-diagnostics';
import { addPythonErrorHint } from '../services/python-error-hints';
import { getPythonL10nValue } from '../services/python-l10n';

const DEBUG_PREFIX = 'Python test runtime:';

/**
 * Splits captured stdout into trimmed lines so multi-line prints are graded per line.
 * @param {string} text - Raw captured output.
 * @returns {string[]} Trimmed output lines.
 */
function splitCapturedOutput(text) {
  const trimmedText = String(text ?? '').trim();

  if (!trimmedText.includes('\n')) {
    return [trimmedText];
  }

  return trimmedText.split(/\r?\n/).map((line) => line.trim());
}

/**
 * Test runtime for executing Python student code against reference solutions.
 *
 * Combines:
 * - PythonRuntime (language-specific execution via Skulpt)
 * - TestRuntimeMixin (test orchestration and lifecycle)
 */
export default class PythonTestRuntime extends H5P.TestRuntimeMixin(PythonRuntime) {
  shouldTraceCurrentTestCase() {
    const trace = this.codeTester?.algorithmTrace || {};
    const index = this.codeTester?.session?.testCaseIndex ?? 0;
    const testCase = this.codeTester?.session?.getCurrentTestCase?.();
    return this.codeTester?.hasAlgorithmTrace?.()
      && Number(trace.traceTestCaseIndex || 0) === index
      && testCase?.hidden !== true;
  }
  /**
   * Appends the active function-test harness to learner code when required.
   *
   * Callers query the runtime's code for several unrelated reasons (canvas
   * detection, multi-file listings, the actual execution call, ...), so this
   * can run many times for the same test case. The constraint/trace preamble
   * embeds a fresh random token on every build and resets shared codeTester
   * state as a side effect, so rebuilding it on each call would mint a new
   * token after the one actually being executed was already generated,
   * leaving the token used to match incoming Pyodide output permanently out
   * of sync with the token printed by the code that is actually running.
   * The preamble is therefore built once per test case and reused.
   * @returns {string} Python source to execute.
   */
  getCode() {
    const learnerCode = super.getCode();
    const testCode = this.codeTester?.getTestCode
      ? this.codeTester.getTestCode(learnerCode)
      : learnerCode;
    if (this.runnerType !== 'pyodide') return testCode;

    if (!this._preamble) {
      this._preamble = this.buildPreamble(learnerCode);
    }

    return `${this._preamble}${testCode}`;
  }

  /**
   * Builds the constraint/trace preamble for the current test case, minting
   * fresh tokens and resetting the matching codeTester state.
   * @param {string} learnerCode - Student source code to analyze.
   * @returns {string} Preamble Python source, or an empty string if none applies.
   */
  buildPreamble(learnerCode) {
    let preamble = '';
    if (this.codeTester?.hasAlgorithmConstraints?.()) {
      const editorManager = this.codeContainer?.getEditorManager?.();
      const editableCode = editorManager?.extractEditableCode
        ? editorManager.extractEditableCode(learnerCode, { isEntry: true })
        : learnerCode;
      const harness = getAlgorithmConstraintHarness(
        editableCode,
        this.codeTester.algorithmConstraints,
        this.codeTester.functionName,
        learnerCode,
      );
      this.codeTester.setAlgorithmConstraintResult(null);
      this.algorithmConstraintToken = harness.token;
      preamble += `${harness.code}\n`;
    }
    if (this.shouldTraceCurrentTestCase()) {
      const trace = getAlgorithmTracePreamble(this.codeTester.algorithmTrace);
      this.algorithmTraceToken = trace.token;
      preamble += `${trace.code}\n`;
    }
    else if (this.codeTester?.hasAlgorithmTrace?.()) {
      // Learner source may call trace methods in any test case, but only the
      // traced case records events. Provide a silent stub elsewhere so those
      // calls stay valid even though each run starts from a fresh namespace.
      preamble += `${getAlgorithmTraceNoopPreamble()}\n`;
    }
    const needsOps = usesOpsCounter(learnerCode)
      || Number(this.codeTester?.session?.getCurrentTestCase?.()?.maxOperations) > 0;
    if (needsOps) {
      preamble += `${getOpsCounterPreamble()}\n`;
    }
    return preamble;
  }

  /**
   * Creates a Python runtime for executing the reference solution.
   * @returns {PythonSolutionRuntime} The runtime to gneerate the solution
   */
  createSolutionRuntime() {
    return new PythonSolutionRuntime(
      this.resizeActionHandler,
      this.solutionCode,
      this.codeTester,
      this.options
    );
  }

  getCanvasManager() {
    if (!this._canvasManager) {
      this._canvasManager = new CanvasRuntimeManager(this.codeTester.view, this.runner);
      this._canvasManager.setup();
    }
    return this._canvasManager;
  }

  /**
   * Prepares the Python runtime before executing student code.
   * Sets up canvas handling if canvas-related code is detected.
   */
  async prepareForRun() {
    await super.prepareForRun();
    const containsCanvasCode = this.containsCanvasCode(this.getCode());
    const testCaseIndex = this.codeTester?.session?.testCaseIndex
      ?? this.codeTester?.testCaseIndex;
    logPythonDiagnostic(this.options, DEBUG_PREFIX, 'prepareForRun', {
      testCaseIndex,
      containsCanvasCode,
      containsTurtleCode: this.containsTurtleCode?.(),
      containsSDLCode: this.containsSDLCode?.(),
      containsMiniworldsCode: this.containsMiniworldsCode?.(),
    });
    if (containsCanvasCode) {
      this.getCanvasManager().attachCanvas('testcase', testCaseIndex);
    }
  }

  /**
   * Removes all canvases created for test cases.
   */
  reset() {
    super.reset();
    logPythonDiagnostic(this.options, DEBUG_PREFIX, 'reset removing canvas', {
      testCaseIndex: this.codeTester?.session?.testCaseIndex,
      hasCanvasManager: !!this._canvasManager,
    });
    this._canvasManager?.removeCanvas();
  }

  /**
   * Handles output generated by the Python runtime.
   * Stores output in the CodeTester and writes it to the test console.
   * @param {string} text - Output text
   * @param {boolean} [isCapturedOutput] - False for internal status messages
   *   (e.g. Pyodide/package loading) that must not count as test output.
   */
  outputHandler(text, isCapturedOutput = true) {
    const trimmedText = text.trim();

    if (!isCapturedOutput) {
      const testCaseIndex = this.codeTester.session.testCaseIndex;
      const testCaseLabel = this.codeTester.l10n.testCase;
      this._consoleManager.write(text, `${testCaseLabel} ${testCaseIndex + 1}`);
      return;
    }

    if (
      trimmedText.includes('\n')
      && (
        trimmedText.includes(RESULT_PREFIX)
        || trimmedText.includes(TRACE_PREFIX)
        || trimmedText.includes('__H5P_FUNCTION_TEST_RESULT__:')
      )
    ) {
      trimmedText.split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .forEach((line) => this.outputHandler(line, true));
      return;
    }

    const marker = `${RESULT_PREFIX}${this.algorithmConstraintToken}:`;
    if (this.algorithmConstraintToken && trimmedText.startsWith(marker)) {
      try {
        this.codeTester.setAlgorithmConstraintResult(JSON.parse(trimmedText.slice(marker.length)));
      }
      catch {
        this.codeTester.setAlgorithmConstraintResult({
          passed: false,
          violations: ['Constraint analysis failed'],
        });
      }
      return;
    }
    const traceMarker = `${TRACE_PREFIX}${this.algorithmTraceToken}:`;
    if (this.algorithmTraceToken && trimmedText.startsWith(traceMarker)) {
      try {
        const event = JSON.parse(trimmedText.slice(traceMarker.length));
        if (['watch', 'compare', 'mark', 'swap'].includes(event?.type)
          && Number.isInteger(event?.step)
          && event.step > 0
          && (!event.snapshot || (Array.isArray(event.snapshot) && event.snapshot.length <= 100))) {
          this.codeTester.addAlgorithmTraceEvent(event);
        }
      }
      catch {
        // Ignore malformed trace events.
      }
      return;
    }

    if (trimmedText.startsWith('__H5P_FUNCTION_TEST_RESULT__:')) {
      this.codeTester.addOutput(this.addFunctionErrorHint(trimmedText));
      return;
    }

    splitCapturedOutput(text).forEach((line) => {
      this.codeTester.addOutput(line);
    });

    const testCaseIndex = this.codeTester.session.testCaseIndex;
    const testCaseLabel = this.codeTester.l10n.testCase;

    this._consoleManager.write(text, `${testCaseLabel} ${testCaseIndex + 1}`);
  }

  /**
   * Turns an execution-limit timeout into a failed function test and moves on.
   *
   * The harness cannot report a timeout itself because the run is killed from
   * outside. Without this, the first test that exceeds the limit (for example a
   * loop over 10^8 elements) left the remaining tests pending forever.
   * @param {*} error - Runtime error.
   * @returns {Promise<void>|void} Continues with the next test case.
   */
  onError(error) {
    const tester = this.codeTester;
    const message = String(error?.message ?? error ?? '');
    const limitMessage = getPythonL10nValue(this.options?.l10n || tester?.l10n || {}, 'executionLimitExceeded');
    const isTimeout = Boolean(limitMessage) && message.includes(limitMessage);
    const index = tester?.session?.testCaseIndex;

    if (isTimeout && tester?.resultToken && typeof tester.addOutput === 'function'
      && !tester.session?.outputs?.[index]?.length) {
      tester.addOutput(`__H5P_FUNCTION_TEST_RESULT__:${tester.resultToken}:error:${limitMessage.replace(/\s+/g, ' ')}`);
      return this.onSuccess();
    }

    return super.onError(error);
  }

  /**
   * Appends the didactic Python hint to an error reported by the function-test harness.
   * @param {string} resultLine - Harness result line.
   * @returns {string} Result line, with a hint if the call raised a known error.
   */
  addFunctionErrorHint(resultLine) {
    const match = resultLine.match(/^(__H5P_FUNCTION_TEST_RESULT__:[^:]+:error:)([\s\S]*)$/);
    if (!match) {
      return resultLine;
    }

    return `${match[1]}${addPythonErrorHint(this.codeTester?.l10n || {}, match[2])}`;
  }

  /**
   * Sets up the runtime for test execution.
   * Initializes console and canvas managers and marks the runtime as test mode.
   * @param {object} codeContainer - Container holding code and output elements
   */
  setup(codeContainer) {
    super.setup(codeContainer);

    this._consoleManager ||= this.createConsoleManager();
    this._canvasManager ||= this.createCanvasManager();
    this.isTest = true;
  }
}
