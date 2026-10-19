import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadExternalDiagnosticsModule = vi.fn();

vi.mock('../src/scripts/services/python-external-diagnostics-runtime.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    loadExternalDiagnosticsModule: (...args) => loadExternalDiagnosticsModule(...args),
  };
});

const {
  DEFAULT_RUFF_CDN_URL,
  DEFAULT_PYREFLY_CDN_URL,
  DEFAULT_PYREFLY_WASM_URL,
} = await import('../src/scripts/services/python-external-diagnostics-runtime.js');
const { getPythonRuffInlineDiagnostics, resetPythonRuffDiagnosticsForTests } =
  await import('../src/scripts/services/python-ruff-diagnostics.js');
const { getPythonPyreflyInlineDiagnostics, resetPythonPyreflyDiagnosticsForTests } =
  await import('../src/scripts/services/python-pyrefly-diagnostics.js');

function createFakeRuffRuntime() {
  return {
    default: vi.fn(async () => {}),
    Workspace: class {
      check() {
        return [];
      }
    },
    PositionEncoding: { UTF16: 1 },
  };
}

function createFakePyreflyRuntime() {
  return {
    default: vi.fn(async () => {}),
    State: class {
      updateSandboxFiles() {}
      setActiveFile() {}
      getErrors() {
        return [];
      }
    },
  };
}

describe('Diagnostics runtime caches keyed by CDN URL', () => {
  beforeEach(() => {
    loadExternalDiagnosticsModule.mockReset();
    resetPythonRuffDiagnosticsForTests();
    resetPythonPyreflyDiagnosticsForTests();
  });

  it('loads one Ruff runtime per URL and reuses it for repeated calls', async () => {
    const first = createFakeRuffRuntime();
    const second = createFakeRuffRuntime();
    loadExternalDiagnosticsModule.mockImplementationOnce(async () => first)
      .mockImplementationOnce(async () => second);

    await getPythonRuffInlineDiagnostics('x = 1', { ruffCdnUrl: 'https://a.example.com/ruff/' });
    await getPythonRuffInlineDiagnostics('x = 1', { ruffCdnUrl: 'https://a.example.com/ruff/' });
    await getPythonRuffInlineDiagnostics('x = 1', { ruffCdnUrl: 'https://b.example.com/ruff/' });

    expect(loadExternalDiagnosticsModule.mock.calls.map(([url]) => url)).toEqual([
      'https://a.example.com/ruff/ruff_wasm.js',
      'https://b.example.com/ruff/ruff_wasm.js',
    ]);
    expect(first.default).toHaveBeenCalledTimes(1);
    expect(second.default).toHaveBeenCalledTimes(1);
  });

  it('loads one Pyrefly runtime per URL pair and initializes each with its own WASM URL', async () => {
    const first = createFakePyreflyRuntime();
    const second = createFakePyreflyRuntime();
    loadExternalDiagnosticsModule.mockImplementationOnce(async () => first)
      .mockImplementationOnce(async () => second);

    await getPythonPyreflyInlineDiagnostics('x = 1', { pyreflyCdnUrl: 'https://a.example.com/pyrefly/' });
    await getPythonPyreflyInlineDiagnostics('x = 1', { pyreflyCdnUrl: 'https://a.example.com/pyrefly/' });
    await getPythonPyreflyInlineDiagnostics('x = 1', { pyreflyCdnUrl: 'https://b.example.com/pyrefly/' });

    expect(loadExternalDiagnosticsModule.mock.calls.map(([url]) => url)).toEqual([
      'https://a.example.com/pyrefly/pyrefly_wasm.js',
      'https://b.example.com/pyrefly/pyrefly_wasm.js',
    ]);
    expect(first.default).toHaveBeenCalledWith('https://a.example.com/pyrefly/pyrefly_wasm_bg.wasm');
    expect(second.default).toHaveBeenCalledWith('https://b.example.com/pyrefly/pyrefly_wasm_bg.wasm');
    expect(first.default).toHaveBeenCalledTimes(1);
    expect(second.default).toHaveBeenCalledTimes(1);
  });

  it('falls back to the default URLs and caches them like any other URL', async () => {
    const ruff = createFakeRuffRuntime();
    const pyrefly = createFakePyreflyRuntime();
    loadExternalDiagnosticsModule.mockImplementation(async (url) => {
      if (url === DEFAULT_RUFF_CDN_URL) {
        return ruff;
      }
      if (url === DEFAULT_PYREFLY_CDN_URL) {
        return pyrefly;
      }
      throw new Error(`Unexpected module URL: ${url}`);
    });

    await getPythonRuffInlineDiagnostics('x = 1', {});
    await getPythonRuffInlineDiagnostics('x = 1', {});
    await getPythonPyreflyInlineDiagnostics('x = 1', {});
    await getPythonPyreflyInlineDiagnostics('x = 1', {});

    expect(loadExternalDiagnosticsModule).toHaveBeenCalledTimes(2);
    expect(pyrefly.default).toHaveBeenCalledWith(DEFAULT_PYREFLY_WASM_URL);
  });

  it('retries a failed Ruff runtime load on the next call', async () => {
    loadExternalDiagnosticsModule.mockRejectedValueOnce(new Error('offline'))
      .mockImplementationOnce(async () => createFakeRuffRuntime());

    await expect(getPythonRuffInlineDiagnostics('x = 1', {})).rejects.toThrow('offline');
    await expect(getPythonRuffInlineDiagnostics('x = 1', {})).resolves.toEqual([]);
    expect(loadExternalDiagnosticsModule).toHaveBeenCalledTimes(2);
  });

  it('retries a failed Pyrefly runtime load on the next call', async () => {
    loadExternalDiagnosticsModule.mockRejectedValueOnce(new Error('offline'))
      .mockImplementationOnce(async () => createFakePyreflyRuntime());

    await expect(getPythonPyreflyInlineDiagnostics('x = 1', {})).rejects.toThrow('offline');
    await expect(getPythonPyreflyInlineDiagnostics('x = 1', {})).resolves.toEqual([]);
    expect(loadExternalDiagnosticsModule).toHaveBeenCalledTimes(2);
  });
});
