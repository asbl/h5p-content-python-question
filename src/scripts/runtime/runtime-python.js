import SkulptRunner from './skulptrunner';
import CanvasRuntimeManager from './canvasruntimemanager';

/**
 * Python runtime for executing Python code via Skulpt.
 * Extends H5P.Runtime and internally uses SkulptRunner for code execution.
 */
export default class PythonRuntime extends H5P.Runtime {
  /**
   * @param {function} resizeActionHandler - Callback invoked on resize actions.
   * @param {string} code - Initial Python code to execute.
   * @param {object} [options] - Optional runtime configuration options.
   */
  constructor(resizeActionHandler, code, options = {}) {
    super(resizeActionHandler, code, options);

    /**
     * Human-readable runtime type.
     * @type {string}
     */
    this.type = 'Python Runtime';

    /**
     * Internal SkulptRunner instance.
     * @type {SkulptRunner|null}
     */
    this.runner = null;

    /**
     * Canvas manager instance for handling turtle/p5 canvases.
     * @type {CanvasRuntimeManager|null}
     */
    this._canvasManager = null;

    /**
     * Configuration options for the runtime.
     * @type {object}
     */
    this.options = options;
  }

  /**
   * Sets up the runtime with a code container, runner, and canvas manager.
   * @param {object} codeContainer - The code container that holds the Python code.
   */
  setup(codeContainer) {
    super.setup(codeContainer);

    // Initialize SkulptRunner if not already present
    this.runner = this.getRunner();

    // Lazily initialize the canvas manager
    this._canvasManager = this.getCanvasManager();
  }

  getCanvasManager() {
    if (!this._canvasManager) {
      this._canvasManager = new CanvasRuntimeManager(this.codeContainer.getCanvasManager(), this.runner);
      this._canvasManager.setup();
    }
    return this._canvasManager;
  }

  /**
   * Returns the SkulptRunner instance for this runtime.
   * Creates a new one if it doesn't exist yet.
   * @returns {SkulptRunner} The SkulptRunner instance.
   */
  getRunner() {
    if (!this.runner) {
      this.runner = new SkulptRunner(this, this.options);
    }
    return this.runner;
  }

  prepareForRun() {
    super.prepareForRun();
    if (this.containsCanvasCode()) {
      this.getCanvasManager().attachCanvas('manual');
    }
  }

  /**
   * Checks whether the code uses canvas-related libraries.
   * @returns {boolean}
   */
  containsCanvasCode() {
    return this.containsTurtleCode() || this.containsP5Code();
  }

  containsTurtleCode() {
    const code = this.getCode();
    if (!code) return false;
    return (
      code.includes('import turtle') ||
      code.includes('from turtle import')
    );
  }

  containsP5Code() {
    const code = this.getCode();
    if (!code) return false;
    return (
      code.includes('import p5') ||
      code.includes('from p5 import')
    );
  }

}
