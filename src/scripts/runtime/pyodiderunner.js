/* global p5 */

import {
  getPythonL10nValue,
} from '../services/python-l10n';
import { normalizePythonExecutionLimit } from '../services/python-execution-limit';
import {
  getImportedPyodidePackages,
  loadMissingPyodidePackages,
} from './services/pyodide-package-service';
import PyodideImageService from './services/pyodide-image-service';
import PyodideSourceService from './services/pyodide-source-service';
import PyodideSoundService from './services/pyodide-sound-service';
import {
  cancelPyodideBackgroundTask,
  clearPyodideExecutionLimit,
  getSharedPyodide,
  hasPyodideBackgroundTask,
  installPyodideInputOverride,
  installPyodideRuntimeCompatibility,
  resetPyodideBackgroundTaskState,
  setActivePyodideRuntime,
  setActivePyodideSDLCanvas,
  setPyodideExecutionLimit,
  sharedPyodideRuntimeState,
} from './services/pyodide-runtime-service';

export default class PyodideRunner {
  /**
   * @param {object} runtime - Owning Python runtime instance.
   * @param {object} [options] - Runner options.
   */
  constructor(runtime, options = {}) {
    this.runtime = runtime;
    this.options = options;

    /* Execution state */
    this.stopped = false;
    this.pyodide = null;

    /* Error state */
    this.errorMessage = null;
    this.errorLineNumber = null;

    /* Localization */
    this.l10n = runtime.l10n || {};

    this.type = getPythonL10nValue(this.l10n, 'pyodideRunner');

    this.canvasWrapper = null;
    this.canvasDiv = null;
    this.sdlCanvas = null;
    this.hasBackgroundTask = false;
    this._resizeTimeout = null;

    this.p5Instance = null;
    this._isInitialized = false;
    this._setupPromise = null;
    this.imageService = new PyodideImageService(this);
    this.soundService = new PyodideSoundService(this);
    this.sourceService = new PyodideSourceService(this);
    this.canvasRuntimeManager = null;

    /* Options */
    this.retainGlobals = options.retainGlobals || false;
    this.executionLimit = normalizePythonExecutionLimit(options.executionLimit ?? options.execLimit);
  }

  /**
   * Returns whether a positive execution limit is configured.
   * @returns {boolean} True if execution limiting is enabled.
   */
  hasExecutionLimit() {
    return this.executionLimit > 0;
  }

  /**
   * Returns the localized execution-limit message.
   * @returns {string} Localized timeout text.
   */
  getExecutionLimitMessage() {
    return getPythonL10nValue(this.l10n, 'executionLimitExceeded');
  }

  /**
   * Determines whether the given error was caused by the execution limit.
   * @param {*} error - Candidate error.
   * @returns {boolean} True if the error indicates a timeout.
   */
  isExecutionLimitError(error) {
    if (!this.hasExecutionLimit()) {
      return false;
    }

    const errorMessage = String(error?.message || error?.toString?.() || error || '');

    return error?.name === 'TimeoutError'
      || errorMessage.includes(this.getExecutionLimitMessage())
      || errorMessage.includes('TimeoutError');
  }

  /**
   * Applies the configured execution limit trace inside Pyodide.
   * @returns {Promise<void>} Resolves once the trace is installed.
   */
  async applyExecutionLimit() {
    if (!this.hasExecutionLimit()) {
      return;
    }

    await setPyodideExecutionLimit(
      this.pyodide,
      this.executionLimit,
      this.getExecutionLimitMessage(),
    );
  }

  /**
   * Clears the configured execution limit trace inside Pyodide.
   * @returns {Promise<void>} Resolves once the trace is removed.
   */
  async clearExecutionLimit() {
    if (!this.hasExecutionLimit()) {
      return;
    }

    await clearPyodideExecutionLimit(this.pyodide);
  }

  /**
   * Returns the service responsible for synchronizing uploaded images.
   * @returns {PyodideImageService} Image service instance.
   */
  getImageService() {
    return this.imageService;
  }

  /**
   * Returns the service responsible for synchronizing uploaded sounds.
   * @returns {PyodideSoundService} Sound service instance.
   */
  getSoundService() {
    return this.soundService;
  }

  /**
   * Returns the service responsible for synchronizing source files.
   * @returns {PyodideSourceService} Source service instance.
   */
  getSourceService() {
    return this.sourceService;
  }

  /**
   * Returns all configured file services.
   * @returns {Array<object>} File services.
   */
  getFileServices() {
    return [this.getImageService(), this.getSoundService(), this.getSourceService()];
  }

  /**
   * Updates the visible loading state of the canvas host.
   * @param {boolean} isLoading - Whether the canvas is still loading.
   * @param {string} [message] - Optional status message.
   * @returns {void}
   */
  setCanvasLoading(isLoading, message = getPythonL10nValue(this.l10n, 'pyodideCanvasLoading')) {
    if (typeof this.canvasRuntimeManager?.setLoading === 'function') {
      this.canvasRuntimeManager.setLoading(isLoading, message);
      return;
    }

    const overlay = this.canvasWrapper?.querySelector('.canvas-loading');
    const label = this.canvasWrapper?.querySelector('.canvas-loading__label');

    if (!overlay) {
      return;
    }

    overlay.hidden = !isLoading;
    overlay.style.display = isLoading ? 'flex' : 'none';
    overlay.classList.toggle('is-visible', isLoading);

    if (label && typeof message === 'string') {
      label.textContent = message;
    }
  }

  /**
   * Lazily initializes the shared Pyodide runtime.
   * @returns {Promise<void>} Resolves once Pyodide is ready.
   */
  async setup() {
    if (this._setupPromise) {
      return this._setupPromise;
    }

    this._setupPromise = this._setupInternal().catch((error) => {
      this._setupPromise = null;
      throw error;
    });

    return this._setupPromise;
  }

  /**
   * Performs the one-time runner setup work.
   * @returns {Promise<void>} Resolves when initialization is complete.
   */
  async _setupInternal() {
    setActivePyodideRuntime(this.runtime);

    if (!this.pyodide) {
      const isFirstSharedLoad = !sharedPyodideRuntimeState.sharedPyodidePromise;

      if (isFirstSharedLoad) {
        this.runtime.outputHandler(getPythonL10nValue(this.l10n, 'pyodideLoading'), false);
      }

      this.pyodide = await getSharedPyodide(this.options);

      if (isFirstSharedLoad) {
        this.runtime.outputHandler(getPythonL10nValue(this.l10n, 'pyodideReady'), false);
      }
    }

    await installPyodideInputOverride(this.pyodide);
    await installPyodideRuntimeCompatibility(this.pyodide);
    await loadMissingPyodidePackages(this.pyodide, this.options.packages);

    if (this.canvasDiv && this.runtime.containsSDLCode()) {
      this.setupSDLCanvas(this.canvasDiv);
    }

    this._isInitialized = true;
  }

  /**
   * Executes learner code inside the shared Pyodide instance.
   * @param {string} code - Python code to execute.
   * @param {HTMLElement|null} [canvasDiv] - Optional canvas mount target.
   * @returns {Promise<*>} Python result value or undefined on handled errors.
   */
  async execute(code, canvasDiv = null) {
    setActivePyodideRuntime(this.runtime);

    const activeCanvasDiv = canvasDiv || this.canvasDiv;
    const shouldShowCanvasLoading = Boolean(activeCanvasDiv && this.runtime.containsCanvasCode?.());

    if (shouldShowCanvasLoading) {
      this.setCanvasLoading(true);
    }

    try {
      if (!this._isInitialized) {
        await this.setup();
      }

      await resetPyodideBackgroundTaskState(this.pyodide);
      this.hasBackgroundTask = false;

      const analysisCode = this.runtime.getAnalysisCode?.() || code;
      const localModuleNames = this.runtime.getLocalModuleNames?.() || [];

      await loadMissingPyodidePackages(this.pyodide, [
        ...(this.options.packages || []),
        ...getImportedPyodidePackages(analysisCode, { localModuleNames }),
      ]);

      for (const service of this.getFileServices()) {
        if (typeof service.installSourceRegistry === 'function') {
          await service.installSourceRegistry();
          continue;
        }

        await service.installRegistry();
      }

      this.stopped = false;

      // Prepare canvas integrations before executing user code.
      if (canvasDiv && this.runtime.containsP5Code()) {
        this.setupP5(canvasDiv);
      }
      else if (activeCanvasDiv && this.runtime.containsSDLCode()) {
        this.setupSDLCanvas(activeCanvasDiv);
      }

      if (shouldShowCanvasLoading) {
        this.setCanvasLoading(false);
      }

      let result = null;

      await this.applyExecutionLimit();

      try {
        if (code.includes('input(')) {
          const asyncCode = code.replace(/\binput\(/g, 'await input(');
          const wrappedCode = `
async def _h5p_main():
${asyncCode.split('\n').map((line) => `  ${line}`).join('\n')}

await _h5p_main()
`;

          result = await this.pyodide.runPythonAsync(wrappedCode);
        }
        else {
          result = await this.pyodide.runPythonAsync(code);
        }
      }
      finally {
        await this.clearExecutionLimit();
      }

      this.hasBackgroundTask = await hasPyodideBackgroundTask(this.pyodide);

      if (this.hasBackgroundTask) {
        this.setCanvasLoading(false);
        return result;
      }

      await this.onSuccess?.(result);
      return result;
    }
    catch (error) {
      this.setCanvasLoading(false);
      await this.onError?.(error);
    }
  }

  /**
   * Stops the active Pyodide runtime execution as far as supported.
   * @returns {boolean} Always true once stop handling has been triggered.
   */
  stop() {
    this.stopped = true;
    this.setCanvasLoading(false);

    // Pyodide itself offers no hard stop, so active integrations are torn down
    // and background tasks are cancelled cooperatively where possible.
    if (this.p5Instance) {
      try {
        this.p5Instance.remove();
      }
      catch (error) {
        console.warn('Could not stop p5 instance');
      }
      this.p5Instance = null;
    }

    if (this.sdlCanvas) {
      this.sdlCanvas = null;
    }

    if (this.hasBackgroundTask && this.pyodide) {
      cancelPyodideBackgroundTask(this.pyodide).catch((error) => {
        console.warn('Could not cancel background SDL task', error);
      });
      this.hasBackgroundTask = false;
    }

    this.runtime.codeContainer.getStateManager()?.stop();
    return true;
  }

  /**
   * Handles a Pyodide execution error.
   * @param {*} error - Raised execution error.
   * @returns {Promise<void>} Resolves after error propagation.
   */
  async onError(error) {
    this.setCanvasLoading(false);
    console.warn('Error in PyodideRunner', error);
    this.errorMessage = error;
    this.runtime.onError(
      this.isExecutionLimitError(error)
        ? this.getExecutionLimitMessage()
        : String(error?.message || error?.toString?.() || error),
    );
  }

  /**
   * Handles a successful Pyodide execution.
   * @param {*} value - Python result value.
   * @returns {Promise<void>} Resolves after success propagation.
   */
  async onSuccess(value) {
    this.setCanvasLoading(false);
    this.runtime.onSuccess(value);
    this.runtime.codeContainer.getStateManager()?.stop();
  }

  /**
   * Schedules one or more resize notifications after canvas updates.
   * @returns {void}
   */
  triggerResizeAfterCanvasUpdate() {
    if (typeof this.runtime?.resizeActionHandler !== 'function') {
      return;
    }

    this.runtime.resizeActionHandler();

    if (typeof window?.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => this.runtime?.resizeActionHandler?.());
      });
    }

    if (typeof window?.setTimeout === 'function') {
      if (this._resizeTimeout !== null) {
        window.clearTimeout(this._resizeTimeout);
      }

      this._resizeTimeout = window.setTimeout(() => {
        this._resizeTimeout = null;
        this.runtime?.resizeActionHandler?.();
      }, 250);
    }
  }

  /**
   * Mounts a p5 sketch into the provided canvas container.
   * @param {HTMLElement} canvasDiv - Canvas mount target.
   * @returns {void}
   */
  setupP5(canvasDiv) {
    if (!window.p5) {
      console.error(getPythonL10nValue(this.l10n, 'pyodideP5Missing'));
      return;
    }

    if (this.p5Instance) {
      this.p5Instance.remove();
      this.p5Instance = null;
    }

    canvasDiv.innerHTML = '';
    this.canvasDiv = canvasDiv;

    // Rebind p5 APIs onto window so learner code can use the regular globals.
    const runner = this;
    const sketch = (p) => {
      runner.p5Instance = p;

      if (window.setup) {
        p.setup = () => window.setup();
      }
      if (window.draw) {
        p.draw = () => {
          if (runner.stopped) {
            p.noLoop();
            return;
          }
          window.draw();
        };
      }

      Object.getOwnPropertyNames(p.__proto__).forEach((name) => {
        if (typeof p[name] === 'function') {
          window[name] = (...args) => p[name](...args);
        }
      });
    };

    this.p5Instance = new p5(sketch, canvasDiv);
  }

  /**
   * Mounts and activates the SDL canvas used by pygame-ce and miniworlds.
   * @param {HTMLElement|null} canvasDiv - Canvas mount target.
   * @returns {HTMLCanvasElement|null} The mounted canvas element.
   */
  setupSDLCanvas(canvasDiv) {
    if (!canvasDiv) {
      return null;
    }

    if (!this.pyodide?.canvas?.setCanvas2D) {
      return null;
    }

    canvasDiv.innerHTML = '';
    this.canvasDiv = canvasDiv;

    const canvas = document.createElement('canvas');
    canvas.classList.add('pyodide-sdl-canvas');
    canvas.width = canvasDiv.clientWidth || 800;
    canvas.height = canvasDiv.clientHeight || 600;
    canvas.style.maxWidth = '100%';
    canvas.style.display = 'block';
    canvas.tabIndex = 0;

    canvasDiv.appendChild(canvas);

    setActivePyodideSDLCanvas(canvas);

    if (this.pyodide?._api) {
      this.pyodide._api._skip_unwind_fatal_error = true;
    }

    this.pyodide.canvas.setCanvas2D(canvas);
    this.sdlCanvas = canvas;
    canvas.focus();
    this.triggerResizeAfterCanvasUpdate();

    return canvas;
  }

  /**
   * Attaches a runtime canvas wrapper to this runner.
   * @param {HTMLElement} canvasWrapper - Canvas wrapper element.
   * @param {HTMLElement|null} canvasDiv - Canvas mount target.
   * @param {object|null} canvasRuntimeManager - Canvas runtime manager instance.
   * @returns {void}
   */
  addCanvas(canvasWrapper, canvasDiv, canvasRuntimeManager = null) {
    if (!canvasDiv) return;

    this.canvasWrapper = canvasWrapper;
    this.canvasDiv = canvasDiv;
    this.canvasRuntimeManager = canvasRuntimeManager;
    this.setCanvasLoading(true);

    if (this.runtime.containsP5Code()) {
      this.setupP5(canvasDiv);
      this.setCanvasLoading(false);
    }
    else if (this.runtime.containsSDLCode()) {
      this.setup()
        .then(() => {
          this.setupSDLCanvas(canvasDiv);
          this.setCanvasLoading(false);
        })
        .catch((error) => {
          this.setCanvasLoading(false);
          this.onError(error);
        });
    }
    else if (!this._isInitialized) {
      this.setup()
        .then(() => this.setCanvasLoading(false))
        .catch((error) => {
          this.setCanvasLoading(false);
          this.onError(error);
        });
    }
    else {
      this.setCanvasLoading(false);
    }
  }
}