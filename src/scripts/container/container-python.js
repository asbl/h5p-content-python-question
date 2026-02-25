export default class PythonCodeContainer extends H5P.CodeQuestionContainer {

  async setup() {
    await super.setup();
    this.getButtonManager().addButton({
      identifier: 'canvas',
      label: 'Canvas',
      class: 'canvas',
      weight: -1
    });
    this.getPageManager().addPage('canvas', '', 'canvas', false, false);

    this.getObserverManager().register(
      'page:canvas:show',
      new H5P.PageShowObserver(
        this.getPageManager().getPage('canvas'),
        () => {
          /*this.getButtonManager().showButton('canvas');
          this.getButtonManager().setActive('canvas');
          this.registerDOM();*/
        },
      )
    );

    this.getObserverManager().register(
      'page:canvas:hide',
      new H5P.PageHideObserver(
        this.getPageManager().getPage('canvas'),
        () => {
          if (!this.getPageManager().isEmpty('canvas')) {
            this.getButtonManager().showButton('canvas');
            this.registerDOM();
          }
        }
      )
    );

    this.getObserverManager().register(
      'button:canvas:clicked',
      new H5P.ButtonClickedObserver(
        this.getButtonManager().getButton('canvas'),
        () => {

          this.getPageManager().showPage('canvas');
          this.getButtonManager().setActive('canvas');
          this.registerDOM();
        }
      )
    );

    this.getButtonManager().hideButton('canvas');

    this.registerDOM();
  }

  /**
   * Return CodeMirror mode for Python
   * @returns {string}
   */
  getMode() {
    return 'python';
  }
}
