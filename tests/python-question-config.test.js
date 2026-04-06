import { describe, expect, it } from 'vitest';

import {
  buildPythonCodeContainerOptions,
  buildPythonRuntimeOptions,
  decodeHtmlCode,
  getPyodidePackageEntriesFromParams,
  getPyodideSourceFileEntriesFromParams,
  normalizePythonAdvancedOptions,
  normalizePythonDefaultImages,
  normalizePythonExecutionLimit,
  normalizePythonQuestionConfig,
  normalizePythonRunner,
  normalizePythonSourceFileName,
  normalizePythonSourceFiles,
} from '../src/scripts/services/python-question-config.js';

describe('Python question config', () => {
  it('normalizes runner and advanced options', () => {
    expect(normalizePythonRunner('pyodide')).toBe('pyodide');
    expect(normalizePythonRunner('custom')).toBe('skulpt');
    expect(normalizePythonExecutionLimit(1500.9)).toBe(1500);
    expect(normalizePythonExecutionLimit('invalid')).toBe(0);
    expect(normalizePythonAdvancedOptions({
      disableOutputPopups: true,
      enableImageUploads: true,
      enableSoundUploads: true,
      enableSaveLoadButtons: false,
      execLimit: 1500.9,
    })).toEqual({
      showConsole: true,
      disableOutputPopups: true,
      enableImageUploads: true,
      enableSoundUploads: true,
      enableSaveLoadButtons: false,
      executionLimit: 1500,
    });
  });

  it('normalizes execution-limit edge cases consistently', () => {
    expect(normalizePythonExecutionLimit('900.8')).toBe(900);
    expect(normalizePythonExecutionLimit(0)).toBe(0);
    expect(normalizePythonExecutionLimit(-1)).toBe(0);
    expect(normalizePythonExecutionLimit(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('extracts raw package entries from both supported semantics shapes', () => {
    expect(getPyodidePackageEntriesFromParams({
      pyodideOptions: ['numpy'],
    })).toEqual(['numpy']);

    expect(getPyodidePackageEntriesFromParams({
      pyodideOptions: {
        packages: [{ package: 'pygame-ce' }],
      },
    })).toEqual([{ package: 'pygame-ce' }]);

    expect(getPyodideSourceFileEntriesFromParams({
      pyodideOptions: {
        sourceFiles: [{ fileName: 'helper.py' }],
      },
    })).toEqual([{ fileName: 'helper.py' }]);

    expect(getPyodideSourceFileEntriesFromParams({
      editorSettings: {
        sourceFiles: [{ fileName: 'legacy.py' }],
      },
    })).toEqual([{ fileName: 'legacy.py' }]);
  });

  it('builds normalized config and derived option objects', () => {
    const config = normalizePythonQuestionConfig({
      pythonRunner: 'pyodide',
      pyodideOptions: {
        packages: [
          'miniworlds',
          { package: { value: 'sqlite3' } },
          { value: 'miniworlds' },
        ],
      },
      advancedOptions: {
        disableOutputPopups: true,
        enableImageUploads: true,
        enableSoundUploads: true,
        enableSaveLoadButtons: false,
        execLimit: 2750,
      },
    });

    expect(config).toEqual({
      runner: 'pyodide',
      pyodidePackageEntries: [
        'miniworlds',
        { package: { value: 'sqlite3' } },
        { value: 'miniworlds' },
      ],
      packages: ['miniworlds', 'numpy', 'pygame-ce', 'sqlite3'],
      advancedOptions: {
        showConsole: true,
        disableOutputPopups: true,
        enableImageUploads: true,
        enableSoundUploads: true,
        enableSaveLoadButtons: false,
        executionLimit: 2750,
      },
    });

    const editorParams = {
      allowAddingFiles: true,
      editorMode: 'blocks',
      blocklyCategories: { variables: true, logic: false, loops: true, math: false, text: true, lists: false, functions: false },
      defaultImages: [
        {
          image: { path: 'images/background.png' },
          fileName: 'bg.png',
        },
      ],
      sourceFiles: [
        {
          fileName: 'helper.py',
          code: 'VALUE = 1',
          visibleToLearner: true,
          learnerEditable: true,
        },
      ],
    };

    expect(buildPythonCodeContainerOptions({ fromParent: true }, config, editorParams)).toEqual({
      fromParent: true,
      hasConsole: true,
      consoleBelowCanvas: true,
      enableImageUploads: true,
      enableSoundUploads: true,
      showSaveLoadButtons: false,
      projectStorageEnabled: true,
      entryFileName: 'main.py',
      allowAddingFiles: true,
      sourceFiles: [
        {
          name: 'helper.py',
          code: 'VALUE = 1',
          visible: true,
          editable: true,
        },
      ],
      defaultImages: [
        {
          path: 'images/background.png',
          fileName: 'bg.png',
        },
      ],
      downloadFilename: 'main.py',
      projectDownloadFilename: 'python-project.zip',
      projectBundleType: 'h5p-python-question-project',
      editorMode: 'blocks',
      blocklyCategories: { variables: true, logic: false, loops: true, math: false, text: true, lists: false, functions: false },
      blocklyPackages: ['miniworlds', 'numpy', 'pygame-ce', 'sqlite3'],
    });

    expect(buildPythonRuntimeOptions(config, { pyodideReady: 'Ready' })).toEqual({
      runner: 'pyodide',
      l10n: { pyodideReady: 'Ready' },
      packages: ['miniworlds', 'numpy', 'pygame-ce', 'sqlite3'],
      disableOutputPopups: true,
      executionLimit: 2750,
      projectStorageEnabled: true,
    });
  });

  it('disables the container console when showConsole is false', () => {
    const config = normalizePythonQuestionConfig({
      pythonRunner: 'skulpt',
      advancedOptions: {
        showConsole: false,
      },
    });

    expect(config.advancedOptions.showConsole).toBe(false);
    expect(buildPythonCodeContainerOptions({ fromParent: true }, config, {})).toMatchObject({
      hasConsole: false,
    });
  });

  it('decodes HTML entities and normalizes Python source file names', () => {
    expect(decodeHtmlCode('&lt;tag&gt;')).toBe('<tag>');
    expect(normalizePythonSourceFileName('1 helper.py', 0)).toBe('helper.py');
    expect(normalizePythonSourceFiles([
      {
        fileName: 'main.py',
        code: '&lt;value&gt;',
        visibleToLearner: false,
        learnerEditable: true,
      },
      {
        fileName: 'helper.py',
        code: 'print(1)',
        visibleToLearner: true,
        learnerEditable: false,
      },
    ])).toEqual([
      {
        name: 'module_1.py',
        code: '<value>',
        visible: false,
        editable: false,
      },
      {
        name: 'helper.py',
        code: 'print(1)',
        visible: true,
        editable: false,
      },
    ]);
  });

  it('skips empty placeholder source file entries from H5P editor list widget', () => {
    // H5P editor pre-populates list fields with one empty item; these must be ignored.
    expect(normalizePythonSourceFiles([
      { code: '', visibleToLearner: true, learnerEditable: true },
    ])).toEqual([]);

    expect(normalizePythonSourceFiles([
      { fileName: '', code: '   ', visibleToLearner: true, learnerEditable: true },
    ])).toEqual([]);

    // An entry with code but no name should still be kept (the user set code).
    expect(normalizePythonSourceFiles([
      { code: 'x = 1', visibleToLearner: true, learnerEditable: true },
    ])).toEqual([
      { name: 'module_1.py', code: 'x = 1', visible: true, editable: true },
    ]);
  });

  it('normalizes default image entries and file names', () => {
    expect(normalizePythonDefaultImages([
      {
        image: { path: 'uploads/bg image.png' },
        fileName: 'Background Image',
      },
      {
        image: { path: 'uploads/bg image.png' },
      },
      {
        image: { path: '' },
      },
    ])).toEqual([
      { path: 'uploads/bg image.png', fileName: 'Background_Image.png' },
      { path: 'uploads/bg image.png', fileName: 'image_2.png' },
    ]);
  });
});