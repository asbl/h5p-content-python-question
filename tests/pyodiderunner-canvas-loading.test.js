import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  clearPyodideExecutionLimit: vi.fn(() => Promise.resolve()),
  getImportedPyodidePackages: vi.fn(() => []),
  hasPyodideBackgroundTask: vi.fn(() => Promise.resolve(false)),
  loadMissingPyodidePackages: vi.fn(() => Promise.resolve()),
  resetPyodideBackgroundTaskState: vi.fn(() => Promise.resolve()),
  setActivePyodideRuntime: vi.fn(),
  setPyodideExecutionLimit: vi.fn(() => Promise.resolve()),
}));

vi.mock('../src/scripts/runtime/services/pyodide-package-service', () => ({
  getImportedPyodidePackages: mocks.getImportedPyodidePackages,
  loadMissingPyodidePackages: mocks.loadMissingPyodidePackages,
}));

vi.mock('../src/scripts/runtime/services/pyodide-image-service', () => ({
  default: class PyodideImageServiceMock {
    installRegistry() {
      return Promise.resolve();
    }
  },
}));

vi.mock('../src/scripts/runtime/services/pyodide-sound-service', () => ({
  default: class PyodideSoundServiceMock {
    installRegistry() {
      return Promise.resolve();
    }
  },
}));

vi.mock('../src/scripts/runtime/services/pyodide-runtime-service', () => ({
  cancelPyodideBackgroundTask: vi.fn(() => Promise.resolve(false)),
  clearPyodideExecutionLimit: mocks.clearPyodideExecutionLimit,
  getSharedPyodide: vi.fn(() => Promise.resolve(null)),
  hasPyodideBackgroundTask: mocks.hasPyodideBackgroundTask,
  installPyodideInputOverride: vi.fn(() => Promise.resolve()),
  installPyodideRuntimeCompatibility: vi.fn(() => Promise.resolve()),
  resetPyodideBackgroundTaskState: mocks.resetPyodideBackgroundTaskState,
  setActivePyodideRuntime: mocks.setActivePyodideRuntime,
  setActivePyodideSDLCanvas: vi.fn(),
  setPyodideExecutionLimit: mocks.setPyodideExecutionLimit,
  sharedPyodideRuntimeState: {
    sharedPyodidePromise: null,
  },
}));

const { default: PyodideRunner } = await import('../src/scripts/runtime/pyodiderunner.js');

function createRuntime() {
  return {
    l10n: {},
    outputHandler: vi.fn(),
    inputHandler: vi.fn(),
    onSuccess: vi.fn(),
    onError: vi.fn(),
    containsCanvasCode: vi.fn(() => false),
    containsP5Code: vi.fn(() => false),
    containsSDLCode: vi.fn(() => false),
    codeContainer: {
      getStateManager: () => ({ stop: vi.fn() }),
    },
  };
}

describe('PyodideRunner canvas loading edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates the fallback canvas overlay when no runtime manager is present', () => {
    const runner = new PyodideRunner(createRuntime(), {});
    const wrapper = document.createElement('div');
    const overlay = document.createElement('div');
    overlay.className = 'canvas-loading';
    const label = document.createElement('span');
    label.className = 'canvas-loading__label';
    overlay.appendChild(label);
    wrapper.appendChild(overlay);
    runner.canvasWrapper = wrapper;

    runner.setCanvasLoading(true, 'Preparing canvas');

    expect(overlay.hidden).toBe(false);
    expect(overlay.style.display).toBe('flex');
    expect(label.textContent).toBe('Preparing canvas');

    runner.setCanvasLoading(false);

    expect(overlay.hidden).toBe(true);
    expect(overlay.style.display).toBe('none');
  });

  it('delegates loading updates to the canvas runtime manager when present', () => {
    const runner = new PyodideRunner(createRuntime(), {});
    runner.canvasRuntimeManager = {
      setLoading: vi.fn(),
    };

    runner.setCanvasLoading(true, 'Preparing canvas');

    expect(runner.canvasRuntimeManager.setLoading).toHaveBeenCalledWith(true, 'Preparing canvas');
  });
});