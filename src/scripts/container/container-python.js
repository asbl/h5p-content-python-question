import { createPythonCompletionSource } from '../services/python-autocomplete';
import { getPythonL10nValue } from '../services/python-l10n';

const PYTHON_TUTOR_EMBED_URL = 'https://pythontutor.com/iframe-embed.html';

/**
 * Builds the PythonTutor embed URL for the given Python source code.
 * The code is URL-encoded and passed via the fragment (#) so the request body
 * stays small and the visualization is rendered client-side by pythontutor.com.
 * @param {string} code - Python source code to visualize.
 * @returns {string} Fully qualified PythonTutor embed URL.
 */
function buildPythonTutorUrl(code) {
  const params = new URLSearchParams();
  params.set('code', String(code ?? ''));
  params.set('py', '3');
  params.set('cumulative', 'false');
  return `${PYTHON_TUTOR_EMBED_URL}#${params.toString()}`;
}

export default class PythonCodeContainer extends H5P.CodeQuestionContainer {

  applyPythonAutocomplete() {
    this.getEditorManager?.()?.setCompletionConfig?.({
      override: [createPythonCompletionSource({
        packageNames: Array.isArray(this.options?.pythonPackages) ? [...this.options.pythonPackages] : [],
        getWorkspaceFiles: () => this.getEditorManager?.()?.getWorkspaceFiles?.() || this.options?.sourceFiles || [],
      })],
      activateOnTyping: true,
      maxRenderedOptions: 200,
    });
  }

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
    this.applyPythonAutocomplete();
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
          {
            when: 'hasPythonTutor',
            identifier: 'pythonTutor',
            label: () => getPythonL10nValue(this.l10n, 'pythonTutor'),
            ariaLabel: () => getPythonL10nValue(this.l10n, 'pythonTutor'),
            title: () => getPythonL10nValue(this.l10n, 'pythonTutor'),
            icon: 'fa-solid fa-eye',
            class: 'python_tutor',
            weight: 2,
          },
        ],
        pages: [
          {
            name: 'canvas',
            content: '',
            additionalClass: 'canvas',
            visible: false,
          },
          {
            when: 'hasPythonTutor',
            name: 'pythonTutor',
            content: () => this.getPythonTutorPageDOM(),
            additionalClass: 'python-tutor',
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
          {
            when: 'hasPythonTutor',
            name: 'button:pythonTutor:clicked',
            type: 'button-click',
            button: 'pythonTutor',
            callback: 'showPythonTutorPage',
          },
          {
            when: 'hasPythonTutor',
            name: 'page:pythonTutor:show',
            type: 'page-show',
            page: 'pythonTutor',
            callback: 'onPythonTutorPageShown',
          },
          {
            when: 'hasPythonTutor',
            name: 'page:pythonTutor:hide',
            type: 'page-hide',
            page: 'pythonTutor',
            callback: 'onPythonTutorPageHidden',
          },
        ],
      },
    );
  }

  /**
   * Indicates whether the Python Tutor visualization feature is enabled.
   * @returns {boolean} True if the feature is enabled for this container.
   */
  hasPythonTutor() {
    return this.options?.enablePythonTutor === true;
  }

  /**
   * Returns the DOM node for the Python Tutor page.
   * The page hosts an iframe and a short privacy hint. The iframe is populated
   * lazily when the page is shown via refreshPythonTutorVisualization() so the
   * network request to pythontutor.com only happens on demand.
   * @returns {HTMLElement} Page DOM element.
   */
  getPythonTutorPageDOM() {
    if (this._pythonTutorPageDOM) {
      return this._pythonTutorPageDOM;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'python-tutor-wrapper';

    const hint = document.createElement('p');
    hint.className = 'python-tutor-hint';
    hint.textContent = getPythonL10nValue(this.l10n, 'pythonTutorPrivacyHint');

    const iframe = document.createElement('iframe');
    iframe.className = 'python-tutor-iframe';
    iframe.title = getPythonL10nValue(this.l10n, 'pythonTutor');
    iframe.setAttribute('loading', 'lazy');
    iframe.setAttribute('referrerpolicy', 'no-referrer');
    iframe.setAttribute('sandbox', 'allow-scripts allow-forms');
    // A min-height prevents a 0-height iframe before content loads.
    iframe.style.minHeight = '500px';
    iframe.style.width = '100%';
    iframe.style.border = '0';

    wrapper.append(hint, iframe);

    this._pythonTutorPageDOM = wrapper;
    this._pythonTutorIframe = iframe;
    return wrapper;
  }

  /**
   * Returns the Python source code that should be visualized.
   * Uses the entry-file code, i.e. the same code that would be executed by Run.
   * @returns {string} Python source code.
   */
  getPythonTutorCode() {
    return this.getCode ? this.getCode() : (this.getEditorManager?.()?.getCode?.() || '');
  }

  /**
   * Updates the embedded Python Tutor iframe with the current editor code.
   * @returns {void}
   */
  refreshPythonTutorVisualization() {
    if (!this._pythonTutorIframe) {
      return;
    }

    this._pythonTutorIframe.src = buildPythonTutorUrl(this.getPythonTutorCode());
  }

  /**
   * Shows the Python Tutor page and refreshes the visualization.
   * @returns {void}
   */
  showPythonTutorPage() {
    this.getPageManager().showPage('pythonTutor');
    this.getButtonManager().setActive('pythonTutor');
    this.refreshPythonTutorVisualization();
    this.registerDOM();
  }

  /**
   * Called when the Python Tutor page becomes visible.
   * @returns {void}
   */
  onPythonTutorPageShown() {
    this.refreshPythonTutorVisualization();
    this.resizeActionHandler?.();
  }

  /**
   * Called when the Python Tutor page is hidden.
   * @returns {void}
   */
  onPythonTutorPageHidden() {
    // Drop the iframe src so background network traffic stops while hidden.
    if (this._pythonTutorIframe) {
      this._pythonTutorIframe.src = 'about:blank';
    }
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
