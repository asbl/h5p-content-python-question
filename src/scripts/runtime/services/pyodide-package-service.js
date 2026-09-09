import {
  getImportedPythonPackages,
  getPythonPackageUrlMap,
  getPythonPackageDependencies,
  normalizePythonPackageEntries,
  splitPythonPackages,
} from '../../services/python-package-utils';
import { tPython } from '../../services/python-l10n';
import {
  PYODIDE_FETCH_CACHE_NAME,
  getActivePyodideL10n,
  getLoadedPyodidePackages,
  invalidateMiniworldsWheelCache,
  measurePyodidePerformance,
  queuePyodidePackageLoad,
  resolveLatestMiniworldsWheel,
  sharedPyodideRuntimeState,
} from './pyodide-runtime-service';
import { ensureFreshPyodideMiniworldsCache } from './pyodide-cache-freshness';

export {
  getImportedPythonPackages as getImportedPyodidePackages,
  normalizePythonPackageEntries as normalizePyodidePackageEntries,
  splitPythonPackages as splitPyodidePackages,
};

const MINIWORLDS_FAMILY_PACKAGES = ['miniworlds', 'miniworlds-data', 'miniworlds-robot', 'miniworlds-turtle'];
const MINIWORLDS_PACKAGE_IMPORTS = Object.freeze({
  miniworlds: 'miniworlds',
  'miniworlds-data': 'miniworlds_data',
  'miniworlds-robot': 'miniworlds_robot',
  'miniworlds-turtle': 'miniworlds_turtle',
});

/**
 * Returns whether a package should be installed by micropip.
 * @param {string} packageName - Normalized package name.
 * @returns {boolean} True when micropip owns this package.
 */
function isMicropipPackage(packageName) {
  return MINIWORLDS_FAMILY_PACKAGES.includes(packageName);
}

/**
 * Returns whether a Miniworlds-family package can already be imported.
 * This catches packages that were installed by a previous preload/run before
 * the JS loaded-package registry was updated.
 * @param {object} pyodide - Shared Pyodide instance.
 * @param {string} packageName - Normalized package name.
 * @returns {Promise<boolean>} True if Python can import the module.
 */
async function isMiniworldsPackageImportable(pyodide, packageName) {
  const importName = MINIWORLDS_PACKAGE_IMPORTS[packageName];

  if (!importName || typeof pyodide?.runPythonAsync !== 'function') {
    return false;
  }

  try {
    return Boolean(await pyodide.runPythonAsync(`
import importlib.util as _h5p_importlib_util
_h5p_importlib_util.find_spec(${JSON.stringify(importName)}) is not None
`));
  }
  catch (_) {
    return false;
  }
}

/**
 * Resolves a package argument for micropip.install.
 * @param {string} packageName - Normalized package name.
 * @param {Record<string, string>} packageUrls - Explicit package URL map.
 * @param {object} [options] - Resolution options.
 * @param {boolean} [options.forceFresh] - Whether cached wheel metadata should be dropped first.
 * @returns {Promise<string>} Package name or direct wheel URL.
 */
async function resolveMicropipInstallPackage(packageName, packageUrls, options = {}) {
  if (!isMicropipPackage(packageName)) {
    return packageName;
  }

  if (packageUrls[packageName]) {
    return packageUrls[packageName];
  }

  try {
    if (options.forceFresh) {
      invalidateMiniworldsWheelCache(packageName);
    }

    return await resolveLatestMiniworldsWheel(packageName);
  }
  catch (_) {
    // Preserve the established behavior if PyPI metadata is temporarily
    // unavailable. Micropip can still resolve the package itself.
    return packageName;
  }
}

/**
 * Reads the installed Miniworlds package version from Pyodide.
 * @param {object} pyodide - Shared Pyodide instance.
 * @returns {Promise<string|null>} Installed version, or null if unavailable.
 */
async function getMiniworldsPackageVersion(pyodide) {
  if (typeof pyodide?.runPythonAsync !== 'function') {
    return null;
  }

  try {
    const version = await pyodide.runPythonAsync(`
import importlib.metadata as _h5p_importlib_metadata
try:
  _h5p_importlib_metadata.version('miniworlds')
except Exception:
  None
`);
    return typeof version === 'string' && version !== '' ? version : null;
  }
  catch (_) {
    return null;
  }
}

/**
 * Reports the installed Miniworlds package version as a status message.
 * Uses the same non-captured output path as the Pyodide ready message, so it
 * never affects test-case comparisons.
 * @param {object} pyodide - Shared Pyodide instance.
 * @returns {Promise<void>} Resolves once the version was reported (or skipped).
 */
async function reportMiniworldsPackageVersion(pyodide) {
  const activeRuntime = sharedPyodideRuntimeState.activeRuntime;
  if (!activeRuntime?.outputHandler) {
    return;
  }

  const version = await getMiniworldsPackageVersion(pyodide);
  if (!version) {
    return;
  }

  activeRuntime.outputHandler(
    tPython(activeRuntime.l10n || getActivePyodideL10n(), 'miniworldsVersion', { version }),
    false,
  );
}

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
 * @param {object} [options] - Package loading options.
 * @returns {Promise<void>} Resolves once packages were installed.
 */
export async function installPyodideMicropipPackages(pyodide, packages = [], options = {}) {
  const loadedPackages = getLoadedPyodidePackages(pyodide);
  const requestedPackages = normalizePythonPackageEntries(packages);
  const packageUrls = getPythonPackageUrlMap(packages, options.packageUrls);
  const missingPyodideDependencies = requestedPackages
    .filter((packageName) => !isMicropipPackage(packageName))
    .filter((packageName) => !loadedPackages.has(packageName));
  let missingPackages = requestedPackages
    .filter((packageName) => isMicropipPackage(packageName))
    .filter((packageName) => !loadedPackages.has(packageName));

  if (missingPyodideDependencies.length) {
    await measurePyodidePerformance(
      `packages:${missingPyodideDependencies.join(',')}`,
      () => pyodide.loadPackage(missingPyodideDependencies),
    );
    markLoadedPyodidePackages(pyodide, missingPyodideDependencies);
  }

  if (!missingPackages.length) {
    return;
  }

  const importablePackages = [];
  for (const packageName of missingPackages) {
    if (await isMiniworldsPackageImportable(pyodide, packageName)) {
      importablePackages.push(packageName);
    }
  }

  if (importablePackages.length) {
    markLoadedPyodidePackages(pyodide, [
      ...importablePackages,
      ...importablePackages.flatMap((packageName) => getPythonPackageDependencies(packageName)),
    ]);
    missingPackages = missingPackages.filter((packageName) => !importablePackages.includes(packageName));
  }

  if (!missingPackages.length) {
    return;
  }

  await ensurePyodideMicropip(pyodide);

  const installPackages = await Promise.all(
    missingPackages.map((packageName) => resolveMicropipInstallPackage(packageName, packageUrls)),
  );
  const micropip = pyodide.pyimport('micropip');

  try {
    // Miniworlds dependencies are normalized and loaded through Pyodide's
    // package repository before this point. Letting micropip resolve them can
    // fetch CPython wheels from PyPI, which breaks native modules in Pyodide.
    try {
      await micropip.install.callKwargs(installPackages, { deps: false });
    }
    catch (error) {
      const retryablePackages = missingPackages.filter((packageName) => (
        isMicropipPackage(packageName) && !packageUrls[packageName]
      ));

      if (!retryablePackages.length) {
        throw error;
      }

      const retryPackages = await Promise.all(missingPackages.map((packageName) => (
        retryablePackages.includes(packageName)
          ? resolveMicropipInstallPackage(packageName, packageUrls, { forceFresh: true })
          : resolveMicropipInstallPackage(packageName, packageUrls)
      )));

      if (retryPackages.every((packageName, index) => packageName === installPackages[index])) {
        throw error;
      }

      await micropip.install.callKwargs(retryPackages, { deps: false });
    }
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

  if (missingPackages.includes('miniworlds')) {
    await reportMiniworldsPackageVersion(pyodide);
  }

  const miniworldsFamilyPackages = missingPackages.filter(
    (packageName) => MINIWORLDS_FAMILY_PACKAGES.includes(packageName),
  );

  if (miniworldsFamilyPackages.length) {
    // Fire-and-forget: this only prunes superseded wheel entries from the
    // persistent Cache Storage cache and must never delay code execution.
    ensureFreshPyodideMiniworldsCache({
      cacheName: PYODIDE_FETCH_CACHE_NAME,
      trackedPackageNames: miniworldsFamilyPackages,
      resolveWheelUrl: (packageName) => (
        packageUrls[packageName]
          ? Promise.resolve(packageUrls[packageName])
          : resolveLatestMiniworldsWheel(packageName)
      ),
    });
  }
}

/**
 * Loads all packages that are still missing from the shared Pyodide runtime.
 *
 * Runs behind {@link queuePyodidePackageLoad} because several runtime
 * instances (the editor's speculative preload, the reference-solution
 * runtime, the learner's test runtime) can each call this independently
 * around the same time. Without serialization, two callers could both see a
 * package as "missing" and both call `pyodide.loadPackage()` for it
 * concurrently, which corrupts Pyodide's dynamic linker state for that
 * package.
 * @param {object} pyodide - Shared Pyodide instance.
 * @param {Array<*>} [packages] - Desired packages.
 * @param {object} [options] - Package loading options.
 * @returns {Promise<void>} Resolves once all required packages are loaded.
 */
export async function loadMissingPyodidePackages(pyodide, packages = [], options = {}) {
  return queuePyodidePackageLoad(pyodide, async () => {
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
        await measurePyodidePerformance(
          `packages:${pyodidePackages.join(',')}`,
          () => pyodide.loadPackage(pyodidePackages),
        );
        markLoadedPyodidePackages(pyodide, pyodidePackages);
      }

      if (micropipPackages.length) {
        await measurePyodidePerformance(
          `micropip:${micropipPackages.join(',')}`,
          () => installPyodideMicropipPackages(pyodide, packages, options),
        );
      }
    }
    finally {
      sharedPyodideRuntimeState.packageLoadDepth--;
    }
  });
}
