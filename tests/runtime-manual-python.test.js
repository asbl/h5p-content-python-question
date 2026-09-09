import { describe, expect, it, vi } from 'vitest';

const resetMock = vi.hoisted(() => vi.fn());

vi.mock('../src/scripts/runtime/runtime-python', () => ({
  default: class PythonRuntimeMock {
    reset() {
      resetMock();
    }
  },
}));

describe('PythonManualRuntime', () => {
  it('removes the canvas after the shared manual runtime reset', async () => {
    const removeCanvas = vi.fn();

    globalThis.H5P = {
      ...(globalThis.H5P || {}),
      ManualRuntimeMixin: (BaseClass) => class extends BaseClass {},
    };

    const { default: PythonManualRuntime } = await import('../src/scripts/runtime/runtime-manual-python.js');
    const runtime = new PythonManualRuntime();
    runtime.getCanvasManager = vi.fn(() => ({ removeCanvas }));

    runtime.reset();

    expect(resetMock).toHaveBeenCalledTimes(1);
    expect(removeCanvas).toHaveBeenCalledTimes(1);
  });
});
