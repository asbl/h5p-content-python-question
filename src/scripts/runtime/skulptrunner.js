import {
  getPythonL10nValue,
  tPython,
} from '../services/python-l10n';
import { addPythonErrorHint } from '../services/python-error-hints';
import { normalizePythonExecutionLimit } from '../services/python-execution-limit';
import { ensureP5Script } from './services/p5-runtime-service';
import { ensureSkulptRuntime } from './services/skulpt-runtime-service';

export default class SkulptRunner {

  constructor(runtime, options = {}) {
    this.runtime = runtime;
    this.options = options;

    /* Execution state */
    this.stopped = false;
    this.Sk = null;

    /* Skulpt configuration flags */
    this.inputTakesPrompt =
      options.inputTakesPrompt !== undefined ? options.inputTakesPrompt : true;

    this.retainGlobals = options.retainGlobals || false;

    this.killableWhile =
      options.killableWhile !== undefined ? options.killableWhile : true;

    this.killableFor =
      options.killableFor !== undefined ? options.killableFor : true;

    this.executionLimit = normalizePythonExecutionLimit(options.executionLimit ?? options.execLimit);

    this.suspension = this._createSuspensionConfig();

    /* Error state */
    this.errorMessage = null;
    this.errorLineNumber = null;

    /* Localization */
    this.l10n = runtime.l10n || {};

    this.type = getPythonL10nValue(this.l10n, 'skulptRunner');

    this.canvasWrapper = null;
    this.canvasDiv = null;

    this.p5Instance = null;
    this._isInitalized = false;

  }

  /**
   * Returns whether execution limiting is enabled.
   * @returns {boolean} True if a positive execution limit is configured.
   */
  hasExecutionLimit() {
    return this.executionLimit > 0;
  }

  /**
   * Returns the localized execution-limit error message.
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

    const errorMessage = String(error?.toString?.() || error?.message || error || '');

    return error?.tp$name === 'TimeoutError'
      || error?.name === 'TimeoutError'
      || errorMessage.includes(this.getExecutionLimitMessage())
      || errorMessage.includes('Program exceeded run time limit');
  }

  getSkulpt() {
    return this.Sk || globalThis.Sk || null;
  }

  getSkulptRuntimeUrl(containsP5 = this.runtime.containsP5Code()) {
    const configuredUrl = String(this.options.skulptCdnUrl || '').trim();

    if (configuredUrl) {
      return configuredUrl;
    }

    if (containsP5) {
      const localUrl = String(this.options.localSkulptUrl || '').trim();

      if (localUrl) {
        return localUrl;
      }
    }

    return undefined;
  }

  /**
   * Stops the current execution.
   * @returns {boolean} true, if program is stopped
   */
  stop() {
    this.stopped = true;

    const skulpt = this.getSkulpt();

    if (!skulpt) return;

    // 1. Python-Seite abbrechen (falls noch aktiv)
    skulpt.shouldStop = true;
    skulpt.rejectSleep?.('Interrupted execution');

    // 2. Turtle HARD RESET
    if (skulpt.TurtleGraphics) {
      try {
        skulpt.TurtleGraphics.stop();
      }
      catch {
        console.warn('could not stop turtle');
        return false;
      }
    }
    // p5 abbrechen
    if (skulpt.p5) {
      try {
        skulpt.p5.kill();
      }
      catch {
        console.warn('could not stop p5');
        return false;
      }
      this.p5Instance = null;
    }

    this.runtime.codeContainer.getStateManager()?.stop();
    return true;
  }

  async setup() {
    const skulptRuntimeUrl = this.getSkulptRuntimeUrl();
    const skulpt = this.getSkulpt() || await ensureSkulptRuntime(skulptRuntimeUrl);

    if (!skulpt) {
      throw new Error('Skulpt runtime is not loaded.');
    }

    this._isInitalized = true;
    this.Sk = skulpt;
    skulpt.timeoutMsg = () => this.getExecutionLimitMessage();
    skulpt.configure({
      output: (text) => {
        this.runtime.outputHandler(text);
      },
      read: (fileName) => this._readHandler(fileName),
      inputfun: (prompt) => this.runtime.inputHandler(prompt),
      inputfunTakesPrompt: this.inputTakesPrompt,
      killableWhile: this.killableWhile,
      killableFor: this.killableFor,
      retainGlobals: this.retainGlobals,
      execLimit: this.hasExecutionLimit() ? this.executionLimit : null,
      __future__: skulpt.python3
    });
  }

  getImageManager() {
    return this.runtime?.codeContainer?.getImageManager?.() || null;
  }

  getUploadedImages() {
    const imageManager = this.getImageManager();

    if (!imageManager?.isEnabled?.()) {
      return [];
    }

    return imageManager.getImages();
  }

  getSoundManager() {
    return this.runtime?.codeContainer?.getSoundManager?.() || null;
  }

  getUploadedSounds() {
    const soundManager = this.getSoundManager();

    if (!soundManager?.isEnabled?.()) {
      return [];
    }

    return soundManager.getSounds();
  }

  buildImageRegistry() {
    return this.getUploadedImages().reduce((registry, image) => {
      registry[image.name] = {
        name: image.name,
        url: image.objectUrl,
        path: null,
        mime_type: image.mimeType,
        size: image.size,
      };

      return registry;
    }, {});
  }

  installImageRegistry() {
    if (!Sk?.ffi?.remapToPy || !Sk?.builtins) {
      return;
    }

    Sk.builtins.h5p_images = Sk.ffi.remapToPy(this.buildImageRegistry());
  }

  buildSoundRegistry() {
    return this.getUploadedSounds().reduce((registry, sound) => {
      registry[sound.name] = {
        name: sound.name,
        url: sound.objectUrl,
        path: null,
        mime_type: sound.mimeType,
        size: sound.size,
      };

      return registry;
    }, {});
  }

  installSoundRegistry() {
    if (!Sk?.ffi?.remapToPy || !Sk?.builtins) {
      return;
    }

    Sk.builtins.h5p_sounds = Sk.ffi.remapToPy(this.buildSoundRegistry());
  }

  async execute(code, canvasDiv = null) {
    const containsP5 = this.runtime.containsP5Code();
    const containsTurtle = this.runtime.containsTurtleCode?.() === true;
    const skulptRuntimeUrl = this.getSkulptRuntimeUrl(containsP5);

    await ensureSkulptRuntime(skulptRuntimeUrl);

    if (!this._isInitalized) {
      await this.setup();
    }

    if (containsP5) {
      await ensureP5Script(this.options.p5CdnUrl);
    }

    this.stopped = false;
    const skulpt = this.getSkulpt();

    this.Sk = skulpt;
    skulpt.shouldStop = false;
    skulpt.execStart = Date.now();
    this.installImageRegistry();
    this.installSoundRegistry();

    // Canvas vorbereiten
    if (canvasDiv && containsP5) {
      this.setupP5(canvasDiv);
    }
    else if (canvasDiv && containsTurtle) {
      this.setupTurtleDiv(canvasDiv);
    }

    if (containsP5 && canvasDiv) {
      const runner = this;
      const P5Runtime = window.p5;

      // Erzeugen einer p5 Instanz mit Instance Mode
      const sketch = function (p) {
        runner.p5Instance = p;

        // draw/ setup aus Benutzer-Code
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

        // Methoden global spiegeln, damit Python circle(), line() usw. aufrufen kann
        Object.getOwnPropertyNames(p.__proto__).forEach(name => {
          if (typeof p[name] === 'function') {
            window[name] = (...args) => p[name](...args);
          }
        });
      };

      // p5 Instanz erstellen
      this.p5Instance = new P5Runtime(sketch, canvasDiv);
      skulpt.p5 = { instance: this.p5Instance };
    }

    try {
      const result = await skulpt.misceval.asyncToPromise(() =>
        skulpt.importMainWithBody('<stdin>', false, code, true, this.suspension)
      );
      await this.onSuccess?.(result);
      return result;
    } catch (error) {
      await this.onError?.(error);
    }
  }

  onError(error) {
    if (this.isExecutionLimitError(error)) {
      this.runtime.onError(this.getExecutionLimitMessage());
      return;
    }

    if (
      error === 'Interrupted execution' ||
      error === 'Program suspended' ||
      error?.toString?.().includes('Interrupted execution')
    ) {
      this.runtime
        .getConsoleManager()
        .write(`${getPythonL10nValue(this.l10n, 'skulptExecutionAborted')}\n`);
      return;
    }

    try {
      console.warn('Error in skulptrunner', error);
      const message = error.args?.v?.[0]?.$mangled
        ?? getPythonL10nValue(this.l10n, 'skulptUnknownError');
      const trace = error.traceback?.[0];

      this.errorMessage = error;
      this.errorLineNumber = trace?.lineno ?? null;

      this.runtime.onError(
        addPythonErrorHint(this.l10n, tPython(this.l10n, 'skulptRuntimeError', {
          message,
          line: trace?.lineno ?? '?',
          column: trace?.colno ?? '?',
        }))
      );
    }
    catch {
      console.warn('Unhandled Skulpt error', error);
    }
  }

  async onSuccess(value) {
    this.runtime.onSuccess(value);
    if (!this.runtime.containsP5Code()) {
      this.runtime.codeContainer.getStateManager()?.stop();
    }

  }


  _readHandler(x) {
    const skulpt = this.getSkulpt();

    if (!skulpt?.builtinFiles?.files?.[x]) {
      throw tPython(this.l10n, 'skulptFileNotFound', { file: x });
    }
    return skulpt.builtinFiles.files[x];
  }

  _createSuspensionConfig() {
    return {
      '*': () => {
        const skulpt = this.getSkulpt();

        if (this.stopped || skulpt?.shouldStop) {
          throw 'Program suspended';
        }
      },
    };
  }

  setupTurtleDiv(canvasDiv) {
    const skulpt = this.getSkulpt();

    (skulpt.TurtleGraphics ||= {}).target = canvasDiv.id;
  }

  setupP5(canvasDiv) {
    const P5Runtime = window.p5;
    const skulpt = this.getSkulpt();

    if (!P5Runtime) {
      console.error(getPythonL10nValue(this.l10n, 'skulptP5Missing'));
      return;
    }

    // Alten Sketch entfernen
    if (this.p5Instance) {
      this.p5Instance.remove();
      this.p5Instance = null;
    }

    canvasDiv.innerHTML = '';
    this.canvasDiv = canvasDiv;

    if (this.runtime.containsP5Code() && !P5Runtime.prototype._skulptBound) {
      P5Runtime.prototype._skulptBound = true;
    }

    P5Runtime.prototype.linmap = P5Runtime.prototype.map;

    // attach all p5 instance properties to the p5 prototype so they are accessible in Python
    // necessary for p5play bindings
    P5Runtime.prototype.registerMethod('init', function () {
      for (let key in this) {
        const val = this[key];
        if (P5Runtime.prototype[key] === undefined) {
          P5Runtime.prototype[key] = val;
        }// else
      }
      //this.loadImage = P5Runtime.prototype.loadImage;
    });

    // Skulpt p5 Referenz für Python
    skulpt.p5 = { instance: this.p5Instance };
  }

  addCanvas(canvasWrapper, canvasDiv) {
    if (!canvasDiv) return;

    const containsP5 = this.runtime.containsP5Code();
    const skulptRuntimeUrl = this.getSkulptRuntimeUrl(containsP5);

    ensureSkulptRuntime(skulptRuntimeUrl)
      .then(() => {
        if (!this._isInitalized) {
          this.setup();
        }

        const skulpt = this.getSkulpt();
        skulpt.canvas = canvasDiv.id;

        if (this.runtime.containsTurtleCode()) {
          this.setupTurtleDiv(canvasDiv);
        }

        if (!containsP5) {
          return null;
        }

        return ensureP5Script(this.options.p5CdnUrl)
          .then(() => this.setupP5(canvasDiv));
      })
      .catch((error) => this.runtime.onError(String(error?.message || error)));
  }
}