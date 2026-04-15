const DEFAULT_SKULPT_CDN_URL = 'https://cdn.jsdelivr.net/npm/skulpt@1.2.0/dist/skulpt.min.js';

const sharedSkulptRuntimeState = {
  loadPromise: null,
};

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

function appendScript(url, dataAttribute) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.dataset[dataAttribute] = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load Skulpt runtime script: ${url}`));
    document.head.appendChild(script);
  });
}

export function resetSharedSkulptRuntimeState() {
  sharedSkulptRuntimeState.loadPromise = null;
}

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