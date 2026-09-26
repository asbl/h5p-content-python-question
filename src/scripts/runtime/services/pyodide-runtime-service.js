/* global loadPyodide */

import { applyCspNonce } from '../../../../../H5P.LibCodeTools-6.0/src/scripts/services/csp';
import {
  getPythonL10nValue,
  tPython,
} from '../../services/python-l10n';
import { normalizePythonExecutionLimit } from '../../services/python-execution-limit';
import { PYTHON_IMPORT_PACKAGE_MAP, normalizePythonPackageEntries } from '../../services/python-package-utils';
import { getPyodideCompatibilityPreamble } from './pyodide-compat-service';
import {
  installPyodideFetchCache,
  invalidateMiniworldsWheelCache,
  measurePyodidePerformance,
  precachePyodideAssets,
  PYODIDE_FETCH_CACHE_NAME,
  resolveMiniworldsWheelUrl,
  shouldCachePyodideFetch,
} from './pyodide-precache-service';

export {
  invalidateMiniworldsWheelCache,
  measurePyodidePerformance,
  precachePyodideAssets,
  PYODIDE_FETCH_CACHE_NAME,
  resolveMiniworldsWheelUrl,
  shouldCachePyodideFetch,
};

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
const DEFAULT_PYODIDE_CDN_URL = 'https://cdn.jsdelivr.net/pyodide/v0.29.5/full/pyodide.js';

const UNSAFE_WARM_IMPORT_NAMES = Object.freeze([
  'pygame',
  'miniworlds',
  'miniworlds_data',
  'miniworlds_robot',
  'miniworlds_turtle',
]);

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
    applyCspNonce(script);
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

  state.compatibilityPromise = pyodide.runPythonAsync(getPyodideCompatibilityPreamble())
    .catch((error) => {
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
