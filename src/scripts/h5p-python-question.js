import PythonCodeContainer from './container/container-python';
import PythonManualRuntime from './runtime/runtime-manual-python';
import PythonTestRuntime from './runtime/runtime-test-python';

export default class PythonQuestion extends H5P.CodeQuestion {
  /**
   * @class
   * @param {object} params Parameters passed by the editor.
   * @param {number} contentId Content's id.
   * @param {object} [extras] Saved state, metadata, etc.
   */
  constructor(params, contentId, extras = {}) {
    super(params, contentId, extras);
  }

  getCodingLanguage() {
    return 'python';
  }

  getTestRuntimeClass() {
    return PythonTestRuntime;
  }

  getCodeTesterFactoryClass() {
    return H5P.CodeTesterFactory;
  }

  getManualRuntimeClass() {
    return PythonManualRuntime;
  }

  getContainerClass() {
    return PythonCodeContainer;
  }
}
