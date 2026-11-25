/* Production-bundle smoke test. No running development server is required. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '../../../..');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    page.on('pageerror', (error) => console.error(error.message));
    await page.route('https://h5p-worker.test/**', (route) => route.fulfill({
      contentType: 'text/html', body: '<!doctype html><html lang="en"><body></body></html>',
    }));
    await page.goto('https://h5p-worker.test/');
    await page.evaluate(() => {
      window.H5P = {
        Question: class {}, CodeContainer: class {},
        createUUID: () => crypto.randomUUID(),
        t: (key) => `[Missing translation ${key}]`,
        registerBlocklyLanguagePack() {},
        DialogQueue: class { setTarget() {} async enqueueInput() { return '7'; } },
      };
      window.H5PEditor = { widgets: {}, t: (_library, key) => key };
    });
    for (const file of [
      'libraries/H5P.CodeQuestion-6.0/dist/h5p-content-code-question.js',
      'libraries/H5P.PythonQuestion-6.0/dist/h5p-python-question.js',
      'libraries/H5PEditor.CodeWidget-6.0/dist/h5p-editor-code-widget.js',
    ]) {
      const url = `https://h5p-worker.test/${file}`;
      await page.route(url, (route) => route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(root, file), 'utf8') }));
      await page.addScriptTag({ url });
    }

    const result = await page.evaluate(async () => {
      const NativeWorker = window.Worker;
      const workerRecords = [];
      window.Worker = class extends NativeWorker {
        constructor(...args) {
          super(...args);
          this.record = { prepared: false, ready: false, runs: 0, terminated: false };
          workerRecords.push(this.record);
          this.addEventListener('message', ({ data }) => {
            if (data.type === 'ready') this.record.ready = true;
          });
        }
        postMessage(message, ...args) {
          if (message.type === 'prepare') this.record.prepared = true;
          if (message.type === 'run') this.record.runs++;
          return super.postMessage(message, ...args);
        }
        terminate() {
          this.record.terminated = true;
          return super.terminate();
        }
      };
      const events = [];
      let code = 'zahl = int(input("Zahl?"))\nprint(zahl * 2)';
      const state = { start() {}, stop() {} };
      const consoleManager = { write(text) { events.push(String(text)); }, showConsole() {}, clearConsole() {}, getConsole() { return {}; } };
      const container = {
        parent: document.body, getEditorManager: () => ({ getCode: () => code, extractEditableCode: (source) => source }),
        getCanvasManager: () => ({}), getConsoleManager: () => consoleManager,
        getStateManager: () => state, setExecutionStatus: (status) => { events.push(`status:${status}`); },
        showCodePage() {}, getWorkspaceSnapshot: () => null,
      };
      const options = { runner: 'pyodide', isolatedExecution: true, executionLimit: 500, disableOutputPopups: true };
      const run = async (source) => {
        code = source;
        const runtime = new H5P.PythonManualRuntime(() => {}, '', options);
        await runtime.start(container);
        return runtime;
      };
      await run(code);
      const inputPassed = events.includes('14\n');
      const prepared = workerRecords.find((record) => record.prepared);
      const preparationDeadline = Date.now() + 120000;
      while (prepared && !prepared.ready && !prepared.terminated && Date.now() < preparationDeadline) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      const preparedWithoutLearnerCode = Boolean(prepared?.ready && prepared.runs === 0);
      events.length = 0;
      let ticks = 0;
      const timer = setInterval(() => ticks++, 20);
      await run('while True:\n    pass');
      clearInterval(timer);
      const timeoutPassed = events.some((text) => text.includes('execution time limit'));
      const preparedConsumedOnce = Boolean(prepared?.runs === 1 && prepared.terminated);
      const responsive = ticks > 2;
      events.length = 0;
      // Stop through the actual container method while the worker computes.
      code = 'while True:\n    pass';
      const stopped = new H5P.PythonManualRuntime(() => {}, '', { ...options, executionLimit: 10000 });
      const stoppedRun = stopped.start(container);
      while (!stopped.runner?.client?.worker) await new Promise((resolve) => setTimeout(resolve, 5));
      const worker = stopped.runner.client.worker;
      const onMessage = worker.onmessage;
      worker.onmessage = (event) => {
        onMessage(event);
        if (event.data.type === 'executing') {
          setTimeout(() => H5P.CodeQuestionContainer.prototype.stop.call(container), 50);
        }
      };
      await stoppedRun;
      const cancelled = container.stopSignal === true && !events.includes('status:success');
      events.length = 0;
      const early = new H5P.PythonManualRuntime(() => {}, '', options);
      const earlyRun = early.start(container);
      early.stop();
      await earlyRun;
      const earlyCancelled = !early.runner.client.worker && !events.includes('status:success');
      events.length = 0;
      await run('print("fresh" if "zahl" not in globals() else "stale")');
      const fresh = events.includes('fresh\n');
      events.length = 0;
      await run('import asyncio\nasync def main():\n    await asyncio.sleep(0.01)\n    print("async done")\nasyncio.run(main())');
      const asyncPassed = events.includes('async done\n');

      let completed = 0;
      code = 'def summe(werte):\n    return sum(werte)';
      const cases = [{ arguments: ['[1,2,3]'], expectedResult: '6', weight: 2 }, { arguments: ['[]'], expectedResult: '0' }];
      const tester = new H5P.CodeTesterFactory(cases, 'functionTests', () => completed++,
        () => new H5P.TestRuntimeFactory(H5P.PythonTestRuntime, () => {}, '', tester, { ...options, executionLimit: 10000 }),
        { testCase: 'Test' }, null, false, '', 'summe').create();
      document.body.append(tester.view.getDOM());
      const testRuntime = new H5P.PythonTestRuntime(() => {}, '', tester, { ...options, executionLimit: 10000 });
      await testRuntime.start(container);
      const testsPassed = completed === 1 && tester.results.getScore() === 3;
      const assistant = new H5PEditor.widgets.pythonTaskAssistant({ params: {} }, { label: 'Assistant', description: '' });
      assistant.select.value = 'oop';
      assistant.previewTemplate();
      assistant.parent.params = assistant.pendingTemplate;
      await assistant.checkTask();
      const referencePassed = assistant.output.textContent.split('assistantReferencePassed').length - 1 === 2;
      assistant.remove();
      return { inputPassed, preparedWithoutLearnerCode, preparedConsumedOnce,
        timeoutPassed, responsive, cancelled, earlyCancelled, fresh, asyncPassed, testsPassed, referencePassed };
    });
    Object.entries(result).forEach(([name, passed]) => assert.equal(passed, true, name));
    const report = { passed: true, checks: result };
    if (process.env.H5P_WORKER_REPORT) fs.writeFileSync(process.env.H5P_WORKER_REPORT, `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  }
  finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
