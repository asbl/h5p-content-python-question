import PyodideFileService from './pyodide-file-service';

/**
 * Handles uploaded image synchronization into the Pyodide filesystem.
 */
export default class PyodideImageService extends PyodideFileService {
  /**
   * @param {object} runner - Owning PyodideRunner instance.
   */
  constructor(runner) {
    super(runner, {
      managerMethod: 'getImageManager',
      entriesMethod: 'getImages',
      variableName: 'h5p_images',
      rootDirectoryName: 'h5p_images',
      sharedRootDirectoryName: 'h5p_project',
      relativeDirectory: 'images',
    });
  }

  /**
   * Returns the active image manager if uploads are enabled.
   * @returns {object|null} Image manager instance.
   */
  getImageManager() {
    return this.getManager();
  }

  /**
   * Returns the currently uploaded images.
   * @returns {object[]} Uploaded image entries.
   */
  getUploadedImages() {
    return this.getUploadedFiles();
  }

  /**
   * Returns the runner-specific root directory for uploaded images.
   * @returns {string} Absolute Pyodide root path.
   */
  getImageRootDirectory() {
    return this.getFileRootDirectory();
  }

  /**
   * Returns the image directory inside the runner root.
   * @returns {string} Absolute Pyodide image directory.
   */
  getImageDirectory() {
    return this.getFileDirectory();
  }

  /**
   * Builds the Python-visible image registry.
   * @param {function} [pathResolver] - Optional per-image path resolver.
   * @returns {Record<string, object>} Registry keyed by visible file name.
   */
  buildImageRegistry(pathResolver = () => null) {
    return this.buildRegistry(pathResolver);
  }

  /**
   * Returns the relative path exposed to learner code.
   * @param {string} [fileName] - Visible file name.
   * @returns {string} Relative image path.
   */
  getRelativeImagePath(fileName = '') {
    return this.getRelativePath(fileName);
  }

  /**
   * Writes uploaded images into the Pyodide FS and exposes the registry.
   * @returns {Promise<void>} Resolves once the registry is installed.
   */
  async installImageRegistry() {
    await this.installRegistry();
  }
}