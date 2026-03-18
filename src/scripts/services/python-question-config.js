import { normalizePythonExecutionLimit } from './python-execution-limit';
import { normalizePythonPackageEntries } from './python-package-utils';

export { normalizePythonExecutionLimit };

/**
 * Decodes HTML entities that may be persisted by H5P editor widgets.
 * @param {string} [value] - Encoded text value.
 * @returns {string} Decoded string.
 */
export function decodeHtmlCode(value = '') {
  return String(value || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/&#039;/g, '\'')
    .replace(/&amp;/g, '&');
}

/**
 * Normalizes one additional Python module file name.
 * @param {string} [fileName] - Raw file name.
 * @param {number} [index] - Entry index used for fallbacks.
 * @returns {string} Sanitized Python module file name.
 */
export function normalizePythonSourceFileName(fileName = '', index = 0) {
  const fallbackBaseName = `module_${index + 1}`;
  const lastSegment = String(fileName || '')
    .split(/[\\/]/)
    .pop()
    ?.trim() || '';
  const baseName = lastSegment.replace(/\.py$/i, '');
  const normalizedBaseName = baseName
    .replace(/[^A-Za-z0-9_]/g, '_')
    .replace(/^([^A-Za-z_]+)/, '')
    .replace(/^_+/, '')
    .replace(/_+/g, '_')
    .replace(/^$/, fallbackBaseName)
    .replace(/^main$/, fallbackBaseName);

  return `${normalizedBaseName}.py`;
}

/**
 * Normalizes all configured additional Python source files.
 * @param {Array<*>} [entries] - Raw source file entries from semantics.
 * @returns {Array<{name: string, code: string, visible: boolean, editable: boolean}>} Normalized source files.
 */
export function normalizePythonSourceFiles(entries = []) {
  const files = [];
  const usedNames = new Set(['main.py']);

  (Array.isArray(entries) ? entries : []).forEach((entry, index) => {
    let candidate = normalizePythonSourceFileName(entry?.fileName || entry?.name, index);
    let suffix = 2;

    while (usedNames.has(candidate)) {
      const baseName = candidate.replace(/\.py$/i, '');
      candidate = `${baseName}_${suffix}.py`;
      suffix += 1;
    }

    usedNames.add(candidate);

    const visible = entry?.visibleToLearner !== false;
    files.push({
      name: candidate,
      code: decodeHtmlCode(entry?.code || ''),
      visible,
      editable: visible && entry?.learnerEditable !== false,
    });
  });

  return files;
}

/**
 * Resolves the raw Pyodide package entries from semantics params.
 * @param {object} [params] - PythonQuestion params.
 * @returns {Array<*>} Raw package entries.
 */
export function getPyodidePackageEntriesFromParams(params = {}) {
  if (Array.isArray(params.pyodideOptions)) {
    return params.pyodideOptions;
  }

  return params.pyodideOptions?.packages || [];
}

/**
 * Resolves additional Python source files from semantics params.
 * Prefers the Pyodide advanced options shape and falls back to legacy editor settings.
 * @param {object} [params] - PythonQuestion params.
 * @returns {Array<*>} Raw source file entries.
 */
export function getPyodideSourceFileEntriesFromParams(params = {}) {
  if (Array.isArray(params?.pyodideOptions?.sourceFiles)) {
    return params.pyodideOptions.sourceFiles;
  }

  return Array.isArray(params?.editorSettings?.sourceFiles)
    ? params.editorSettings.sourceFiles
    : [];
}

/**
 * Resolves whether learners are allowed to add, rename, and delete files.
 * @param {object} [params] - PythonQuestion params.
 * @returns {boolean} True if the file manager and '+' tab should be available.
 */
export function getPyodideAllowAddingFilesFromParams(params = {}) {
  return params?.pyodideOptions?.allowAddingFiles === true;
}

/**
 * Normalizes the selected Python runtime.
 * @param {string} [runner] - Raw runner value.
 * @returns {'skulpt'|'pyodide'} Supported runner identifier.
 */
export function normalizePythonRunner(runner) {
  return runner === 'pyodide' ? 'pyodide' : 'skulpt';
}

/**
 * Normalizes advanced runtime options from semantics.
 * @param {object} [advancedOptions] - Raw advanced options.
 * @returns {{disableOutputPopups: boolean, enableImageUploads: boolean, enableSoundUploads: boolean, enableSaveLoadButtons: boolean, executionLimit: number}} Normalized options.
 */
export function normalizePythonAdvancedOptions(advancedOptions = {}) {
  return {
    disableOutputPopups: advancedOptions?.disableOutputPopups === true,
    enableImageUploads: advancedOptions?.enableImageUploads === true,
    enableSoundUploads: advancedOptions?.enableSoundUploads === true,
    enableSaveLoadButtons: advancedOptions?.enableSaveLoadButtons !== false,
    executionLimit: normalizePythonExecutionLimit(advancedOptions?.execLimit),
  };
}

/**
 * Builds a stable, normalized PythonQuestion configuration snapshot.
 * @param {object} [params] - Raw PythonQuestion params.
 * @returns {{runner: 'skulpt'|'pyodide', pyodidePackageEntries: Array<*>, packages: string[], sourceFiles: Array<{name: string, code: string, visible: boolean, editable: boolean}>, allowAddingFiles: boolean, advancedOptions: {disableOutputPopups: boolean, enableImageUploads: boolean, enableSoundUploads: boolean, enableSaveLoadButtons: boolean, executionLimit: number}}} Normalized config.
 */
export function normalizePythonQuestionConfig(params = {}) {
  const runner = normalizePythonRunner(params.pythonRunner);
  const pyodidePackageEntries = getPyodidePackageEntriesFromParams(params);

  return {
    runner,
    pyodidePackageEntries,
    packages: normalizePythonPackageEntries(pyodidePackageEntries),
    sourceFiles: normalizePythonSourceFiles(getPyodideSourceFileEntriesFromParams(params)),
    allowAddingFiles: runner === 'pyodide'
      ? getPyodideAllowAddingFilesFromParams(params)
      : false,
    advancedOptions: normalizePythonAdvancedOptions(params.advancedOptions),
  };
}

/**
 * Merges normalized Python options into container options.
 * @param {*} parentOptions - Parent container options.
 * @param {object} config - Normalized PythonQuestion config.
 * @returns {object} Final container options.
 */
export function buildPythonCodeContainerOptions(parentOptions, config) {
  const baseOptions = (!Array.isArray(parentOptions) && typeof parentOptions === 'object' && parentOptions !== null)
    ? { ...parentOptions }
    : {};

  return {
    ...baseOptions,
    enableImageUploads: config?.advancedOptions?.enableImageUploads === true,
    enableSoundUploads: config?.advancedOptions?.enableSoundUploads === true,
    showSaveLoadButtons: config?.advancedOptions?.enableSaveLoadButtons !== false,
    projectStorageEnabled: config?.runner === 'pyodide',
    entryFileName: 'main.py',
    allowAddingFiles: config?.allowAddingFiles === true,
    sourceFiles: config?.runner === 'pyodide' ? [...(config?.sourceFiles || [])] : [],
    downloadFilename: 'main.py',
    projectDownloadFilename: 'python-project.h5pproject',
    projectBundleType: 'h5p-python-question-project',
  };
}

/**
 * Builds normalized runtime options for Python runtimes.
 * @param {object} config - Normalized PythonQuestion config.
 * @param {object} runtimeL10n - Runtime localization object.
 * @returns {{runner: 'skulpt'|'pyodide', l10n: object, packages: string[], disableOutputPopups: boolean, executionLimit: number}} Final runtime options.
 */
export function buildPythonRuntimeOptions(config, runtimeL10n) {
  return {
    runner: config?.runner || 'skulpt',
    l10n: runtimeL10n,
    packages: [...(config?.packages || [])],
    disableOutputPopups: config?.advancedOptions?.disableOutputPopups === true,
    executionLimit: config?.advancedOptions?.executionLimit || 0,
    projectStorageEnabled: config?.runner === 'pyodide',
  };
}