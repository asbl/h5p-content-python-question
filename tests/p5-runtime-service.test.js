import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ensureP5Script,
  resetSharedP5RuntimeState,
} from '../src/scripts/runtime/services/p5-runtime-service.js';

describe('p5 runtime service', () => {
  beforeEach(() => {
    resetSharedP5RuntimeState();
    delete window.p5;
    document.head.innerHTML = '';
  });

  it('loads the hosted p5 URL first when provided', async () => {
    const appendSpy = vi.spyOn(document.head, 'appendChild').mockImplementation((element) => {
      window.p5 = class P5Mock {};
      queueMicrotask(() => element.onload());
      return element;
    });

    const result = await ensureP5Script('https://static.example.com/p5/p5.min.js');

    expect(result).toBe(window.p5);
    expect(appendSpy).toHaveBeenCalledTimes(1);
    expect(appendSpy.mock.calls[0][0].src).toBe('https://static.example.com/p5/p5.min.js');

    appendSpy.mockRestore();
  });

  it('uses the default CDN when no custom p5 URL is configured', async () => {
    const appendSpy = vi.spyOn(document.head, 'appendChild').mockImplementation((element) => {
      window.p5 = class P5Mock {};
      queueMicrotask(() => element.onload());
      return element;
    });

    const result = await ensureP5Script();

    expect(result).toBe(window.p5);
    expect(appendSpy).toHaveBeenCalledTimes(1);
    expect(appendSpy.mock.calls[0][0].src).toBe('https://cdn.jsdelivr.net/npm/p5@1.1.9/lib/p5.min.js');

    appendSpy.mockRestore();
  });
});