import { describe, expect, it, vi } from 'vitest';
import {
  ensureSDLEventPumpFunction,
  installSDLMouseCapture,
  shouldCaptureSDLKeyboard,
  shouldRunSDLEventPump,
  startSDLEventPumpLoop,
} from '../src/scripts/runtime/services/pyodide-sdl-input-service';

/**
 * Builds a minimal fake runner with a canvas mounted at a known rect.
 * @returns {object} Fake runner plus its DOM elements for assertions.
 */
function createFakeRunner() {
  const wrapper = document.createElement('div');
  const canvas = document.createElement('canvas');
  wrapper.appendChild(canvas);
  document.body.appendChild(wrapper);

  canvas.width = 200;
  canvas.height = 100;
  canvas.getBoundingClientRect = () => ({
    left: 0, right: 200, top: 0, bottom: 100, width: 200, height: 100,
  });
  canvas.focus = vi.fn();

  const runner = {
    runtime: { containsSDLCode: () => true },
    canvasWrapper: wrapper,
    canvasDiv: wrapper,
    sdlCanvas: canvas,
    pyodide: {
      canvas: { setCanvas2D: vi.fn() },
      runPythonAsync: vi.fn().mockResolvedValue(undefined),
    },
    bindSDLCanvas: vi.fn(),
  };

  return { runner, wrapper, canvas };
}

describe('shouldCaptureSDLKeyboard', () => {
  it('captures Space/arrow keys targeting the page body while the canvas page is active', () => {
    const { runner } = createFakeRunner();
    runner.runtime.codeContainer = { getPageManager: () => ({ activePageName: 'canvas' }) };

    const event = { key: ' ', target: document.body };

    expect(shouldCaptureSDLKeyboard(runner, event, {})).toBe(true);
  });

  it('does not capture keys typed into a text input, e.g. the input() SweetAlert dialog', () => {
    // Regression test: the keydown handler used to steal focus back to the
    // canvas (and preventDefault) whenever Space/arrow keys were pressed
    // anywhere outside the canvas while the canvas page was active -
    // including while a SweetAlert input dialog for Python's input() had
    // focus. That made it impossible to type a space or move the cursor
    // with arrow keys inside the dialog.
    const { runner } = createFakeRunner();
    runner.runtime.codeContainer = { getPageManager: () => ({ activePageName: 'canvas' }) };

    const swalInput = document.createElement('input');
    document.body.appendChild(swalInput);

    const event = { key: ' ', target: swalInput };

    expect(shouldCaptureSDLKeyboard(runner, event, {})).toBe(false);
  });

  it('does not capture keys typed into a textarea or contenteditable element', () => {
    const { runner } = createFakeRunner();
    runner.runtime.codeContainer = { getPageManager: () => ({ activePageName: 'canvas' }) };

    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    expect(shouldCaptureSDLKeyboard(runner, { key: 'ArrowLeft', target: textarea }, {})).toBe(false);

    // jsdom does not compute HTMLElement.isContentEditable from the
    // contenteditable attribute, so the flag is set directly here to
    // exercise that branch of the guard.
    const editable = document.createElement('div');
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    document.body.appendChild(editable);
    expect(shouldCaptureSDLKeyboard(runner, { key: 'ArrowLeft', target: editable }, {})).toBe(false);
  });
});

describe('installSDLMouseCapture', () => {
  it('rebinds and focuses the canvas for a press event that actually targets it', () => {
    const { runner, canvas } = createFakeRunner();

    installSDLMouseCapture(runner);
    runner._sdlMouseCaptureBound({
      type: 'pointerdown', clientX: 80, clientY: 40, button: 0, buttons: 1, target: canvas,
    });

    expect(runner.bindSDLCanvas).toHaveBeenCalled();
    expect(canvas.focus).toHaveBeenCalledTimes(1);
  });

  it('does not steal focus for a press event whose target overlaps the canvas area but is not part of it', () => {
    // Regression test: a SweetAlert input dialog rendered on top of the
    // canvas falls within its bounding rect. Clicking into the dialog must
    // not rebind/focus the canvas, or the dialog's input field can never
    // keep keyboard focus.
    const { runner, canvas } = createFakeRunner();
    const dialogInput = document.createElement('input');
    document.body.appendChild(dialogInput);

    installSDLMouseCapture(runner);
    runner._sdlMouseCaptureBound({
      type: 'pointerdown', clientX: 80, clientY: 40, button: 0, buttons: 1, target: dialogInput,
    });

    expect(runner.bindSDLCanvas).not.toHaveBeenCalled();
    expect(canvas.focus).not.toHaveBeenCalled();
  });

  it('treats a press event without a target permissively (e.g. synthetic events)', () => {
    const { runner, canvas } = createFakeRunner();

    installSDLMouseCapture(runner);
    runner._sdlMouseCaptureBound({
      type: 'pointerdown', clientX: 80, clientY: 40, button: 0, buttons: 1,
    });

    expect(runner.bindSDLCanvas).toHaveBeenCalled();
    expect(canvas.focus).toHaveBeenCalledTimes(1);
  });
});

describe('SDL event pump loop', () => {
  it('installs a reusable Python helper instead of compiling pygame pump code every tick', async () => {
    const { runner } = createFakeRunner();
    runner.pyodide.runPythonAsync = vi.fn().mockResolvedValue(undefined);

    await ensureSDLEventPumpFunction(runner);
    await ensureSDLEventPumpFunction(runner);

    expect(runner.pyodide.runPythonAsync).toHaveBeenCalledTimes(1);
    expect(runner.pyodide.runPythonAsync.mock.calls[0][0]).toContain('def _h5p_pygame_event_pump():');
    expect(runner._sdlEventPumpFunctionInstalled).toBe(true);
  });

  it('only runs the pump while the runner owns the active visible SDL canvas', () => {
    const { runner } = createFakeRunner();
    const otherRunner = {};
    const sharedState = { activeSDLRunner: runner };
    runner.runtime.codeContainer = { getPageManager: () => ({ activePageName: 'canvas' }) };

    expect(shouldRunSDLEventPump(runner, sharedState)).toBe(true);
    expect(shouldRunSDLEventPump(runner, { activeSDLRunner: otherRunner })).toBe(false);

    runner.runtime.codeContainer = { getPageManager: () => ({ activePageName: 'code' }) };
    expect(shouldRunSDLEventPump(runner, sharedState)).toBe(false);

    runner.stopped = true;
    expect(shouldRunSDLEventPump(runner, sharedState)).toBe(false);
  });

  it('calls the installed helper on interval ticks when active', async () => {
    vi.useFakeTimers();
    const { runner } = createFakeRunner();
    runner.pyodide.runPythonAsync = vi.fn().mockResolvedValue(undefined);
    runner.runtime.codeContainer = { getPageManager: () => ({ activePageName: 'canvas' }) };

    const { sharedPyodideRuntimeState } = await import('../src/scripts/runtime/services/pyodide-runtime-service');
    sharedPyodideRuntimeState.activeSDLRunner = runner;

    startSDLEventPumpLoop(runner);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(50);

    expect(runner.pyodide.runPythonAsync).toHaveBeenCalledWith(expect.stringContaining('def _h5p_pygame_event_pump():'));
    expect(runner.pyodide.runPythonAsync).toHaveBeenCalledWith('_h5p_pygame_event_pump()');

    sharedPyodideRuntimeState.activeSDLRunner = null;
    window.clearInterval(runner._sdlEventPumpInterval);
    runner._sdlEventPumpInterval = null;
    vi.useRealTimers();
  });
});
