export default class PythonCodeContainer extends H5P.CodeQuestionContainer {

  async setup() {
    await super.setup();
  }

  getUIRegistrations() {
    return this.mergeUIRegistrations(
      super.getUIRegistrations(),
      {
        buttons: [
          {
            identifier: 'canvas',
            label: () => this.l10n.canvas,
            class: 'canvas',
            weight: -1,
            state: 'hidden',
          },
        ],
        pages: [
          {
            name: 'canvas',
            content: '',
            additionalClass: 'canvas',
            visible: false,
          },
        ],
        observers: [
          {
            name: 'page:canvas:show',
            type: 'page-show',
            page: 'canvas',
            callback: 'onCanvasPageShown',
          },
          {
            name: 'page:canvas:hide',
            type: 'page-hide',
            page: 'canvas',
            callback: 'onCanvasPageHidden',
          },
          {
            name: 'button:canvas:clicked',
            type: 'button-click',
            button: 'canvas',
            callback: 'showCanvasPage',
          },
          {
            name: 'button:stop:clicked-hide-canvas',
            type: 'button-click',
            button: 'stopButton',
            callback: 'hideCanvasButton',
          },
        ],
      },
    );
  }

  /**
   * Handles the canvas page becoming visible.
   * @returns {void}
   */
  onCanvasPageShown() {
    this._runtime?.runner?.acquireInputFocus?.();
    this._runtime?.runner?.scheduleSDLCanvasRebind?.();
    this._runtime?.runner?.triggerResizeAfterCanvasUpdate?.();
    this.hideCanvasButton();
  }

  /**
   * Restores the canvas button when the canvas page has content and gets hidden.
   * @returns {void}
   */
  onCanvasPageHidden() {
    this._runtime?.runner?.releaseInputFocus?.();
    if (!this.getPageManager().isEmpty('canvas')) {
      this.getButtonManager().showButton('canvas');
      this.registerDOM();
    }
  }

  /**
   * Shows the canvas page and updates button visibility.
   * @returns {void}
   */
  showCanvasPage() {
    this.getPageManager().showPage('canvas');
    this.hideCanvasButton();
    this.registerDOM();
  }

  /**
   * Hides the dedicated canvas button.
   * @returns {void}
   */
  hideCanvasButton() {
    this.getButtonManager().hideButton('canvas');
  }

  /**
   * Return CodeMirror mode for Python
   * @returns {string} CodeMirror mode identifier.
   */
  getMode() {
    return 'python';
  }
}
