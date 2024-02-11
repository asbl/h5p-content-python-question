import PythonRuntime from './python-runtime';

export default class PythonSolutionRuntime extends PythonRuntime {

  constructor(question, codeTester, options) {
    super(question, options);
    this.codeTester = codeTester;
    this.code = this.question.targetCode;
    this.type = 'Solution runtime';
    this.editor = this.question.editor;
  }
      
  async run() {
    if (!this.solutions[this.codeTester.testCaseCounter] === true) {
      this.setup();
      await this._run(this.code);
    }
  }

  setSolutionCanvas() {
    const canvasWrapper = document.createElement('div');
    canvasWrapper.id = `canvas-wrapper_solution_${this.codeTester.testCaseCounter}_${H5P.createUUID()}`;
    canvasWrapper.classList.add('canvas-wrapper');
    canvasWrapper.classList.add('solution-canvas-wrapper');
    const canvasData = this.createCanvas(canvasWrapper, 'testCaseNumber');
    const turtleDiv = canvasData[1];
    const p5Div = canvasData[2];
    const testCaseTableCell = this.codeTester.getTestCasesArea().querySelector(`.expected.expected-${this.codeTester.testCaseCounter}`);
    if (testCaseTableCell !== null) {
      testCaseTableCell.appendChild(canvasWrapper);
    }
    
    return [canvasWrapper, turtleDiv, p5Div];
  }

  setupEnvironment() {
    this.codeTester.startTest(); 
    this.Sk = Sk;
    /* Preparations: Reset console*/
    if (this._containsCanvasCode()) {
      const canvasData = this.setSolutionCanvas();
      const canvasWrapper = canvasData[0];
      const turtleDiv = canvasData[1];
      Sk.canvas = canvasWrapper.id;
      (Sk.TurtleGraphics || (Sk.TurtleGraphics = {})).target = turtleDiv.id;
    }

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
      retainGlobals: this.retainGlobals
    });
    Sk.runtime = this;
  }

  setup() {
    if (this.solutions[this.codeTester.testCaseCounter] === undefined) {
      this.solutions[this.codeTester.testCaseCounter] = true;
      this.setupEnvironment();
    }
  }

  inputHandler(_text) {
    return new Promise((resolve, _reject) => {
      resolve(this.codeTester.getInput());
    });
  } 

  outputHandler(text) {
    let trimmed_output = text;
    const editorConsole = this.editor.getConsole();
    if (editorConsole) {
      editorConsole.parentElement.style.display = 'block';
      trimmed_output = `[Solution-${this.codeTester.testCaseCounter + 1}] > ${text}\n`;
      editorConsole.value += trimmed_output;
      editorConsole.scrollTop = editorConsole.scrollHeight;
    }
  }

} 