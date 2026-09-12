import { applyCspNonce } from '../../../../../H5P.LibCodeTools-6.0/src/scripts/services/csp';

export const DEFAULT_SKULPT_CDN_URL = 'https://cdn.jsdelivr.net/gh/StriveMath/p5-python-web@0.0.15/lib/skulpt.min.js';
export const ALTERNATIVE_SKULPT_CDN_URL = 'https://rawcdn.githack.com/StriveMath/p5-python-web/0.0.15/lib/skulpt.min.js';
export const OFFICIAL_SKULPT_CDN_URL = 'https://cdn.jsdelivr.net/npm/skulpt@1.2.0/dist/skulpt.min.js';

const sharedSkulptRuntimeState = {
  loadPromise: null,
};

/**
 * Derives the Skulpt runtime and stdlib script URLs from a configured base or direct URL.
 * @param {string} [url] - Configured Skulpt base directory or direct skulpt.min.js URL.
 * @returns {{scriptUrl: string, stdlibUrl: string}} Resolved script URLs.
 */
export function resolveSkulptRuntimeUrls(url = DEFAULT_SKULPT_CDN_URL) {
  const trimmedUrl = String(url || '').trim();
  const scriptUrl = trimmedUrl || DEFAULT_SKULPT_CDN_URL;
  const normalizedScriptUrl = /\/skulpt(?:\.min)?\.js(?:[?#].*)?$/i.test(scriptUrl)
    ? scriptUrl
    : `${scriptUrl.replace(/\/$/, '')}/skulpt.min.js`;
  const scriptUrlWithoutQuery = normalizedScriptUrl.split(/[?#]/)[0];
  const baseUrl = scriptUrlWithoutQuery.replace(/\/[^/]*$/, '');

  return {
    scriptUrl: normalizedScriptUrl,
    stdlibUrl: `${baseUrl}/skulpt-stdlib.js`,
  };
}

/**
 * Injects a script tag with a CSP nonce and resolves once it has loaded.
 * @param {string} url - Script URL.
 * @param {string} dataAttribute - Dataset attribute name used to mark the injected script.
 * @returns {Promise<void>} Resolves once the script has loaded.
 */
function appendScript(url, dataAttribute) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.dataset[dataAttribute] = 'true';
    applyCspNonce(script);
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load Skulpt runtime script: ${url}`));
    document.head.appendChild(script);
  });
}

/**
 * Resets the shared Skulpt load promise so the runtime is reloaded on next use.
 * @returns {void}
 */
export function resetSharedSkulptRuntimeState() {
  sharedSkulptRuntimeState.loadPromise = null;
}

/**
 * Ensures the Skulpt runtime and stdlib are loaded exactly once, returning the shared instance.
 * @param {string} [url] - Configured Skulpt base directory or direct skulpt.min.js URL.
 * @returns {Promise<object>} Resolves with the global Sk object once loaded.
 */
export function ensureSkulptRuntime(url = DEFAULT_SKULPT_CDN_URL) {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Skulpt runtime requires a browser window.'));
  }

  if (window.Sk?.builtinFiles?.files) {
    return Promise.resolve(window.Sk);
  }

  if (sharedSkulptRuntimeState.loadPromise) {
    return sharedSkulptRuntimeState.loadPromise;
  }

  const { scriptUrl, stdlibUrl } = resolveSkulptRuntimeUrls(url);

  sharedSkulptRuntimeState.loadPromise = appendScript(scriptUrl, 'h5pSkulptRuntime')
    .then(() => appendScript(stdlibUrl, 'h5pSkulptStdlib'))
    .then(() => {
      if (window.Sk?.builtinFiles?.files) {
        return window.Sk;
      }

      throw new Error('Skulpt runtime loaded, but Sk.builtinFiles is unavailable.');
    })
    .catch((error) => {
      sharedSkulptRuntimeState.loadPromise = null;
      throw error;
    });

  return sharedSkulptRuntimeState.loadPromise;
}
