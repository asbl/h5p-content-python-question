/**
 * @typedef {object} PyodideFileServiceOptions
 * @property {string} managerMethod - Code container accessor for the file manager.
 * @property {string} entriesMethod - Manager method that returns uploaded files.
 * @property {string} variableName - Python-visible registry variable name.
 * @property {string} rootDirectoryName - Stable top-level FS root directory.
 * @property {string} [sharedRootDirectoryName] - Shared project root directory.
 * @property {string} relativeDirectory - Runtime-relative directory.
 * @property {boolean} [exposeRegistry] - Whether the registry should be exposed to Python.
 */

/**
 * Shared base service for synchronizing uploaded files into the Pyodide runtime.
 */
export default class PyodideFileService {
  /**
   * @param {object} runner - Owning PyodideRunner instance.
   * @param {PyodideFileServiceOptions} options - Service configuration.
   */
  constructor(runner, options) {
    this.runner = runner;
    this.managerMethod = options.managerMethod;
    this.entriesMethod = options.entriesMethod;
    this.variableName = options.variableName;
    this.rootDirectoryName = options.rootDirectoryName;
    this.sharedRootDirectoryName = options.sharedRootDirectoryName || null;
    this.relativeDirectory = options.relativeDirectory;
    this.exposeRegistry = options.exposeRegistry !== false;
  }

  /**
   * Returns the active file manager if uploads are enabled.
   * @returns {object|null} File manager instance.
   */
  getManager() {
    return this.runner?.runtime?.codeContainer?.[this.managerMethod]?.() || null;
  }

  /**
   * Returns the currently uploaded files.
   * @returns {object[]} Uploaded file entries.
   */
  getUploadedFiles() {
    const manager = this.getManager();

    if (!manager?.isEnabled?.()) {
      return [];
    }

    const entries = this.getManagerEntries(manager);
    return Array.isArray(entries) ? entries : [];
  }

  /**
   * Resolves the uploaded entries from the active manager.
   * @param {object|null} manager - Active file manager instance.
   * @returns {object[]|unknown} Uploaded entries or an empty fallback.
   */
  getManagerEntries(manager) {
    return manager?.[this.entriesMethod]?.() || manager?.getFiles?.() || [];
  }

  /**
   * Returns the runner-specific root directory for uploaded files.
   * @returns {string} Absolute Pyodide root path.
   */
  getFileRootDirectory() {
    const rootDirectoryName = this.sharedRootDirectoryName || this.rootDirectoryName;
    return `/tmp/${rootDirectoryName}/${this.getContainerIdentifier()}`;
  }

  /**
   * Returns a filesystem-safe container identifier.
   * @returns {string} Sanitized container identifier.
   */
  getContainerIdentifier() {
    return String(this.runner?.runtime?.codeContainer?.containerUID || 'default')
      .replace(/[^A-Za-z0-9_-]/g, '_');
  }

  /**
   * Returns the asset directory inside the runner root.
   * @returns {string} Absolute Pyodide asset directory.
   */
  getFileDirectory() {
    return `${this.getFileRootDirectory()}/${this.relativeDirectory}`;
  }

  /**
   * Ensures that every path segment exists.
   * @param {object} fs - Pyodide FS implementation.
   * @param {string} path - Absolute path to create.
   * @returns {void}
   */
  ensureFSPath(fs, path) {
    const segments = String(path)
      .split('/')
      .filter((segment) => segment !== '');

    let currentPath = '';

    segments.forEach((segment) => {
      currentPath += `/${segment}`;

      if (!fs.analyzePath(currentPath).exists) {
        fs.mkdir(currentPath);
      }
    });
  }

  /**
   * Checks whether an FS stat result points to a directory.
   * @param {object} fs - Pyodide FS implementation.
   * @param {object} stat - FS stat result.
   * @returns {boolean} True if the entry is a directory.
   */
  isFSDirectory(fs, stat) {
    if (typeof fs.isDir === 'function') {
      return fs.isDir(stat.mode);
    }

    return (stat.mode & 0o040000) === 0o040000;
  }

  /**
   * Removes all nested entries below a directory.
   * @param {object} fs - Pyodide FS implementation.
   * @param {string} path - Directory to clear.
   * @returns {void}
   */
  clearFSDirectory(fs, path) {
    if (!fs.analyzePath(path).exists) {
      return;
    }

    fs.readdir(path)
      .filter((entry) => entry !== '.' && entry !== '..')
      .forEach((entry) => {
        const entryPath = `${path}/${entry}`;
        const stat = fs.stat(entryPath);

        if (this.isFSDirectory(fs, stat)) {
          this.clearFSDirectory(fs, entryPath);
          fs.rmdir(entryPath);
          return;
        }

        fs.unlink(entryPath);
      });
  }

  /**
   * Builds the Python-visible registry.
   * @param {function} [pathResolver] - Optional per-file path resolver.
   * @returns {Record<string, object>} Registry keyed by visible file name.
   */
  buildRegistry(pathResolver = () => null) {
    return this.getUploadedFiles().reduce((registry, file) => {
      registry[file.name] = this.createRegistryEntry(file, pathResolver(file));

      return registry;
    }, {});
  }

  /**
   * Creates one registry entry for an uploaded file.
   * @param {object} file - Uploaded file entry.
   * @param {string|object|null} resolvedPath - Resolved path information.
   * @returns {Record<string, unknown>} Python-visible registry entry.
   */
  createRegistryEntry(file, resolvedPath) {
    return {
      name: file.name,
      url: file.objectUrl,
      path: null,
      mime_type: file.mimeType,
      size: file.size,
      ...this.normalizeResolvedEntry(resolvedPath),
    };
  }

  /**
   * Normalizes path resolver output into a registry fragment.
   * @param {string|object|null} resolvedPath - Resolved path information.
   * @returns {object} Normalized registry fragment.
   */
  normalizeResolvedEntry(resolvedPath) {
    if (resolvedPath && typeof resolvedPath === 'object') {
      return resolvedPath;
    }

    return { path: resolvedPath };
  }

  /**
   * Returns the relative path exposed to learner code.
   * @param {string} [fileName] - Visible file name.
   * @returns {string} Relative runtime path.
   */
  getRelativePath(fileName = '') {
    return `${this.relativeDirectory}/${fileName}`;
  }

  /**
   * Moves Pyodide's current working directory to the file root.
   * @param {string} path - Target working directory.
   * @returns {Promise<void>} Resolves after chdir completed.
   */
  async setWorkingDirectory(path) {
    if (!this.runner.pyodide) {
      return;
    }

    const directory = JSON.stringify(String(path || ''));

    await this.runner.pyodide.runPythonAsync(`
import os as _h5p_os
_h5p_os.makedirs(${directory}, exist_ok=True)
_h5p_os.chdir(${directory})
del _h5p_os
`);
  }

  /**
   * Writes uploaded files into the Pyodide FS and exposes the registry.
   * @returns {Promise<void>} Resolves once the registry is installed.
   */
  async installRegistry() {
    if (!this.runner.pyodide) {
      return;
    }

    const fs = this.runner.pyodide.FS;
    const fileRootDirectory = this.getFileRootDirectory();
    const fileDirectory = this.getFileDirectory();

    if (fs) {
      this.ensureFSPath(fs, fileDirectory);
      this.clearFSDirectory(fs, fileDirectory);
    }

    const registry = this.buildRegistry((file) => {
      if (!fs) {
        return {
          path: null,
          relative_path: null,
          absolute_path: null,
        };
      }

      const relativePath = this.getRelativePath(file.name);
      const absolutePath = `${fileDirectory}/${file.name}`;
      fs.writeFile(absolutePath, file.bytes);

      return {
        path: relativePath,
        relative_path: relativePath,
        absolute_path: absolutePath,
      };
    });

    if (fs) {
      await this.setWorkingDirectory(fileRootDirectory);
    }

    if (this.exposeRegistry) {
      await this.installGlobalRegistry(registry);
    }
  }

  /**
   * Exposes the registry to Python either via toPy or a JSON fallback.
   * @param {Record<string, object>} registry - Registry to expose.
   * @returns {Promise<void>} Resolves once globals were updated.
   */
  async installGlobalRegistry(registry) {
    if (typeof this.runner.pyodide.toPy === 'function') {
      const pyRegistry = this.runner.pyodide.toPy(registry);

      try {
        this.runner.pyodide.globals.set(this.variableName, pyRegistry);
      }
      finally {
        pyRegistry.destroy?.();
      }

      return;
    }

    const payload = JSON.stringify(JSON.stringify(registry));
    await this.runner.pyodide.runPythonAsync(`
import json as _h5p_json
${this.variableName} = _h5p_json.loads(${payload})
del _h5p_json
`);
  }
}