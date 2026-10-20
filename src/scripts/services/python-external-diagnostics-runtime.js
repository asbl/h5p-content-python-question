import { getCdnPackageVersion } from '@libcodetools/scripts/services/cdn-package-versions';
import packageJson from '../../../package.json';

const RUFF_WASM_PACKAGE_NAME = '@astral-sh/ruff-wasm-web';

/**
 * Resolves a CDN version pinned in this library's own devDependencies. The
 * devDependency must be an exact pin; a semver range would let the local
 * install drift away from the version baked into the CDN URL.
 * @param {string} packageName Package name as listed in devDependencies.
 * @returns {string} Exact version string.
 */
function getPythonCdnPackageVersion(packageName) {
  return getCdnPackageVersion(packageName, {
    exact: true,
    devDependencies: packageJson.devDependencies,
  });
}

/**
 * Pyrefly has no official npm package; the vendored WASM build lives in this
 * library's public GitHub repository. The commit pins the exact build that
 * was vendored, so CDN content cannot change under a floating branch ref.
 * @type {string}
 */
const PYREFLY_VENDOR_COMMIT = '554d95d8fae15749ef39361ec383c04438c6283c';
const PYREFLY_VENDOR_PATH = 'vendor/pyrefly-wasm';
const PYREFLY_GITHUB_REPOSITORY = 'asbl/h5p-content-python-question';

/**
 * Default Ruff runtime URL. The WASM binary is resolved by the glue module
 * itself, relative to its own URL (import.meta.url).
 * @type {string}
 */
export const DEFAULT_RUFF_CDN_URL = `https://cdn.jsdelivr.net/npm/${RUFF_WASM_PACKAGE_NAME}@${getPythonCdnPackageVersion(RUFF_WASM_PACKAGE_NAME)}/ruff_wasm.js`;

/**
 * Default Pyrefly glue module URL. jsDelivr serves the plain git file; the
 * WASM binary is Git-LFS tracked, so it cannot be served from the same URL.
 * @type {string}
 */
export const DEFAULT_PYREFLY_CDN_URL = `https://cdn.jsdelivr.net/gh/${PYREFLY_GITHUB_REPOSITORY}@${PYREFLY_VENDOR_COMMIT}/${PYREFLY_VENDOR_PATH}/pyrefly_wasm.js`;

/**
 * Default Pyrefly WASM URL. GitHub's media CDN resolves Git-LFS content with
 * cross-origin access enabled.
 * @type {string}
 */
export const DEFAULT_PYREFLY_WASM_URL = `https://media.githubusercontent.com/media/${PYREFLY_GITHUB_REPOSITORY}/${PYREFLY_VENDOR_COMMIT}/${PYREFLY_VENDOR_PATH}/pyrefly_wasm_bg.wasm`;

const externalModulePromises = new Map();

/**
 * Loads one external ES module (wasm-bindgen glue code) via a native dynamic
 * import, so webpack leaves the URL to the browser instead of bundling it.
 * Modules are cached per URL; a failed load is dropped from the cache so a
 * later call can retry.
 * @param {string} url Absolute URL of the ES module.
 * @returns {Promise<object>} Module exports.
 */
export function loadExternalDiagnosticsModule(url) {
  const moduleUrl = String(url || '').trim();

  if (!moduleUrl) {
    return Promise.reject(new Error('Missing URL for the external diagnostics module.'));
  }

  if (!externalModulePromises.has(moduleUrl)) {
    const modulePromise = import(/* webpackIgnore: true */ moduleUrl);
    externalModulePromises.set(moduleUrl, modulePromise);
    modulePromise.catch(() => externalModulePromises.delete(moduleUrl));
  }

  return externalModulePromises.get(moduleUrl);
}

/**
 * Normalizes a configured Ruff runtime URL. Accepts either the glue module
 * URL or the directory that contains it.
 * @param {string} [url] Configured URL or directory.
 * @returns {string} Glue module URL.
 */
export function normalizeRuffRuntimeUrl(url = '') {
  const rawUrl = String(url || '').trim() || DEFAULT_RUFF_CDN_URL;

  if (/\.js(?:[?#].*)?$/i.test(rawUrl)) {
    return rawUrl;
  }

  return `${rawUrl.replace(/\/$/, '')}/ruff_wasm.js`;
}

/**
 * Normalizes configured Pyrefly runtime URLs. Accepts either the glue module
 * URL or the directory that contains glue module and WASM binary. The WASM
 * URL defaults to the GitHub media CDN for the default glue URL (jsDelivr
 * cannot serve the Git-LFS binary) and is derived from the glue module
 * directory otherwise, unless an explicit WASM URL is configured.
 * @param {string} [cdnUrl] Configured glue module URL or directory.
 * @param {string} [wasmUrl] Configured WASM binary URL.
 * @returns {{glueUrl: string, wasmUrl: string}} Normalized URLs.
 */
export function normalizePyreflyRuntimeUrls(cdnUrl = '', wasmUrl = '') {
  const rawCdnUrl = String(cdnUrl || '').trim() || DEFAULT_PYREFLY_CDN_URL;
  const glueUrl = /\.js(?:[?#].*)?$/i.test(rawCdnUrl)
    ? rawCdnUrl
    : `${rawCdnUrl.replace(/\/$/, '')}/pyrefly_wasm.js`;
  const explicitWasmUrl = String(wasmUrl || '').trim();

  if (explicitWasmUrl) {
    return { glueUrl, wasmUrl: explicitWasmUrl };
  }

  if (glueUrl === DEFAULT_PYREFLY_CDN_URL) {
    return { glueUrl, wasmUrl: DEFAULT_PYREFLY_WASM_URL };
  }

  const baseDir = glueUrl.slice(0, glueUrl.lastIndexOf('/') + 1);

  return { glueUrl, wasmUrl: `${baseDir}pyrefly_wasm_bg.wasm` };
}

/**
 * Resets the external module cache. Intended for tests.
 * @returns {void}
 */
export function resetExternalDiagnosticsModulesForTests() {
  externalModulePromises.clear();
}
