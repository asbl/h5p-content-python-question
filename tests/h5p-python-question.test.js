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
  });

  it('normalizes runtime and container options from params', () => {
    const question = new PythonQuestion({
      l10n: { localValue: 'child' },
      pythonRunner: 'pyodide',
      pyodideOptions: {
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
        showConsole: false,
        disableOutputPopups: true,
        enableImageUploads: true,
        enableSoundUploads: true,
        enableSaveLoadButtons: false,
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
      executionLimit: 1800,
      projectStorageEnabled: true,
    });
    expect(question.getCodeContainerOptions()).toEqual({
      fromParent: true,
      hasConsole: false,
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
      downloadFilename: 'main.py',
      projectDownloadFilename: 'python-project.h5pproject',
      projectBundleType: 'h5p-python-question-project',
      editorMode: 'code',
      blocklyCategories: null,
    });
    expect(question.hasConsole).toBe(false);
    expect(question.getAdvancedOption('enableSoundUploads')).toBe(true);
    expect(question.getAdvancedOption('missingOption')).toBe(false);
    expect(question.shouldEnableSoundUploads()).toBe(true);
    expect(question.shouldEnableSaveLoadButtons()).toBe(false);
    expect(question.shouldShowConsole()).toBe(false);
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
      enableImageUploads: false,
      enableSoundUploads: false,
      showSaveLoadButtons: true,
      projectStorageEnabled: false,
      entryFileName: 'main.py',
      allowAddingFiles: false,
      sourceFiles: [],
      downloadFilename: 'main.py',
      projectDownloadFilename: 'python-project.h5pproject',
      projectBundleType: 'h5p-python-question-project',
      editorMode: 'code',
      blocklyCategories: null,
    });
    expect(question.hasConsole).toBe(true);
    expect(question.shouldShowConsole()).toBe(true);
    expect(question.getRuntimeOptions().executionLimit).toBe(0);
    expect(question.getRuntimeOptions().projectStorageEnabled).toBe(false);
  });
});