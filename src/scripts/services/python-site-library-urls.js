import { parseExternalLibraryUrlsYaml } from '@libcodetools/scripts/services/code-question-config';

/** Name of the page-level object a site administrator may define. */
export const SITE_LIBRARY_URLS_GLOBAL = 'H5PPythonQuestionLibraryUrls';

/**
 * Reads the site-wide library URL overrides. The object uses the same keys as
 * the per-task "External Library URLs" YAML field, for example
 * `{ pyodide: 'https://school.example/pyodide/pyodide.js' }`. It has to be
 * defined inside the frame that runs H5P, before the content is created.
 * Unknown keys and non-string values are ignored.
 * @returns {object} Normalized option keys, e.g. `{ pyodideCdnUrl }`.
 */
export function getSiteLibraryUrls() {
  const configured = globalThis[SITE_LIBRARY_URLS_GLOBAL];

  if (!configured || typeof configured !== 'object') {
    return {};
  }

  const lines = Object.entries(configured)
    .filter(([, url]) => typeof url === 'string' && url.trim() && !/[\r\n]/.test(url.trim()))
    .map(([key, url]) => `${key}: "${url.trim()}"`);

  return parseExternalLibraryUrlsYaml(lines.join('\n'));
}
