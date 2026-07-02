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
import {
  getSharedPyodide,
  precachePyodideAssets,
  warmPyodidePackageImports,
} from './runtime/services/pyodide-runtime-service';
import { loadMissingPyodidePackages } from './runtime/services/pyodide-package-service';

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
    this.scheduleEarlyPyodidePreload();
  }

  /**
   * Starts Pyodide package preparation as soon as the content is constructed.
   * Runtime instances are created lazily on Run, so this is the earliest point
   * where configured package metadata is available during learner reading time.
   * @returns {void}
   */
  scheduleEarlyPyodidePreload() {
    if (
      this.pythonConfig.runner !== 'pyodide' ||
      this._earlyPyodidePreloadScheduled ||
      !Array.isArray(this.pythonConfig.packages) ||
      this.pythonConfig.packages.length === 0
    ) {
      return;
    }

    this._earlyPyodidePreloadScheduled = true;
    const options = buildPythonRuntimeOptions(this.pythonConfig, this.runtimeL10n);
    const packages = [...this.pythonConfig.packages];

    precachePyodideAssets(options, packages).catch(() => {
      // Opportunistic preload; normal Run path reports actionable failures.
    });

    const preload = async () => {
      const preloadRuntime = {
        l10n: this.runtimeL10n,
        outputHandler: () => {},
        inputHandler: () => '',
      };

      try {
        const pyodide = await getSharedPyodide(options, preloadRuntime);
        await loadMissingPyodidePackages(pyodide, packages);
        await warmPyodidePackageImports(pyodide, packages);
      }
      catch (error) {
        console.warn('Unable to preload the configured Pyodide packages', error);
      }
    };

    if (typeof window?.requestIdleCallback === 'function') {
      window.requestIdleCallback(preload, { timeout: 2000 });
      return;
    }

    window.setTimeout(preload, 200);
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
    const editorEnabled = this.params?.editorSettings?.options?.enableImageUploads;
    return editorEnabled === true || this.getAdvancedOption('enableImageUploads');
  }

  /**
   * Indicates whether learner sound uploads are enabled.
   * @returns {boolean} True if sound uploads are enabled.
   */
  shouldEnableSoundUploads() {
    const editorEnabled = this.params?.editorSettings?.options?.enableSoundUploads;
    return editorEnabled === true || this.getAdvancedOption('enableSoundUploads');
  }

  /**
   * Indicates whether the shared save/load buttons should be shown.
   * @returns {boolean} True if save/load buttons should be shown.
   */
  shouldEnableSaveLoadButtons() {
    return this.getAdvancedOption('enableSaveLoadButtons');
  }

  /**
   * Returns normalized container options for a specific editor instance.
   * When contentParams is null (main assignment editor), reads from editorSettings.
   * When contentParams is a content item, reads per-item sourceFiles/allowAddingFiles.
   * @param {object|null} [contentParams] - Per-editor content item params, or null for main editor.
   * @returns {object} Container options.
   */
  getCodeContainerOptions(contentParams = null) {
    // For the main assignment editor contentParams is null → use editorSettings.
    // For content-part editors contentParams is the content item object.
    const editorParams = contentParams !== null
      ? {
        ...(contentParams || {}),
        ...(contentParams?.options || {}),
      }
      : {
        // Prefer nested editorSettings.options; keep top-level fallbacks for old content.
        sourceFiles: Array.isArray(this.params.editorSettings?.options?.sourceFiles)
          ? this.params.editorSettings.options.sourceFiles
          : (Array.isArray(this.params.editorSettings?.sourceFiles)
            ? this.params.editorSettings.sourceFiles
            : this.params.pyodideOptions?.sourceFiles),
        allowAddingFiles: this.params.editorSettings?.options?.allowAddingFiles ?? this.params.editorSettings?.allowAddingFiles,
        editorMode: this.params.editorSettings?.options?.editorMode ?? this.params.editorSettings?.editorMode,
        enableImageUploads: this.params.editorSettings?.options?.enableImageUploads,
        defaultImages: this.params.editorSettings?.options?.defaultImages,
        enableSoundUploads: this.params.editorSettings?.options?.enableSoundUploads,
        blocklyCategories: this.params.editorSettings?.blocklyCategories,
        blocklyWorkspaceState: this.params.editorSettings?.options?.blocklyWorkspaceState ?? this.params.editorSettings?.blocklyWorkspaceState,
      };

    return buildPythonCodeContainerOptions(
      super.getCodeContainerOptions(contentParams),
      this.pythonConfig,
      editorParams,
    );
  }

  getLoadedBundleBasePath() {
    const bundleScript = Array.from(document.querySelectorAll('script[src]')).find((script) => (
      /\/libraries\/H5P\.PythonQuestion-[^/]+\/dist\/h5p-python-question\.js(?:\?.*)?$/i.test(script.src)
    ));

    return bundleScript?.src
      ? bundleScript.src.replace(/\/dist\/h5p-python-question\.js(?:\?.*)?$/i, '')
      : '';
  }

  getLibraryAssetPath(relativePath) {
    const bundleBasePath = this.getLoadedBundleBasePath();

    if (bundleBasePath) {
      return `${bundleBasePath}/${String(relativePath || '').replace(/^\/+/, '')}`;
    }

    return this.getLibraryFilePath(relativePath);
  }

  /**
   * Returns normalized runtime options for Python runtimes.
   * @returns {object} Runtime options.
   */
  getRuntimeOptions() {
    const options = buildPythonRuntimeOptions(this.pythonConfig, this.runtimeL10n);

    if (this.contentType === 'ide_only') {
      return {
        ...options,
        // A game loop is expected to keep running in IDE mode. Authors can
        // still configure a limit explicitly for individual assignments.
        disableOutputPopups: true,
      };
    }

    return options;
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
