import CanvasRuntimeManager from './canvasruntimemanager';
import PythonRuntime from './runtime-python';

export default class PythonSolutionRuntime extends H5P.SolutionRuntimeMixin(PythonRuntime) {

  /**
   * Returns the author-defined project workspace and replaces main.py with the
   * current solution code so expected results stay independent from learner edits.
   * @returns {object|null} Workspace snapshot for solution execution.
   */
  getProjectSnapshot() {
    if (this.runnerType !== 'pyodide') {
      return null;
    }

    const defaultWorkspace = this.codeContainer?.getDefaultWorkspaceSnapshot?.();

    if (!defaultWorkspace?.files?.length) {
      return null;
    }

    const snapshot = {
      ...defaultWorkspace,
      files: defaultWorkspace.files.map((file) => ({ ...file })),
    };
    const entryFile = snapshot.files.find((file) => file.isEntry === true)
      || snapshot.files.find((file) => file.name === snapshot.entryFileName);

    if (entryFile) {
      entryFile.code = this.code;
    }

    return snapshot;
  }

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
