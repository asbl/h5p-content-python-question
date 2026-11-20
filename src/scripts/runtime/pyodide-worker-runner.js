import PyodideWorkerClient from './services/pyodide-worker-client';
import { getPythonL10nValue } from '../services/python-l10n';
import { addPythonErrorHint } from '../services/python-error-hints';
import { createPythonRuntimeError } from './python-runtime-result';

/** Isolated execution for single-file console/function tasks without browser APIs. */
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

  async execute(code) {
    if (this.stopped) return;
    try {
      if (this.runtime.codeContainer) this.runtime.codeContainer._runtime = this.runtime;
      this.runtime.codeContainer?.getStateManager?.()?.start?.();
      const result = await this.client.run(code, this.options);
      if (result.stopped || this.stopped) return;
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
