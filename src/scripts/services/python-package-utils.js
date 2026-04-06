/**
 * Maps imported Python module names to installable Pyodide package names.
 * @type {Record<string, string>}
 */
export const PYTHON_IMPORT_PACKAGE_MAP = Object.freeze({
  bs4: 'beautifulsoup4',
  matplotlib: 'matplotlib',
  miniworlds: 'miniworlds',
  micropip: 'micropip',
  networkx: 'networkx',
  numpy: 'numpy',
  packaging: 'packaging',
  pandas: 'pandas',
  PIL: 'pillow',
  pygame: 'pygame-ce',
  regex: 'regex',
  scipy: 'scipy',
  sqlite3: 'sqlite3',
  sympy: 'sympy',
  lxml: 'lxml',
});

/**
 * Packages that must be installed through micropip instead of loadPackage.
 * @type {string[]}
 */
export const PYTHON_MICROPIP_PACKAGES = Object.freeze([
  'miniworlds',
]);

/**
 * Additional packages that become available as transitive dependencies.
 * @type {Record<string, string[]>}
 */
export const PYTHON_PACKAGE_DEPENDENCY_MAP = Object.freeze({
  miniworlds: Object.freeze(['numpy', 'pygame-ce']),
});

/**
/**
 * Normalizes a package-like entry coming from semantics or runtime options.
 * @param {*} entry - Raw package entry.
 * @returns {string|null} Normalized package name or null.
 */
function normalizePythonPackageEntry(entry) {
  if (typeof entry === 'string') {
    return entry.trim() || null;
  }

  if (typeof entry?.package === 'string') {
    return entry.package.trim() || null;
  }

  if (typeof entry?.package?.value === 'string') {
    return entry.package.value.trim() || null;
  }

  if (typeof entry?.value === 'string') {
    return entry.value.trim() || null;
  }

  return null;
}

/**
 * Adds one package and its transitive dependencies while preserving order.
 * @param {string} packageName - Normalized package name.
 * @param {Set<string>} seen - Already added packages.
 * @param {string[]} packageNames - Target package list.
 * @returns {void}
 */
function addPythonPackageWithDependencies(packageName, seen, packageNames) {
  if (!packageName || seen.has(packageName)) {
    return;
  }

  seen.add(packageName);
  packageNames.push(packageName);

  getPythonPackageDependencies(packageName).forEach((dependencyName) => {
    addPythonPackageWithDependencies(dependencyName, seen, packageNames);
  });
}

/**
 * Normalizes and de-duplicates Python package entries.
 * @param {Array<*>} [entries] - Raw package entries.
 * @returns {string[]} Unique package names.
 */
export function normalizePythonPackageEntries(entries = []) {
  const packageNames = [];
  const seen = new Set();

  entries.forEach((entry) => {
    const packageName = normalizePythonPackageEntry(entry);

    if (!packageName || seen.has(packageName)) {
      return;
    }

    addPythonPackageWithDependencies(packageName, seen, packageNames);
  });

  return packageNames;
}

/**
 * Detects installable packages from Python import statements.
 * @param {string} [code] - Python source code.
 * @returns {string[]} Unique imported package names.
 */
export function getImportedPythonPackages(code = '', options = {}) {
  const importedPackages = new Set();
  const localModuleNames = new Set(
    Array.isArray(options?.localModuleNames)
      ? options.localModuleNames.map((name) => String(name || '').trim()).filter(Boolean)
      : [],
  );
  const importPattern = /^\s*(?:from\s+([A-Za-z_][\w.]*)\s+import|import\s+([A-Za-z_][\w.]*))/gm;

  let match = importPattern.exec(code);
  while (match) {
    const moduleName = (match[1] || match[2] || '').split('.')[0];

    if (localModuleNames.has(moduleName)) {
      match = importPattern.exec(code);
      continue;
    }

    const packageName = PYTHON_IMPORT_PACKAGE_MAP[moduleName];

    if (packageName) {
      importedPackages.add(packageName);
    }

    match = importPattern.exec(code);
  }

  return Array.from(importedPackages);
}

/**
 * Splits package names into loadPackage and micropip groups.
 * @param {Array<*>} [packages] - Raw package names or entries.
 * @returns {{pyodidePackages: string[], micropipPackages: string[]}} Package groups.
 */
export function splitPythonPackages(packages = []) {
  const micropipPackageSet = new Set(PYTHON_MICROPIP_PACKAGES);
  const pyodidePackages = [];
  const micropipPackages = [];

  normalizePythonPackageEntries(packages).forEach((packageName) => {
    if (micropipPackageSet.has(packageName)) {
      micropipPackages.push(packageName);
      return;
    }

    pyodidePackages.push(packageName);
  });

  return {
    pyodidePackages,
    micropipPackages,
  };
}

/**
 * Returns additional dependency packages that are implicitly installed.
 * @param {string} packageName - Normalized package name.
 * @returns {string[]} Dependency package names.
 */
export function getPythonPackageDependencies(packageName) {
  return [...(PYTHON_PACKAGE_DEPENDENCY_MAP[packageName] || [])];
}