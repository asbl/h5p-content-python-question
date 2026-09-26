import { normalizePythonPackageEntries } from '../../services/python-package-utils';
import { normalizePyodideScriptUrl, sharedPyodideRuntimeState } from './pyodide-runtime-service';

export const PYODIDE_FETCH_CACHE_NAME = 'h5p-pythonquestion-pyodide-fetch-v3';
const MINIWORLDS_WHEEL_CACHE_STORAGE_KEY = 'h5p-pythonquestion-miniworlds-wheel-cache-v1';
const MINIWORLDS_WHEEL_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const PYODIDE_CORE_ASSETS = Object.freeze([
  'pyodide.js',
  'pyodide-lock.json',
  'pyodide.asm.js',
  'pyodide.asm.wasm',
  'python_stdlib.zip',
]);
const PYODIDE_PRECACHE_CORE_ASSETS = Object.freeze(
  PYODIDE_CORE_ASSETS.filter((assetName) => assetName !== 'pyodide.js'),
);
const MINIWORLDS_FAMILY_PACKAGES = Object.freeze([
  'miniworlds',
  'miniworlds-data',
  'miniworlds-robot',
  'miniworlds-turtle',
]);

/**
 * Miniworlds-family releases verified to work with this library's runtime.
 * Every learner run resolves this exact version instead of whatever PyPI
 * happens to publish next, so a new Miniworlds release never changes
 * behavior for already-published content until this map is updated and the
 * library itself is released. 'miniworlds-data' is pinned ahead of its first
 * PyPI release (tracked in the miniworlds-data repo's TODO.md); package
 * resolution fails the same way it already does today until that release is
 * published, and then starts working without any further change here.
 * @type {Record<string, string>}
 */
const MINIWORLDS_PINNED_VERSIONS = Object.freeze({
  miniworlds: '4.3.1.16',
  'miniworlds-data': '0.1.0',
  'miniworlds-robot': '0.1.4',
  'miniworlds-turtle': '0.1.0',
});

/**
 * Builds the PyPI JSON metadata URL for one Miniworlds-family package. Uses
 * the version-specific endpoint when a version is pinned, so the resolved
 * wheel URL never drifts to a newer release; otherwise falls back to the
 * project endpoint, which reports the current release.
 * @param {string} packageName - Normalized package name (e.g. 'miniworlds-robot').
 * @returns {string} PyPI JSON metadata URL.
 */
function pypiMetadataUrl(packageName) {
  const pinnedVersion = MINIWORLDS_PINNED_VERSIONS[packageName];

  return pinnedVersion
    ? `https://pypi.org/pypi/${packageName}/${pinnedVersion}/json`
    : `https://pypi.org/pypi/${packageName}/json`;
}

/**
 * Reads persisted Miniworlds wheel URL metadata.
 * @returns {Record<string, {url: string, checkedAt: number}>} Cached metadata.
 */
function readMiniworldsWheelStorageCache() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return {};
    }

    const raw = window.localStorage.getItem(MINIWORLDS_WHEEL_CACHE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  }
  catch (_) {
    return {};
  }
}

/**
 * Stores persisted Miniworlds wheel URL metadata.
 * @param {Record<string, {url: string, checkedAt: number}>} cache - Metadata to persist.
 * @returns {void}
 */
function writeMiniworldsWheelStorageCache(cache) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }

    window.localStorage.setItem(MINIWORLDS_WHEEL_CACHE_STORAGE_KEY, JSON.stringify(cache));
  }
  catch (_) {
    // Storage can be unavailable; the resolver simply falls back to PyPI.
  }
}

/**
 * Returns a fresh persisted Miniworlds wheel URL if one exists. A pinned
 * package's cache entry is reused indefinitely as long as it was resolved
 * for the currently pinned version (its wheel URL cannot change); bumping
 * the pin in {@link MINIWORLDS_PINNED_VERSIONS} therefore invalidates it
 * automatically. An unpinned package falls back to time-based freshness.
 * @param {string} packageName - Miniworlds-family package name.
 * @returns {string|null} Cached wheel URL.
 */
function readCachedMiniworldsWheelUrl(packageName) {
  const cached = readMiniworldsWheelStorageCache()?.[packageName];

  if (typeof cached?.url !== 'string' || !cached.url) {
    return null;
  }

  const pinnedVersion = MINIWORLDS_PINNED_VERSIONS[packageName];
  if (pinnedVersion) {
    return cached.version === pinnedVersion ? cached.url : null;
  }

  const checkedAt = Number(cached?.checkedAt) || 0;
  return Date.now() - checkedAt < MINIWORLDS_WHEEL_CACHE_MAX_AGE_MS ? cached.url : null;
}

/**
 * Persists a resolved Miniworlds wheel URL.
 * @param {string} packageName - Miniworlds-family package name.
 * @param {string} url - Resolved wheel URL.
 * @returns {void}
 */
function writeCachedMiniworldsWheelUrl(packageName, url) {
  const cache = readMiniworldsWheelStorageCache();
  const pinnedVersion = MINIWORLDS_PINNED_VERSIONS[packageName];

  cache[packageName] = {
    url,
    checkedAt: Date.now(),
    ...(pinnedVersion ? { version: pinnedVersion } : {}),
  };
  writeMiniworldsWheelStorageCache(cache);
}

/**
 * Removes persisted Miniworlds wheel URL metadata.
 * @param {string} packageName - Miniworlds-family package name.
 * @returns {void}
 */
function removeCachedMiniworldsWheelUrl(packageName) {
  const cache = readMiniworldsWheelStorageCache();

  if (!(packageName in cache)) {
    return;
  }

  delete cache[packageName];
  writeMiniworldsWheelStorageCache(cache);
}

/**
 * Records a named duration in the browser Performance timeline when available.
 * @param {string} name - Stable H5P performance measurement name.
 * @param {function(): Promise<*>} callback - Work to measure.
 * @returns {Promise<*>} Result of callback.
 */
export async function measurePyodidePerformance(name, callback) {
  const canMeasure = typeof performance !== 'undefined'
    && typeof performance.mark === 'function'
    && typeof performance.measure === 'function';
  const startMark = `h5p.pyodide.${name}:start`;
  const endMark = `h5p.pyodide.${name}:end`;

  if (canMeasure) {
    performance.mark(startMark);
  }

  try {
    return await callback();
  }
  finally {
    if (canMeasure) {
      performance.mark(endMark);
      performance.measure(`h5p.pyodide.${name}`, startMark, endMark);
    }
  }
}

/**
 * Resolves the browser-compatible wheel URL for one Miniworlds-family
 * package from PyPI, pinned to the version in
 * {@link MINIWORLDS_PINNED_VERSIONS} so every run installs the same,
 * already-verified release. A package without a pinned version still
 * resolves PyPI's current release, and that response is deliberately never
 * persisted so a fresh page session sees a newly published one, while its
 * immutable wheel remains cacheable.
 * @param {string} [packageName] - Miniworlds-family package name.
 * @returns {Promise<string>} Direct URL for the resolved wheel.
 */
export function resolveMiniworldsWheelUrl(packageName = 'miniworlds') {
  const state = sharedPyodideRuntimeState;
  const existingPromise = state.miniworldsWheelPromises.get(packageName);

  if (existingPromise) {
    return existingPromise;
  }

  const resolutionPromise = measurePyodidePerformance(`resolve:${packageName}`, async () => {
    if (typeof window === 'undefined' || typeof window.fetch !== 'function') {
      throw new Error('The browser cannot resolve the Miniworlds package.');
    }

    const cachedUrl = readCachedMiniworldsWheelUrl(packageName);
    if (cachedUrl) {
      return cachedUrl;
    }

    const response = await window.fetch(pypiMetadataUrl(packageName), { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Could not resolve the current ${packageName} release (${response.status}).`);
    }

    const metadata = await response.json();
    const version = String(metadata?.info?.version || '');
    const releases = metadata?.releases?.[version] || metadata?.urls || [];
    const wheel = releases.find((release) => (
      release?.packagetype === 'bdist_wheel' && /-py3-none-any\.whl$/i.test(release.filename || '')
    ));

    if (!wheel?.url) {
      throw new Error(`PyPI did not provide a browser-compatible ${packageName} wheel.`);
    }

    writeCachedMiniworldsWheelUrl(packageName, wheel.url);
    return wheel.url;
  }).catch((error) => {
    state.miniworldsWheelPromises.delete(packageName);
    throw error;
  });

  state.miniworldsWheelPromises.set(packageName, resolutionPromise);

  return resolutionPromise;
}

/**
 * Drops the cached wheel-resolution promise for one Miniworlds-family package.
 * @param {string} [packageName] - Miniworlds-family package name.
 * @returns {void}
 */
export function invalidateMiniworldsWheelCache(packageName = 'miniworlds') {
  sharedPyodideRuntimeState.miniworldsWheelPromises.delete(packageName);
  removeCachedMiniworldsWheelUrl(packageName);
}

/**
 * Returns whether a request URL should be persisted in the Pyodide cache.
 * @param {string} url - Absolute request URL.
 * @param {string} pyodideCdnUrl - Configured Pyodide CDN script URL.
 * @returns {boolean} True when the request should be cached.
 */
export function shouldCachePyodideFetch(url, pyodideCdnUrl) {
  try {
    const requestUrl = new URL(url);
    const pyodideOrigin = new URL(pyodideCdnUrl).origin;

    if (requestUrl.origin === pyodideOrigin) {
      return true;
    }

    // Cache only the immutable wheel artifact, never PyPI's package index or
    // JSON metadata. Micropip therefore resolves a newly published Miniworlds
    // release on PyPI, then uses its new versioned wheel URL. Existing wheels
    // remain safe to reuse from Cache Storage.
    return /\.whl$/i.test(requestUrl.pathname);
  }
  catch (_) {
    return false;
  }
}

/**
 * Installs a persistent fetch cache for Pyodide assets and wheel downloads.
 * @param {string} pyodideCdnUrl - Configured Pyodide CDN script URL.
 * @returns {void}
 */
export function installPyodideFetchCache(pyodideCdnUrl) {
  const state = sharedPyodideRuntimeState;

  try {
    state.fetchCacheCdnUrls.add(new URL(pyodideCdnUrl).toString());
  }
  catch (_) {
    // Invalid URLs are ignored by the cache predicate below.
  }

  if (state.fetchCacheInstalled) {
    return;
  }

  if (typeof window === 'undefined' || typeof window.fetch !== 'function' || typeof window.caches === 'undefined') {
    return;
  }

  const nativeFetch = window.fetch.bind(window);

  const cachedFetch = async (input, init = undefined) => {
    const request = new Request(input, init);

    if ((request.method || 'GET').toUpperCase() !== 'GET') {
      return nativeFetch(input, init);
    }

    const shouldCache = Array.from(state.fetchCacheCdnUrls).some((cdnUrl) => (
      shouldCachePyodideFetch(request.url, cdnUrl)
    ));

    if (!shouldCache) {
      return nativeFetch(input, init);
    }

    try {
      const cache = await window.caches.open(PYODIDE_FETCH_CACHE_NAME);
      const cachedResponse = await cache.match(request);

      if (cachedResponse) {
        return cachedResponse.clone();
      }

      const cacheKey = request.url;
      let fetchPromise = state.fetchCacheInflight.get(cacheKey);

      if (!fetchPromise) {
        fetchPromise = nativeFetch(input, init).then(async (response) => {
          if (response?.ok) {
            try {
              await cache.put(request, response.clone());
            }
            catch (_) {
              // Ignore cache write failures and return the network response.
            }
          }

          return response;
        }).finally(() => {
          state.fetchCacheInflight.delete(cacheKey);
        });
        state.fetchCacheInflight.set(cacheKey, fetchPromise);
        return fetchPromise;
      }

      const response = await fetchPromise;
      return response.clone();
    }
    catch (_) {
      return nativeFetch(input, init);
    }
  };

  window.fetch = cachedFetch;
  state.fetchCacheInstalled = true;
}

/**
 * Downloads Pyodide's core files and configured Pyodide package wheels into
 * the browser cache before the learner starts the program. Package metadata is
 * deliberately not prefetched: micropip must resolve current PyPI releases.
 * @param {object} [options] - Runtime options.
 * @param {string[]} [packages] - Additional packages inferred from source code.
 * @returns {Promise<void>} Resolves after all cacheable assets have settled.
 */
export async function precachePyodideAssets(options = {}, packages = []) {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') {
    return;
  }

  const { scriptUrl, indexURL } = normalizePyodideScriptUrl(options.pyodideCdnUrl);
  const packageNames = normalizePythonPackageEntries([
    ...(options.packages || []),
    ...packages,
  ]);

  if (options.persistentPyodideCache !== false) {
    installPyodideFetchCache(scriptUrl);
  }

  // Resolve Miniworlds wheel URLs in parallel with the core asset downloads.
  // The PyPI metadata lookup is independent of the Pyodide CDN, so it must not
  // wait behind the multi-megabyte wasm/stdlib downloads. Each lookup settles
  // to null on failure, so an early return below never leaves a rejection
  // unhandled and the normal micropip path retains its fallback behavior.
  const miniworldsWheelUrls = Promise.all(MINIWORLDS_FAMILY_PACKAGES
    .filter((packageName) => packageNames.includes(packageName))
    .map(async (packageName) => {
      try {
        return await resolveMiniworldsWheelUrl(packageName);
      }
      catch (_) {
        return null;
      }
    }));

  const coreAssetUrls = PYODIDE_PRECACHE_CORE_ASSETS.map((assetName) => new URL(assetName, indexURL).toString());
  const coreResponses = await Promise.allSettled(coreAssetUrls.map((url) => window.fetch(url)));
  const lockResponse = coreResponses[PYODIDE_PRECACHE_CORE_ASSETS.indexOf('pyodide-lock.json')];

  if (lockResponse?.status !== 'fulfilled' || !lockResponse.value?.ok) {
    return;
  }

  try {
    const lock = await lockResponse.value.clone().json();
    const packageUrls = packageNames
      .map((packageName) => lock?.packages?.[packageName]?.file_name)
      .filter(Boolean)
      .map((fileName) => new URL(fileName, indexURL).toString());

    for (const wheelUrl of await miniworldsWheelUrls) {
      if (wheelUrl) {
        packageUrls.push(wheelUrl);
      }
    }

    await Promise.allSettled(packageUrls.map((url) => window.fetch(url)));
  }
  catch (_) {
    // Precache is opportunistic. The regular Pyodide loading path reports any
    // real download failures with its existing, localized error handling.
  }
}
