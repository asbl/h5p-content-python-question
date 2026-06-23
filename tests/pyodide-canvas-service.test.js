import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ensureP5Script: vi.fn(() => Promise.resolve()),
}));

vi.mock('../src/scripts/runtime/services/p5-runtime-service.js', () => ({
  ensureP5Script: mocks.ensureP5Script,
}));

const { default: PyodideCanvasService } = await import('../src/scripts/runtime/services/pyodide-canvas-service.js');

function createRunner() {
  return {
    l10n: {},
    options: {},
    stopped: false,
    runtime: {
      containsP5Code: () => false,
      containsSDLCode: () => false,
    },
    pyodide: { canvas: { setCanvas2D: vi.fn() } },
    restoreP5WindowBindings: vi.fn(),
    bindP5WindowFunction: vi.fn(),
    finalizeSDLCanvasSetup: vi.fn((canvas) => canvas),
    setCanvasLoading: vi.fn(),
    setup: vi.fn(() => Promise.resolve()),
    onError: vi.fn(),
    _isInitialized: true,
  };
}

describe('PyodideCanvasService', () => {
  afterEach(() => {
    delete window.p5;
    delete window.setup;
    delete window.draw;
  });

  it('mounts p5 through the runner while preserving lifecycle hooks', () => {
    const runner = createRunner();
    const canvasDiv = document.createElement('div');
    canvasDiv.append(document.createElement('span'));
    const remove = vi.fn();
    window.setup = vi.fn();
    window.p5 = class P5Mock {
      constructor(sketch, target) {
        const prototype = { background: vi.fn() };
        const instance = Object.create(prototype);
        instance.remove = remove;
        sketch(instance);
        this.target = target;
      }
    };

    const service = new PyodideCanvasService(runner);
    service.setupP5(canvasDiv);

    expect(canvasDiv.childElementCount).toBe(0);
    expect(runner.restoreP5WindowBindings).toHaveBeenCalledOnce();
    expect(runner.bindP5WindowFunction).toHaveBeenCalledWith('setup', expect.any(Function));
    expect(runner.canvasDiv).toBe(canvasDiv);
  });

  it('creates and reuses an accessible SDL canvas', () => {
    const runner = createRunner();
    const service = new PyodideCanvasService(runner);
    const canvasDiv = document.createElement('div');

    const first = service.setupSDLCanvas(canvasDiv);
    const second = service.setupSDLCanvas(canvasDiv);

    expect(first).toBe(second);
    expect(first.classList.contains('pyodide-sdl-canvas')).toBe(true);
    expect(first.width).toBe(1);
    expect(first.getAttribute('role')).toBe('img');
    expect(first.getAttribute('aria-label')).toBe('Program canvas');
    expect(runner.finalizeSDLCanvasSetup).toHaveBeenCalledTimes(2);
  });

  it('loads p5 before mounting through addCanvas', async () => {
    const runner = createRunner();
    runner.runtime.containsP5Code = () => true;
    const service = new PyodideCanvasService(runner);
    service.setupP5 = vi.fn();
    const canvasDiv = document.createElement('div');

    service.addCanvas(document.createElement('div'), canvasDiv);
    await Promise.resolve();

    expect(mocks.ensureP5Script).toHaveBeenCalledWith(undefined);
    expect(service.setupP5).toHaveBeenCalledWith(canvasDiv);
    expect(runner.setCanvasLoading).toHaveBeenLastCalledWith(false);
  });
});
