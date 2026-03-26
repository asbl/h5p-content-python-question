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
    this._inactiveSDLCanvas = null;
    this.hasBackgroundTask = false;
    this._resizeTimeout = null;
    this._p5WindowBindings = new Map();
    this._p5BaselineBindings = new Map([
      ['setup', this.getWindowBindingSnapshot('setup')],
      ['draw', this.getWindowBindingSnapshot('draw')],
    ]);

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
      const isFirstLoaderRequest = !sharedPyodideRuntimeState.loadPyodidePromise;

      if (isFirstLoaderRequest) {
        this.runtime.outputHandler(getPythonL10nValue(this.l10n, 'pyodideLoading'), false);
      }

      this.pyodide = await getSharedPyodide(this.options, this.runtime);

      if (isFirstLoaderRequest) {
        this.runtime.outputHandler(getPythonL10nValue(this.l10n, 'pyodideReady'), false);
      }
    }

    await installPyodideInputOverride(this.pyodide, this.runtime);
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
          result = await this.pyodide.runPythonAsync(
            `await _h5p_run_with_async_input(${JSON.stringify(String(code || ''))})`
          );
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

    this.restoreP5WindowBindings();

    if (this.sdlCanvas) {
      this.releaseInputFocus();
      this.sdlCanvas = null;
    }

    if (this._resizeTimeout !== null && typeof window?.clearTimeout === 'function') {
      window.clearTimeout(this._resizeTimeout);
      this._resizeTimeout = null;
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
   * Stores the current window binding for a p5 global if not tracked yet.
   * @param {string} name - Global function name.
   * @returns {void}
   */
  rememberP5WindowBinding(name) {
    if (this._p5WindowBindings.has(name)) {
      return;
    }

    const baselineBinding = this._p5BaselineBindings.get(name);
    if (baselineBinding) {
      this._p5WindowBindings.set(name, baselineBinding);
      return;
    }

    this._p5WindowBindings.set(name, {
      existed: Object.prototype.hasOwnProperty.call(window, name),
      value: window[name],
    });
  }

  /**
   * Captures whether a global window binding exists and its current value.
   * @param {string} name - Global function name.
   * @returns {{existed: boolean, value: *}} Snapshot of the current binding.
   */
  getWindowBindingSnapshot(name) {
    return {
      existed: Object.prototype.hasOwnProperty.call(window, name),
      value: window[name],
    };
  }

  /**
   * Binds one p5 function to window while tracking the previous binding.
   * @param {string} name - Global function name.
   * @param {Function} fn - Function implementation.
   * @returns {void}
   */
  bindP5WindowFunction(name, fn) {
    if (typeof fn !== 'function') {
      return;
    }

    this.rememberP5WindowBinding(name);
    window[name] = fn;
  }

  /**
   * Restores all window globals that were overridden for p5 execution.
   * @returns {void}
   */
  restoreP5WindowBindings() {
    this._p5WindowBindings.forEach((binding, name) => {
      if (binding?.existed) {
        window[name] = binding.value;
      } else {
        delete window[name];
      }
    });

    this._p5WindowBindings.clear();
  }

  /**
   * Gives keyboard focus to the active SDL canvas when available.
   * @returns {void}
   */
  acquireInputFocus() {
    if (!this.sdlCanvas?.isConnected) {
      return;
    }

    setActivePyodideSDLCanvas(this.sdlCanvas);
    this.pyodide?.canvas?.setCanvas2D?.(this.sdlCanvas);
    this.sdlCanvas.focus();
  }

  /**
   * Returns a detached fallback canvas used when SDL should stop targeting the
   * visible learner canvas.
   * @returns {HTMLCanvasElement|null} Detached fallback canvas.
   */
  getInactiveSDLCanvas() {
    if (typeof document === 'undefined') {
      return null;
    }

    if (!this._inactiveSDLCanvas) {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      canvas.tabIndex = -1;
      this._inactiveSDLCanvas = canvas;
    }

    return this._inactiveSDLCanvas;
  }

  /**
   * Releases keyboard focus from the SDL canvas when leaving the canvas page.
   * @returns {void}
   */
  releaseInputFocus() {
    if (!this.sdlCanvas) {
      return;
    }

    if (typeof this.sdlCanvas.blur === 'function') {
      this.sdlCanvas.blur();
    }

    const inactiveCanvas = this.getInactiveSDLCanvas();
    if (inactiveCanvas) {
      setActivePyodideSDLCanvas(inactiveCanvas);
      this.pyodide?.canvas?.setCanvas2D?.(inactiveCanvas);
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

    const learnerSetup = typeof window.setup === 'function' ? window.setup : null;
    const learnerDraw = typeof window.draw === 'function' ? window.draw : null;

    this.restoreP5WindowBindings();

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

      if (learnerSetup) {
        p.setup = () => learnerSetup();
      }
      if (learnerDraw) {
        p.draw = () => {
          if (runner.stopped) {
            p.noLoop();
            return;
          }
          learnerDraw();
        };
      }

      if (learnerSetup) {
        runner.bindP5WindowFunction('setup', (...args) => p.setup?.(...args));
      }

      if (learnerDraw) {
        runner.bindP5WindowFunction('draw', (...args) => p.draw?.(...args));
      }

      Object.getOwnPropertyNames(p.__proto__).forEach((name) => {
        if (typeof p[name] === 'function') {
          if (name === 'constructor') {
            return;
          }

          runner.bindP5WindowFunction(name, (...args) => p[name](...args));
        }
      });
    };

    this.p5Instance = new p5(sketch, canvasDiv);
  }

  /**
   * Mounts and activates the SDL canvas used by pygame-ce and miniworlds.
   * Reuses an existing canvas element when re-running so that SDL does not
   * need to re-bind to a freshly created element, which causes a black screen.
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

    this.canvasDiv = canvasDiv;

    // Reuse the existing canvas if the correct one is already in the div.
    // Destroying and recreating the element causes SDL to render to an orphaned
    // surface, leaving the visible canvas permanently black.
    const existing = canvasDiv.querySelector('canvas.pyodide-sdl-canvas');
    if (existing) {
      const canvas = existing;

      if (this.pyodide?._api) {
        this.pyodide._api._skip_unwind_fatal_error = true;
      }

      this.sdlCanvas = canvas;
      this.acquireInputFocus();
      this.triggerResizeAfterCanvasUpdate();
      return canvas;
    }

    canvasDiv.innerHTML = '';

    const canvas = document.createElement('canvas');
    canvas.classList.add('pyodide-sdl-canvas');
    canvas.width = canvasDiv.clientWidth || 800;
    canvas.height = canvasDiv.clientHeight || 600;
    canvas.style.maxWidth = '100%';
    canvas.style.display = 'block';
    canvas.tabIndex = 0;

    canvasDiv.appendChild(canvas);

    if (this.pyodide?._api) {
      this.pyodide._api._skip_unwind_fatal_error = true;
    }

    this.sdlCanvas = canvas;
    this.acquireInputFocus();
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