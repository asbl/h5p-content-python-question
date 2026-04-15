import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ensureSkulptRuntime,
  resetSharedSkulptRuntimeState,
  resolveSkulptRuntimeUrls,
} from '../src/scripts/runtime/services/skulpt-runtime-service.js';

describe('Skulpt runtime service', () => {
  beforeEach(() => {
    resetSharedSkulptRuntimeState();
    delete window.Sk;
  });

  it('derives the stdlib file from a hosted Skulpt script URL', () => {
    expect(resolveSkulptRuntimeUrls('https://static.example.com/skulpt/skulpt.min.js')).toEqual({
      scriptUrl: 'https://static.example.com/skulpt/skulpt.min.js',
      stdlibUrl: 'https://static.example.com/skulpt/skulpt-stdlib.js',
    });

    expect(resolveSkulptRuntimeUrls('https://static.example.com/skulpt/')).toEqual({
      scriptUrl: 'https://static.example.com/skulpt/skulpt.min.js',
      stdlibUrl: 'https://static.example.com/skulpt/skulpt-stdlib.js',
    });
  });

  it('loads the hosted Skulpt runtime and stdlib exactly once', async () => {
    let appendCount = 0;
    const appendSpy = vi.spyOn(document.head, 'appendChild').mockImplementation((node) => {
      appendCount += 1;

      queueMicrotask(() => {
        if (appendCount === 2) {
          window.Sk = { builtinFiles: { files: {} } };
        }
        else {
          window.Sk = {};
        }

        node.onload?.();
      });

      return node;
    });

    const skulpt = await ensureSkulptRuntime('https://static.example.com/skulpt/skulpt.min.js');

    expect(skulpt).toBe(window.Sk);
    expect(appendSpy).toHaveBeenCalledTimes(2);
    expect(appendSpy.mock.calls[0][0].src).toBe('https://static.example.com/skulpt/skulpt.min.js');
    expect(appendSpy.mock.calls[1][0].src).toBe('https://static.example.com/skulpt/skulpt-stdlib.js');

    appendSpy.mockRestore();
  });
});