import SkulptRunner from './skulptrunner';
import CanvasRuntimeManager from './canvasruntimemanager';
import PyodideRunner from './pyodiderunner';
import {
  getPythonL10nValue,
} from '../services/python-l10n';
import { getImportedPythonPackages } from '../services/python-package-utils';
import { precachePyodideAssets } from './services/pyodide-runtime-service';

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

    this.schedulePyodidePreload();
  }

  /**
   * Starts Pyodide asset/package preloading while the learner reads the
   * exercise. SDL content additionally starts the full runner setup during idle
   * time because pygame/miniworlds initialization dominates first-run latency.
   * @returns {void}
   */
  schedulePyodidePreload() {
    if (
      this.runnerType !== 'pyodide' ||
      this._pyodidePreloadScheduled
    ) {
      return;
    }

    this._pyodidePreloadScheduled = true;
    const packageHints = this.getPreloadPackageHints();

    precachePyodideAssets(this.options, packageHints).catch(() => {
      // The normal run path remains authoritative and reports real failures.
    });

    if (!this.shouldPreloadPyodideRuntime(packageHints)) {
      return;
    }

    const preload = () => {
      this.getRunner().setup().catch((error) => {
        // The normal run path reports setup failures to the learner. A failed
        // speculative preload must not surface an error before they run code.
        console.warn('Unable to preload the Pyodide runtime', error);
      });
    };

    if (typeof window?.requestIdleCallback === 'function') {
      window.requestIdleCallback(preload, { timeout: 2000 });
      return;
    }

    window.setTimeout(preload, 200);
  }

  /**
   * Returns package names that can be inferred before the first run.
   * @returns {string[]} Installable Pyodide package names.
   */
  getPreloadPackageHints() {
    return getImportedPythonPackages(this.getAnalysisCode(), {
      localModuleNames: this.getLocalModuleNames(),
    });
  }

  /**
   * Determines whether idle time should initialize Pyodide, not just cache files.
   * @param {string[]} packageHints - Packages inferred from source code.
   * @returns {boolean} True when first-run latency is likely dominated by libraries.
   */
  shouldPreloadPyodideRuntime(packageHints = this.getPreloadPackageHints()) {
    if (this.shouldPreloadPyodideSDL()) {
      return true;
    }

    const configuredPackages = Array.isArray(this.options?.packages) ? this.options.packages : [];
    return configuredPackages.length > 0 || packageHints.length > 0;
  }

  /**
   * Determines whether initial code or the configured package set needs SDL.
   * @returns {boolean} True when pygame-ce or miniworlds should be preloaded.
   */
  shouldPreloadPyodideSDL() {
    if (this.containsSDLCode()) {
      return true;
    }

    const packages = Array.isArray(this.options?.packages) ? this.options.packages : [];
    return packages.some((packageName) => ['miniworlds', 'miniworlds-data', 'miniworlds-robot', 'miniworlds-turtle', 'pygame-ce'].includes(String(packageName).trim()));
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

  async prepareForRun() {
    const containsCanvasCode = this.containsCanvasCode();

    if (containsCanvasCode) {
      this.getCanvasManager().attachCanvas('manual');
    }

    if (this.runnerType === 'pyodide') {
      try {
        await this.runner.setup();
      }
      catch (error) {
        this.onError(error.toString());
      }
    }
    else {
      await super.prepareForRun();
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
      code.includes('from miniworlds import') ||
      code.includes('import miniworlds_data') ||
      code.includes('from miniworlds_data import') ||
      code.includes('import miniworlds_robot') ||
      code.includes('from miniworlds_robot import') ||
      code.includes('import miniworlds_turtle') ||
      code.includes('from miniworlds_turtle import')
    );
  }

}
