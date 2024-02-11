import PythonRuntime from './python-runtime';

export default class PythonManualRuntime extends PythonRuntime {

  constructor(question, editor, options) {
    super(question, options);
    this.code = editor.getCode();
    this.editor = editor;
  }

  async run() {
    this.removeRunCanvas();
    this.setup();
    this._run(this.code);
  }

  setup() {
    this.setupEnvironment();
  }

  setRunCanvas() {
    const canvasData = this.createCanvas(this.canvasWrapper, 'run');
    this.canvasWrapper = canvasData[0];
    this.turtleDiv = canvasData[1];
    this.p5Div = canvasData[2];
    this.editor.getPage('canvas').appendChild(this.canvasWrapper);
    return [this.canvasWrapper, this.turtleDiv, this.p5Div];
  }

  removeRunCanvas() {
    this.editor.getPage('canvas').innerHTML = '';
  }

  showCanvas() {
    if (this._containsCanvasCode(this.code)) {
      this.editor.showCanvas();
    }
  }

  userInputHandler(text, runtime, resolve) {
    const inputString = runtime.prompt(resolve, text);
    return inputString;
  }

  inputHandler(text) {
    const rValue =  new Promise((resolve, _reject) => {
      resolve(this.getPrompt()(text, 'Python asks for User-Input', ''));
    });
    return rValue;
  }

  /**
   * Handler for stdout - Prints text to console.
   * @param {string} text The text which should be printed to console
   */
  outputHandler(text) {
    // write output to console
    const editorConsole = this.editor.getConsole();
    if (editorConsole) {
      editorConsole.parentElement.style.display = 'block';
      const trimmed_output = '> ' + text.trim() + '\n';
      editorConsole.value += trimmed_output;
      editorConsole.scrollTop = editorConsole.scrollHeight;
      this.editor.showConsole(true);
    }
    console.info(text);
  }

  setupEnvironment() {
    this.isTest = false;
    this.Sk = Sk;
    /* Preparations: Reset console*/
    if (this.console != null) {
      this.console.value = '';
    }
    const canvasData = this.setRunCanvas();
    const canvasWrapper = canvasData[0];
    const turtleDiv = canvasData[1];
    const p5Div = canvasData[2];
    Sk.canvas = canvasWrapper.id;
    (Sk.TurtleGraphics || (Sk.TurtleGraphics = {})).target = turtleDiv.id;
    /* For processing : */
    if (window.p5 && window.p5 !== p5) {
      window.p5 = p5;
    }
    p5Div.innerHTML = '';
    Sk.p5Sketch = this.p5Div.id;
    Sk.p5 = {
      node: p5Div.id
    };

    /* Configure SK environment */
    Sk.configure({
      output: (text) => {
        this.outputHandler(text);
      }, // handles output
      read: this.readHandler, // read input files
      inputfun: async (x) =>  {
        const a = await this.inputHandler(x);
        return a;
      },
      inputfunTakesPrompt: this.inputTakesPrompt,
      killableWhile: this.killableWhile,
      killableFor: this.killableFor,
      retainGlobals: this.retainGlobals,
      __future__: Sk.python3
    });
    Sk.runtime = this;
    this.showCanvas();
  }
      
} 