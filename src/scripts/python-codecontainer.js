/**
 * @class
 * PythonCodeMirror - Replaces AceEditor with CodeMirror for Python exercises.
 * Supports code editing, console, canvas page, buttons, pre/post code, and instructions.
 */
export default class PythonCodeMirror extends H5P.CodeContainer {
  /**
   * Adds a "canvas" page in addition to code pages
   * @returns {Array} List of pages
   */
  getPages() {
    return super.getPages().concat([
      {
        name: "canvas",
        id: "canvas-" + H5P.createUUID(),
        button: "canvas",
      },
    ]);
  }

  /**
   * Return CodeMirror mode for Python
   * @returns {string}
   */
  getMode() {
    return "python";
  }

  /**
   * Check if the canvas page has any visible content
   * @returns {boolean}
   */
  hasVisibleCanvas() {
    const canvasWrapper =
      this.getPage("canvas")?.querySelector(".canvas-wrapper");
    if (!canvasWrapper) return false;

    return [...canvasWrapper.children].some(
      (item) => item.innerHTML.trim() !== "",
    );
  }

  /**
   * Add buttons, including a canvas button
   * @returns {Array} List of button definitions
   */
  getButtons() {
    const pythonButtons = [
      {
        identifier: "canvasButton",
        name: "Canvas",
        label: this.l10n.canvas || "Canvas",
        class: "canvas",
        page: "canvas",
        display: "hidden",
      },
    ];
    return super.getButtons().concat(pythonButtons);
  }

  /**
   * Set editor code safely
   * @param {string} code
   */
  setCode(code) {
    if (this.editor) {
      this.editor.setValue(code, -1);
    }
  }
}
