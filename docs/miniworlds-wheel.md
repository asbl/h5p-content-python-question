# Bundled Miniworlds runtime

PythonQuestion 6.160 includes Miniworlds 4.4.0.7 as a browser-compatible wheel.
The default Pyodide runner installs this wheel from the H5P library's `dist/`
directory, so the self-collision fix does not depend on a PyPI publication.
The asset is shipped as `.whl.txt` for Moodle's file allowlist, then staged
inside Pyodide's filesystem with its original `.whl` filename and installed
through micropip's `emfs:` support.
Explicit package-entry URLs and runner `packageUrls` still override the default.

To update the bundled runtime:

1. Run the Miniworlds unit and Pyodide regression suites.
2. Build the Miniworlds wheel and source distribution.
3. Copy the wheel into `src/scripts/runtime/assets/`.
4. Update the wheel URL in `pyodide-bundled-miniworlds-service.js` and the Miniworlds version in
   `pyodide-precache-service.js`, then update the runner regression tests.
5. Bump PythonQuestion's minor version in the workspace `versions.json`, run
   `invoke sync-versions`, and build with
   `invoke pack --library=H5P.PythonQuestion-6.0`.

The staging step preserves the original wheel filename because micropip
parses the package name and version from that filename. Verify that the exported
H5P contains `dist/miniworlds-<version>-py3-none-any.whl.txt` with the same checksum
as the wheel built from Miniworlds.
