import { describe, expect, it, vi } from 'vitest';

import PyodideImageService from '../src/scripts/runtime/services/pyodide-image-service.js';

function createRunner(images, pyodide) {
  return {
    pyodide,
    runtime: {
      codeContainer: {
        containerUID: 'container:1',
        getImageManager: () => ({
          isEnabled: () => true,
          getImages: () => images,
        }),
      },
    },
  };
}

describe('Pyodide image service', () => {
  it('builds the Python-visible image registry', () => {
    const service = new PyodideImageService(createRunner([
      {
        name: 'zelda.png',
        objectUrl: 'blob:zelda',
        mimeType: 'image/png',
        size: 7,
        bytes: new Uint8Array([1, 2, 3]),
      },
    ]));

    expect(service.buildImageRegistry((image) => ({
      path: service.getRelativeImagePath(image.name),
      absolute_path: `/tmp/${image.name}`,
    }))).toEqual({
      'zelda.png': {
        name: 'zelda.png',
        url: 'blob:zelda',
        path: 'images/zelda.png',
        mime_type: 'image/png',
        size: 7,
        absolute_path: '/tmp/zelda.png',
      },
    });
  });

  it('writes uploaded images into the pyodide filesystem and installs h5p_images', async () => {
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
    const pyRegistry = { destroy: vi.fn() };
    const pyodide = {
      FS: fs,
      toPy: vi.fn(() => pyRegistry),
      globals: { set: vi.fn() },
      runPythonAsync: vi.fn(async () => {}),
    };
    const service = new PyodideImageService(createRunner([
      {
        name: 'zelda.png',
        objectUrl: 'blob:zelda',
        mimeType: 'image/png',
        size: 7,
        bytes: new Uint8Array([1, 2, 3]),
      },
    ], pyodide));

    await service.installImageRegistry();

    expect(fs.writeFile).toHaveBeenCalledWith(
      '/tmp/h5p_project/container_1/images/zelda.png',
      expect.any(Uint8Array),
    );
    expect(pyodide.toPy).toHaveBeenCalledWith({
      'zelda.png': {
        name: 'zelda.png',
        url: 'blob:zelda',
        path: 'images/zelda.png',
        relative_path: 'images/zelda.png',
        absolute_path: '/tmp/h5p_project/container_1/images/zelda.png',
        mime_type: 'image/png',
        size: 7,
      },
    });
    expect(pyodide.globals.set).toHaveBeenCalledWith('h5p_images', pyRegistry);
    expect(pyRegistry.destroy).toHaveBeenCalled();
    expect(pyodide.runPythonAsync).toHaveBeenCalled();
  });
});