/**
 * Builds one Python-visible registry entry for an uploaded image/sound.
 * Shared by the Pyodide and Skulpt runners so the exposed shape
 * (name/url/path/mime_type/size) cannot drift between backends.
 * @param {object} file - Uploaded file entry (name, objectUrl, mimeType, size, id?).
 * @param {string|object|null} [resolvedPath] - Resolved path info from a backend-specific resolver.
 * @returns {Record<string, unknown>} Python-visible registry entry.
 */
export function createAssetRegistryEntry(file, resolvedPath = null) {
  const normalizedPath = resolvedPath && typeof resolvedPath === 'object'
    ? resolvedPath
    : { path: resolvedPath };

  return {
    ...(file.id ? { id: file.id } : {}),
    name: file.name,
    url: file.objectUrl,
    path: null,
    mime_type: file.mimeType,
    size: file.size,
    ...normalizedPath,
  };
}

/**
 * Builds a Python-visible registry keyed by visible file name. Entries with
 * a stable id are additionally keyed by that id, so Blockly asset blocks can
 * reference a file even after it is renamed.
 * @param {object[]} files - Uploaded file entries.
 * @param {function} [pathResolver] - Optional per-file path resolver.
 * @returns {Record<string, object>} Registry keyed by visible file name (and id).
 */
export function buildAssetRegistry(files = [], pathResolver = () => null) {
  return files.reduce((registry, file) => {
    const entry = createAssetRegistryEntry(file, pathResolver(file));

    if (file.id) {
      registry[file.id] = entry;
    }
    registry[file.name] = entry;

    return registry;
  }, {});
}
