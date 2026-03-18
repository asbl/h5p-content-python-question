import {
  getImportedPythonPackages,
  getPythonPackageDependencies,
  normalizePythonPackageEntries,
  splitPythonPackages,
} from '../../services/python-package-utils';
import { sharedPyodideRuntimeState } from './pyodide-runtime-service';

export {
  getImportedPythonPackages as getImportedPyodidePackages,
  normalizePythonPackageEntries as normalizePyodidePackageEntries,
  splitPythonPackages as splitPyodidePackages,
};

/**
 * Clears the shared set of already loaded packages.
 * @returns {void}
 */
export function resetLoadedPyodidePackages() {
  sharedPyodideRuntimeState.loadedPackages.clear();
}

/**
 * Marks packages as available in the shared Pyodide instance.
 * @param {Array<*>} [packages] - Package entries.
 * @returns {void}
 */
export function markLoadedPyodidePackages(packages = []) {
  normalizePythonPackageEntries(packages).forEach((packageName) => {
    sharedPyodideRuntimeState.loadedPackages.add(packageName);
  });
}

/**
 * Ensures micropip itself is available inside Pyodide.
 * @param {object} pyodide - Shared Pyodide instance.
 * @returns {Promise<void>} Resolves once micropip is installed.
 */
export async function ensurePyodideMicropip(pyodide) {
  if (sharedPyodideRuntimeState.loadedPackages.has('micropip')) {
    return;
  }

  await pyodide.loadPackage(['micropip']);
  markLoadedPyodidePackages(['micropip']);
}

/**
 * Installs packages that must be resolved through micropip.
 * @param {object} pyodide - Shared Pyodide instance.
 * @param {Array<*>} [packages] - Package entries.
 * @returns {Promise<void>} Resolves once packages were installed.
 */
export async function installPyodideMicropipPackages(pyodide, packages = []) {
  const missingPackages = normalizePythonPackageEntries(packages)
    .filter((packageName) => !sharedPyodideRuntimeState.loadedPackages.has(packageName));

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

  markLoadedPyodidePackages([
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
  const missingPackages = normalizePythonPackageEntries(packages)
    .filter((packageName) => !sharedPyodideRuntimeState.loadedPackages.has(packageName));

  if (!missingPackages.length) {
    return;
  }

  const { pyodidePackages, micropipPackages } = splitPythonPackages(missingPackages);

  if (pyodidePackages.length) {
    await pyodide.loadPackage(pyodidePackages);
    markLoadedPyodidePackages(pyodidePackages);
  }

  if (micropipPackages.length) {
    await installPyodideMicropipPackages(pyodide, micropipPackages);
  }
}