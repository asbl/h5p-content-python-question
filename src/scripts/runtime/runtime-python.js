import SkulptRunner from './skulptrunner';
import CanvasRuntimeManager from './canvasruntimemanager';
import PyodideRunner from './pyodiderunner';
import {
  getPythonL10nValue,
} from '../services/python-l10n';

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
    this.l10n = options.l10n || {};

    /**
     * Human-readable runtime type.
     * @type {string}
     */
    this.type = getPythonL10nValue(this.l10n, 'pythonRuntime');

    /**
     * Which Python runner to use (skulpt or pyodide).
     * @type {string}
     */
    this.runnerType = options.runner || 'skulpt';

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

  /**
   * Returns the runtime canvas manager.
   * @returns {CanvasRuntimeManager} Canvas runtime manager.
   */
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
      if (this.runnerType === 'pyodide') {
        this.runner = new PyodideRunner(this, this.options);
      }
      else {
        this.runner = new SkulptRunner(this, this.options);
      }
    }
    return this.runner;
  }

  /**
   * Returns the current project workspace when Pyodide project support is enabled.
   * @returns {object|null} Workspace snapshot or null.
   */
  getProjectSnapshot() {
    if (this.runnerType !== 'pyodide') {
      return null;
    }

    return this.codeContainer?.getWorkspaceSnapshot?.() || null;
  }

  /**
   * Returns all code that should be analyzed for imports and canvas usage.
   * @returns {string} Combined Python source code.
   */
  getAnalysisCode() {
    const projectSnapshot = this.getProjectSnapshot();

    if (!projectSnapshot?.files?.length) {
      return this.getCode();
    }

    return projectSnapshot.files
      .map((file) => (file.isEntry ? this.getCode() : String(file.code || '')))
      .join('\n');
  }

  /**
   * Returns local Python module names from the current project workspace.
   * @returns {string[]} Local module names without the .py extension.
   */
  getLocalModuleNames() {
    const projectSnapshot = this.getProjectSnapshot();

    if (!projectSnapshot?.files?.length) {
      return [];
    }

    return projectSnapshot.files
      .filter((file) => file.isEntry !== true)
      .map((file) => String(file.name || '').replace(/\.py$/i, ''))
      .filter(Boolean);
  }

  prepareForRun() {
    if (this.runnerType === 'pyodide') {
      this.runner.setup().catch((error) => this.onError(error.toString()));
    }
    else {
      super.prepareForRun();
    }

    if (this.containsCanvasCode()) {
      this.getCanvasManager().attachCanvas('manual');
    }
  }

  /**
   * Checks whether the code uses canvas-related libraries.
   * @returns {boolean} True, if code contains turtle or p5 code
   */
  containsCanvasCode() {
    return this.containsTurtleCode() || this.containsP5Code() || this.containsSDLCode();
  }

  containsSDLCode() {
    return this.containsPygameCode() || this.containsMiniworldsCode();
  }

  containsTurtleCode() {
    const code = this.getAnalysisCode();
    if (!code) return false;
    return (
      code.includes('import turtle') ||
      code.includes('from turtle import')
    );
  }

  containsP5Code() {
    const code = this.getAnalysisCode();
    if (!code) return false;
    return (
      code.includes('import p5') ||
      code.includes('from p5 import')
    );
  }

  containsPygameCode() {
    const code = this.getAnalysisCode();
    if (!code) return false;
    return (
      code.includes('import pygame') ||
      code.includes('from pygame import')
    );
  }

  containsMiniworldsCode() {
    const code = this.getAnalysisCode();
    if (!code) return false;
    return (
      code.includes('import miniworlds') ||
      code.includes('from miniworlds import')
    );
  }

}
