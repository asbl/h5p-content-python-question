import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Vitest resolves the .txt import to a path (webpack inlines the source in the
// bundle), so read the asset directly for content assertions.
const workerSource = readFileSync(
  join(process.cwd(), 'src/scripts/runtime/assets/pyodide-worker.txt'),
  'utf8',
);

describe('pyodide worker asset', () => {
  it('writes per-run project files below a fixed project src directory', () => {
    expect(workerSource).toContain("const PROJECT_SRC_DIR = '/tmp/h5p_project/src'");
    expect(workerSource).toContain('for (const file of data.files || [])');
    expect(workerSource).toContain('pyodide.FS.writeFile(filePath');
  });

  it('exposes the project src directory on sys.path during initialization', () => {
    expect(workerSource).toContain('_h5p_sys.path.insert(0,');
  });

  it('resolves package wheel URLs and routes micropip-owned packages through micropip', () => {
    expect(workerSource).toContain('const packageUrls = data.packageUrls || {};');
    expect(workerSource).toContain('MICROPIP_OWNED_PACKAGES.includes(name)');
    expect(workerSource).toContain('micropip.install.callKwargs(micropipInstalls, { deps: false })');
  });

  it('scans entry code and project files for imports before executing', () => {
    expect(workerSource).toContain('const importScanCode = [...(data.files || []).map((file) => file.code), data.code].join(\'\\n\');');
    expect(workerSource).toContain('await pyodide.loadPackagesFromImports(importScanCode);');
  });
});
