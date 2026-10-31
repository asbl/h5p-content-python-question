export const BUNDLED_MINIWORLDS_WHEEL_URL = new URL(
  '../assets/miniworlds-4.4.0.7-py3-none-any.whl',
  import.meta.url,
).href;

const WHEEL_PATH = '/tmp/miniworlds-4.4.0.7-py3-none-any.whl';

export async function installBundledMiniworldsWheel(pyodide, options, packages = []) {
  const requested = normalizePythonPackageEntries([...(options.packages || []), ...packages]);
  if (!requested.some((packageName) => PYTHON_MINIWORLDS_PACKAGES.includes(packageName))) {
    return;
  }

  if (!pyodide?.FS?.writeFile || options.packageUrls?.miniworlds !== BUNDLED_MINIWORLDS_WHEEL_URL) {
    return;
  }

  if (!pyodide.FS.analyzePath?.(WHEEL_PATH)?.exists) {
    const response = await fetch(BUNDLED_MINIWORLDS_WHEEL_URL);
    if (!response.ok) {
      throw new Error(`Could not load bundled Miniworlds wheel (${response.status}).`);
    }
    pyodide.FS.writeFile(WHEEL_PATH, new Uint8Array(await response.arrayBuffer()));
  }

  options.packageUrls.miniworlds = `emfs:${WHEEL_PATH}`;
}
import { normalizePythonPackageEntries, PYTHON_MINIWORLDS_PACKAGES } from '../../services/python-package-utils';
