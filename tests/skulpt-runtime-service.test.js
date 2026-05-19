import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ALTERNATIVE_SKULPT_CDN_URL,
  DEFAULT_SKULPT_CDN_URL,
  OFFICIAL_SKULPT_CDN_URL,
  ensureSkulptRuntime,
  resetSharedSkulptRuntimeState,
  resolveSkulptRuntimeUrls,
} from '../src/scripts/runtime/services/skulpt-runtime-service.js';

describe('Skulpt runtime service', () => {
  beforeEach(() => {
    resetSharedSkulptRuntimeState();
    delete window.Sk;
    delete window.H5PIntegration;
    document.head.innerHTML = '';
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

  it('documents the default, alternative and official hosted Skulpt sources', () => {
    expect(DEFAULT_SKULPT_CDN_URL).toBe('https://cdn.jsdelivr.net/gh/StriveMath/p5-python-web@0.0.15/lib/skulpt.min.js');
    expect(ALTERNATIVE_SKULPT_CDN_URL).toBe('https://rawcdn.githack.com/StriveMath/p5-python-web/0.0.15/lib/skulpt.min.js');
    expect(OFFICIAL_SKULPT_CDN_URL).toBe('https://cdn.jsdelivr.net/npm/skulpt@1.2.0/dist/skulpt.min.js');
    expect(resolveSkulptRuntimeUrls()).toEqual({
      scriptUrl: DEFAULT_SKULPT_CDN_URL,
      stdlibUrl: 'https://cdn.jsdelivr.net/gh/StriveMath/p5-python-web@0.0.15/lib/skulpt-stdlib.js',
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

  it('applies the host CSP nonce to injected Skulpt scripts', async () => {
    let appendCount = 0;
    window.H5PIntegration = { nonce: 'host-nonce' };
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

    await ensureSkulptRuntime('https://static.example.com/skulpt/skulpt.min.js');

    expect(appendSpy.mock.calls[0][0].getAttribute('nonce')).toBe('host-nonce');
    expect(appendSpy.mock.calls[1][0].getAttribute('nonce')).toBe('host-nonce');

    appendSpy.mockRestore();
  });
});
