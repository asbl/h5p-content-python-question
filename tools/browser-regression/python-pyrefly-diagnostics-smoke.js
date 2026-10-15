const { chromium } = require('playwright');

const BASE_URL = process.env.H5P_BASE_URL || 'http://localhost:8080';
const MACHINE_NAME = process.env.H5P_PYTHON_PYREFLY_MACHINE || 'H5P.PythonQuestion';
const CONTENT_ID = process.env.H5P_PYTHON_PYREFLY_CONTENT_ID || 'pyrefly-diagnostics';
const HEADED = process.env.H5P_HEADED === '1';
const WARNING_CODE = process.env.H5P_PYTHON_PYREFLY_WARNING_CODE
  || 'def check(guess: int) -> int:\n    return "wrong return type"\n';
const CLEAN_CODE = process.env.H5P_PYTHON_PYREFLY_CLEAN_CODE
  || 'def check(guess: int) -> int:\n    return guess\n';
const EXPECTED_WARNING = process.env.H5P_PYTHON_PYREFLY_EXPECTED_WARNING
  || 'is not assignable to';

function getViewUrl() {
  return `${BASE_URL}/view/${MACHINE_NAME}/${CONTENT_ID}`;
}

async function getH5pFrame(page) {
  await page.goto(getViewUrl(), { waitUntil: 'load' });
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

async function getDiagnostics(frame) {
  return frame.locator('.cm-inline-diagnostic').evaluateAll((items) => {
    return items.map((item) => ({
      text: item.textContent || '',
      label: item.getAttribute('aria-label') || '',
      className: item.className || '',
    }));
  });
}

async function waitForDiagnostic(frame, expectedText) {
  await frame.waitForFunction((needle) => {
    return [...document.querySelectorAll('.cm-inline-diagnostic')]
      .some((element) => (element.getAttribute('aria-label') || '').includes(needle));
  }, expectedText, { timeout: 60000 });

  return getDiagnostics(frame);
}

async function waitForNoDiagnostics(frame) {
  await frame.waitForFunction(() => {
    return document.querySelectorAll('.cm-inline-diagnostic').length === 0;
  }, undefined, { timeout: 60000 });
}

async function main() {
  const browser = await chromium.launch({
    headless: !HEADED,
    executablePath: process.env.H5P_CHROMIUM_PATH || undefined,
  });

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const frame = await getH5pFrame(page);

    await replaceEditorText(page, frame, WARNING_CODE);
    const diagnostics = await waitForDiagnostic(frame, EXPECTED_WARNING);

    await replaceEditorText(page, frame, CLEAN_CODE);
    await waitForNoDiagnostics(frame);

    console.log(JSON.stringify({
      message: 'Python Pyrefly diagnostics smoke test passed.',
      contentId: CONTENT_ID,
      expectedWarning: EXPECTED_WARNING,
      diagnostics,
    }, null, 2));
  }
  finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
