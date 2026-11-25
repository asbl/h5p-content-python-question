import { describe, expect, it, vi } from 'vitest';
import PyodideWorkerRunner from '../src/scripts/runtime/pyodide-worker-runner';

function createRuntime(files) {
  return {
    l10n: {},
    outputHandler: vi.fn(),
    inputHandler: vi.fn(async () => ''),
    codeContainer: null,
    getProjectSnapshot: () => (files ? { files } : null),
  };
}

describe('PyodideWorkerRunner', () => {
  it('passes only non-entry project files to the worker', () => {
    const runtime = createRuntime([
      { name: 'main.py', code: 'print(1)', isEntry: true },
      { name: 'helper.py', code: 'X = 1', isEntry: false },
      { name: 'util.py', code: 'Y = 2', isEntry: false },
    ]);
    const runner = new PyodideWorkerRunner(runtime, { l10n: {} });
    expect(runner.getWorkerFiles()).toEqual([
      { name: 'helper.py', code: 'X = 1' },
      { name: 'util.py', code: 'Y = 2' },
    ]);
  });

  it('returns no files without a project snapshot', () => {
    const runner = new PyodideWorkerRunner(createRuntime(null), { l10n: {} });
    expect(runner.getWorkerFiles()).toEqual([]);
  });

  it('sends the workspace files with the run options', async () => {
    const runtime = createRuntime([
      { name: 'main.py', code: 'import helper', isEntry: true },
      { name: 'helper.py', code: 'X = 1', isEntry: false },
    ]);
    runtime.onSuccess = vi.fn(async () => {});
    const runner = new PyodideWorkerRunner(runtime, { l10n: {}, packages: ['numpy'], packageUrls: { custom: 'https://example.test/x.whl' } });
    const runSpy = vi.spyOn(runner.client, 'run').mockResolvedValue({ stopped: false });

    await runner.execute('import helper');

    expect(runSpy).toHaveBeenCalledWith('import helper', expect.objectContaining({
      packages: ['numpy'],
      packageUrls: { custom: 'https://example.test/x.whl' },
      files: [{ name: 'helper.py', code: 'X = 1' }],
    }));
  });
});
