import PythonCodeContainer from './container/container-python';
import PythonManualRuntime from './runtime/runtime-manual-python';
import PythonTestRuntime from './runtime/runtime-test-python';
import {
  buildPythonCodeContainerOptions,
  buildPythonRuntimeOptions,
  getPyodidePackageEntriesFromParams,
  normalizePythonQuestionConfig,
} from './services/python-question-config';
import { createPythonL10n } from './services/python-l10n';

export default class PythonQuestion extends H5P.CodeQuestion {
  /**
   * @class
   * @param {object} params Parameters passed by the editor.
   * @param {number} contentId Content's id.
   * @param {object} [extras] Saved state, metadata, etc.
   */
  constructor(params, contentId, extras = {}) {
    super(params, contentId, extras);

    const sharedL10n = this.l10n;
    this.pythonConfig = normalizePythonQuestionConfig(this.params);

    this.runtimeL10n = createPythonL10n();
    this.l10n = createPythonL10n({}, sharedL10n);

    // Recreate tester so it also uses the updated localization chain.
    this.codeTester = this.getCodeTesterFactory().create();

    this.pythonRunner = this.pythonConfig.runner;
  }

  /**
   * Returns the raw Pyodide package entries from semantics params.
   * @returns {Array<*>} Raw package entries.
   */
  getPyodidePackageEntries() {
    return getPyodidePackageEntriesFromParams(this.params);
  }

  /**
   * Returns normalized Pyodide package names.
   * @returns {string[]} Unique package names.
   */
  getPyodidePackages() {
    return [...this.pythonConfig.packages];
  }

  /**
   * Returns a normalized boolean advanced option.
   * @param {string} optionName - Advanced option key.
   * @returns {boolean} True if the option is enabled.
   */
  getAdvancedOption(optionName) {
    return this.pythonConfig.advancedOptions?.[optionName] === true;
  }

  /**
   * Indicates whether runtime output popups should be disabled.
   * @returns {boolean} True if popups should be suppressed.
   */
  shouldDisableOutputPopups() {
    return this.getAdvancedOption('disableOutputPopups');
  }

  /**
   * Indicates whether learner image uploads are enabled.
   * @returns {boolean} True if image uploads are enabled.
   */
  shouldEnableImageUploads() {
    return this.getAdvancedOption('enableImageUploads');
  }

  /**
   * Indicates whether learner sound uploads are enabled.
   * @returns {boolean} True if sound uploads are enabled.
   */
  shouldEnableSoundUploads() {
    return this.getAdvancedOption('enableSoundUploads');
  }

  /**
   * Indicates whether the shared save/load buttons should be shown.
   * @returns {boolean} True if save/load buttons should be shown.
   */
  shouldEnableSaveLoadButtons() {
    return this.getAdvancedOption('enableSaveLoadButtons');
  }

  /**
   * Returns normalized container options for the shared code container.
   * @returns {object} Container options.
   */
  getCodeContainerOptions() {
    return buildPythonCodeContainerOptions(
      super.getCodeContainerOptions(),
      this.pythonConfig,
    );
  }

  /**
   * Returns normalized runtime options for Python runtimes.
   * @returns {object} Runtime options.
   */
  getRuntimeOptions() {
    return buildPythonRuntimeOptions(this.pythonConfig, this.runtimeL10n);
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
