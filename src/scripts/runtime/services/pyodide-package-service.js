import {
  extractWheelPackageName,
  getImportedPythonPackages,
  getPythonPackageDependencies,
  normalizePythonPackageEntries,
  splitPythonPackages,
} from '../../services/python-package-utils';
import {
  getLoadedPyodidePackages,
  sharedPyodideRuntimeState,
} from './pyodide-runtime-service';

export {
  getImportedPythonPackages as getImportedPyodidePackages,
  normalizePythonPackageEntries as normalizePyodidePackageEntries,
  splitPythonPackages as splitPyodidePackages,
};

/**
 * Clears the shared set of already loaded packages.
 * @returns {void}
 */
export function resetLoadedPyodidePackages(pyodide = null) {
  if (pyodide) {
    getLoadedPyodidePackages(pyodide).clear();
    return;
  }

  sharedPyodideRuntimeState.loadedPackages.clear();
  sharedPyodideRuntimeState.pyodideInstanceState = new WeakMap();
}

/**
 * Marks packages as available in the shared Pyodide instance.
 * @param {Array<*>} [packages] - Package entries.
 * @returns {void}
 */
export function markLoadedPyodidePackages(pyodide, packages = []) {
  const loadedPackages = getLoadedPyodidePackages(pyodide);

  normalizePythonPackageEntries(packages).forEach((packageName) => {
    loadedPackages.add(packageName);
  });
}

/**
 * Ensures micropip itself is available inside Pyodide.
 * @param {object} pyodide - Shared Pyodide instance.
 * @returns {Promise<void>} Resolves once micropip is installed.
 */
export async function ensurePyodideMicropip(pyodide) {
  if (getLoadedPyodidePackages(pyodide).has('micropip')) {
    return;
  }

  await pyodide.loadPackage(['micropip']);
  markLoadedPyodidePackages(pyodide, ['micropip']);
}

/**
 * Installs packages that must be resolved through micropip.
 * @param {object} pyodide - Shared Pyodide instance.
 * @param {Array<*>} [packages] - Package entries.
 * @returns {Promise<void>} Resolves once packages were installed.
 */
export async function installPyodideMicropipPackages(pyodide, packages = []) {
  const loadedPackages = getLoadedPyodidePackages(pyodide);
  const missingPackages = normalizePythonPackageEntries(packages)
    .filter((packageName) => !loadedPackages.has(packageName));

  if (!missingPackages.length) {
    return;
  }

  await ensurePyodideMicropip(pyodide);

  const micropip = pyodide.pyimport('micropip');

  try {
    await micropip.install(missingPackages);
  }
  finally {
    if (typeof micropip.destroy === 'function') {
      micropip.destroy();
    }
  }

  markLoadedPyodidePackages(pyodide, [
    ...missingPackages,
    ...missingPackages.flatMap((packageName) => getPythonPackageDependencies(packageName)),
  ]);
}

/**
 * Loads all packages that are still missing from the shared Pyodide runtime.
 * @param {object} pyodide - Shared Pyodide instance.
 * @param {Array<*>} [packages] - Desired packages.
 * @returns {Promise<void>} Resolves once all required packages are loaded.
 */
export async function loadMissingPyodidePackages(pyodide, packages = []) {
  const loadedPackages = getLoadedPyodidePackages(pyodide);
  const missingPackages = normalizePythonPackageEntries(packages)
    .filter((packageName) => !loadedPackages.has(packageName));

  if (!missingPackages.length) {
    return;
  }

  const { pyodidePackages, micropipPackages } = splitPythonPackages(missingPackages);

  sharedPyodideRuntimeState.packageLoadDepth++;
  try {
    if (pyodidePackages.length) {
      await pyodide.loadPackage(pyodidePackages);
      markLoadedPyodidePackages(pyodide, pyodidePackages);

      // For URL wheel entries, also mark the extracted bare package name as
      // loaded.  Without this, auto-import detection (e.g. 'import miniworlds')
      // would find the bare name missing from loadedPackages and re-install the
      // package via micropip, which would then pull in deps like pygame-ce from
      // PyPI — a binary incompatible with pyodide's WASM environment.
      pyodidePackages.forEach((pkg) => {
        const bareName = extractWheelPackageName(pkg);
        if (bareName) {
          markLoadedPyodidePackages(pyodide, [bareName]);
        }
      });
    }

    if (micropipPackages.length) {
      await installPyodideMicropipPackages(pyodide, micropipPackages);
    }
  }
  finally {
    sharedPyodideRuntimeState.packageLoadDepth--;
  }
}