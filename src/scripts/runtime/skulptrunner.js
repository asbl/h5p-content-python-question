/* global Sk, p5 */

import Util from '../services/util';

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

    this.suspension = this._createSuspensionConfig();

    /* Error state */
    this.errorMessage = null;
    this.errorLineNumber = null;

    /* Localization */
    this.l10n = Util.extend({ hidden: 'hidden' }, runtime.l10n);

    this.type = 'Skulpt Runner';

    this.canvasWrapper = null;
    this.canvasDiv = null;

    this.p5Instance = null;
    this._isInitalized = false;
  }

  static warmup(runtime) {
    SkulptRunner._warmupSkulpt(runtime);
    SkulptRunner._warmupP5();
  }

  static _warmupSkulpt(runtime) {
    if (SkulptRunner._skulptWarmedUp) return;
    SkulptRunner._skulptWarmedUp = true;

    Sk.configure({
      output: () => { },
      read: (x) => {
        if (!Sk.builtinFiles?.files?.[x]) {
          throw `File not found: '${x}'`;
        }
        return Sk.builtinFiles.files[x];
      },
      __future__: Sk.python3,
    });

    Sk.importMainWithBody('<warmup>', false, 'pass', true);
  }

  static _warmupP5() {
    if (!window.p5 || SkulptRunner._p5WarmedUp) return;
    SkulptRunner._p5WarmedUp = true;

    p5.prototype.linmap = p5.prototype.map;

    if (!p5.prototype._skulptBound) {
      p5.prototype._skulptBound = true;

      p5.prototype.registerMethod('init', function () {
        for (let key in this) {
          if (p5.prototype[key] === undefined) {
            p5.prototype[key] = this[key];
          }
        }
      });
    }

    new p5(function (s) {
      s.setup = function () {
        s.createCanvas(1, 1);
        s.noLoop();
        s.remove();
      };
    });
  }

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
      catch { }
    }
    // p5 abbrechen
    if (this.p5Instance) {
      try {
        this.p5Instance.noLoop(); // stoppt den Loop
        this.p5Instance.remove(); // zerstört Canvas und Instanz
      }
      catch { }
      this.p5Instance = null;
    }


    this.runtime.codeContainer.getStateManager()?.stop();
  }

  setup() {
    this._isInitalized = true;
    Sk.configure({
      output: (text) => {
        this.runtime.outputHandler(text);
      },
      read: this._readHandler,
      inputfun: (prompt) => this.runtime.inputHandler(prompt),
      inputfunTakesPrompt: this.inputTakesPrompt,
      killableWhile: this.killableWhile,
      killableFor: this.killableFor,
      retainGlobals: this.retainGlobals,
      __future__: Sk.python3
    });
  }

  async execute(code, canvasDiv = null) {
    if (!this._isInitalized) {
      this.setup();
    }
    this.stopped = false;
    this.Sk = Sk;
    Sk.shouldStop = false;

    try {
      const result = await Sk.misceval.asyncToPromise(() =>
        Sk.importMainWithBody('<stdin>', false, code, true, this.suspension)
      );
      await this.onSuccess?.(result);
      return result;
    }
    catch (error) {
      await this.onError?.(error);
    }
  }


  onError(error) {
    if (
      error === 'Interrupted execution' ||
      error === 'Program suspended' ||
      error?.toString?.().includes('Interrupted execution')
    ) {
      this.runtime
        .getConsoleManager()
        .write('Programm wurde abgebrochen.\n');
      return;
    }

    try {
      console.warn("Error in skulptrunner", error)
      const message = error.args?.v?.[0]?.$mangled ?? 'Unknown error';
      const trace = error.traceback?.[0];

      this.errorMessage = error;
      this.errorLineNumber = trace?.lineno ?? null;

      this.runtime.onError(
        `Error: ${message} on line ${trace?.lineno}; column: ${trace?.colno}`
      );
    }
    catch {
      console.info('Unhandled Skulpt error', error);
    }
  }

  async onSuccess(value) {
    this.runtime.onSuccess(value);
  }


  _readHandler(x) {
    if (!Sk.builtinFiles?.files?.[x]) {
      throw `File not found: '${x}'`;
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
      console.error('p5.js ist nicht geladen');
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

    Sk.canvas = canvasWrapper.id;

    if (this.runtime.containsTurtleCode()) {
      this.setupTurtleDiv(canvasDiv);
    }

    if (this.runtime.containsP5Code()) {
      this.setupP5(canvasDiv);
    }
  }
}