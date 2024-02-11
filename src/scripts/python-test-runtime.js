import PythonRuntime from './python-runtime';

export default class PythonTestRuntime extends PythonRuntime {
  constructor(question, codeTester, code, options) {
    super(question, options);
    this.codeTester = codeTester;
    this.code = code;
    this.editor = this.question.editor;
  }

  setCanvas() {
    const canvasWrapper = document.createElement('div');
    canvasWrapper.id = `canvas-wrapper_testcase_${this.codeTester.testCaseCounter}_${H5P.createUUID()}`;
    canvasWrapper.classList.add('canvas-wrapper');
    const canvasData = this.createCanvas(canvasWrapper, 'testCaseNumber');
    const turtleDiv = canvasData[1];
    const p5Div = canvasData[2];
    const testCaseTableCell = this.codeTester.getTestCasesArea().querySelector(`.user-output.output-${this.codeTester.testCaseCounter}`);
    if (testCaseTableCell !== null) {
      testCaseTableCell.appendChild(canvasWrapper);
    }
    return [canvasWrapper, turtleDiv, p5Div];
  }

  removeCanvas() {
    this.codeTester.getTestCasesArea().querySelectorAll('.user-output').forEach((element) => {
      element.innerhHTML = '';
    });
  }

  setupEnvironment() {
    this.codeTester.startTest(); 
    this.Sk = Sk;
    /* Preparations: Reset console*/
    if (this.console != null) {
      this.console.value = '';
    }
    this.test = true;
    this.removeCanvas();
    if (this._containsCanvasCode()) {
      const canvasData = this.setCanvas();
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

  inputHandler(_text) {
    return new Promise((resolve, _reject) => {
      resolve(this.codeTester.getInput());
    });
  } 

  /**
   * Handler for stdout - Prints text to console.
   * @param {string} text The text which should be printed to console
   */
  outputHandler(text) {
    // Store output in array
    let trimmed_output = text; // ends with linebreak,must be removed with trim()
    this.codeTester.addOutput(trimmed_output.trim());
    // write output to console
    const editorConsole = this.editor.getConsole();
    if (editorConsole) {
      editorConsole.parentElement.style.display = 'block';
      trimmed_output = `[Test-${this.codeTester.testCaseCounter + 1}] > ${text}\n`;
      editorConsole.value += trimmed_output;
      editorConsole.scrollTop = editorConsole.scrollHeight;
    }
  }

  setup() {
    this.isTest = true;
    if (this.codeTester !== undefined) {
      this.codeTester.setcode(this.code);
    }
    this.setupEnvironment();
  }

  async run() {
    await this.runSolution();
    this.setup();
    await this._run(this.code);
  }

  /**
   * Called when runtime Promise resolves successfully.
   */
  async onSuccess() {
    await this.codeTester.onSuccessTest(this.codeTester.testCaseCounter);
    if (this.codeTester.hasMoreTestCases()) {
      await this.runNextTest();
    }
    else {
      this.question.evaluate();
    }
  }
  
  async runSolution() {
    if (this.codeTester.runSolution) {
      const solutionRuntime = new H5P.PythonSolutionRuntime(this.question, this.codeTester, this.options);
      await solutionRuntime.run();
    }
  }
    
  async runNextTest() {
    this.codeTester.nextTest();
    const testruntime = this.question.factory.createTestRuntime(this.codeTester, this.code);
    await testruntime.run();
  }

}