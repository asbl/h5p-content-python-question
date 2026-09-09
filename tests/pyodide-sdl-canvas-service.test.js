import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  setActivePyodideSDLCanvas: vi.fn(),
}));

vi.mock('../src/scripts/runtime/services/pyodide-runtime-service', () => ({
  setActivePyodideSDLCanvas: mocks.setActivePyodideSDLCanvas,
}));

const {
  bindSDLCanvas,
  inferSDLLogicalSize,
} = await import('../src/scripts/runtime/services/pyodide-sdl-canvas-service.js');
const { SDL_KEYBOARD_ELEMENT_ID } = await import('../src/scripts/runtime/services/pyodide-sdl-constants.js');

describe('bindSDLCanvas', () => {
  beforeEach(() => {
    mocks.setActivePyodideSDLCanvas.mockClear();
    document.body.innerHTML = '';
  });

  it('tags the canvas with the SDL keyboard-element id used by SDL_EMSCRIPTEN_KEYBOARD_ELEMENT', () => {
    const canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    const runner = { sdlCanvas: canvas, pyodide: { canvas: { setCanvas2D: vi.fn() } } };

    bindSDLCanvas(runner);

    expect(canvas.id).toBe(SDL_KEYBOARD_ELEMENT_ID);
  });

  it('removes the id from a stale canvas so only the active one owns SDL keyboard capture', () => {
    // Regression test: SDL_EMSCRIPTEN_KEYBOARD_ELEMENT scopes pygame-ce's
    // native keyboard listener to a single DOM element by selector. If a
    // previous run's canvas kept the id, a stale/detached canvas could win
    // the selector match instead of the one actually running now.
    const staleCanvas = document.createElement('canvas');
    staleCanvas.id = SDL_KEYBOARD_ELEMENT_ID;
    document.body.appendChild(staleCanvas);

    const activeCanvas = document.createElement('canvas');
    document.body.appendChild(activeCanvas);
    const runner = { sdlCanvas: activeCanvas, pyodide: { canvas: { setCanvas2D: vi.fn() } } };

    bindSDLCanvas(runner);

    expect(staleCanvas.id).toBe('');
    expect(activeCanvas.id).toBe(SDL_KEYBOARD_ELEMENT_ID);
  });

  it('does nothing when the runner has no SDL canvas', () => {
    const runner = { sdlCanvas: null };

    expect(() => bindSDLCanvas(runner)).not.toThrow();
    expect(mocks.setActivePyodideSDLCanvas).not.toHaveBeenCalled();
  });
});

describe('inferSDLLogicalSize Miniworlds cases', () => {
  function createRunner(code) {
    return {
      runtime: {
        getAnalysisCode: () => code,
      },
    };
  }

  it('infers from star imports and keyword arguments with comments and whitespace', () => {
    const runner = createRunner([
      'from miniworlds import *',
      'world = World(',
      '    width=640,  # visible width',
      '    height=360',
      ')',
    ].join('\n'));

    expect(inferSDLLogicalSize(runner)).toEqual({ width: 640, height: 360 });
  });

  it('uses the first statically sized Miniworlds world and applies matching camera attachments only', () => {
    const runner = createRunner([
      'import miniworlds',
      'preview = miniworlds.World(200, 100)',
      'world = miniworlds.World(500, 300)',
      'left_toolbar = miniworlds.Toolbar()',
      'right_toolbar = miniworlds.Toolbar()',
      'preview.camera.add_left(left_toolbar, size=50)',
      'world.camera.add_right(right_toolbar, size=160)',
    ].join('\n'));

    expect(inferSDLLogicalSize(runner)).toEqual({ width: 250, height: 100 });
  });

  it('falls back to Miniworlds Robot basic dimensions for unknown configs', () => {
    const runner = createRunner([
      'from miniworlds_robot import load_world',
      'world = load_world("custom_unknown")',
    ].join('\n'));

    expect(inferSDLLogicalSize(runner)).toEqual({ width: 400, height: 400 });
  });

  it('uses the default TiledWorld dimensions when no literal arguments are present', () => {
    const runner = createRunner([
      'from miniworlds import TiledWorld',
      'world = TiledWorld()',
    ].join('\n'));

    expect(inferSDLLogicalSize(runner)).toEqual({ width: 800, height: 640 });
  });
});
