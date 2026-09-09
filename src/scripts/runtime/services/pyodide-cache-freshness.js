import libraryJson from '../../../../library.json';

/**
 * Current H5P.PythonQuestion library version, baked in at build time.
 * A version change (i.e. a plugin update) forces an immediate freshness
 * check regardless of the regular check interval.
 * @type {string}
 */
export const PYODIDE_LIBRARY_VERSION = `${libraryJson.majorVersion}.${libraryJson.minorVersion}.${libraryJson.patchVersion}`;

const CACHE_STATE_STORAGE_KEY = 'h5p-pythonquestion-pyodide-cache-state-v1';
const FRESHNESS_CHECK_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Reads persisted cache-freshness state from localStorage.
 * @returns {{libraryVersion: string, packageVersions: Record<string, string>, lastCheckedAt: number}|null} Stored state, or null if unavailable/unset.
 */
export function readPyodideCacheState() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null;
    }

    const raw = window.localStorage.getItem(CACHE_STATE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  }
  catch (_) {
    return null;
  }
}

/**
 * Persists cache-freshness state to localStorage.
 * @param {{libraryVersion: string, packageVersions: Record<string, string>, lastCheckedAt: number}} state - State to persist.
 * @returns {void}
 */
export function writePyodideCacheState(state) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }

    window.localStorage.setItem(CACHE_STATE_STORAGE_KEY, JSON.stringify(state));
  }
  catch (_) {
    // Storage may be unavailable (private browsing quota, etc). The
    // freshness check simply runs again on the next visit.
  }
}

/**
 * Decides whether a freshness check against PyPI should run now: either the
 * plugin was updated since the last recorded state, or the check interval
 * has elapsed.
 * @param {{libraryVersion: string, lastCheckedAt: number}|null} state - Previously persisted state.
 * @param {string} libraryVersion - Current library version.
 * @param {number} [now] - Current timestamp in ms, injectable for tests.
 * @returns {boolean} True if a check should run.
 */
export function shouldRunPyodideFreshnessCheck(state, libraryVersion, now = Date.now()) {
  if (!state || state.libraryVersion !== libraryVersion) {
    return true;
  }

  const lastCheckedAt = Number(state.lastCheckedAt) || 0;
  return (now - lastCheckedAt) >= FRESHNESS_CHECK_INTERVAL_MS;
}

/**
 * Removes cached wheel responses for one package that no longer match its
 * current PyPI wheel URL, so a superseded release cannot be served stale.
 * @param {string} cacheName - Cache Storage cache name.
 * @param {string} packageName - Miniworlds-family package name.
 * @param {string} currentWheelUrl - The package's current wheel URL.
 * @returns {Promise<void>} Resolves once outdated entries are removed.
 */
export async function purgeOutdatedPyodideWheelCacheEntries(cacheName, packageName, currentWheelUrl) {
  if (typeof window === 'undefined' || typeof window.caches === 'undefined') {
    return;
  }

  try {
    const cache = await window.caches.open(cacheName);
    const requests = await cache.keys();
    const wheelPrefix = `${packageName.replaceAll('-', '_')}-`;

    await Promise.all(requests.map(async (request) => {
      if (request.url === currentWheelUrl) {
        return;
      }

      const fileName = new URL(request.url).pathname.split('/').pop() || '';

      if (!fileName.startsWith(wheelPrefix) || !fileName.endsWith('.whl')) {
        return;
      }

      await cache.delete(request);
    }));
  }
  catch (_) {
    // Best-effort cleanup; a failure here must never block package loading.
  }
}

/**
 * Ensures the persistent Pyodide asset cache does not silently keep serving
 * a superseded Miniworlds-family wheel. Runs at most once per freshness
 * interval, or immediately after a plugin update.
 * @param {object} options - Options.
 * @param {string} options.cacheName - Cache Storage cache name.
 * @param {string[]} options.trackedPackageNames - Miniworlds-family packages currently in use.
 * @param {function(string): Promise<string>} options.resolveWheelUrl - Resolves a package's current wheel URL.
 * @param {string} [options.libraryVersion] - Current library version.
 * @param {number} [options.now] - Current timestamp in ms, injectable for tests.
 * @returns {Promise<void>} Resolves once the check has settled.
 */
export async function ensureFreshPyodideMiniworldsCache({
  cacheName,
  trackedPackageNames,
  resolveWheelUrl,
  libraryVersion = PYODIDE_LIBRARY_VERSION,
  now = Date.now(),
}) {
  if (!trackedPackageNames?.length) {
    return;
  }

  const state = readPyodideCacheState();

  if (!shouldRunPyodideFreshnessCheck(state, libraryVersion, now)) {
    return;
  }

  const packageVersions = { ...(state?.packageVersions || {}) };

  await Promise.all(trackedPackageNames.map(async (packageName) => {
    try {
      const wheelUrl = await resolveWheelUrl(packageName);

      if (!wheelUrl) {
        return;
      }

      if (packageVersions[packageName] && packageVersions[packageName] !== wheelUrl) {
        await purgeOutdatedPyodideWheelCacheEntries(cacheName, packageName, wheelUrl);
      }

      packageVersions[packageName] = wheelUrl;
    }
    catch (_) {
      // Keep the previously recorded version; try resolving it again next time.
    }
  }));

  writePyodideCacheState({
    libraryVersion,
    packageVersions,
    lastCheckedAt: now,
  });
}
