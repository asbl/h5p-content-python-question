import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearPyodideExecutionLimit,
  getPyodideRuntimeInput,
  resetSharedPyodideRuntimeState,
  setPyodideExecutionLimit,
  setActivePyodideRuntime,
  setActivePyodideSDLCanvas,
  sharedPyodideRuntimeState,
  writePyodideRuntimeOutput,
} from '../src/scripts/runtime/services/pyodide-runtime-service.js';

describe('Pyodide runtime service', () => {
  beforeEach(() => {
    resetSharedPyodideRuntimeState();
  });

  it('routes output and input through the active runtime handlers', async () => {
    const outputHandler = vi.fn();
    const inputHandler = vi.fn(() => '42');

    setActivePyodideRuntime({
      l10n: { pythonInputPrompt: 'Input:' },
      outputHandler,
      inputHandler,
    });

    writePyodideRuntimeOutput('ready');

    expect(outputHandler).toHaveBeenCalledWith('ready');
    expect(await getPyodideRuntimeInput()).toBe('42');
    expect(inputHandler).toHaveBeenCalledWith('Input:');
  });

  it('returns an empty string when no runtime input handler exists', async () => {
    expect(await getPyodideRuntimeInput('Prompt')).toBe('');
  });

  it('keeps only one SDL canvas bound to the shared canvas id', () => {
    const firstCanvas = document.createElement('canvas');
    const secondCanvas = document.createElement('canvas');

    setActivePyodideSDLCanvas(firstCanvas);
    setActivePyodideSDLCanvas(secondCanvas);

    expect(firstCanvas.id).toMatch(/^canvas-inactive-/);
    expect(secondCanvas.id).toBe('canvas');
    expect(sharedPyodideRuntimeState.activeSDLCanvas).toBe(secondCanvas);
  });

  it('installs and clears the execution-limit trace helpers', async () => {
    const pyodide = {
      runPythonAsync: vi.fn().mockResolvedValue(undefined),
    };

    await setPyodideExecutionLimit(pyodide, 1200.8, 'Program exceeded the execution time limit.');

    expect(pyodide.runPythonAsync).toHaveBeenNthCalledWith(
      2,
      '_h5p_set_execution_limit(1200, "Program exceeded the execution time limit.")',
    );

    await clearPyodideExecutionLimit(pyodide);

    expect(pyodide.runPythonAsync).toHaveBeenLastCalledWith('_h5p_clear_execution_limit()');
  });

  it('clears execution-limit helpers instead of installing a non-positive limit', async () => {
    const pyodide = {
      runPythonAsync: vi.fn().mockResolvedValue(undefined),
    };

    await setPyodideExecutionLimit(pyodide, 'invalid', 'Program exceeded the execution time limit.');

    expect(pyodide.runPythonAsync).toHaveBeenNthCalledWith(
      2,
      '_h5p_clear_execution_limit()',
    );
  });
});