import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createPythonL10n: vi.fn((l10n = {}, fallbackL10n = {}) => ({ ...fallbackL10n, ...l10n })),
}));

vi.mock('../src/scripts/container/container-python', () => ({
  default: class PythonCodeContainerMock {},
}));

vi.mock('../src/scripts/runtime/runtime-manual-python', () => ({
  default: class PythonManualRuntimeMock {},
}));

vi.mock('../src/scripts/runtime/runtime-test-python', () => ({
  default: class PythonTestRuntimeMock {},
}));

vi.mock('../src/scripts/services/python-l10n', () => ({
  createPythonL10n: mocks.createPythonL10n,
}));

const { default: PythonQuestion } = await import('../src/scripts/h5p-python-question.js');

describe('PythonQuestion', () => {
  beforeEach(() => {
    mocks.createPythonL10n.mockClear();
    document.head.innerHTML = '';
  });

  it('normalizes runtime and container options from params', () => {
    const question = new PythonQuestion({
      l10n: { localValue: 'child' },
      pythonRunner: 'pyodide',
      pyodideOptions: {
        pyodideCdnUrl: 'https://static.example.com/pyodide/pyodide.js',
        packages: [
          'numpy',
          { package: 'pygame-ce' },
          { package: { value: 'sqlite3' } },
          { value: 'numpy' },
          { package: '' },
        ],
      },
      editorSettings: {
        startingCode: '',
        allowAddingFiles: true,
        options: {
          defaultImages: [
            {
              image: { path: 'uploads/background.png' },
              fileName: 'background.png',
            },
          ],
        },
        sourceFiles: [
          {
            fileName: 'helper.py',
            code: 'VALUE = 1',
            visibleToLearner: true,
            learnerEditable: true,
          },
        ],
      },
      advancedOptions: {
        disableOutputPopups: true,
        enableImageUploads: true,
        enableSoundUploads: true,
        enableSaveLoadButtons: false,
        blocklyCdnUrl: 'https://static.example.com/blockly/',
        codeMirrorCdnUrl: 'https://static.example.com/codemirror/',
        markdownCdnUrl: 'https://static.example.com/markdown/',
        fontAwesomeCdnUrl: 'https://static.example.com/fontawesome.css',
        sweetAlertCdnUrl: 'https://static.example.com/sweetalert/',
        jsZipCdnUrl: 'https://static.example.com/jszip/',
        p5CdnUrl: 'https://static.example.com/p5/p5.min.js',
        skulptCdnUrl: 'https://static.example.com/skulpt/skulpt.min.js',
        sqlJsUrl: 'https://static.example.com/sql.js/sql-wasm.js',
        execLimit: 1800,
      },
    }, 42);

    expect(mocks.createPythonL10n).toHaveBeenCalledTimes(2);
    expect(mocks.createPythonL10n).toHaveBeenNthCalledWith(1);
    expect(mocks.createPythonL10n).toHaveBeenNthCalledWith(2, {}, { parentValue: 'parent' });
    expect(question.pythonRunner).toBe('pyodide');
    expect(question.getPyodidePackages()).toEqual(['numpy', 'pygame-ce', 'sqlite3']);
    expect(question.getRuntimeOptions()).toEqual({
      runner: 'pyodide',
      l10n: question.runtimeL10n,
      packages: ['numpy', 'pygame-ce', 'sqlite3'],
      disableOutputPopups: true,
      blocklyCdnUrl: 'https://static.example.com/blockly/',
      codeMirrorCdnUrl: 'https://static.example.com/codemirror/',
      fontAwesomeCdnUrl: 'https://static.example.com/fontawesome.css',
      sweetAlertCdnUrl: 'https://static.example.com/sweetalert/',
      p5CdnUrl: 'https://static.example.com/p5/p5.min.js',
      skulptCdnUrl: 'https://static.example.com/skulpt/skulpt.min.js',
      sqlJsUrl: 'https://static.example.com/sql.js/sql-wasm.js',
      pyodideCdnUrl: 'https://static.example.com/pyodide/pyodide.js',
      executionLimit: 1800,
      projectStorageEnabled: true,
      localSkulptUrl: '/libraries/H5P.PythonQuestion-6.64/lib/skulpt.min.js',
    });
    expect(question.getCodeContainerOptions()).toEqual({
      fromParent: true,
      hasConsole: true,
      consoleBelowCanvas: true,
      pythonPackages: ['numpy', 'pygame-ce', 'sqlite3'],
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
          path: 'uploads/background.png',
          fileName: 'background.png',
        },
      ],
      downloadFilename: 'main.py',
      projectDownloadFilename: 'python-project.zip',
      projectBundleType: 'h5p-python-question-project',
      editorMode: 'code',
      blocklyCategories: null,
      blocklyPackages: ['numpy', 'pygame-ce', 'sqlite3'],
      blocklyCdnUrl: 'https://static.example.com/blockly/',
      codeMirrorCdnUrl: 'https://static.example.com/codemirror/',
      markdownCdnUrl: 'https://static.example.com/markdown/',
      fontAwesomeCdnUrl: 'https://static.example.com/fontawesome.css',
      sweetAlertCdnUrl: 'https://static.example.com/sweetalert/',
      jsZipCdnUrl: 'https://static.example.com/jszip/',
    });
    expect(question.getAdvancedOption('enableSoundUploads')).toBe(true);
    expect(question.getAdvancedOption('missingOption')).toBe(false);
    expect(question.shouldEnableSoundUploads()).toBe(true);
    expect(question.shouldEnableSaveLoadButtons()).toBe(false);
  });

  it('supports the object-based pyodide package format and default runner', () => {
    const question = new PythonQuestion({
      pyodideOptions: {
        packages: [
          { package: 'matplotlib' },
          { package: { value: 'pygame-ce' } },
          { value: 'matplotlib' },
        ],
      },
      advancedOptions: {},
    }, 7);

    expect(question.pythonRunner).toBe('skulpt');
    expect(question.getPyodidePackages()).toEqual(['matplotlib', 'pygame-ce']);
    expect(question.shouldEnableImageUploads()).toBe(false);
    expect(question.getCodeContainerOptions()).toEqual({
      fromParent: true,
      hasConsole: true,
      consoleBelowCanvas: true,
      pythonPackages: ['matplotlib', 'pygame-ce'],
      enableImageUploads: false,
      enableSoundUploads: false,
      showSaveLoadButtons: true,
      projectStorageEnabled: false,
      entryFileName: 'main.py',
      allowAddingFiles: false,
      sourceFiles: [],
      defaultImages: [],
      downloadFilename: 'main.py',
      projectDownloadFilename: 'python-project.zip',
      projectBundleType: 'h5p-python-question-project',
      editorMode: 'code',
      blocklyCategories: null,
      blocklyPackages: [],
      blocklyCdnUrl: '',
      codeMirrorCdnUrl: '',
      markdownCdnUrl: '',
      fontAwesomeCdnUrl: '',
      sweetAlertCdnUrl: '',
      jsZipCdnUrl: '',
    });
    expect(question.getRuntimeOptions().executionLimit).toBe(0);
    expect(question.getRuntimeOptions().projectStorageEnabled).toBe(false);
    expect(question.getRuntimeOptions()).toMatchObject({
      blocklyCdnUrl: '',
      codeMirrorCdnUrl: '',
      fontAwesomeCdnUrl: '',
      sweetAlertCdnUrl: '',
      p5CdnUrl: '',
      skulptCdnUrl: '',
      sqlJsUrl: '',
      pyodideCdnUrl: '',
      localSkulptUrl: '/libraries/H5P.PythonQuestion-6.64/lib/skulpt.min.js',
    });
  });

  it('derives the local skulpt url from the loaded bundle path when available', () => {
    const script = document.createElement('script');
    script.src = 'http://localhost:8080/libraries/H5P.PythonQuestion-6.0/dist/h5p-python-question.js';
    document.head.appendChild(script);

    const question = new PythonQuestion({
      advancedOptions: {},
    }, 9);

    expect(question.getRuntimeOptions().localSkulptUrl).toBe(
      'http://localhost:8080/libraries/H5P.PythonQuestion-6.0/lib/skulpt.min.js'
    );
  });
});