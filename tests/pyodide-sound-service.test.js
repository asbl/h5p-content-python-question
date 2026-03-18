import { describe, expect, it, vi } from 'vitest';

import PyodideSoundService from '../src/scripts/runtime/services/pyodide-sound-service.js';

/**
 * Creates a minimal runner mock for Pyodide sound service tests.
 * @param {object[]} sounds - Uploaded sound entries.
 * @param {object} [pyodide] - Optional Pyodide mock.
 * @returns {object} Runner mock.
 */
function createRunner(sounds, pyodide) {
  return {
    pyodide,
    runtime: {
      codeContainer: {
        containerUID: 'container:1',
        getSoundManager: () => ({
          isEnabled: () => true,
          getSounds: () => sounds,
        }),
      },
    },
  };
}

describe('Pyodide sound service', () => {
  it('builds the Python-visible sound registry', () => {
    const service = new PyodideSoundService(createRunner([
      {
        name: 'zeldasound.wav',
        objectUrl: 'blob:zelda-sound',
        mimeType: 'audio/wav',
        size: 7,
        bytes: new Uint8Array([1, 2, 3]),
      },
    ]));

    expect(service.buildSoundRegistry((sound) => ({
      path: service.getRelativeSoundPath(sound.name),
      absolute_path: `/tmp/${sound.name}`,
    }))).toEqual({
      'zeldasound.wav': {
        name: 'zeldasound.wav',
        url: 'blob:zelda-sound',
        path: 'sounds/zeldasound.wav',
        mime_type: 'audio/wav',
        size: 7,
        absolute_path: '/tmp/zeldasound.wav',
      },
    });
  });

  it('writes uploaded sounds into the pyodide filesystem and installs h5p_sounds', async () => {
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
    const service = new PyodideSoundService(createRunner([
      {
        name: 'zeldasound.wav',
        objectUrl: 'blob:zelda-sound',
        mimeType: 'audio/wav',
        size: 7,
        bytes: new Uint8Array([1, 2, 3]),
      },
    ], pyodide));

    await service.installSoundRegistry();

    expect(fs.writeFile).toHaveBeenCalledWith(
      '/tmp/h5p_project/container_1/sounds/zeldasound.wav',
      expect.any(Uint8Array),
    );
    expect(pyodide.toPy).toHaveBeenCalledWith({
      'zeldasound.wav': {
        name: 'zeldasound.wav',
        url: 'blob:zelda-sound',
        path: 'sounds/zeldasound.wav',
        relative_path: 'sounds/zeldasound.wav',
        absolute_path: '/tmp/h5p_project/container_1/sounds/zeldasound.wav',
        mime_type: 'audio/wav',
        size: 7,
      },
    });
    expect(pyodide.globals.set).toHaveBeenCalledWith('h5p_sounds', pyRegistry);
    expect(pyRegistry.destroy).toHaveBeenCalled();
  });

  it('returns no uploaded sounds when the sound manager is disabled', () => {
    const service = new PyodideSoundService({
      runtime: {
        codeContainer: {
          containerUID: 'container:1',
          getSoundManager: () => ({
            isEnabled: () => false,
            getSounds: () => [{ name: 'ignored.wav' }],
          }),
        },
      },
    });

    expect(service.getUploadedSounds()).toEqual([]);
    expect(service.buildSoundRegistry()).toEqual({});
  });

  it('sanitizes the container identifier when building sound directories', () => {
    const service = new PyodideSoundService(createRunner([], null));

    expect(service.getSoundRootDirectory()).toBe('/tmp/h5p_project/container_1');
    expect(service.getSoundDirectory()).toBe('/tmp/h5p_project/container_1/sounds');
  });
});