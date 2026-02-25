import CanvasRuntimeManager from './canvasruntimemanager';
import PythonRuntime from './runtime-python';

export default class PythonSolutionRuntime extends H5P.SolutionRuntimeMixin(PythonRuntime) {

  getCanvasManager() {
    if (!this._canvasManager) {
      this._canvasManager = new CanvasRuntimeManager(this.codeTester.view, this.runner);
      this._canvasManager.setup();
    }
    return this._canvasManager;
  }

  /**
   * Prepares the runtime environment before execution.
   * Creates a solution canvas if needed.
   */
  prepareForRun() {
    super.prepareForRun();
    if (this.containsCanvasCode(this.getCode())) {
      this.getCanvasManager().attachCanvas('expected', this.codeTester.testCaseIndex);
    }
  }


}
