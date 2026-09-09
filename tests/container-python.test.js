import { beforeEach, describe, expect, it, vi } from 'vitest';

async function loadContainerClass() {
  vi.resetModules();
  globalThis.H5P = {
    ...(globalThis.H5P || {}),
    CodeQuestionContainer: class {
      getUIRegistrations() {
        return { buttons: [{ identifier: 'base' }], pages: [], observers: [] };
      }
    },
  };

  const { default: PythonCodeContainer } = await import('../src/scripts/container/container-python.js');
  return PythonCodeContainer;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('PythonCodeContainer', () => {
  it('applies package-aware CodeMirror completion config', async () => {
    const PythonCodeContainer = await loadContainerClass();
    const setCompletionConfig = vi.fn();
    const getWorkspaceFiles = vi.fn(() => [{ name: 'helper.py' }]);
    const container = Object.create(PythonCodeContainer.prototype);

    container.options = {
      pythonPackages: ['miniworlds'],
      sourceFiles: [{ name: 'fallback.py' }],
    };
    container.getEditorManager = vi.fn(() => ({
      setCompletionConfig,
      getWorkspaceFiles,
    }));

    container.applyPythonAutocomplete();

    expect(setCompletionConfig).toHaveBeenCalledTimes(1);
    const completionConfig = setCompletionConfig.mock.calls[0][0];
    expect(completionConfig).toEqual(expect.objectContaining({
      activateOnTyping: true,
      maxRenderedOptions: 200,
    }));

    const completionResult = completionConfig.override[0]({
      pos: 'import he'.length,
      explicit: true,
      state: { doc: { toString: () => 'import he' } },
    });

    expect(getWorkspaceFiles).toHaveBeenCalledTimes(1);
    expect(completionResult.options[0]).toEqual(expect.objectContaining({
      label: 'helper',
      type: 'module',
    }));
  });

  it('returns UI registrations for canvas and Python Tutor controls', async () => {
    const PythonCodeContainer = await loadContainerClass();
    const container = Object.create(PythonCodeContainer.prototype);

    container.l10n = { canvas: 'Canvas' };
    container.mergeUIRegistrations = vi.fn((_base, extension) => extension);

    const registrations = container.getUIRegistrations();

    expect(registrations.buttons.map((button) => button.identifier)).toEqual(['canvas', 'pythonTutor']);
    expect(registrations.pages.map((page) => page.name)).toEqual(['canvas', 'pythonTutor']);
    expect(registrations.observers.map((observer) => observer.callback)).toEqual(expect.arrayContaining([
      'onCanvasPageShown',
      'onCanvasPageHidden',
      'showCanvasPage',
      'showPythonTutorPage',
      'onPythonTutorPageShown',
      'onPythonTutorPageHidden',
    ]));
    expect(registrations.buttons[1].when).toBe('hasPythonTutor');
  });

  it('refreshes and clears the Python Tutor iframe lazily', async () => {
    const PythonCodeContainer = await loadContainerClass();
    const container = Object.create(PythonCodeContainer.prototype);

    container.l10n = {};
    container.getCode = vi.fn(() => 'print("hello world")');

    const page = container.getPythonTutorPageDOM();
    const iframe = page.querySelector('iframe');

    expect(container.getPythonTutorPageDOM()).toBe(page);
    expect(iframe.title).toBe('Visualize');
    expect(iframe.src).toBe('');
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts allow-forms');

    container.refreshPythonTutorVisualization();
    expect(iframe.src).toContain('https://pythontutor.com/iframe-embed.html#');
    expect(new URLSearchParams(iframe.src.split('#')[1]).get('code')).toBe('print("hello world")');

    container.onPythonTutorPageHidden();
    expect(iframe.getAttribute('src')).toBe('about:blank');
  });

  it('uses Python Tutor feature flags and editor-manager code fallbacks', async () => {
    const PythonCodeContainer = await loadContainerClass();
    const container = Object.create(PythonCodeContainer.prototype);
    const getCode = vi.fn(() => 'print("from editor")');

    container.options = { enablePythonTutor: true };
    container.getEditorManager = vi.fn(() => ({ getCode }));

    expect(container.hasPythonTutor()).toBe(true);
    expect(container.getPythonTutorCode()).toBe('print("from editor")');

    container.options = { enablePythonTutor: false };
    expect(container.hasPythonTutor()).toBe(false);
  });

  it('shows the Python Tutor page and registers refreshed DOM state', async () => {
    const PythonCodeContainer = await loadContainerClass();
    const container = Object.create(PythonCodeContainer.prototype);
    const pageManager = { showPage: vi.fn() };
    const buttonManager = { setActive: vi.fn() };

    container.l10n = {};
    container.getCode = vi.fn(() => 'x = 1');
    container.getPythonTutorPageDOM();
    container.getPageManager = vi.fn(() => pageManager);
    container.getButtonManager = vi.fn(() => buttonManager);
    container.registerDOM = vi.fn();

    container.showPythonTutorPage();

    expect(pageManager.showPage).toHaveBeenCalledWith('pythonTutor');
    expect(buttonManager.setActive).toHaveBeenCalledWith('pythonTutor');
    expect(container._pythonTutorIframe.src).toContain('code=x+%3D+1');
    expect(container.registerDOM).toHaveBeenCalledTimes(1);
  });
});
