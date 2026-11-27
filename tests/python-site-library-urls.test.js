import { afterEach, describe, expect, it } from 'vitest';
import { getSiteLibraryUrls, SITE_LIBRARY_URLS_GLOBAL } from '../src/scripts/services/python-site-library-urls.js';
import {
  buildPythonCodeContainerOptions,
  normalizePythonQuestionConfig,
} from '../src/scripts/services/python-question-config.js';

const SITE = 'https://school.example/vendor';

describe('site-wide library URLs', () => {
  afterEach(() => {
    delete globalThis[SITE_LIBRARY_URLS_GLOBAL];
  });

  it('is empty without a usable page-level object', () => {
    expect(getSiteLibraryUrls()).toEqual({});
    globalThis[SITE_LIBRARY_URLS_GLOBAL] = 'pyodide: x';
    expect(getSiteLibraryUrls()).toEqual({});
  });

  it('accepts the YAML key names and ignores unknown or invalid entries', () => {
    globalThis[SITE_LIBRARY_URLS_GLOBAL] = {
      pyodide: ` ${SITE}/pyodide.js `,
      sqlJs: `${SITE}/sql/`,
      unknown: `${SITE}/x.js`,
      skulpt: 42,
      p5: '',
      jsZip: `${SITE}/a.js\nblockly: https://other.example/`,
    };

    expect(getSiteLibraryUrls()).toEqual({
      pyodideCdnUrl: `${SITE}/pyodide.js`,
      sqlJsUrl: `${SITE}/sql/`,
    });
  });

  it('applies to tasks without their own setting', () => {
    globalThis[SITE_LIBRARY_URLS_GLOBAL] = { skulpt: `${SITE}/skulpt.min.js`, mermaid: `${SITE}/esm/` };

    const config = normalizePythonQuestionConfig({});

    expect(config.advancedOptions.skulptCdnUrl).toBe(`${SITE}/skulpt.min.js`);
    expect(buildPythonCodeContainerOptions({}, config).mermaidCdnUrl).toBe(`${SITE}/esm/`);
  });

  it('is overridden by the setting of a task', () => {
    globalThis[SITE_LIBRARY_URLS_GLOBAL] = { skulpt: `${SITE}/skulpt.min.js`, pyodide: `${SITE}/pyodide.js` };

    const config = normalizePythonQuestionConfig({
      advancedOptions: { externalLibraryUrls: 'skulpt: https://task.example/skulpt.min.js' },
      pyodideOptions: { pyodideCdnUrl: 'https://task.example/pyodide.js' },
    });

    expect(config.advancedOptions.skulptCdnUrl).toBe('https://task.example/skulpt.min.js');
    expect(config.advancedOptions.pyodideCdnUrl).toBe('https://task.example/pyodide.js');
  });
});
