import { describe, expect, it, vi } from 'vitest';

import PyodideFileService from '../src/scripts/runtime/services/pyodide-file-service.js';

const TEST_OPTIONS = {
  managerMethod: 'getFileManager',
  entriesMethod: 'getFiles',
  variableName: 'h5p_files',
  rootDirectoryName: 'h5p_files',
  sharedRootDirectoryName: 'h5p_project',
  relativeDirectory: 'files',
  exposeRegistry: true,
};

/**
 * Creates a normalized uploaded-file entry for tests.
 * @param {string} name Visible file name.
 * @param {object} [overrides] Optional property overrides.
 * @returns {object} Uploaded file entry.
 */
function makeFile(name, overrides = {}) {
  return {
    name,
    objectUrl: `blob:${name}`,
    mimeType: 'text/plain',
    size: 4,
    bytes: new Uint8Array([1, 2, 3, 4]),
    ...overrides,
  };
}

/**
 * Creates a minimal runner stub that exposes a file manager.
 * @param {object[]} [files] Uploaded files returned by the manager.
 * @param {object} [pyodide] Optional pyodide stub.
 * @param {string} [containerUID] Container identifier.
 * @returns {object} Runner stub.
 */
function createRunner(files = [], pyodide = undefined, containerUID = 'container:1') {
  return {
    pyodide,
    runtime: {
      codeContainer: {
        containerUID,
        getFileManager: () => ({
          isEnabled: () => true,
          getFiles: () => files,
        }),
      },
    },
  };
}

describe('PyodideFileService (base class)', () => {
  describe('getContainerIdentifier', () => {
    it('sanitizes special characters in containerUID', () => {
      const runner = createRunner([], undefined, 'box:7/a');
      const service = new PyodideFileService(runner, TEST_OPTIONS);

      expect(service.getContainerIdentifier()).toBe('box_7_a');
    });

    it('falls back to "default" when containerUID is absent', () => {
      const runner = { pyodide: undefined, runtime: { codeContainer: {} } };
      const service = new PyodideFileService(runner, TEST_OPTIONS);

      expect(service.getContainerIdentifier()).toBe('default');
    });
  });

  describe('getFileRootDirectory / getFileDirectory', () => {
    it('uses the shared root when sharedRootDirectoryName is set', () => {
      const runner = createRunner([], undefined, 'c1');
      const service = new PyodideFileService(runner, TEST_OPTIONS);

      expect(service.getFileRootDirectory()).toBe('/tmp/h5p_project/c1');
      expect(service.getFileDirectory()).toBe('/tmp/h5p_project/c1/files');
    });

    it('falls back to rootDirectoryName when shared root is not set', () => {
      const runner = createRunner([], undefined, 'c1');
      const service = new PyodideFileService(runner, {
        ...TEST_OPTIONS,
        sharedRootDirectoryName: null,
      });

      expect(service.getFileRootDirectory()).toBe('/tmp/h5p_files/c1');
    });
  });

  describe('getUploadedFiles', () => {
    it('returns files from the manager when enabled', () => {
      const files = [makeFile('notes.txt')];
      const service = new PyodideFileService(createRunner(files), TEST_OPTIONS);

      expect(service.getUploadedFiles()).toEqual(files);
    });

    it('returns empty array when the manager is disabled', () => {
      const runner = {
        pyodide: undefined,
        runtime: {
          codeContainer: {
            containerUID: 'c1',
            getFileManager: () => ({ isEnabled: () => false, getFiles: () => [makeFile('x.txt')] }),
          },
        },
      };
      const service = new PyodideFileService(runner, TEST_OPTIONS);

      expect(service.getUploadedFiles()).toEqual([]);
    });

    it('returns empty array when the manager method is absent', () => {
      const runner = { pyodide: undefined, runtime: { codeContainer: { containerUID: 'c1' } } };
      const service = new PyodideFileService(runner, TEST_OPTIONS);

      expect(service.getUploadedFiles()).toEqual([]);
    });
  });

  describe('buildRegistry', () => {
    it('builds a registry keyed by file name with base fields', () => {
      const files = [makeFile('notes.txt')];
      const service = new PyodideFileService(createRunner(files), TEST_OPTIONS);

      const registry = service.buildRegistry();

      expect(registry).toMatchObject({
        'notes.txt': {
          name: 'notes.txt',
          url: 'blob:notes.txt',
          mime_type: 'text/plain',
          size: 4,
        },
      });
    });

    it('merges resolver output into each entry', () => {
      const files = [makeFile('data.bin')];
      const service = new PyodideFileService(createRunner(files), TEST_OPTIONS);

      const registry = service.buildRegistry((f) => `/tmp/files/${f.name}`);

      expect(registry['data.bin'].path).toBe('/tmp/files/data.bin');
    });

    it('accepts an object from the path resolver and merges its keys', () => {
      const files = [makeFile('notes.txt')];
      const service = new PyodideFileService(createRunner(files), TEST_OPTIONS);

      const registry = service.buildRegistry(() => ({
        path: 'files/notes.txt',
        absolute_path: '/tmp/h5p_project/c1/files/notes.txt',
      }));

      expect(registry['notes.txt'].path).toBe('files/notes.txt');
      expect(registry['notes.txt'].absolute_path).toBe('/tmp/h5p_project/c1/files/notes.txt');
    });
  });

  describe('ensureFSPath / clearFSDirectory', () => {
    it('creates all missing path segments', () => {
      const existingPaths = new Set();
      const fs = {
        analyzePath: vi.fn((p) => ({ exists: existingPaths.has(p) })),
        mkdir: vi.fn((p) => existingPaths.add(p)),
      };
      const service = new PyodideFileService(createRunner(), TEST_OPTIONS);

      service.ensureFSPath(fs, '/tmp/h5p_project/c1/files');

      expect(fs.mkdir).toHaveBeenCalledWith('/tmp');
      expect(fs.mkdir).toHaveBeenCalledWith('/tmp/h5p_project');
      expect(fs.mkdir).toHaveBeenCalledWith('/tmp/h5p_project/c1');
      expect(fs.mkdir).toHaveBeenCalledWith('/tmp/h5p_project/c1/files');
    });

    it('does not re-create existing segments', () => {
      const existingPaths = new Set(['/tmp', '/tmp/h5p_project']);
      const fs = {
        analyzePath: vi.fn((p) => ({ exists: existingPaths.has(p) })),
        mkdir: vi.fn((p) => existingPaths.add(p)),
      };
      const service = new PyodideFileService(createRunner(), TEST_OPTIONS);

      service.ensureFSPath(fs, '/tmp/h5p_project/c1');

      expect(fs.mkdir).not.toHaveBeenCalledWith('/tmp');
      expect(fs.mkdir).not.toHaveBeenCalledWith('/tmp/h5p_project');
      expect(fs.mkdir).toHaveBeenCalledWith('/tmp/h5p_project/c1');
    });

    it('clearFSDirectory is a no-op when the directory does not exist', () => {
      const fs = {
        analyzePath: vi.fn(() => ({ exists: false })),
        readdir: vi.fn(),
        stat: vi.fn(),
        unlink: vi.fn(),
        rmdir: vi.fn(),
      };
      const service = new PyodideFileService(createRunner(), TEST_OPTIONS);

      service.clearFSDirectory(fs, '/tmp/nonexistent');

      expect(fs.readdir).not.toHaveBeenCalled();
    });

    it('clearFSDirectory removes files and nested directories', () => {
      const fs = {
        analyzePath: vi.fn((p) => ({ exists: p !== '/tmp/dir/subdir/child.txt' })),
        readdir: vi.fn((p) => {
          if (p === '/tmp/dir') return ['.', '..', 'file.txt', 'subdir'];
          if (p === '/tmp/dir/subdir') return ['.', '..', 'deep.txt'];
          return ['.', '..'];
        }),
        stat: vi.fn((p) => ({
          mode: p.endsWith('subdir') ? 0o040000 : 0o100644,
        })),
        isDir: vi.fn((mode) => (mode & 0o040000) === 0o040000),
        unlink: vi.fn(),
        rmdir: vi.fn(),
      };
      const service = new PyodideFileService(createRunner(), TEST_OPTIONS);

      service.clearFSDirectory(fs, '/tmp/dir');

      expect(fs.unlink).toHaveBeenCalledWith('/tmp/dir/file.txt');
      expect(fs.unlink).toHaveBeenCalledWith('/tmp/dir/subdir/deep.txt');
      expect(fs.rmdir).toHaveBeenCalledWith('/tmp/dir/subdir');
    });
  });

  describe('installRegistry', () => {
    it('writes files into the FS and exposes the registry via toPy', async () => {
      const existingPaths = new Set();
      const fs = {
        analyzePath: vi.fn((p) => ({ exists: existingPaths.has(p) })),
        mkdir: vi.fn((p) => existingPaths.add(p)),
        readdir: vi.fn(() => []),
        writeFile: vi.fn(),
        stat: vi.fn(),
        rmdir: vi.fn(),
        unlink: vi.fn(),
        isDir: vi.fn(() => false),
      };
      const pyRegistry = { destroy: vi.fn() };
      const pyodide = {
        FS: fs,
        toPy: vi.fn(() => pyRegistry),
        globals: { set: vi.fn() },
        runPythonAsync: vi.fn(async () => {}),
      };

      const service = new PyodideFileService(
        createRunner([makeFile('notes.txt')], pyodide, 'container_1'),
        TEST_OPTIONS,
      );

      await service.installRegistry();

      expect(fs.writeFile).toHaveBeenCalledWith(
        '/tmp/h5p_project/container_1/files/notes.txt',
        expect.any(Uint8Array),
      );
      expect(pyodide.globals.set).toHaveBeenCalledWith('h5p_files', pyRegistry);
      expect(pyRegistry.destroy).toHaveBeenCalled();
    });

    it('uses JSON fallback when toPy is unavailable', async () => {
      const existingPaths = new Set();
      const fs = {
        analyzePath: vi.fn((p) => ({ exists: existingPaths.has(p) })),
        mkdir: vi.fn((p) => existingPaths.add(p)),
        readdir: vi.fn(() => []),
        writeFile: vi.fn(),
        stat: vi.fn(),
        rmdir: vi.fn(),
        unlink: vi.fn(),
        isDir: vi.fn(() => false),
      };
      const pyodide = {
        FS: fs,
        toPy: undefined,
        globals: {},
        runPythonAsync: vi.fn(async () => {}),
      };

      const service = new PyodideFileService(
        createRunner([makeFile('notes.txt')], pyodide, 'c1'),
        TEST_OPTIONS,
      );

      await service.installRegistry();

      const pythonCode = pyodide.runPythonAsync.mock.calls
        .map(([code]) => code)
        .join('\n');

      expect(pythonCode).toContain('h5p_files');
      expect(pythonCode).toContain('json');
    });

    it('skips installation when pyodide is not ready', async () => {
      const service = new PyodideFileService(
        createRunner([makeFile('notes.txt')], undefined),
        TEST_OPTIONS,
      );

      await expect(service.installRegistry()).resolves.toBeUndefined();
    });

    it('skips global registry exposure when exposeRegistry is false', async () => {
      const existingPaths = new Set();
      const fs = {
        analyzePath: vi.fn((p) => ({ exists: existingPaths.has(p) })),
        mkdir: vi.fn((p) => existingPaths.add(p)),
        readdir: vi.fn(() => []),
        writeFile: vi.fn(),
        stat: vi.fn(),
        rmdir: vi.fn(),
        unlink: vi.fn(),
        isDir: vi.fn(() => false),
      };
      const pyRegistry = { destroy: vi.fn() };
      const pyodide = {
        FS: fs,
        toPy: vi.fn(() => pyRegistry),
        globals: { set: vi.fn() },
        runPythonAsync: vi.fn(async () => {}),
      };

      const service = new PyodideFileService(
        createRunner([makeFile('notes.txt')], pyodide, 'c1'),
        { ...TEST_OPTIONS, exposeRegistry: false },
      );

      await service.installRegistry();

      expect(pyodide.globals.set).not.toHaveBeenCalled();
    });
  });
});
