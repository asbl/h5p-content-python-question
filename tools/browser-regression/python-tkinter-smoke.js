const { readFile } = require('fs/promises');
const http = require('http');
const path = require('path');

const { chromium } = require('playwright');

const PYODIDE_CDN = 'https://cdn.jsdelivr.net/pyodide/v0.29.5/full/pyodide.js';

/**
 * Learner program run by the harness: a counter window with two buttons.
 * "Plus eins" exercises the full client -> engine -> callback -> ops ->
 * client round trip, "Dialog" blocks in wait_window (the same machinery as
 * messagebox/simpledialog) until its OK button closes the dialog.
 */
const LEARNER_PROGRAM = `
import tkinter as tk

root = tk.Tk()
root.title("Smoke")
state = {"count": 0, "dialog_closed": False, "ok_box": None}

def increment():
    state["count"] += 1
    label.config(text="Zaehler: " + str(state["count"]))

def open_dialog():
    dlg = tk.Toplevel(root)
    dlg.title("Dialog")
    ok = tk.Button(dlg, text="OK", command=dlg.destroy)
    ok.pack()
    dlg.update_idletasks()
    state["ok_box"] = [ok.winfo_rootx() - dlg.winfo_rootx() + ok.winfo_width() // 2,
                       ok.winfo_rooty() - dlg.winfo_rooty() + ok.winfo_height() // 2]
    root.wait_window(dlg)
    state["dialog_closed"] = True

label = tk.Label(root, text="Zaehler: 0")
label.pack()
btn = tk.Button(root, text="Plus eins", command=increment)
btn.pack()
dlg_btn = tk.Button(root, text="Dialog", command=open_dialog)
dlg_btn.pack()
root.mainloop()

state["btn_box"] = [btn.winfo_rootx() - root.winfo_rootx() + btn.winfo_width() // 2,
                    btn.winfo_rooty() - root.winfo_rooty() + btn.winfo_height() // 2]
state["dlg_btn_box"] = [dlg_btn.winfo_rootx() - root.winfo_rootx() + dlg_btn.winfo_width() // 2,
                        dlg_btn.winfo_rooty() - root.winfo_rooty() + dlg_btn.winfo_height() // 2]
`;

const TURTLE_PROGRAM = `
import turtle
t = turtle.Turtle()
t.forward(80)
t.left(90)
t.forward(60)
`;

const SNAPSHOT_PY = `
import json
json.dumps({
    "count": state["count"],
    "dialog_closed": state["dialog_closed"],
    "ok_box": state["ok_box"],
    "btn_box": state.get("btn_box"),
    "dlg_btn_box": state.get("dlg_btn_box"),
})
`;

/**
 * Builds the harness page that loads Pyodide from the CDN, installs
 * tkinter-web-backend and drives the real service bundle.
 * @returns {string} HTML document.
 */
function harnessHtml() {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>tkinter smoke</title>
  <style>
    body { margin: 0; }
    #host { width: 1024px; }
    #status { font-family: monospace; padding: 4px; }
  </style>
</head>
<body>
  <div id="status">loading pyodide…</div>
  <div id="host"></div>
  <script src="${PYODIDE_CDN}"></script>
  <script src="/tkinter-smoke.js"></script>
  <script>
    (async () => {
      try {
        const pyodide = await loadPyodide();
        await pyodide.loadPackage("micropip");
        await pyodide.runPythonAsync("import micropip\\nawait micropip.install(\\"tkinter-web-backend\\")");
        await window.H5PTkinterSmoke.setupPyodideTkinterBridge({ pyodide }, document.getElementById("host"));
        await pyodide.runPythonAsync(${JSON.stringify(LEARNER_PROGRAM)});
        await pyodide.runPythonAsync(${JSON.stringify(TURTLE_PROGRAM)});
        window.__smoke = {
          snapshot: () => JSON.parse(pyodide.runPython(${JSON.stringify(SNAPSHOT_PY)})),
          // can_run_sync() is only true inside a promising entry point, so
          // it must be probed through runPythonAsync.
          canRunSync: () => pyodide.runPythonAsync("from pyodide.ffi import can_run_sync\\ncan_run_sync()"),
        };
        document.getElementById("status").textContent = "ready";
      }
      catch (error) {
        document.getElementById("status").textContent = "error: " + error;
        window.__smokeError = String(error && error.stack || error);
      }
    })();
  </script>
</body>
</html>`;
}

/**
 * Starts a local server for the harness page and the smoke bundle.
 * @returns {Promise<object>} Server handle with `port` and `close()`.
 */
async function startServer() {
  const bundlePath = path.resolve(__dirname, 'build/tkinter-smoke.js');
  const server = http.createServer(async (request, response) => {
    if (request.url === '/tkinter-smoke.js') {
      const bundle = await readFile(bundlePath);
      response.writeHead(200, { 'content-type': 'application/javascript' });
      response.end(bundle);
      return;
    }

    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(harnessHtml());
  });

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  return {
    server,
    port: server.address().port,
    close: () => new Promise((resolve) => {
      server.close(() => resolve());
    }),
  };
}

/**
 * Clicks a Tk widget rendered on the canvas of the window with the given title.
 * @param {object} page - Playwright page.
 * @param {object} frame - Client iframe frame.
 * @param {string} title - Window title.
 * @param {Array<number>} box - Widget center in window coordinates [x, y].
 */
async function clickCanvasWidget(page, frame, title, box) {
  const windowEl = frame.locator('.tkw-window').filter({ hasText: title }).first();
  await windowEl.waitFor({ state: 'visible', timeout: 30000 });
  const canvasBox = await windowEl.locator('canvas').boundingBox();

  if (!canvasBox) {
    throw new Error(`No canvas found in the "${title}" window.`);
  }

  await page.mouse.click(canvasBox.x + box[0], canvasBox.y + box[1]);
}

/**
 * Polls a predicate until it returns true or the timeout expires.
 * @param {function} predicate - Async predicate.
 * @param {number} timeoutMs - Timeout in milliseconds.
 * @param {string} message - Error message on timeout.
 */
async function pollUntil(predicate, timeoutMs, message) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await predicate()) {
      return;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
  }

  throw new Error(message);
}

/**
 * Runs the smoke test: serves the harness, drives it with Chromium and
 * asserts the full tkinter round trip including a blocking dialog.
 */
async function main() {
  const { port, close } = await startServer();
  const browser = await chromium.launch({
    headless: process.env.H5P_HEADED !== '1',
    executablePath: process.env.H5P_CHROMIUM_PATH || undefined,
  });

  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    page.on('pageerror', (error) => {
      console.error('page error:', String(error));
    });
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load', timeout: 60000 });

    await pollUntil(
      () => page.evaluate(() => Boolean(window.__smoke) || Boolean(window.__smokeError)),
      120000,
      'Pyodide or the tkinter backend did not finish loading.',
    );

    const smokeError = await page.evaluate(() => window.__smokeError || null);
    if (smokeError) {
      throw new Error(`Harness failed: ${smokeError}`);
    }

    const canRunSync = await page.evaluate(() => window.__smoke.canRunSync());
    if (!canRunSync) {
      throw new Error('run_sync is unavailable in this browser (no JSPI): dialogs cannot be tested.');
    }

    // The tkinter client page renders inside an iframe of the canvas host.
    const iframe = await page.waitForSelector('iframe.pyodide-tkinter-frame', { timeout: 30000 });
    const frame = await iframe.contentFrame();
    await frame.waitForSelector('.tkw-window', { timeout: 30000 });

    // The turtle program opens a second client page.
    await page.waitForSelector('iframe.pyodide-tkinter-frame:nth-of-type(2)', { timeout: 30000 });

    // Round trip: click the counter button, the label must update.
    let snapshot = await page.evaluate(() => window.__smoke.snapshot());
    await clickCanvasWidget(page, frame, 'Smoke', snapshot.btn_box);
    await pollUntil(
      () => page.evaluate(() => window.__smoke.snapshot().count === 1),
      30000,
      'Clicking the Tk button did not update the counter.',
    );

    // Blocking dialog: wait_window suspends until the OK button closes it.
    snapshot = await page.evaluate(() => window.__smoke.snapshot());
    await clickCanvasWidget(page, frame, 'Smoke', snapshot.dlg_btn_box);
    await pollUntil(
      () => page.evaluate(() => window.__smoke.snapshot().ok_box !== null),
      30000,
      'The dialog did not report its OK button.',
    );
    snapshot = await page.evaluate(() => window.__smoke.snapshot());
    await clickCanvasWidget(page, frame, 'Dialog', snapshot.ok_box);
    await pollUntil(
      () => page.evaluate(() => window.__smoke.snapshot().dialog_closed),
      30000,
      'Closing the dialog did not unblock wait_window.',
    );

    console.log('Python tkinter smoke test passed.');
  }
  finally {
    await browser.close();
    await close();
  }
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
