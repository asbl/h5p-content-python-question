/**
 * Curated Pyodide package sets selectable in the editor. A set expands into the
 * same normalized package list as individually selected packages, so package
 * loading, worker eligibility, Blockly package blocks, precache and early
 * preload all treat set packages exactly like explicit ones.
 *
 * Versions are pinned: Pyodide packages resolve through the pinned Pyodide
 * release's pyodide-lock.json (see pyodide-runtime-service.js), and PyPI wheels
 * (miniworlds family, GUI backends) through the pinned URLs in
 * pyodide-precache-service.js / python-gui-packages.js. Bumping a set therefore
 * only happens together with a library release.
 * @type {Record<string, string[]>}
 */
export const PYTHON_PACKAGE_SETS = Object.freeze({
  none: Object.freeze([]),
  basic: Object.freeze(['numpy']),
  data: Object.freeze(['numpy', 'pandas']),
  science: Object.freeze(['numpy', 'scipy', 'sympy']),
  graphics: Object.freeze(['numpy', 'pillow', 'matplotlib']),
  games: Object.freeze(['pygame-ce', 'miniworlds']),
});

/**
 * Normalizes a package set name from semantics.
 * @param {*} value - Raw select value.
 * @returns {string} A valid package set key.
 */
export function normalizePythonPackageSetName(value) {
  return Object.prototype.hasOwnProperty.call(PYTHON_PACKAGE_SETS, value) ? value : 'none';
}

/**
 * Returns the package names of one curated package set.
 * @param {*} value - Raw select value from semantics.
 * @returns {string[]} Package names (dependencies are added during normalization).
 */
export function getPythonPackageSetPackages(value) {
  return [...PYTHON_PACKAGE_SETS[normalizePythonPackageSetName(value)]];
}
