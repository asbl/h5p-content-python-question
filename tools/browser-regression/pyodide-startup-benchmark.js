const { chromium } = require('playwright');

const BASE_URL = process.env.H5P_BASE_URL || 'http://localhost:8080';
const MACHINE_NAME = process.env.H5P_MACHINE_NAME || 'H5P.PythonQuestion';
const CONTENT_ID = process.env.H5P_CONTENT_ID || 'Pyodide---Test-scipi2';
const READ_DELAY_MS = Number(process.env.H5P_READ_DELAY_MS || 4000);
const STARTUP_BUDGET_MS = Number(process.env.H5P_PYODIDE_STARTUP_BUDGET_MS || 0);
const DISABLE_IDLE_PRELOAD = process.env.H5P_DISABLE_IDLE_PRELOAD === '1';
const EXPECTED_OUTPUT_PATTERN = process.env.H5P_EXPECTED_OUTPUT_PATTERN
  ? new RegExp(process.env.H5P_EXPECTED_OUTPUT_PATTERN, 'i')
  : /(numpy|matrixmultiplikation|hello world)/i;

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

async function getH5pFrame(page) {
  await page.goto(`${BASE_URL}/view/${MACHINE_NAME}/${CONTENT_ID}`, { waitUntil: 'load' });
  const iframeElement = await page.waitForSelector('iframe.h5p-iframe', {
    state: 'attached',
    timeout: 30000,
  });
  const frame = await iframeElement.contentFrame();
  if (!frame) {
    throw new Error('H5P iframe context could not be resolved.');
  }

  await frame.waitForSelector('body', { state: 'visible', timeout: 30000 });
  return frame;
}

async function findRunButton(frame) {
  const selectors = [
    '.h5p-codequestion .h5p-question-buttons button',
    '.h5p-codequestion .h5p-question-buttons .button',
    '.h5p-codequestion button',
    '.h5p-codequestion .button',
  ];

  const end = Date.now() + 30000;
  while (Date.now() < end) {
    for (const selector of selectors) {
      const buttons = frame.locator(selector);
      const count = await buttons.count();
      for (let index = 0; index < count; index += 1) {
        const button = buttons.nth(index);
        if (!(await button.isVisible().catch(() => false))) {
          continue;
        }
        const text = normalizeText(await button.innerText().catch(() => ''));
        if (/^(run|ausf)/i.test(text)) {
          return button;
        }
      }
    }
    await frame.waitForTimeout(100);
  }

  throw new Error('Run button not found.');
}

async function collectPyodidePerformance(frame) {
  return frame.evaluate(() => {
    const structured = Array.isArray(window.__h5pPyodidePerformance)
      ? window.__h5pPyodidePerformance
      : [];
    const measured = typeof performance?.getEntriesByType === 'function'
      ? performance.getEntriesByType('measure')
        .filter((entry) => entry.name.startsWith('h5p.pyodide.'))
        .map((entry) => ({
          name: entry.name.replace(/^h5p\.pyodide\./, ''),
          duration: entry.duration,
          startTime: entry.startTime,
        }))
      : [];

    return (structured.length ? structured : measured).map((entry) => ({
      name: entry.name,
      durationMs: typeof entry.duration === 'number' ? Math.round(entry.duration) : null,
      startMs: typeof entry.startTime === 'number' ? Math.round(entry.startTime) : null,
      endMs: typeof entry.endTime === 'number' ? Math.round(entry.endTime) : null,
    }));
  });
}

async function main() {
  const browser = await chromium.launch({
    headless: process.env.H5P_HEADED !== '1',
    executablePath: process.env.H5P_CHROMIUM_PATH || undefined,
  });

  try {
    const page = await browser.newPage();

    if (DISABLE_IDLE_PRELOAD) {
      await page.addInitScript(() => {
        window.requestIdleCallback = () => 1;
        window.cancelIdleCallback = () => {};
      });
    }

    const frame = await getH5pFrame(page);
    await page.waitForTimeout(READ_DELAY_MS);

    const runButton = await findRunButton(frame);
    const start = Date.now();
    await runButton.click();

    await frame.waitForFunction((patternSource) => {
      const body = document.querySelector('.console-body');
      const text = body?.innerText || body?.textContent || '';
      return new RegExp(patternSource, 'i').test(text);
    }, EXPECTED_OUTPUT_PATTERN.source, { timeout: 90000 });

    const runToFirstOutputMs = Date.now() - start;
    const result = {
      contentId: CONTENT_ID,
      readDelayMs: READ_DELAY_MS,
      idlePreloadDisabled: DISABLE_IDLE_PRELOAD,
      startupBudgetMs: STARTUP_BUDGET_MS || null,
      runToFirstOutputMs,
      measures: await collectPyodidePerformance(frame),
    };

    console.log(JSON.stringify(result, null, 2));

    if (STARTUP_BUDGET_MS > 0 && runToFirstOutputMs > STARTUP_BUDGET_MS) {
      throw new Error(
        `Pyodide startup exceeded budget: ${runToFirstOutputMs}ms > ${STARTUP_BUDGET_MS}ms`
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
