import { describe, expect, it, vi } from 'vitest';

import CanvasRuntimeManager from '../src/scripts/runtime/canvasruntimemanager.js';

describe('CanvasRuntimeManager', () => {
  it('ignores loading state updates before setup created the overlay', () => {
    const manager = new CanvasRuntimeManager({ addCanvas: vi.fn(), showCanvas: vi.fn() }, { addCanvas: vi.fn() });

    expect(() => manager.setLoading(true, 'Preparing canvas runtime...')).not.toThrow();
    expect(manager.getWrapper()).toBeNull();
    expect(manager.getDiv()).toBeNull();
  });

  it('creates and toggles a loading overlay for canvas runtimes', () => {
    const manager = new CanvasRuntimeManager({ addCanvas: vi.fn(), showCanvas: vi.fn() }, { addCanvas: vi.fn() });

    manager.setup('manual', 'canvas');
    manager.setLoading(true, 'Preparing canvas runtime...');

    expect(manager.getWrapper().querySelector('.canvas-loading')).not.toBeNull();
    expect(manager.getWrapper().querySelector('.canvas-loading').hidden).toBe(false);
    expect(manager.getWrapper().querySelector('.canvas-loading__label').textContent).toBe('Preparing canvas runtime...');

    manager.setLoading(false);

    expect(manager.getWrapper().querySelector('.canvas-loading').hidden).toBe(true);
    expect(manager.getWrapper().querySelector('.canvas-loading').style.display).toBe('none');
  });

  it('lazily creates and attaches a canvas before delegating to host and runner', () => {
    const host = {
      addCanvas: vi.fn(),
      showCanvas: vi.fn(),
    };
    const runner = {
      addCanvas: vi.fn(),
    };
    const manager = new CanvasRuntimeManager(host, runner);

    manager.attachCanvas('manual', 'canvas');

    expect(host.addCanvas).toHaveBeenCalledWith(manager.getWrapper(), 'manual', 'canvas');
    expect(host.showCanvas).toHaveBeenCalledTimes(1);
    expect(runner.addCanvas).toHaveBeenCalledWith(manager.getWrapper(), manager.getDiv(), manager);
  });

  it('reuses an existing wrapper when attaching multiple times', () => {
    const host = {
      addCanvas: vi.fn(),
      showCanvas: vi.fn(),
    };
    const runner = {
      addCanvas: vi.fn(),
    };
    const manager = new CanvasRuntimeManager(host, runner);

    manager.setup('manual', 'canvas');
    const initialWrapper = manager.getWrapper();
    const initialDiv = manager.getDiv();

    manager.attachCanvas('manual', 'canvas');
    manager.attachCanvas('manual', 'canvas');

    expect(manager.getWrapper()).toBe(initialWrapper);
    expect(manager.getDiv()).toBe(initialDiv);
    expect(host.addCanvas).toHaveBeenCalledTimes(2);
    expect(runner.addCanvas).toHaveBeenCalledTimes(2);
  });

  it('removes the canvas and resets internal references', () => {
    const host = {
      addCanvas: vi.fn(),
      showCanvas: vi.fn(),
      removeCanvas: vi.fn(),
    };
    const runner = {
      addCanvas: vi.fn(),
    };
    const manager = new CanvasRuntimeManager(host, runner);

    manager.setup('manual', 'canvas');
    manager.setLoading(true, 'Preparing canvas runtime...');

    const canvasDiv = manager.getDiv();

    manager.removeCanvas();

    expect(host.removeCanvas).toHaveBeenCalledWith(canvasDiv);
    expect(manager.getWrapper()).toBeNull();
    expect(manager.getDiv()).toBeNull();
    expect(manager.loadingOverlay).toBeNull();
    expect(manager.loadingLabel).toBeNull();
  });
});