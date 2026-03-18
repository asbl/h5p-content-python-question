import { describe, expect, it, vi } from 'vitest';

import PyodideSourceService from '../src/scripts/runtime/services/pyodide-source-service.js';

function createRunner(sourceFiles, pyodide) {
  return {
    pyodide,
    runtime: {
      getProjectSnapshot: () => ({
        entryFileName: 'main.py',
        activeFileName: 'main.py',
        files: sourceFiles,
      }),
      codeContainer: {
        containerUID: 'container:1',
      },
    },
  };
}

describe('Pyodide source service', () => {
  it('writes workspace source files into a shared src directory and exposes it on sys.path', async () => {
    const existingPaths = new Set();
    const fs = {
      analyzePath: vi.fn((path) => ({ exists: existingPaths.has(path) })),
      mkdir: vi.fn((path) => existingPaths.add(path)),
      readdir: vi.fn(() => []),
      writeFile: vi.fn(),
      stat: vi.fn(),
      rmdir: vi.fn(),
      unlink: vi.fn(),
      isDir: vi.fn(() => false),
    };
    const pyodide = {
      FS: fs,
      runPythonAsync: vi.fn(async () => {}),
    };
    const service = new PyodideSourceService(createRunner([
      {
        name: 'main.py',
        code: 'import helper',
        isEntry: true,
      },
      {
        name: 'helper.py',
        code: 'VALUE = 1',
        isEntry: false,
      },
    ], pyodide));

    await service.installSourceRegistry();

    expect(fs.writeFile.mock.calls[0][0]).toBe('/tmp/h5p_project/container_1/src/main.py');
    expect(ArrayBuffer.isView(fs.writeFile.mock.calls[0][1])).toBe(true);
    expect(fs.writeFile.mock.calls[1][0]).toBe('/tmp/h5p_project/container_1/src/helper.py');
    expect(ArrayBuffer.isView(fs.writeFile.mock.calls[1][1])).toBe(true);
    expect(pyodide.runPythonAsync).toHaveBeenCalledTimes(2);
    expect(pyodide.runPythonAsync).toHaveBeenNthCalledWith(2, expect.stringContaining('/tmp/h5p_project/container_1/src'));
  });
});