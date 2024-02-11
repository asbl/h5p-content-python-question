export default class PythonIOTester extends H5P.CodeTester {

  constructor(codeQuestion) {
    super(codeQuestion);
    this.runSolution = false;
  }

  updateTestCaseTable(testCaseNumber) {
    let testCasesArea = document.getElementById(this.testCasesAreaID);
    let testCaseTable = testCasesArea.getElementsByClassName(`table-testcase-${testCaseNumber}`)[0];
    let row = Array.from(testCaseTable.rows)[1];
    const outputs = this.outputArray[testCaseNumber] ? this.outputArray[testCaseNumber].join('<br/>') : '--';
    row.cells[2].innerHTML = outputs;
   
    if (this.checkTestCase(testCaseNumber)) {
      row.classList.add('test-passed');
      row.cells[3].innerHTML = '✓';
    }
    else {
      row.classList.remove('test-passed');
      row.cells[3].innerHTML = 'X';
    }
  }

  /**
   * Checks all tests in a Testcase.
   * @param {number} testCaseNumber (optional) A specific testCase
   * @returns {boolean} True, if all Tests return True
   */
  checkTestCase() {
    if ((this.testcases[this.testCaseCounter].outputs === undefined || this.testcases[this.testCaseCounter].outputs.length === 0)
       && this.outputArray[this.testCaseCounter].length === 0) {
      return true;
    }
    if (this.testcases[this.testCaseCounter].outputs === undefined) {
      return false;
    }
    // outputArray.length must equal the length of testSuite for the testCase
    if (this.testcases[this.testCaseCounter].outputs.length < this.outputArray[this.testCaseCounter].length) {
      return false;
    }
    return this.testcases[this.testCaseCounter].outputs.every((element, index) => {
      return element === this.outputArray[this.testCaseCounter][index];
    });
  }
      
  generateTestCasesArea() {
    const testCasesArea = super.generateTestCasesArea();
    let html = '';
    this.testcases.forEach((testCase, i) => {
      html += '<div class="table-testcase-container">';
      html += `<h3>${this.l10n.testCase} ${i + 1}</h3>`;
      html += `<table class="table-testcase-${i} table-testcase">`;
      html += `<thead><tr><td>${this.l10n.testInput}</td><td>${this.l10n.expectedOutput}</td><td>${this.l10n.lastOutput}</td><td>${this.l10n.passed}</td></tr></thead>`;
      html += '<tbody>';
      html += `<tr><td class="input input-${i}">`;
      let inputs = testCase.inputs ? testCase.inputs.join('<br/>') : '';
      inputs = !testCase.hidden ? inputs :  this.l10n.hidden;
      html += inputs;
      html += `</td><td class="expected expected-${i}">`;
      let outputs = testCase.outputs ? testCase.outputs.join('<br/>') : '';
      outputs = !testCase.hidden ? outputs : this.l10n.hidden;
      html += outputs;
      html += `</td id=><td class="output output-${i}"></td passed passed-${i}><td></td></tr>`;
      html += '</tbody>';
      html += '</table>';
      html += '</div>';
    });
    testCasesArea.innerHTML = html;
    return testCasesArea;
  }
}