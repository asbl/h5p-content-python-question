import { describe, expect, it, vi } from 'vitest';

describe('PythonCodeContainer', () => {
  it('applies package-aware CodeMirror completion config', async () => {
    globalThis.H5P = {
      ...(globalThis.H5P || {}),
      CodeQuestionContainer: class {},
    };

    const { default: PythonCodeContainer } = await import('../src/scripts/container/container-python.js');
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
});