import { createPyodideWorker, getPyodideWorkerOptions, normalizePyodideWorkerFiles, takePreparedPyodideWorker } from './pyodide-worker-preload';

/** One worker per execution: no learner globals, modules or files survive a run. */
export default class PyodideWorkerClient {
  constructor({ onOutput = () => {}, onInput = async () => '', executionLimit = 0,
    timeoutMessage = 'Execution limit exceeded.', startupLimit = 120000 } = {}) {
    Object.assign(this, { onOutput, onInput, executionLimit, timeoutMessage, startupLimit });
  }

  run(code, options = {}) {
    this.stop();
    const data = getPyodideWorkerOptions(options);
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error, result) => {
        if (settled) return;
        settled = true;
        if (this.worker === worker) this.stopRun = null;
        clearTimeout(timer);
        worker.terminate();
        URL.revokeObjectURL(url);
        if (this.worker === worker) this.worker = null;
        if (error) reject(error);
        else resolve(result);
      };
      let worker;
      let url;
      let timer;
      try {
        ({ worker, url } = takePreparedPyodideWorker(data) || createPyodideWorker());
      }
      catch (error) {
        reject(error); return;
      }
      this.worker = worker;
      this.stopRun = () => finish(null, { stopped: true });
      const armTimer = (limit, message) => {
        clearTimeout(timer);
        timer = limit > 0 ? setTimeout(() => finish(new Error(message)), limit) : null;
      };
      armTimer(this.startupLimit, 'Python runtime loading timed out.');
      worker.onerror = (event) => finish(new Error(event.message || 'Python worker failed.'));
      worker.onmessage = async ({ data }) => {
        if (this.worker !== worker) return;
        if (data.type === 'stdout') {
          try {
            this.onOutput(data.text);
          }
          catch (error) {
            finish(error);
          }
        }
        if (data.type === 'executing') armTimer(this.executionLimit, this.timeoutMessage);
        if (data.type === 'input') {
          clearTimeout(timer);
          try {
            const value = await this.onInput(data.prompt);
            if (this.worker !== worker) return;
            worker.postMessage({ type: 'input', id: data.id, value: String(value ?? '') });
            armTimer(this.executionLimit, this.timeoutMessage);
          }
          catch (error) {
            finish(error);
          }
        }
        if (data.type === 'success') finish(null, { stopped: false });
        if (data.type === 'error') finish(new Error(data.message));
      };
      worker.postMessage({
        type: 'run',
        code: String(code || ''),
        files: normalizePyodideWorkerFiles(options.files),
        ...data,
      });
    });
  }

  stop() {
    this.stopRun?.();
    return true;
  }
}
