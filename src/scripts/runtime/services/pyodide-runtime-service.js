/* global loadPyodide */

import {
  getPythonL10nValue,
  tPython,
} from '../../services/python-l10n';
import { normalizePythonExecutionLimit } from '../../services/python-execution-limit';
import { PYTHON_IMPORT_PACKAGE_MAP, normalizePythonPackageEntries } from '../../services/python-package-utils';
import { SDL_KEYBOARD_ELEMENT_ID } from './pyodide-sdl-constants';

/**
 * Maps an installable Pyodide package name back to the Python module name a
 * learner would import (e.g. 'pygame-ce' -> 'pygame'). Built once from the
 * inverse of PYTHON_IMPORT_PACKAGE_MAP.
 * @type {Record<string, string>}
 */
const PACKAGE_IMPORT_NAME_MAP = Object.entries(PYTHON_IMPORT_PACKAGE_MAP).reduce(
  (map, [importName, packageName]) => {
    if (!(packageName in map)) {
      map[packageName] = importName;
    }
    return map;
  },
  {},
);

/**
 * Shared Pyodide loader state across all runner instances.
 * Per-instance Pyodide state is stored in a WeakMap keyed by the Pyodide object.
 * @type {{loadPyodidePromise: Promise<*>|null, sharedPyodidePromise: Promise<*>|null, sharedPyodidePromises: Map<string, Promise<*>>, miniworldsWheelPromises: Map<string, Promise<string>>, inputOverridePromise: Promise<*>|null, compatibilityPromise: Promise<*>|null, activeRuntime: object|null, activeSDLCanvas: HTMLCanvasElement|null, activeSDLRunner: object|null, loadedPackages: Set<string>, pyodideInstanceState: WeakMap<object, {compatibilityPromise: Promise<*>|null, inputOverridePromise: Promise<*>|null, loadedPackages: Set<string>, packageLoadQueue: Promise<*>, executionQueue: Promise<*>}>, fetchCacheInstalled: boolean, fetchCacheCdnUrls: Set<string>, fetchCacheInflight: Map<string, Promise<Response>>}}
 */
export const sharedPyodideRuntimeState = {
  compatibilityPromise: null,
  loadPyodidePromise: null,
  sharedPyodidePromise: null,
  sharedPyodidePromises: new Map(),
  miniworldsWheelPromises: new Map(),
  inputOverridePromise: null,
  activeRuntime: null,
  activeSDLCanvas: null,
  activeSDLRunner: null,
  loadedPackages: new Set(),
  pyodideInstanceState: new WeakMap(),
  fetchCacheInstalled: false,
  fetchCacheCdnUrls: new Set(),
  fetchCacheInflight: new Map(),
  /** While > 0, Python stdout/stderr is routed to browser console only. */
  packageLoadDepth: 0,
};
export const PYODIDE_FETCH_CACHE_NAME = 'h5p-pythonquestion-pyodide-fetch-v3';
const MINIWORLDS_WHEEL_CACHE_STORAGE_KEY = 'h5p-pythonquestion-miniworlds-wheel-cache-v1';
const MINIWORLDS_WHEEL_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const DEFAULT_PYODIDE_CDN_URL = 'https://cdn.jsdelivr.net/pyodide/v0.29.3/full/pyodide.js';

/**
 * Builds the PyPI JSON metadata URL for one Miniworlds-family package.
 * @param {string} packageName - Normalized package name (e.g. 'miniworlds-robot').
 * @returns {string} PyPI JSON metadata URL.
 */
function pypiMetadataUrl(packageName) {
  return `https://pypi.org/pypi/${packageName}/json`;
}

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
const UNSAFE_WARM_IMPORT_NAMES = Object.freeze([
  'pygame',
  'miniworlds',
  'miniworlds_data',
  'miniworlds_robot',
  'miniworlds_turtle',
]);

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
 * Returns a fresh persisted Miniworlds wheel URL if one exists.
 * @param {string} packageName - Miniworlds-family package name.
 * @returns {string|null} Cached wheel URL.
 */
function readCachedMiniworldsWheelUrl(packageName) {
  const cached = readMiniworldsWheelStorageCache()?.[packageName];
  const checkedAt = Number(cached?.checkedAt) || 0;

  if (
    typeof cached?.url === 'string'
    && cached.url
    && Date.now() - checkedAt < MINIWORLDS_WHEEL_CACHE_MAX_AGE_MS
  ) {
    return cached.url;
  }

  return null;
}

/**
 * Persists a resolved Miniworlds wheel URL.
 * @param {string} packageName - Miniworlds-family package name.
 * @param {string} url - Resolved wheel URL.
 * @returns {void}
 */
function writeCachedMiniworldsWheelUrl(packageName, url) {
  const cache = readMiniworldsWheelStorageCache();

  cache[packageName] = {
    url,
    checkedAt: Date.now(),
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
 * Resolves the latest browser-compatible wheel for one Miniworlds-family
 * package from PyPI. The PyPI response is deliberately never persisted: a
 * fresh page session sees a newly published release, while its immutable
 * wheel remains cacheable.
 * @param {string} [packageName] - Miniworlds-family package name.
 * @returns {Promise<string>} Direct URL for the current wheel.
 */
export function resolveLatestMiniworldsWheel(packageName = 'miniworlds') {
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
 * Normalizes a Pyodide script URL or base directory into a script + index URL pair.
 * @param {string} [url] - Base URL or direct URL to pyodide.js.
 * @returns {{scriptUrl: string, indexURL: string}} Normalized Pyodide URLs.
 */
export function normalizePyodideScriptUrl(url = DEFAULT_PYODIDE_CDN_URL) {
  const trimmedUrl = String(url || '').trim();
  const candidateUrl = trimmedUrl || DEFAULT_PYODIDE_CDN_URL;
  const scriptCandidate = /\/pyodide\.js(?:[?#].*)?$/i.test(candidateUrl)
    ? candidateUrl
    : `${candidateUrl.replace(/\/$/, '')}/pyodide.js`;
  const baseHref = typeof window !== 'undefined' && window.location?.href
    ? window.location.href
    : 'https://cdn.jsdelivr.net/';
  const scriptUrl = new URL(scriptCandidate, baseHref).toString();

  return {
    scriptUrl,
    indexURL: new URL('./', scriptUrl).toString(),
  };
}

/**
 * Returns the mutable state associated with one concrete Pyodide instance.
 * @param {object} pyodide - Pyodide instance.
 * @returns {{compatibilityPromise: Promise<*>|null, inputOverridePromise: Promise<*>|null, loadedPackages: Set<string>, packageLoadQueue: Promise<*>, executionQueue: Promise<*>}} Instance state.
 */
export function getPyodideInstanceState(pyodide) {
  let instanceState = sharedPyodideRuntimeState.pyodideInstanceState.get(pyodide);

  if (!instanceState) {
    instanceState = {
      compatibilityPromise: null,
      inputOverridePromise: null,
      loadedPackages: new Set(),
      packageLoadQueue: Promise.resolve(),
      executionQueue: Promise.resolve(),
    };
    sharedPyodideRuntimeState.pyodideInstanceState.set(pyodide, instanceState);
  }

  return instanceState;
}

/**
 * Serializes code execution for one Pyodide instance and binds global IO
 * routing to the runtime that owns the queued execution.
 * @param {object} pyodide - Pyodide instance.
 * @param {object|null} runtime - Runtime that owns stdout/stderr/input.
 * @param {function(): Promise<*>} task - Execution task.
 * @returns {Promise<*>} Resolves/rejects with the task's outcome.
 */
export function queuePyodideExecution(pyodide, runtime, task) {
  const instanceState = getPyodideInstanceState(pyodide);
  const next = instanceState.executionQueue.catch(() => { }).then(async () => {
    const previousRuntime = sharedPyodideRuntimeState.activeRuntime;

    if (runtime) {
      setActivePyodideRuntime(runtime);
    }

    pyodide?.globals?.set?.('input_handler', (prompt) => getPyodideRuntimeInput(prompt, runtime));

    try {
      return await task();
    }
    finally {
      sharedPyodideRuntimeState.activeRuntime = previousRuntime;
    }
  });

  instanceState.executionQueue = next.catch(() => { });

  return next;
}

/**
 * Serializes package-loading work for one Pyodide instance. Concurrent
 * callers (e.g. the editor's speculative preload alongside a learner's Run
 * or the reference-solution runtime) must never call `pyodide.loadPackage()`
 * for the same package at the same time: Pyodide's dynamic linker is not
 * reentrant for a package that is already being linked, and a second
 * concurrent load can leave a native extension half-initialized (surfacing
 * as "dynamic module does not define module export function"). Queuing here
 * ensures each queued task only starts once the previous one has settled, so
 * later tasks see an up-to-date "already loaded" registry before deciding
 * whether to load anything at all.
 * @param {object} pyodide - Pyodide instance.
 * @param {function(): Promise<*>} task - Work to run once the queue is clear.
 * @returns {Promise<*>} Resolves/rejects with the task's outcome.
 */
export function queuePyodidePackageLoad(pyodide, task) {
  const instanceState = getPyodideInstanceState(pyodide);
  const next = instanceState.packageLoadQueue.catch(() => { }).then(task);

  instanceState.packageLoadQueue = next.catch(() => { });

  return next;
}

/**
 * Returns the package registry for one concrete Pyodide instance.
 * @param {object} pyodide - Pyodide instance.
 * @returns {Set<string>} Loaded package names.
 */
export function getLoadedPyodidePackages(pyodide) {
  return getPyodideInstanceState(pyodide).loadedPackages;
}

/**
 * Resets shared runtime state for tests or hard reloads.
 * @returns {void}
 */
export function resetSharedPyodideRuntimeState() {
  sharedPyodideRuntimeState.compatibilityPromise = null;
  sharedPyodideRuntimeState.loadPyodidePromise = null;
  sharedPyodideRuntimeState.sharedPyodidePromise = null;
  sharedPyodideRuntimeState.sharedPyodidePromises = new Map();
  sharedPyodideRuntimeState.miniworldsWheelPromises = new Map();
  sharedPyodideRuntimeState.inputOverridePromise = null;
  sharedPyodideRuntimeState.activeRuntime = null;
  sharedPyodideRuntimeState.activeSDLCanvas = null;
  sharedPyodideRuntimeState.activeSDLRunner = null;
  sharedPyodideRuntimeState.loadedPackages.clear();
  sharedPyodideRuntimeState.pyodideInstanceState = new WeakMap();
  sharedPyodideRuntimeState.fetchCacheInstalled = false;
  sharedPyodideRuntimeState.fetchCacheCdnUrls = new Set();
  sharedPyodideRuntimeState.fetchCacheInflight = new Map();
  sharedPyodideRuntimeState.packageLoadDepth = 0;
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
function installPyodideFetchCache(pyodideCdnUrl) {
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

    await Promise.all(MINIWORLDS_FAMILY_PACKAGES
      .filter((packageName) => packageNames.includes(packageName))
      .map(async (packageName) => {
        try {
          packageUrls.push(await resolveLatestMiniworldsWheel(packageName));
        }
        catch (_) {
          // The normal micropip path retains its existing fallback behavior.
        }
      }));

    await Promise.allSettled(packageUrls.map((url) => window.fetch(url)));
  }
  catch (_) {
    // Precache is opportunistic. The regular Pyodide loading path reports any
    // real download failures with its existing, localized error handling.
  }
}

/**
 * Returns the active runtime localization map.
 * @returns {object} Runtime localization map.
 */
export function getActivePyodideL10n() {
  return sharedPyodideRuntimeState.activeRuntime?.l10n || {};
}

/**
 * Stores the runtime that currently owns the shared Pyodide instance.
 * @param {object|null} runtime - Active runtime.
 * @returns {void}
 */
export function setActivePyodideRuntime(runtime) {
  sharedPyodideRuntimeState.activeRuntime = runtime;
}

/**
 * Keeps exactly one SDL canvas bound to the global canvas id expected by SDL.
 * @param {HTMLCanvasElement|null} canvas - Next active SDL canvas.
 * @returns {void}
 */
export function setActivePyodideSDLCanvas(canvas) {
  const state = sharedPyodideRuntimeState;

  if (state.activeSDLCanvas && state.activeSDLCanvas !== canvas && state.activeSDLCanvas.id === 'canvas') {
    state.activeSDLCanvas.id = `canvas-inactive-${H5P.createUUID()}`;
  }

  if (!canvas) {
    if (state.activeSDLCanvas?.id === 'canvas') {
      state.activeSDLCanvas.id = `canvas-inactive-${H5P.createUUID()}`;
    }
    state.activeSDLCanvas = null;
    return;
  }

  canvas.id = 'canvas';
  state.activeSDLCanvas = canvas;
}

/**
 * Ensures that the Pyodide loader script is present exactly once.
 * @param {string} url - Pyodide script URL.
 * @returns {Promise<void>} Resolves when loadPyodide is available.
 */
export function ensurePyodideScript(url) {
  const state = sharedPyodideRuntimeState;

  if (typeof window === 'undefined') {
    return Promise.reject(new Error(tPython(getActivePyodideL10n(), 'pyodideMissingWindow')));
  }

  if (window.loadPyodide) {
    return Promise.resolve();
  }

  if (state.loadPyodidePromise) {
    return state.loadPyodidePromise;
  }

  state.loadPyodidePromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.dataset.h5pPyodide = 'true';
    script.onload = () => {
      if (window.loadPyodide) {
        resolve();
        return;
      }

      reject(new Error(tPython(getActivePyodideL10n(), 'pyodideMissingApi')));
    };
    script.onerror = () => reject(new Error(tPython(getActivePyodideL10n(), 'pyodideScriptLoadFailed', { url })));
    document.head.appendChild(script);
  }).catch((error) => {
    state.loadPyodidePromise = null;
    throw error;
  });

  return state.loadPyodidePromise;
}

/**
 * Writes runtime output to the active runtime, or stderr if no runtime exists.
 * @param {string} text - Output text.
 * @param {object|boolean} [runtimeOrIsError] - Runtime override or legacy stderr flag.
 * @param {boolean} [isError] - Whether the text is stderr.
 * @returns {void}
 */
export function writePyodideRuntimeOutput(text, runtimeOrIsError = false, isError = false) {
  const activeRuntime = (runtimeOrIsError && typeof runtimeOrIsError === 'object')
    ? runtimeOrIsError
    : sharedPyodideRuntimeState.activeRuntime;
  const treatAsError = typeof runtimeOrIsError === 'boolean' ? runtimeOrIsError : isError;

  if (activeRuntime?.outputHandler) {
    // During package loading, show in console but suppress the popup dialog.
    activeRuntime.outputHandler(text, sharedPyodideRuntimeState.packageLoadDepth === 0);
    return;
  }

  if (treatAsError) {
    console.error(text);
  }
}

/**
 * Reads runtime input from the active runtime input handler.
 * @param {string} [promptText] - Prompt shown to the learner.
 * @param {object|null} [runtime] - Optional runtime override.
 * @returns {Promise<string>} User input string.
 */
export function getPyodideRuntimeInput(promptText = '', runtime = null) {
  const activeRuntime = runtime || sharedPyodideRuntimeState.activeRuntime;
  const l10n = activeRuntime?.l10n || getActivePyodideL10n();

  if (activeRuntime?.inputHandler) {
    return Promise.resolve(
      activeRuntime.inputHandler(promptText || getPythonL10nValue(l10n, 'pythonInputPrompt')),
    ).then((value) => (value == null ? '' : String(value)));
  }

  return Promise.resolve('');
}

/**
 * Installs the async input override once per shared Pyodide instance.
 * @param {object} pyodide - Shared Pyodide instance.
 * @returns {Promise<void>} Resolves when the override is installed.
 */
export function installPyodideInputOverride(pyodide) {
  const state = getPyodideInstanceState(pyodide);

  if (state.inputOverridePromise) {
    return state.inputOverridePromise;
  }

  pyodide.globals.set('input_handler', (prompt) => getPyodideRuntimeInput(prompt));

  state.inputOverridePromise = pyodide.runPythonAsync(`
import builtins

async def _h5p_input(prompt=''):
  return await input_handler(prompt)

builtins.input = _h5p_input
  `).catch((error) => {
    state.inputOverridePromise = null;
    throw error;
  });

  return state.inputOverridePromise;
}

/**
 * Installs Pyodide runtime compatibility helpers once.
 * @param {object} pyodide - Shared Pyodide instance.
 * @returns {Promise<void>} Resolves when compatibility helpers are installed.
 */
export function installPyodideRuntimeCompatibility(pyodide) {
  const state = getPyodideInstanceState(pyodide);

  if (state.compatibilityPromise) {
    return state.compatibilityPromise;
  }

  state.compatibilityPromise = pyodide.runPythonAsync(`
import asyncio
import ast as _h5p_ast
import builtins as _h5p_builtins
import os as _h5p_os
import sys as _h5p_sys
import time as _h5p_time

if not globals().get('_h5p_runtime_compat_installed', False):
  _h5p_os.environ['PYGAME_HIDE_SUPPORT_PROMPT'] = '1'
  # pygame-ce's emscripten SDL2 build otherwise binds its native keyboard
  # listener to the whole document, which swallows keystrokes meant for an
  # unrelated input() dialog no matter where DOM focus actually is. Scoping
  # it to the active SDL canvas element (see SDL_KEYBOARD_ELEMENT_ID) means
  # SDL only sees keys while the canvas itself has focus. Must be set before
  # the first pygame.init()/SDL_Init() call.
  _h5p_os.environ['SDL_EMSCRIPTEN_KEYBOARD_ELEMENT'] = '#${SDL_KEYBOARD_ELEMENT_ID}'
  _h5p_original_asyncio_run = asyncio.run
  _h5p_background_task = None
  _h5p_background_task_started = False
  _h5p_execution_limit_ms = 0
  _h5p_execution_limit_started = 0.0
  _h5p_execution_limit_message = 'Execution limit exceeded.'
  _h5p_original_import = _h5p_builtins.__import__
  _h5p_previous_trace = None

  def _h5p_execution_limit_trace(frame, event, arg):
    if _h5p_execution_limit_ms > 0 and event in ('call', 'line'):
      elapsed_ms = (_h5p_time.monotonic() - _h5p_execution_limit_started) * 1000
      if elapsed_ms > _h5p_execution_limit_ms:
        raise TimeoutError(_h5p_execution_limit_message)
    return _h5p_execution_limit_trace

  def _h5p_set_execution_limit(limit_ms, message):
    global _h5p_execution_limit_ms
    global _h5p_execution_limit_started
    global _h5p_execution_limit_message
    global _h5p_previous_trace

    _h5p_previous_trace = _h5p_sys.gettrace()
    _h5p_execution_limit_ms = max(int(limit_ms or 0), 0)
    _h5p_execution_limit_message = str(message)

    if _h5p_execution_limit_ms > 0:
      _h5p_execution_limit_started = _h5p_time.monotonic()
      _h5p_sys.settrace(_h5p_execution_limit_trace)
    else:
      _h5p_execution_limit_started = 0.0
      _h5p_sys.settrace(_h5p_previous_trace)

  def _h5p_clear_execution_limit():
    global _h5p_execution_limit_ms
    global _h5p_execution_limit_started
    global _h5p_previous_trace

    _h5p_sys.settrace(_h5p_previous_trace)
    _h5p_previous_trace = None
    _h5p_execution_limit_ms = 0
    _h5p_execution_limit_started = 0.0

  def _h5p_reset_background_task_state():
    global _h5p_background_task, _h5p_background_task_started
    _h5p_background_task = None
    _h5p_background_task_started = False

  def _h5p_consume_js_pygame_event_queue():
    try:
      from js import window as _h5p_window
    except Exception:
      return []

    queue = getattr(_h5p_window, '__h5pPygameEventQueue', None)
    if queue is None:
      return []

    events = []

    try:
      while int(getattr(queue, 'length', 0)) > 0:
        item = queue.shift()
        if item is None:
          continue

        if hasattr(item, 'to_py'):
          item = item.to_py()

        if isinstance(item, dict):
          events.append(item)
    except Exception:
      return events

    return events

  def _h5p_patch_pygame_event_get():
    try:
      import pygame
    except Exception:
      return

    if getattr(pygame.event, '_h5p_patched_get', False):
      return

    _h5p_original_pygame_event_get = pygame.event.get

    def _h5p_event_get(*args, **kwargs):
      events = list(_h5p_original_pygame_event_get(*args, **kwargs))

      for payload in _h5p_consume_js_pygame_event_queue():
        event_type_name = str(payload.get('type') or '')
        event_type = getattr(pygame, event_type_name, None)
        if event_type is None:
          continue

        attrs = payload.get('attrs') or {}
        try:
          attrs = dict(attrs)
        except Exception:
          attrs = {}

        try:
          events.append(pygame.event.Event(event_type, attrs))
        except Exception:
          continue

      return events

    pygame.event.get = _h5p_event_get
    pygame.event._h5p_patched_get = True

  def _h5p_import(name, globals=None, locals=None, fromlist=(), level=0):
    module = _h5p_original_import(name, globals, locals, fromlist, level)

    try:
      if str(name).split('.', 1)[0] == 'pygame':
        _h5p_patch_pygame_event_get()
    except Exception:
      pass

    return module

  def _h5p_has_background_task():
    return bool(
      _h5p_background_task_started
      and _h5p_background_task is not None
      and not _h5p_background_task.done()
    )

  async def _h5p_cancel_background_task():
    global _h5p_background_task, _h5p_background_task_started

    miniworlds_app = None

    try:
      import miniworlds
      running_app = getattr(miniworlds.App, 'running_app', None)
      miniworlds_app = getattr(miniworlds, 'App', None)
      if running_app is not None:
        running_app.quit()
    except Exception:
      pass

    task = _h5p_background_task
    if task is None:
      try:
        if miniworlds_app is not None and hasattr(miniworlds_app, 'reset'):
          miniworlds_app.reset()
      except Exception:
        pass
      _h5p_background_task_started = False
      return False

    if task.done():
      try:
        if miniworlds_app is not None and hasattr(miniworlds_app, 'reset'):
          miniworlds_app.reset()
      except Exception:
        pass
      _h5p_background_task = None
      _h5p_background_task_started = False
      return False

    task.cancel()
    try:
      await task
    except asyncio.CancelledError:
      pass
    except BaseException:
      pass

    try:
      if miniworlds_app is not None and hasattr(miniworlds_app, 'reset'):
        miniworlds_app.reset()
    except Exception:
      pass

    _h5p_background_task = None
    _h5p_background_task_started = False
    return True

  class _h5p_async_input_function_discoverer(_h5p_ast.NodeVisitor):
    def __init__(self, async_function_names):
      super().__init__()
      self.async_function_names = async_function_names
      self.contains_async_input = False
      self._nested_function_depth = 0

    def visit_FunctionDef(self, node):
      if self._nested_function_depth == 0 and node.name in self.async_function_names:
        self.contains_async_input = True
        return

      self._nested_function_depth += 1
      if self._nested_function_depth == 1:
        for child in node.body:
          self.visit(child)
      self._nested_function_depth -= 1

    def visit_AsyncFunctionDef(self, node):
      return

    def visit_Call(self, node):
      if (
        isinstance(node.func, _h5p_ast.Name)
        and (
          node.func.id == 'input'
          or node.func.id in self.async_function_names
        )
      ):
        self.contains_async_input = True
      self.generic_visit(node)

  class _h5p_await_input_transformer(_h5p_ast.NodeTransformer):
    def __init__(self, async_function_names):
      super().__init__()
      self.async_function_names = async_function_names
      self._inside_await = False

    def visit_FunctionDef(self, node):
      self.generic_visit(node)
      if node.name not in self.async_function_names:
        return node

      return _h5p_ast.copy_location(_h5p_ast.AsyncFunctionDef(
        name=node.name,
        args=node.args,
        body=node.body,
        decorator_list=node.decorator_list,
        returns=node.returns,
        type_comment=getattr(node, 'type_comment', None),
      ), node)

    def visit_Await(self, node):
      previous = self._inside_await
      self._inside_await = True
      self.generic_visit(node)
      self._inside_await = previous
      return node

    def visit_Call(self, node):
      self.generic_visit(node)
      if (
        not self._inside_await
        and isinstance(node.func, _h5p_ast.Name)
        and (
          node.func.id == 'input'
          or node.func.id in self.async_function_names
        )
      ):
        return _h5p_ast.copy_location(_h5p_ast.Await(value=node), node)
      return node

  def _h5p_discover_async_input_function_names(tree):
    discovered_async_function_names = set()
    changed = True

    while changed:
      changed = False
      for node in tree.body:
        if not isinstance(node, _h5p_ast.FunctionDef):
          continue
        if node.name in discovered_async_function_names:
          continue

        discoverer = _h5p_async_input_function_discoverer(discovered_async_function_names)
        for child in node.body:
          discoverer.visit(child)

        if discoverer.contains_async_input:
          discovered_async_function_names.add(node.name)
          changed = True

    return discovered_async_function_names

  def _h5p_build_async_input_module(source):
    source = '' if source is None else str(source)
    tree = _h5p_ast.parse(source, mode='exec')
    discovered_async_function_names = _h5p_discover_async_input_function_names(tree)
    transformed_body = _h5p_await_input_transformer(discovered_async_function_names).visit(tree).body

    if not transformed_body:
      transformed_body = [_h5p_ast.Pass()]

    async_main = _h5p_ast.AsyncFunctionDef(
      name='_h5p_main',
      args=_h5p_ast.arguments(
        posonlyargs=[],
        args=[],
        kwonlyargs=[],
        kw_defaults=[],
        defaults=[]
      ),
      body=transformed_body,
      decorator_list=[],
      returns=None,
      type_comment=None,
    )

    module = _h5p_ast.Module(body=[async_main], type_ignores=[])

    return _h5p_ast.fix_missing_locations(module)

  async def _h5p_run_with_async_input(source):
    module = _h5p_build_async_input_module(source)
    namespace = globals()
    exec(compile(module, '<h5p-learner-code>', 'exec'), namespace, namespace)
    return await namespace['_h5p_main']()

  async def _h5p_wrap_background_coro(coro):
    try:
      return await coro
    except SystemExit as error:
      # miniworlds exits with sys.exit(0) after normal shutdown.
      # In Pyodide background tasks this must not surface as uncaught error.
      code = getattr(error, 'code', 0)
      if code in (0, None):
        return code
      raise

  def _h5p_track_background_task(task):
    global _h5p_background_task, _h5p_background_task_started

    _h5p_background_task = task
    _h5p_background_task_started = True

    def _h5p_finalize_background_task(done_task):
      try:
        error = done_task.exception()
      except asyncio.CancelledError:
        return
      except BaseException:
        return

      if isinstance(error, SystemExit):
        code = getattr(error, 'code', 0)
        if code in (0, None):
          return

      if error is not None:
        try:
          done_task.get_loop().call_exception_handler({
            'message': 'Unhandled exception in H5P background task',
            'exception': error,
            'task': done_task,
          })
        except Exception:
          pass

    task.add_done_callback(_h5p_finalize_background_task)
    return task

  def _h5p_asyncio_run(main, *args, **kwargs):
    global _h5p_background_task, _h5p_background_task_started

    _h5p_background_task = None
    _h5p_background_task_started = False

    try:
      result = _h5p_original_asyncio_run(main, *args, **kwargs)
      if isinstance(result, asyncio.Task):
        return _h5p_track_background_task(result)
      return result
    except SystemExit as error:
      code = getattr(error, 'code', 0)
      if code in (0, None):
        return code
      raise
    except RuntimeError as error:
      try:
        loop = asyncio.get_running_loop()
      except RuntimeError:
        loop = None

      # If no running loop is available, this RuntimeError was unrelated and
      # should be surfaced to the caller.
      if loop is None:
        message = str(error)
        if (
          'event loop is running' in message
          or 'WebAssembly stack switching not supported' in message
        ):
          loop = asyncio.get_event_loop()
        else:
          raise

      task = loop.create_task(_h5p_wrap_background_coro(main))
      return _h5p_track_background_task(task)

  _h5p_builtins.__import__ = _h5p_import
  _h5p_patch_pygame_event_get()
  asyncio.run = _h5p_asyncio_run
  globals()['_h5p_runtime_compat_installed'] = True
`).catch((error) => {
    state.compatibilityPromise = null;
    throw error;
  });

  return state.compatibilityPromise;
}

/**
 * Resets the tracked background-task state inside Python.
 * @param {object} pyodide - Shared Pyodide instance.
 * @returns {Promise<void>} Resolves when the state was reset.
 */
export async function resetPyodideBackgroundTaskState(pyodide) {
  await installPyodideRuntimeCompatibility(pyodide);
  await pyodide.runPythonAsync('_h5p_reset_background_task_state()');
}

/**
 * Checks whether a background task is still running.
 * @param {object} pyodide - Shared Pyodide instance.
 * @returns {Promise<boolean>} True if a background task exists.
 */
export async function hasPyodideBackgroundTask(pyodide) {
  await installPyodideRuntimeCompatibility(pyodide);
  return Boolean(await pyodide.runPythonAsync('_h5p_has_background_task()'));
}

/**
 * Cancels the current background task if present.
 * @param {object} pyodide - Shared Pyodide instance.
 * @returns {Promise<boolean>} True if a task was cancelled.
 */
export async function cancelPyodideBackgroundTask(pyodide) {
  await installPyodideRuntimeCompatibility(pyodide);
  return Boolean(await pyodide.runPythonAsync('await _h5p_cancel_background_task()'));
}

/**
 * Applies the execution limit trace for the next Pyodide run.
 * @param {object} pyodide - Shared Pyodide instance.
 * @param {number} executionLimit - Maximum runtime in milliseconds.
 * @param {string} message - Localized timeout message.
 * @returns {Promise<void>} Resolves once the trace hook is installed.
 */
export async function setPyodideExecutionLimit(pyodide, executionLimit, message) {
  await installPyodideRuntimeCompatibility(pyodide);

  const safeLimit = normalizePythonExecutionLimit(executionLimit);

  if (safeLimit <= 0) {
    await clearPyodideExecutionLimit(pyodide);
    return;
  }

  await pyodide.runPythonAsync(`_h5p_set_execution_limit(${safeLimit}, ${JSON.stringify(String(message || 'Execution limit exceeded.'))})`);
}

/**
 * Removes the active execution limit trace hook.
 * @param {object} pyodide - Shared Pyodide instance.
 * @returns {Promise<void>} Resolves once the trace hook is removed.
 */
export async function clearPyodideExecutionLimit(pyodide) {
  await installPyodideRuntimeCompatibility(pyodide);
  await pyodide.runPythonAsync('_h5p_clear_execution_limit()');
}

/**
 * Pre-imports the Python modules for already-loaded Pyodide packages, so the
 * learner's first `import` statement hits Python's module cache instead of
 * paying import cost during the visible Run.
 * @param {object} pyodide - Shared Pyodide instance.
 * @param {Array<*>} [packages] - Package entries to warm.
 * @returns {Promise<void>} Resolves once the warm-up imports have settled.
 */
export async function warmPyodidePackageImports(pyodide, packages = []) {
  const importNames = normalizePythonPackageEntries(packages)
    .map((packageName) => PACKAGE_IMPORT_NAME_MAP[packageName])
    .filter((importName) => importName && !UNSAFE_WARM_IMPORT_NAMES.includes(importName));

  if (!importNames.length) {
    return;
  }

  await measurePyodidePerformance(`warm:${importNames.join(',')}`, () => pyodide.runPythonAsync(
    importNames.map((importName) => `
try:
    import ${importName}
except Exception:
    pass
`).join('\n'),
  ));
}

/**
 * Returns a shared Pyodide instance across all runner instances.
 * @param {object} [options] - Runtime options.
 * @param {string} [options.pyodideCdnUrl] - Optional CDN override.
 * @param {object|null} [runtime] - Active runtime for IO routing.
 * @returns {Promise<object>} Shared Pyodide instance.
 */
export async function getSharedPyodide(options = {}, runtime = null) {
  const state = sharedPyodideRuntimeState;
  const { scriptUrl, indexURL } = normalizePyodideScriptUrl(options.pyodideCdnUrl);
  const persistentPyodideCache = options.persistentPyodideCache !== false;

  if (runtime) {
    setActivePyodideRuntime(runtime);
  }

  if (persistentPyodideCache) {
    installPyodideFetchCache(scriptUrl);
  }

  await measurePyodidePerformance('script', () => ensurePyodideScript(scriptUrl));

  let sharedPyodidePromise = state.sharedPyodidePromises.get(indexURL);

  if (!sharedPyodidePromise) {
    sharedPyodidePromise = measurePyodidePerformance('initialize', () => loadPyodide({
      indexURL,
      stdout: (text) => writePyodideRuntimeOutput(text),
      stderr: (text) => writePyodideRuntimeOutput(text, true),
      stdin: () => '\n',
    })).catch((error) => {
      state.sharedPyodidePromises.delete(indexURL);
      if (state.sharedPyodidePromise === sharedPyodidePromise) {
        state.sharedPyodidePromise = null;
      }
      throw error;
    });
    state.sharedPyodidePromises.set(indexURL, sharedPyodidePromise);
    if (!state.sharedPyodidePromise) {
      state.sharedPyodidePromise = sharedPyodidePromise;
    }
  }

  const pyodide = await sharedPyodidePromise;

  await installPyodideInputOverride(pyodide);

  return pyodide;
}
