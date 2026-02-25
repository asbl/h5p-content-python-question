export default class CanvasRuntimeManager {
  /**
   * @param {object} host - Eine Instanz von CodeContainer oder CodeTester
   * @param runner
   */
  constructor(host, runner) {
    this.host = host; // z.B. codeContainer oder codeTester
    this.canvasWrapper = null;
    this.canvasDiv = null;
    this.runner = runner;
  }

  setup(type, identifier) {
    const wrapperId = `canvas-wrapper_${type}_${identifier}_${H5P.createUUID()}`;
    const canvasId = `canvas_div_${type}_${identifier}_${H5P.createUUID()}`;

    this.canvasWrapper = document.createElement('div');
    this.canvasWrapper.id = wrapperId;
    this.canvasWrapper.classList.add('canvas-wrapper');

    this.canvasDiv = document.createElement('div');
    this.canvasDiv.id = canvasId;
    this.canvasDiv.classList.add('canvas-content', 'turtle-content');

    this.canvasWrapper.appendChild(this.canvasDiv);

    return [this.canvasWrapper, this.canvasDiv];
  }

  getWrapper() {
    return this.canvasWrapper;
  }

  getDiv() {
    return this.canvasDiv;
  }

  attachCanvas(type, identifier) {
    if (!this.canvasWrapper || !this.canvasDiv) {
      this.setup(type, identifier);
    }
    if (typeof this.host.addCanvas === 'function') {
      //this.setup(type, identifier)
      this.host.addCanvas(this.canvasWrapper, type, identifier);
    }

    if (typeof this.host.showCanvas === 'function') {
      this.host.showCanvas();
    }
    this.runner.addCanvas(this.getWrapper(), this.getDiv());
  }

  removeCanvas() {
    if (this.host && typeof this.host.removeCanvas === 'function') {
      this.host.removeCanvas(this.canvasDiv);
    }

    this.canvasWrapper = null;
    this.canvasDiv = null;
  }

}
