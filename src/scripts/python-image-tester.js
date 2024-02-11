import pixelmatch from 'pixelmatch';

export default class PythonImageTester extends H5P.CodeTester {

  constructor(codeQuestion) {
    super(codeQuestion);
    this.runSolution = true;
  }

  async onSuccessTest() {
    try {
      this.mergeOutputCanvas(this.testCaseCounter);
      if (this.outputArray[this.testCaseCounter] === undefined) {
        this.outputArray[this.testCaseCounter] = [];
      }
      this.outputArray[this.testCaseCounter].push(this.getOutputImage(this.testCaseCounter));
    }
    catch (error) {
      this.outputArray[this.testCaseCounter].push('error');
    } 

    
    this.checkedTestCases[this.testCaseCounter] = await this.checkTestCase(this.testCaseCounter);
    await this.updateTestCaseTable(this.testCaseCounter);
  }

  mergeOutputCanvas() {
    const turtleContent = this.getTestCasesArea().querySelector(`.user-output.output-${this.testCaseCounter} .canvas-wrapper`);
    const userOutputCanvas =  this._merge_turtle_canvases(turtleContent);
    let testCasesArea = this.getTestCasesArea();
    let testCaseTable = testCasesArea.querySelector(`.table-testcase-${this.testCaseCounter}`);
    let row = Array.from(testCaseTable.rows)[1];
    row.cells[2].innerHTML = '';
    row.cells[2].append(userOutputCanvas);
  }

  reset() {
    super.reset();
    const turtleContent = this.getTestCasesArea().querySelectorAll('.user-output');
    [...turtleContent].forEach((element) => {
      element.innerHTML = '';
    });
    const expectedContent = this.getTestCasesArea().querySelectorAll('.expected');
    [...expectedContent].forEach((element) => {
      element.innerHTML = '';
    });
  }

  /**
   * Checks all tests in a Testcase.
   * @returns {boolean} True, if all Tests return True
   */
  async checkTestCase() {
    if ((this.testcases[this.testCaseCounter].targetImage === undefined)
         && this.outputArray[this.testCaseCounter].length === 0) {
      return true;
    }
    else if (this.outputArray[this.testCaseCounter] && this.outputArray[this.testCaseCounter][0] === 'error') {
      return false;
    }
    else {
      const canvas = this.getOutputImage(this.testCaseCounter);
      let canvasData = canvas.getContext('2d').getImageData(0, 0, 400, 400).data;
      const expectedCanvas = this.getExpectedImage(this.testCaseCounter);
      const imgData = expectedCanvas.getContext('2d').getImageData(0, 0, 400, 400).data;
      /*const expected =  this.getExpectedImage(testCaseNumber);
      const imgData = expected.data;*/
      
      const targetImage = document.createElement('img');
      targetImage.width = 400;
      targetImage.height = 400;
      const targetData = targetImage.data; 
      let diffvalue = 1;
      diffvalue = await pixelmatch(canvasData, imgData, targetData, 400, 400, { threshold: 0.95, includeAA: false });
      console.info('Image difference value: ', diffvalue);
      return diffvalue < 0.1;
    }
  }

  _merge_turtle_canvases(selector) {
    const targetCanvas = document.createElement('canvas');
    targetCanvas.classList.add('merged');
    const firstCanvas = selector.querySelectorAll('canvas')[0];
    const secondCanvas = selector.querySelectorAll('canvas')[1];
    targetCanvas.width = firstCanvas.width;
    targetCanvas.height = firstCanvas.height;
    targetCanvas.getContext('2d').drawImage(firstCanvas, 0, 0);
    targetCanvas.getContext('2d').drawImage(secondCanvas, 0, 0);
    return targetCanvas;
  }

  getOutputImage() {
    return this.getTestCasesArea().querySelector(`.user-output.output-${this.testCaseCounter} canvas.merged`);
  }

  mergeExpectedImage() {
    const turtleContent =  this.getTestCasesArea().querySelector(`.tester-image.expected.expected-${this.testCaseCounter} .canvas-wrapper`);
    const expectedCanvas =  this._merge_turtle_canvases(turtleContent);
    let testCasesArea = this.getTestCasesArea();
    let testCaseTable = testCasesArea.querySelector(`.table-testcase-${this.testCaseCounter}`);
    let row = Array.from(testCaseTable.rows)[1];
    row.cells[1].innerHTML = '';
    row.cells[1].append(expectedCanvas);
    return this._merge_turtle_canvases(turtleContent);
  }

  getExpectedImage() {
    let img = this.getTestCasesArea().querySelector(`.tester-image.expected.expected-${this.testCaseCounter} canvas.merged`);
    img = img !== null ? img : this.mergeExpectedImage();
    const targetCanvas = document.createElement('canvas');
    targetCanvas.width = 400;
    targetCanvas.height = 400;
    targetCanvas.getContext('2d').drawImage(img, 0, 0);
    return targetCanvas; 
  }

  updateTestCaseTable() {
    let testCasesArea = this.getTestCasesArea();
    let testCaseTable = testCasesArea.querySelector(`.table-testcase-${this.testCaseCounter}`);
    let row = Array.from(testCaseTable.rows)[1];
    if (this.checkedTestCases[this.testCaseCounter]) {
      row.classList.add('test-passed');
      row.cells[3].innerHTML = '✓';
    }
    else {
      row.classList.remove('test-passed');
      row.cells[3].innerHTML = 'X';
    }
  }

  generateTestCasesArea() {
    const testCasesArea = super.generateTestCasesArea();
    let html = '';
    this.testcases.forEach((testCase, i) => {
      html += '<div class="table-testcase-container image-tester">';
      html += `<h3>${this.l10n.testCase} ${i + 1}</h3>`;
      html += `<table class="table-testcase-${i} table-testcase">`;
      html += `<thead><tr><td>${this.l10n.testInput}</td><td>${this.l10n.expectedOutput}</td><td>${this.l10n.lastOutput}</td><td>${this.l10n.passed}</td></tr></thead>`;
      html += '<tbody>';
      html += `<tr><td class="input input-${i}">`;
      let inputs = testCase.inputs ? testCase.inputs.join('<br/>') : '';
      inputs = !testCase.hidden ? inputs :  this.l10n.hidden;
      html += inputs;
      html += `</td><td class="expected tester-image expected-${i}">`;
      html += '</td id=>';
      html += `<td class="output tester-image user-output output-${i}">`;
      html += `</td passed passed-${i}><td></td></tr>`;
      html += '</tbody>';
      html += '</table>';
      html += '</div>';
    });
    testCasesArea.innerHTML = html;
    this.question.trigger('resize');
    
    return testCasesArea;
  }

}