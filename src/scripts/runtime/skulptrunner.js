/* global Sk, p5 */

import {
  getPythonL10nValue,
  tPython,
} from '../services/python-l10n';
import { normalizePythonExecutionLimit } from '../services/python-execution-limit';

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

  /**
   * Stops the current execution.
   * @returns {boolean} true, if program is stopped
   */
  stop() {
    this.stopped = true;

    if (!Sk) return;

    // 1. Python-Seite abbrechen (falls noch aktiv)
    Sk.shouldStop = true;
    Sk.rejectSleep?.('Interrupted execution');

    // 2. Turtle HARD RESET
    if (Sk.TurtleGraphics) {
      try {
        Sk.TurtleGraphics.stop();
      }
      catch {
        console.warn('could not stop turtle');
        return false;
      }
    }
    // p5 abbrechen
    if (Sk.p5) {
      try {
        Sk.p5.kill();
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

  setup() {
    this._isInitalized = true;
    Sk.timeoutMsg = () => this.getExecutionLimitMessage();
    Sk.configure({
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
      __future__: Sk.python3
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
    if (!this._isInitalized) this.setup();

    this.stopped = false;
    this.Sk = Sk;
    Sk.shouldStop = false;
    Sk.execStart = Date.now();
    this.installImageRegistry();
    this.installSoundRegistry();

    // Canvas vorbereiten
    if (canvasDiv) this.setupP5(canvasDiv);

    // Prüfen, ob Python Code p5 verwendet
    const containsP5 = this.runtime.containsP5Code();

    if (containsP5 && canvasDiv) {
      const runner = this;

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
      this.p5Instance = new p5(sketch, canvasDiv);
      Sk.p5 = { instance: this.p5Instance };
    }

    try {
      const result = await Sk.misceval.asyncToPromise(() =>
        Sk.importMainWithBody('<stdin>', false, code, true, this.suspension)
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
        tPython(this.l10n, 'skulptRuntimeError', {
          message,
          line: trace?.lineno ?? '?',
          column: trace?.colno ?? '?',
        })
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
    if (!Sk.builtinFiles?.files?.[x]) {
      throw tPython(this.l10n, 'skulptFileNotFound', { file: x });
    }
    return Sk.builtinFiles.files[x];
  }

  _createSuspensionConfig() {
    return {
      '*': () => {
        if (this.stopped || Sk.shouldStop) {
          throw 'Program suspended';
        }
      },
    };
  }

  setupTurtleDiv(canvasDiv) {
    (Sk.TurtleGraphics ||= {}).target = canvasDiv.id;
  }

  setupP5(canvasDiv) {
    if (!window.p5) {
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

    if (this.runtime.containsP5Code() && !p5.prototype._skulptBound) {
      p5.prototype._skulptBound = true;
    }

    p5.prototype.linmap = p5.prototype.map;

    // attach all p5 instance properties to the p5 prototype so they are accessible in Python
    // necessary for p5play bindings
    p5.prototype.registerMethod('init', function () {
      for (let key in this) {
        const val = this[key];
        if (p5.prototype[key] === undefined) {
          p5.prototype[key] = val;
        }// else
      }
      //this.loadImage = p5.prototype.loadImage;
    });

    // Skulpt p5 Referenz für Python
    Sk.p5 = { instance: this.p5Instance };
  }

  addCanvas(canvasWrapper, canvasDiv) {
    if (!this._isInitalized) {
      this.setup();
    }
    if (!canvasDiv) return;

    Sk.canvas = canvasDiv.id;

    if (this.runtime.containsTurtleCode()) {
      this.setupTurtleDiv(canvasDiv);
    }

    if (this.runtime.containsP5Code()) {
      this.setupP5(canvasDiv);
    }
  }
}