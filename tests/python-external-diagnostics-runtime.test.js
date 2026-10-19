import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PYREFLY_CDN_URL,
  DEFAULT_PYREFLY_WASM_URL,
  DEFAULT_RUFF_CDN_URL,
  loadExternalDiagnosticsModule,
  normalizePyreflyRuntimeUrls,
  normalizeRuffRuntimeUrl,
} from '../src/scripts/services/python-external-diagnostics-runtime.js';

describe('Python external diagnostics runtime', () => {
  it('pins the Ruff CDN URL to the local devDependency version', () => {
    expect(DEFAULT_RUFF_CDN_URL).toBe('https://cdn.jsdelivr.net/npm/@astral-sh/ruff-wasm-web@0.17.0/ruff_wasm.js');
  });

  it('pins the Pyrefly CDN URLs to the vendored commit', () => {
    expect(DEFAULT_PYREFLY_CDN_URL).toBe('https://cdn.jsdelivr.net/gh/asbl/h5p-content-python-question@554d95d8fae15749ef39361ec383c04438c6283c/vendor/pyrefly-wasm/pyrefly_wasm.js');
    expect(DEFAULT_PYREFLY_WASM_URL).toBe('https://media.githubusercontent.com/media/asbl/h5p-content-python-question/554d95d8fae15749ef39361ec383c04438c6283c/vendor/pyrefly-wasm/pyrefly_wasm_bg.wasm');
  });

  it('normalizes Ruff runtime URLs', () => {
    expect(normalizeRuffRuntimeUrl('')).toBe(DEFAULT_RUFF_CDN_URL);
    expect(normalizeRuffRuntimeUrl('https://static.example.com/ruff/ruff_wasm.js?v=1'))
      .toBe('https://static.example.com/ruff/ruff_wasm.js?v=1');
    expect(normalizeRuffRuntimeUrl('https://static.example.com/ruff/'))
      .toBe('https://static.example.com/ruff/ruff_wasm.js');
    expect(normalizeRuffRuntimeUrl('https://static.example.com/ruff'))
      .toBe('https://static.example.com/ruff/ruff_wasm.js');
  });

  it('falls back to the GitHub media CDN for the default Pyrefly glue URL', () => {
    expect(normalizePyreflyRuntimeUrls('', '')).toEqual({
      glueUrl: DEFAULT_PYREFLY_CDN_URL,
      wasmUrl: DEFAULT_PYREFLY_WASM_URL,
    });
  });

  it('derives the Pyrefly WASM URL from a custom glue directory', () => {
    expect(normalizePyreflyRuntimeUrls('https://static.example.com/pyrefly/', '')).toEqual({
      glueUrl: 'https://static.example.com/pyrefly/pyrefly_wasm.js',
      wasmUrl: 'https://static.example.com/pyrefly/pyrefly_wasm_bg.wasm',
    });
  });

  it('keeps an explicit Pyrefly glue URL and honors a separate WASM override', () => {
    expect(normalizePyreflyRuntimeUrls('https://static.example.com/pyrefly/pyrefly_wasm.js', '')).toEqual({
      glueUrl: 'https://static.example.com/pyrefly/pyrefly_wasm.js',
      wasmUrl: 'https://static.example.com/pyrefly/pyrefly_wasm_bg.wasm',
    });

    expect(normalizePyreflyRuntimeUrls('https://static.example.com/pyrefly/', 'https://other.example.com/pyrefly_wasm_bg.wasm')).toEqual({
      glueUrl: 'https://static.example.com/pyrefly/pyrefly_wasm.js',
      wasmUrl: 'https://other.example.com/pyrefly_wasm_bg.wasm',
    });
  });

  it('rejects loading an external module without a URL', async () => {
    await expect(loadExternalDiagnosticsModule('')).rejects.toThrow('Missing URL');
    await expect(loadExternalDiagnosticsModule(null)).rejects.toThrow('Missing URL');
  });
});
