import PyodideWorkerClient from './services/pyodide-worker-client';
import { getPythonL10nValue } from '../services/python-l10n';
import { addPythonErrorHint } from '../services/python-error-hints';
import { createPythonRuntimeError } from './python-runtime-result';
import { preparePyodideWorker } from './services/pyodide-worker-preload';

/** Isolated execution for console/function tasks without browser APIs. */
export default class PyodideWorkerRunner {
  constructor(runtime, options = {}) {
    this.runtime = runtime;
    this.options = options;
    this.stopped = false;
    this.client = new PyodideWorkerClient({
      onOutput: (text) => runtime.outputHandler(text),
      onInput: (prompt) => runtime.inputHandler(prompt),
      executionLimit: options.executionLimit || 10000,
      timeoutMessage: getPythonL10nValue(options.l10n || {}, 'executionLimitExceeded'),
    });
  }

  async setup() {}

  /**
   * Returns the non-entry project files that the worker must write into its
   * Python file system before the entry code runs, so multi-file projects and
   * pre/post code work in isolation too.
   * @returns {Array<{name: string, code: string}>} Project module files.
   */
  getWorkerFiles() {
    const files = this.runtime.getProjectSnapshot?.()?.files || [];

    return files
      .filter((file) => file?.isEntry !== true && file?.name)
      .map((file) => ({ name: String(file.name), code: String(file.code || '') }));
  }

  async execute(code) {
    if (this.stopped) return;
    try {
      if (this.runtime.codeContainer) this.runtime.codeContainer._runtime = this.runtime;
      this.runtime.codeContainer?.getStateManager?.()?.start?.();
      const result = await this.client.run(code, {
        ...this.options,
        files: this.getWorkerFiles(),
      });
      if (result.stopped || this.stopped) return;
      preparePyodideWorker(this.options);
      // Stop before onSuccess: test execution can start the next runtime there.
      this.runtime.codeContainer?.getStateManager?.()?.stop?.();
      await this.runtime.onSuccess();
    }
    catch (error) {
      this.runtime.onError(createPythonRuntimeError({ phase: 'execution',
        message: addPythonErrorHint(this.options.l10n || {}, error.message) }));
    }
  }

  stop() {
    this.stopped = true;
    return this.client.stop();
  }
}
