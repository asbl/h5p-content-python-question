import PyodideFileService from './pyodide-file-service';

/**
 * Handles uploaded sound synchronization into the Pyodide filesystem.
 */
export default class PyodideSoundService extends PyodideFileService {
  /**
   * @param {object} runner - Owning PyodideRunner instance.
   */
  constructor(runner) {
    super(runner, {
      managerMethod: 'getSoundManager',
      entriesMethod: 'getSounds',
      variableName: 'h5p_sounds',
      rootDirectoryName: 'h5p_sounds',
      sharedRootDirectoryName: 'h5p_project',
      relativeDirectory: 'sounds',
    });
  }

  /**
   * Returns the active sound manager if uploads are enabled.
   * @returns {object|null} Sound manager instance.
   */
  getSoundManager() {
    return this.getManager();
  }

  /**
   * Returns the currently uploaded sounds.
   * @returns {object[]} Uploaded sound entries.
   */
  getUploadedSounds() {
    return this.getUploadedFiles();
  }

  /**
   * Returns the runner-specific root directory for uploaded sounds.
   * @returns {string} Absolute Pyodide root path.
   */
  getSoundRootDirectory() {
    return this.getFileRootDirectory();
  }

  /**
   * Returns the sound directory inside the runner root.
   * @returns {string} Absolute Pyodide sound directory.
   */
  getSoundDirectory() {
    return this.getFileDirectory();
  }

  /**
   * Builds the Python-visible sound registry.
   * @param {function} [pathResolver] - Optional per-sound path resolver.
   * @returns {Record<string, object>} Registry keyed by visible file name.
   */
  buildSoundRegistry(pathResolver = () => null) {
    return this.buildRegistry(pathResolver);
  }

  /**
   * Returns the relative path exposed to learner code.
   * @param {string} [fileName] - Visible file name.
   * @returns {string} Relative sound path.
   */
  getRelativeSoundPath(fileName = '') {
    return this.getRelativePath(fileName);
  }

  /**
   * Writes uploaded sounds into the Pyodide FS and exposes the registry.
   * @returns {Promise<void>} Resolves once the registry is installed.
   */
  async installSoundRegistry() {
    await this.installRegistry();
  }
}