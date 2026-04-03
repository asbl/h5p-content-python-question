export default class PythonCodeContainer extends H5P.CodeQuestionContainer {

  shouldShowConsoleBelowCanvas() {
    return this.options?.consoleBelowCanvas === true && this.options?.hasConsole !== false;
  }

  getConsoleWrapper() {
    const consoleUID = this.getConsoleManager?.()?.consoleUID;
    if (!consoleUID) {
      return null;
    }

    const consoleBody = document.getElementById(consoleUID);
    return consoleBody?.closest('.console_wrapper') || null;
  }

  moveConsoleBelowCanvas() {
    if (!this.shouldShowConsoleBelowCanvas()) {
      return;
    }

    const wrapper = this.getConsoleWrapper();
    const canvasPage = this.getPageManager().getPage('canvas');

    if (!wrapper || !canvasPage) {
      return;
    }

    const canvasWrapper = canvasPage.querySelector('.canvas-wrapper');
    if (canvasWrapper) {
      canvasWrapper.insertAdjacentElement('afterend', wrapper);
    }
    else {
      canvasPage.appendChild(wrapper);
    }
  }

  restoreConsoleToCodePage() {
    if (!this.shouldShowConsoleBelowCanvas()) {
      return;
    }

    const wrapper = this.getConsoleWrapper();
    const codePage = this.getPageManager().getPage('code');

    if (!wrapper || !codePage) {
      return;
    }

    codePage.appendChild(wrapper);
  }

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
    this.moveConsoleBelowCanvas();
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
    this.restoreConsoleToCodePage();
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
    this.moveConsoleBelowCanvas();
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
