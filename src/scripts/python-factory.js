export default class PyhonQuestionFactory extends H5P.CodeQuestionFactory {
  
  /**
   * Returns Ace-Editor-Instance
   * @param {HTMLElement} parent parentDiv-Element
   * @param {string} code code as String (optional)
   * @param isAssignment
   * @returns {H5P.PythonAce} The generated Editor
   */
  createEditor(parent, code, isAssignment = false) {
    if (isAssignment) {
      return new H5P.PythonAce(parent, {
        isAssignment: true,
        code: code,
        hasButtons: true,
        preCode: this.question.preCode,
        postCode: this.question.postCode,
        language: this.question.language,
        console: this.question.hasConsole,
        consoleHidden: true,
        l10n : this.question.l10n,
        question: this.question
      });
    }
    else {
      return new H5P.PythonAce(parent, {
        isAssignment: false,
        code: code,
        fixedSize : false,
        consoleHidden : true,
        hasButtons: true,
        l10n : this.question.l10n,
        question: this.question
      });
    }
  }
  
  /**
   * Creates a new Manual Runtime
   * @param {string} code Code to execute
   * @param editor
   * @returns  {H5P.PythonRuntime} The generated Runtime
   */
  createManualRuntime(editor) {
    return new H5P.PythonManualRuntime(this.question, editor, {
      console: true,
      shouldStop: () => {
        this.question.shouldStop();
      },
      saveOutput: true,
      hasCanvas: true,
      hasConsole: true,
    });
  }

  /**
   * Creates a new Test-Runtime
   * @param codeTester Codetester Instance
   * @param {string} code Code to execute
   * @returns  {H5P.PythonRuntime} The generated Runtime
   */
  createTestRuntime(codeTester, code) {
    codeTester = this.question.codeTester;
    return new H5P.PythonTestRuntime(this.question, codeTester, code, {
      console: true,
      shouldStop: () => {
        this.question.shouldStop();
      },
      saveOutput: true,
      hasCanvas: true,
      hasConsole: true,
    });
  }

  createCodeTester() {
    if (this.question.gradingMethod === 'ioTestCases') {
      return new H5P.PythonIOTester(this.question);
    }
    else if (this.question.gradingMethod === 'targetImage') {
      return new H5P.PythonImageTester(this.question);
    }
  }
}