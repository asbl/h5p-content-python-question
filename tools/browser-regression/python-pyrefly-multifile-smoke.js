const { chromium } = require('playwright');

const BASE_URL = process.env.H5P_BASE_URL || 'http://localhost:8080';
const MACHINE_NAME = process.env.H5P_PYTHON_PYREFLY_MACHINE || 'H5P.PythonQuestion';
const CONTENT_ID = process.env.H5P_PYTHON_PYREFLY_MULTIFILE_CONTENT_ID || 'pyrefly-multifile';
const HEADED = process.env.H5P_HEADED === '1';

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

async function switchToFile(frame, fileName) {
  await frame.locator(`.editor-file-tab[data-file-name="${fileName}"]`).click();
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

async function waitForDiagnosticPresence(frame, needle, present) {
  await frame.waitForFunction(([diagnosticNeedle, shouldBePresent]) => {
    const found = [...document.querySelectorAll('.cm-inline-diagnostic')]
      .some((element) => (element.getAttribute('aria-label') || '').includes(diagnosticNeedle));
    return found === shouldBePresent;
  }, [needle, present], { timeout: 60000 });
}

async function getDiagnostics(frame) {
  return frame.locator('.cm-inline-diagnostic').evaluateAll((items) => {
    return items.map((item) => item.getAttribute('aria-label') || '');
  });
}

async function main() {
  const browser = await chromium.launch({
    headless: !HEADED,
    executablePath: process.env.H5P_CHROMIUM_PATH || undefined,
  });

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const frame = await getH5pFrame(page);

    // main.py imports from helper.py by default: no missing-import noise means
    // Pyrefly resolved the sibling file, not just the active one.
    await page.waitForTimeout(2000);
    const initialDiagnostics = await getDiagnostics(frame);
    if (initialDiagnostics.length > 0) {
      throw new Error(`Expected no diagnostics on load, got: ${JSON.stringify(initialDiagnostics)}`);
    }

    // Introduce a type error in helper.py while it is the active file.
    await switchToFile(frame, 'helper.py');
    await replaceEditorText(page, frame, 'def add(a: int, b: int) -> int:\n    return a + "oops"\n');
    await waitForDiagnosticPresence(frame, 'is not supported between', true);

    // Switching to main.py must not carry helper.py's diagnostic along;
    // Pyrefly reports errors per sandboxed file and must be filtered by filename.
    await switchToFile(frame, 'main.py');
    await waitForDiagnosticPresence(frame, 'is not supported between', false);
    const mainDiagnosticsAfterHelperBug = await getDiagnostics(frame);
    if (mainDiagnosticsAfterHelperBug.length > 0) {
      throw new Error(
        `Expected helper.py's diagnostic not to leak into main.py, got: ${JSON.stringify(mainDiagnosticsAfterHelperBug)}`
      );
    }

    // Revert helper.py, then introduce a genuine cross-file error in main.py
    // itself: calling add() with a type that violates helper.py's real signature.
    await switchToFile(frame, 'helper.py');
    await replaceEditorText(page, frame, 'def add(a: int, b: int) -> int:\n    return a + b\n');
    await switchToFile(frame, 'main.py');
    await replaceEditorText(
      page,
      frame,
      'from helper import add\n\ndef check(guess: int) -> int:\n    return add(guess, "not a number")\n'
    );
    const crossFileDiagnostics = await waitForDiagnostic(frame, 'is not assignable to parameter');

    console.log(JSON.stringify({
      message: 'Python Pyrefly multi-file smoke test passed.',
      contentId: CONTENT_ID,
      crossFileDiagnostics,
    }, null, 2));
  }
  finally {
    await browser.close();
  }
}

async function waitForDiagnostic(frame, expectedText) {
  await frame.waitForFunction((needle) => {
    return [...document.querySelectorAll('.cm-inline-diagnostic')]
      .some((element) => (element.getAttribute('aria-label') || '').includes(needle));
  }, expectedText, { timeout: 60000 });

  return getDiagnostics(frame);
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
