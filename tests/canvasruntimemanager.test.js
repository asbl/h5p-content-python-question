import { describe, expect, it, vi } from 'vitest';

import CanvasRuntimeManager from '../src/scripts/runtime/canvasruntimemanager.js';

describe('CanvasRuntimeManager', () => {
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
});