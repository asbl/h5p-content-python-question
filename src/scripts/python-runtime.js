import Util from "./services/util";

export default class PythonRuntime extends H5P.Runtime {
  constructor(question, options) {
    super(question);
    this.solutions = [];
    this.options = options || {};
    this.hasConsole = options.hasConsole;
    this.console = null;
    this.codeContainer = null;
    this.inputTakesPrompt =
      options.inputTakesPrompt !== undefined ? options.inputTakesPrompt : true;
    this.saveOutput =
      options.saveOutput !== undefined ? options.saveOutput : false;
    this.stopped = false; // set in this.run / this.stop
    this.suspension =
      options.shouldStop !== undefined
        ? {
            "*": () => {
              if (this.stopped === true) throw "Program suspended";
            },
          }
        : {};
    this.killableWhile =
      options.shouldStop !== undefined && options.killableWhile !== undefined
        ? options.killableWhile
        : true;
    this.killableFor =
      options.shouldStop !== undefined && options.killableFor !== undefined
        ? options.killableFor
        : true;
    this.retainGlobals = options.retainGlobals || false;
    this.hasCanvas = options.hasCanvas;
    this.canvasWrapper = document.createElement("div");
    this.canvasWrapper.classList.add("canvas-wrapper");
    this.errorMessage = null;
    this.errorLineNumber = null;
    this.l10n = Util.extend(
      {
        hidden: "hidden",
      },
      this.l10n,
    );
    this.Sk = null;
    this.type = "Runtime (general)";
  }

  createCanvas(canvasWrapper, identifier) {
    /* For turtle graphics: */
    canvasWrapper.innerHTML = "";
    const p5Div = document.createElement("div");
    const turtleDiv = document.createElement("div");
    p5Div.id = `p5_${identifier}_${H5P.createUUID()}`;
    p5Div.classList.add("canvas-content");
    p5Div.classList.add("p5-content");
    turtleDiv.id = `turtle_${identifier}_${H5P.createUUID()}`;
    turtleDiv.classList.add("canvas-content");
    turtleDiv.classList.add("turtle-content");
    p5Div.innerHTML = "";
    turtleDiv.innerHTML = "";
    canvasWrapper.append(turtleDiv);
    canvasWrapper.append(p5Div);
    return [canvasWrapper, turtleDiv, p5Div];
  }

  _containsCanvasCode() {
    if (
      this.code.includes("import turtle") ||
      this.code.includes("import p5") ||
      this.code.includes("from turtle import") ||
      this.code.includes("import p5")
    ) {
      return true;
    }
  }

  /**
   *
   * @param {*} code The code to run.
   * @private
   * @returns {Promise} A Promise describing the result.
   */
  async _run(code) {
    /* Run SK enironment via promise. Errors are handled with error-promise */
    this.stopped = false;
    let myPromise = Sk.misceval.asyncToPromise(() => {
      return Sk.importMainWithBody("<stdin>", false, code, true);
    }, this.suspension);
    myPromise.runtime = this;
    return myPromise
      .then(async () => {
        await this.onSuccess();
      })
      .catch((error) => {
        this.onError(error);
      })
      .finally(() => {
        this.onFinally();
        this.question.trigger("resize");
      });
  }

  inputHandler(_text) {
    /* Set in subclasses */
  }

  getTraceBackFromError(error) {
    let errorText = "";
    if (error.traceback) {
      for (const element of error.traceback) {
        if (element.filename === "<stdin>.py") {
          errorText += "\n  at line " + element.lineno;
        } else {
          errorText += "\n  at " + element.filename + " line " + element.lineno;
        }
        if ("colno" in element) {
          errorText += " column " + element.colno;
        }
      }
    }
    return errorText;
  }

  stop() {
    this.stopped = true;
    if (this.currentRejectPromise !== undefined) {
      this.currentRejectPromise("Interrupted execution");
    }
    if (this.Sk !== null && this.Sk.rejectSleep !== undefined) {
      this.Sk.rejectSleep("Interrupted execution");
    }
    if (this.Sk !== null && this.Sk.p5 !== undefined) {
      if (this.Sk.p5.instance !== undefined) {
        this.Sk.p5.instance.remove();
      }
    }
  }

  /**
   * Handles error
   * @param {error} error Error with error information in error.args
   */
  onError(error) {
    // Write error to console
    this.question.codeContainer.pageManager.showPage("code");
    try {
      const errorMessage = error.args.v[0].$mangled;
      const lineNumber = error.traceback[0].lineno;
      const colNumber = error.traceback[0].colno;
      this.outputHandler(
        "Error: " + errorMessage + " on line " + lineNumber,
        "; column: " + colNumber,
      );
      // Handle on Error
      this.errorMessage = error;
      this.errorLineNumber = lineNumber;
    } catch (ex) {
      console.info("Error (catched)", error);
    }
  }

  /**
   * Reads input files, needed for imports.
   * @param {*} x file to read
   * @returns {*} The input
   */
  readHandler(x) {
    if (
      Sk.builtinFiles === undefined ||
      Sk.builtinFiles["files"][x] === undefined
    ) {
      throw "File not found: '" + x + "'";
    }
    return Sk.builtinFiles["files"][x];
  }

  onFinally() {}
}
