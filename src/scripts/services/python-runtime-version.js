/**
 * CPython version bundled by the Pyodide release pinned in
 * `DEFAULT_PYODIDE_CDN_URL` (pyodide-runtime-service.js). Static analysis
 * tools that need a Python version but don't run inside Pyodide (Pyrefly)
 * read it from here so the two stay in sync; bump this alongside any Pyodide
 * CDN URL version change.
 */
export const PYODIDE_PYTHON_VERSION = '3.13';
