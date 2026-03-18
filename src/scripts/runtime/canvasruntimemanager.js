export default class CanvasRuntimeManager {
  /**
   * @param {object} host - Eine Instanz von CodeContainer oder CodeTester
   * @param runner
   */
  constructor(host, runner) {
    this.host = host; // z.B. codeContainer oder codeTester
    this.canvasWrapper = null;
    this.canvasDiv = null;
    this.loadingOverlay = null;
    this.loadingLabel = null;
    this.runner = runner;
  }

  setup(type, identifier) {
    const wrapperId = `canvas-wrapper_${type}_${identifier}_${H5P.createUUID()}`;
    const canvasId = `canvas_div_${type}_${identifier}_${H5P.createUUID()}`;

    this.canvasWrapper = document.createElement('div');
    this.canvasWrapper.id = wrapperId;
    this.canvasWrapper.classList.add('canvas-wrapper');

    this.loadingOverlay = document.createElement('div');
    this.loadingOverlay.classList.add('canvas-loading');
    this.loadingOverlay.hidden = true;
    this.loadingOverlay.style.display = 'none';

    const loadingSpinner = document.createElement('span');
    loadingSpinner.classList.add('canvas-loading__spinner');
    loadingSpinner.setAttribute('aria-hidden', 'true');
    this.loadingOverlay.appendChild(loadingSpinner);

    this.loadingLabel = document.createElement('span');
    this.loadingLabel.classList.add('canvas-loading__label');
    this.loadingOverlay.appendChild(this.loadingLabel);

    this.canvasWrapper.appendChild(this.loadingOverlay);

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
    this.runner.addCanvas(this.getWrapper(), this.getDiv(), this);
  }

  /**
   * Updates the loading overlay for the active canvas wrapper.
   * @param {boolean} isLoading - Whether loading is active.
   * @param {string} [message] - Loading message.
   * @returns {void}
   */
  setLoading(isLoading, message = '') {
    if (!this.loadingOverlay) {
      return;
    }

    this.loadingOverlay.hidden = !isLoading;
    this.loadingOverlay.style.display = isLoading ? 'flex' : 'none';
    this.loadingOverlay.classList.toggle('is-visible', isLoading);

    if (this.loadingLabel) {
      this.loadingLabel.textContent = message;
    }
  }

  removeCanvas() {
    // Remove the canvas wrapper element from the DOM completely
    if (this.canvasWrapper && this.canvasWrapper.parentNode) {
      this.canvasWrapper.parentNode.removeChild(this.canvasWrapper);
    }

    if (this.host && typeof this.host.removeCanvas === 'function') {
      this.host.removeCanvas(this.canvasDiv);
    }

    this.setLoading(false);
    this.canvasWrapper = null;
    this.canvasDiv = null;
    this.loadingOverlay = null;
    this.loadingLabel = null;
  }

}
