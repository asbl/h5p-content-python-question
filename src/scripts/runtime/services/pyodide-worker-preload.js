import workerSource from '../assets/pyodide-worker.txt';
import { getPyodideCompatibilityPreamble } from './pyodide-compat-service';
import { isPyodidePreloadEnabled } from './pyodide-preload-policy';

// One unused interpreter per page. A consumed worker is never put back here.
let preparedWorker = null;

/**
 * Normalizes per-run project files for the worker message. Path segments that
 * could escape the project directory are dropped; files are written below
 * /tmp/h5p_project/src inside the worker.
 * @param {Array<{name: string, code: string}>} [files] - Raw project files.
 * @returns {Array<{name: string, code: string}>} Sanitized project files.
 */
export function normalizePyodideWorkerFiles(files = []) {
  return (Array.isArray(files) ? files : [])
    .filter((file) => file && file.name)
    .map((file) => ({
      name: String(file.name).split('/')
        .filter((segment) => segment && segment !== '.' && segment !== '..')
        .join('/'),
      code: String(file.code || ''),
    }))
    .filter((file) => file.name);
}

/**
 * Returns the immutable initialization data used to match prepared workers.
 * Project files and learner code belong exclusively to the run message.
 * @param {object} [options] - Runtime configuration.
 * @param {string} [options.pyodideCdnUrl] - Pyodide script or base URL.
 * @param {string[]} [options.packages] - Packages to install before execution.
 * @param {Record<string, string>} [options.packageUrls] - Explicit package wheels.
 * @returns {object} Worker initialization data.
 */
export function getPyodideWorkerOptions({ pyodideCdnUrl = '', packages = [], packageUrls = {} } = {}) {
  const base = pyodideCdnUrl || 'https://cdn.jsdelivr.net/pyodide/v0.29.5/full/pyodide.js';
  const scriptUrl = new URL(/\/pyodide\.m?js(?:[?#].*)?$/.test(base)
    ? base : `${base.replace(/\/$/, '')}/pyodide.js`, globalThis.location?.href).href.replace(/pyodide\.js(?=[?#]|$)/, 'pyodide.mjs');
  return { scriptUrl, indexURL: new URL('./', scriptUrl).href,
    packages: Array.isArray(packages) ? packages.map(String) : [],
    packageUrls: { ...(packageUrls || {}) },
    compatibility: getPyodideCompatibilityPreamble() };
}

/**
 * Creates a module worker and its owned blob URL.
 * @returns {{worker: Worker, url: string}} Worker resources.
 */
export function createPyodideWorker() {
  const url = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
  try {
    return { worker: new Worker(url, { type: 'module' }), url };
  }
  catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

/**
 * Releases an unused prepared interpreter, including any pending startup.
 * @returns {void}
 */
export function discardPreparedPyodideWorker() {
  if (!preparedWorker) return;
  clearTimeout(preparedWorker.timer);
  preparedWorker.worker.terminate();
  URL.revokeObjectURL(preparedWorker.url);
  preparedWorker = null;
}

/**
 * Prepares one unused interpreter without executing learner code.
 * @param {object} [options] - Runtime configuration.
 * @returns {void}
 */
export function preparePyodideWorker(options = {}) {
  if (!isPyodidePreloadEnabled()) return;
  try {
    const data = getPyodideWorkerOptions(options);
    const key = JSON.stringify(data);
    if (preparedWorker?.key === key) return;
    discardPreparedPyodideWorker();
    const entry = { ...createPyodideWorker(), key };
    preparedWorker = entry;
    entry.timer = setTimeout(() => {
      if (preparedWorker === entry) discardPreparedPyodideWorker();
    }, 120000);
    entry.worker.onerror = () => {
      if (preparedWorker === entry) discardPreparedPyodideWorker();
    };
    entry.worker.onmessage = ({ data: message }) => {
      if (preparedWorker !== entry) return;
      if (message.type === 'ready') clearTimeout(entry.timer);
      if (message.type === 'error') discardPreparedPyodideWorker();
    };
    entry.worker.postMessage({ type: 'prepare', ...data });
  }
  catch (_) {
    // Speculative failures must not prevent a fresh attempt on Run.
    discardPreparedPyodideWorker();
  }
}

/**
 * Transfers a matching worker to a run, which must terminate it afterwards.
 * @param {object} data - Required initialization data.
 * @returns {object|null} Owned worker resources or null for a fresh startup.
 */
export function takePreparedPyodideWorker(data) {
  if (preparedWorker?.key !== JSON.stringify(data)) return null;
  const entry = preparedWorker;
  preparedWorker = null;
  clearTimeout(entry.timer);
  entry.worker.onerror = null;
  entry.worker.onmessage = null;
  return entry;
}
