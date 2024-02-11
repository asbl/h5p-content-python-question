export default class PythonAce extends H5P.AceEditor {

  async setup() {
    await super.setup();
    const editorConsole = this.getConsole();
    if (this.consoleHidden) {
      editorConsole.parentElement.style.display = 'none';
    }

  }
   
  getPages() {
    return super.getPages().concat([{ name: 'canvas', id: 'canvas-' + H5P.createUUID(), button:'canvas' }]);
  }

  getMode() {
    return 'ace/mode/python';
  }

  hasVisibleCanvas() {
    const canvasElements = this.getPage('canvas').querySelector('.canvas-wrapper');
    if (canvasElements) { // True, if There is a canvas page
      for (let item of [...canvasElements.children]) {
        if (item.innerHTML !== '') {
          return true;
        }
      }
      return false;
    }
  }
 
  /**
   * Show canvas if canvas has content.
   */
  showCanvas() {
    this.showPage('canvas');
  }

  /**
   * Show canvas if canvas has content.
   */
  showCode() {
    this.showPage('code');
  }

  getButtons() {
    const pythonButtons = [{
      identifier: 'canvasButton',
      name: 'Canvas',
      label: this.l10n.canvas,
      class: 'canvas',
      page: 'canvas',
      display: 'hidden'
    }];
    return super.getButtons().concat(pythonButtons);
  }

  setupObservers() {
    super.setupObservers();
    const canvasButton = this.getButton('canvasButton');
    canvasButton.style.display = 'none';
    let canvas = this.getPage('canvas');
    canvasButton.style.display = 'none';
    // Add observer for canvas changed
    const canvasObserver = new MutationObserver((_mutationList, _observer) => {
      if (this.hasVisibleCanvas()) {
        this.showPage('canvas');
        canvasButton.style.display = 'none';
      }
    });
    canvasObserver.observe(canvas, { characterData: false, childList: true, attributes: false });
    // Add ovserver if canvas was hidden
    const canvasButtonObserver = new MutationObserver((_mutationList, _observer) => {
      let canvasButton = this.getButton('canvasButton');
      // Show canvas, when canvas was changed
      if (this.hasVisibleCanvas() && this.getPageName() !== 'canvas') {
        canvasButton.style.display = 'block';
      }
      else {
        canvasButton.style.display = 'none';
      }
    });
    // Observer for canvas page. 
    canvasButtonObserver.observe(this.getPage('canvas'), { attributes: true, attributeFilter: ['style'] });
  }

  addButtonListeners() {
    super.addButtonListeners();
  }

}
