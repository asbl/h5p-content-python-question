import PyodideFileService from './pyodide-file-service';

const textEncoder = new TextEncoder();

/**
 * Synchronizes Python source files from the current project workspace into
 * Pyodide's filesystem and exposes them on sys.path for local imports.
 */
export default class PyodideSourceService extends PyodideFileService {
  /**
   * @param {object} runner - Owning PyodideRunner instance.
   */
  constructor(runner) {
    super(runner, {
      managerMethod: 'getEditorManager',
      entriesMethod: 'getWorkspaceFiles',
      variableName: 'h5p_sources',
      rootDirectoryName: 'h5p_project',
      sharedRootDirectoryName: 'h5p_project',
      relativeDirectory: 'src',
      exposeRegistry: false,
    });
  }

  /**
   * Returns the current runtime workspace snapshot.
   * @returns {object|null} Runtime workspace snapshot.
   */
  getProjectSnapshot() {
    return this.runner?.runtime?.getProjectSnapshot?.() || null;
  }

  /**
   * Returns the workspace files as writable Pyodide file entries.
   * @returns {object[]} Source file entries.
   */
  getUploadedFiles() {
    const projectSnapshot = this.getProjectSnapshot();

    if (!projectSnapshot?.files?.length) {
      return [];
    }

    return projectSnapshot.files.map((file) => {
      const code = String(file.code || '');
      const bytes = textEncoder.encode(code);

      return {
        name: file.name,
        bytes,
        size: bytes.byteLength,
        mimeType: 'text/x-python',
        objectUrl: null,
      };
    });
  }

  /**
   * Returns the shared source directory inside the project root.
   * @returns {string} Absolute source directory.
   */
  getSourceDirectory() {
    return this.getFileDirectory();
  }

  /**
   * Writes source files and exposes the source directory on sys.path.
   * @returns {Promise<void>} Resolves once source files are available.
   */
  async installSourceRegistry() {
    await this.installRegistry();

    if (!this.runner.pyodide) {
      return;
    }

    const sourceDirectory = JSON.stringify(this.getSourceDirectory());

    await this.runner.pyodide.runPythonAsync(`
import sys as _h5p_sys
if ${sourceDirectory} not in _h5p_sys.path:
    _h5p_sys.path.insert(0, ${sourceDirectory})
del _h5p_sys
`);
  }
}