import PythonRuntime from './runtime-python';
import { getManualRunHelpers } from '../services/python-ops-counter';

export default class PythonManualRuntime extends H5P.ManualRuntimeMixin(PythonRuntime) {

  /**
   * Returns the learner code. For Pyodide the `ops` counter and a silent
   * `trace` stub are defined first when the code uses them, so a plain Run
   * behaves like a graded run instead of failing with a NameError. Error line
   * numbers shift by the helper length, which is why helpers are added only
   * on demand.
   * @returns {string} Python source to execute.
   */
  getCode() {
    const code = super.getCode();
    if (this.runnerType !== 'pyodide') return code;
    const helpers = getManualRunHelpers(code);
    return helpers ? `${helpers}${code}` : code;
  }

  reset() {
    super.reset();
    this.getCanvasManager().removeCanvas();
  }
}
