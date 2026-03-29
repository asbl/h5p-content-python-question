export default class PythonCodeContainer extends H5P.CodeQuestionContainer {

  /**
   * Re-synchronizes canvas sizing/binding after page visibility changes.
   * @returns {void}
   */
  syncCanvasLayout() {
    const runner = this._runtime?.runner;

    runner?.scheduleSDLCanvasRebind?.();
    runner?.triggerResizeAfterCanvasUpdate?.();
    this.resizeActionHandler?.();

    if (typeof window?.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => {
        runner?.scheduleSDLCanvasRebind?.();
        runner?.triggerResizeAfterCanvasUpdate?.();
        this.resizeActionHandler?.();
      });
    }
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
    this._runtime?.runner?.acquireInputFocus?.();
    this.hideCanvasButton();
    this.syncCanvasLayout();
  }

  /**
   * Restores the canvas button when the canvas page has content and gets hidden.
   * @returns {void}
   */
  onCanvasPageHidden() {
    this._runtime?.runner?.releaseInputFocus?.();
    if (!this.getPageManager().isEmpty('canvas')) {
      this.getButtonManager().showButton('canvas');
    }
  }

  /**
   * Shows the canvas page and updates button visibility.
   * @returns {void}
   */
  showCanvasPage() {
    this.getPageManager().showPage('canvas');
    this.hideCanvasButton();
    this.syncCanvasLayout();
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
   * @returns {string}
   */
  getMode() {
    return 'python';
  }
}
