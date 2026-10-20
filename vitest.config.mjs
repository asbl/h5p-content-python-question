import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Serves vendored .py files (e.g. the turtle module) as raw strings so
 * services can import them like webpack's asset/source rule does.
 * @type {import('vite').Plugin}
 */
const rawPythonAssetPlugin = {
  name: 'raw-python-asset',
  load(id) {
    if (id.endsWith('.py')) {
      return `export default ${JSON.stringify(readFileSync(id, 'utf8'))}`;
    }

    return undefined;
  },
};

export default defineConfig({
  plugins: [rawPythonAssetPlugin],
  resolve: {
    alias: {
      '@libcodetools': path.resolve(__dirname, '../H5P.LibCodeTools-6.0/src')
    }
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/scripts/**/*.js'],
      exclude: [
        'src/entries/**',
      ],
    },
  },
});
