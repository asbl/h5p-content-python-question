import defaultLanguage from './default-language.json';
import defaultLanguageDe from './default-language.de.json';

const PYTHONQUESTION_LIBRARY = 'H5P.PythonQuestion';
const H5P_MISSING_TRANSLATION_PREFIX = '[Missing translation';

function getPreferredLocale() {
  const documentLanguage = globalThis.document?.documentElement?.lang;
  const navigatorLanguage = Array.isArray(globalThis.navigator?.languages)
    ? globalThis.navigator.languages[0]
    : globalThis.navigator?.language;

  return String(documentLanguage || navigatorLanguage || '').toLowerCase();
}

function getDefaultLibraryStrings() {
  return getPreferredLocale().startsWith('de')
    ? (defaultLanguageDe?.libraryStrings ?? defaultLanguage?.libraryStrings ?? {})
    : (defaultLanguage?.libraryStrings ?? {});
}

const DEFAULT_LIBRARY_STRINGS = getDefaultLibraryStrings();

/**
 * Check whether a string is H5P's missing-translation placeholder.
 * @param {string} message - Candidate translation string.
 * @returns {boolean} True if the message indicates a missing translation.
 */
function isMissingTranslation(message) {
  return typeof message === 'string' && message.startsWith(H5P_MISSING_TRANSLATION_PREFIX);
}

/**
 * Resolve a PythonQuestion library string from H5P or bundled defaults.
 * @param {string} key - Localization key.
 * @returns {string|null} Localized string or null if missing.
 */
function getPythonLibraryString(key) {
  const message = H5P.t(key, undefined, PYTHONQUESTION_LIBRARY);

  if (typeof message === 'string' && message !== '' && !isMissingTranslation(message)) {
    return message;
  }

  const fallback = DEFAULT_LIBRARY_STRINGS[key];
  return typeof fallback === 'string' && fallback !== ''
    ? fallback
    : null;
}

/**
 * Create a PythonQuestion localization proxy with optional fallback l10n.
 * @param {object} l10n - Legacy per-content overrides.
 * @param {object} fallbackL10n - Fallback localization proxy.
 * @returns {object} Localization proxy.
 */
export function createPythonL10n(l10n = {}, fallbackL10n = {}) {
  return new Proxy(l10n, {
    get(target, key, receiver) {
      if (typeof key !== 'string') {
        return Reflect.get(target, key, receiver);
      }

      const value = Reflect.get(target, key, receiver);
      if (typeof value === 'string' && value !== '') {
        return value;
      }

      const libraryValue = getPythonLibraryString(key);
      if (libraryValue !== null) {
        return libraryValue;
      }

      return Reflect.get(fallbackL10n, key, receiver);
    },
  });
}

/**
 * Get a required Python l10n string.
 * @param {object} l10n - Localization map or proxy with legacy overrides.
 * @param {string} key - Localization key.
 * @returns {string} Localized string.
 */
export function getPythonL10nValue(l10n = {}, key) {
  const value = (typeof l10n[key] === 'string' && l10n[key] !== '')
    ? l10n[key]
    : getPythonLibraryString(key);

  if (typeof value !== 'string' || value === '') {
    throw new Error(`Missing Python language key: ${key}`);
  }

  return value;
}

/**
 * Format a localized Python string with placeholder replacements.
 * @param {object} l10n - Localization map or proxy with legacy overrides.
 * @param {string} key - Localization key.
 * @param {object} replacements - Placeholder replacements.
 * @returns {string} Formatted localized string.
 */
export function tPython(l10n = {}, key, replacements = {}) {
  let message = getPythonL10nValue(l10n, key);

  Object.keys(replacements).forEach((replacementKey) => {
    message = message.replace(
      new RegExp(`\\{${replacementKey}\\}`, 'g'),
      replacements[replacementKey],
    );
  });

  return message;
}