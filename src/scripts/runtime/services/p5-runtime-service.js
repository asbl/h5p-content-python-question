const DEFAULT_P5_CDN_URL = 'https://cdn.jsdelivr.net/npm/p5@1.1.9/lib/p5.min.js';

const sharedP5RuntimeState = {
  loadPromise: null,
};

function loadP5Script(url) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.dataset.h5pP5Runtime = 'true';
    script.onload = () => {
      if (window.p5) {
        resolve(window.p5);
        return;
      }

      script.remove();
      reject(new Error('p5 runtime loaded, but window.p5 is unavailable.'));
    };
    script.onerror = () => {
      script.remove();
      reject(new Error(`Failed to load p5 runtime script: ${url}`));
    };
    document.head.appendChild(script);
  });
}

export function resetSharedP5RuntimeState() {
  sharedP5RuntimeState.loadPromise = null;
}

export function ensureP5Script(url = DEFAULT_P5_CDN_URL) {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('p5 runtime requires a browser window.'));
  }

  if (window.p5) {
    return Promise.resolve(window.p5);
  }

  if (sharedP5RuntimeState.loadPromise) {
    return sharedP5RuntimeState.loadPromise;
  }

  const resolvedUrl = String(url || '').trim() || DEFAULT_P5_CDN_URL;

  sharedP5RuntimeState.loadPromise = loadP5Script(resolvedUrl).catch((error) => {
    sharedP5RuntimeState.loadPromise = null;
    throw error;
  });

  return sharedP5RuntimeState.loadPromise;
}
