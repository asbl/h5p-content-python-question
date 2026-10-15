const { chromium } = require('playwright');

const BASE_URL = process.env.H5P_BASE_URL || 'http://localhost:8080';
const MACHINE_NAME = process.env.H5P_PYTHON_PYREFLY_MACHINE || 'H5P.PythonQuestion';
const CONTENT_ID = process.env.H5P_PYTHON_PYREFLY_CONTENT_ID || 'pyrefly-diagnostics';
const HEADED = process.env.H5P_HEADED === '1';
const EDIT_RUNS = Number(process.env.H5P_PYREFLY_LATENCY_RUNS || 5);
const PER_EDIT_BUDGET_MS = Number(process.env.H5P_PYREFLY_PER_EDIT_BUDGET_MS || 0);

// Every run flips `x` between a type error and a clean assignment, independent
// of any missing annotations, so Ruff's own (much cheaper) checks don't
// interfere with measuring Pyrefly's per-keystroke latency in isolation.
const CODE_ERROR = 'x: int = 1\nx = "bad"\n';
const CODE_CLEAN = 'x: int = 1\nx = 2\n';
const ERROR_NEEDLE = 'is not assignable to variable';

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[index];
}

async function getH5pFrame(page) {
  await page.goto(`${BASE_URL}/view/${MACHINE_NAME}/${CONTENT_ID}`, { waitUntil: 'load' });
  const iframeElement = await page.waitForSelector('iframe.h5p-iframe', { timeout: 30000 });
  const frame = await iframeElement.contentFrame();
  if (!frame) {
    throw new Error('H5P iframe context could not be resolved.');
  }

  await frame.waitForSelector('.h5p-codequestion .cm-editor', { timeout: 30000 });
  return frame;
}

async function replaceEditorText(page, frame, code) {
  const editor = frame.locator('.h5p-codequestion .cm-editor').first();
  await editor.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Backspace');

  const lines = String(code).split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    await page.keyboard.insertText(lines[index]);
    if (index < lines.length - 1) {
      await page.keyboard.press('Enter');
    }
  }
}

async function waitForDiagnosticPresence(frame, present) {
  await frame.waitForFunction(([needle, shouldBePresent]) => {
    const found = [...document.querySelectorAll('.cm-inline-diagnostic')]
      .some((element) => (element.getAttribute('aria-label') || '').includes(needle));
    return found === shouldBePresent;
  }, [ERROR_NEEDLE, present], { timeout: 60000 });
}

async function main() {
  const browser = await chromium.launch({
    headless: !HEADED,
    executablePath: process.env.H5P_CHROMIUM_PATH || undefined,
  });

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const frame = await getH5pFrame(page);

    // Cold run: first Pyrefly check on this page also pays for the WASM
    // fetch/instantiate/compile, so it's reported separately from steady-state edits.
    const coldStart = Date.now();
    await replaceEditorText(page, frame, CODE_ERROR);
    await waitForDiagnosticPresence(frame, true);
    const coldRunMs = Date.now() - coldStart;

    const editDurationsMs = [];
    let codeIsError = true;
    for (let run = 0; run < EDIT_RUNS; run += 1) {
      const nextCode = codeIsError ? CODE_CLEAN : CODE_ERROR;
      const editStart = Date.now();
      await replaceEditorText(page, frame, nextCode);
      await waitForDiagnosticPresence(frame, !codeIsError);
      editDurationsMs.push(Date.now() - editStart);
      codeIsError = !codeIsError;
    }

    const result = {
      contentId: CONTENT_ID,
      coldRunMs,
      editRuns: EDIT_RUNS,
      editDurationsMs,
      editP50Ms: percentile(editDurationsMs, 50),
      editP95Ms: percentile(editDurationsMs, 95),
      perEditBudgetMs: PER_EDIT_BUDGET_MS || null,
    };

    console.log(JSON.stringify(result, null, 2));

    if (PER_EDIT_BUDGET_MS > 0 && result.editP95Ms > PER_EDIT_BUDGET_MS) {
      throw new Error(
        `Pyrefly per-edit latency exceeded budget: p95 ${result.editP95Ms}ms > ${PER_EDIT_BUDGET_MS}ms`
      );
    }
  }
  finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
