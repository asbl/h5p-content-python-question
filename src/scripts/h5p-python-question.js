import PyhonQuestionFactory from './python-factory';

export default class PythonQuestion extends H5P.CodeQuestion {
  /**
   * @class
   * @param {object} params Parameters passed by the editor.
   * @param {number} contentId Content's id.
   * @param {object} [extras] Saved state, metadata, etc.
   */
  constructor(params, contentId, extras = {}) {
    super(params, contentId, extras);
    //this.state = 'code';
    this.language = 'python';
    this.layout = 'python';
  } // end of constructor


  getFactory() {
    return new PyhonQuestionFactory(this);
  }

} // end of class




