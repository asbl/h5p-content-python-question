const { chromium } = require('playwright');

const BASE_URL = process.env.H5P_BASE_URL || 'http://localhost:8080';
const MACHINE_NAME = process.env.H5P_MACHINE_NAME || 'H5P.PythonQuestion';
const TUTORIAL_CONTENT_ID = process.env.H5P_TUTORIAL_CONTENT_ID || 'miniworlds-tutorial';
const HEADED = process.env.H5P_HEADED === '1';

function getViewUrl(contentId) {
  return `${BASE_URL}/view/${MACHINE_NAME}/${contentId}`;
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

async function getH5pFrame(page, url) {
  await page.goto(url, { waitUntil: 'load' });
  const iframeElement = await page.waitForSelector('iframe.h5p-iframe', {
    state: 'attached',
    timeout: 30000,
  });

  const frame = await iframeElement.contentFrame();
  if (!frame) {
    throw new Error('H5P iframe context could not be resolved.');
  }

  await frame.waitForSelector('body', { state: 'visible', timeout: 30000 });
  await page.waitForTimeout(1200);
  return frame;
}

async function findTutorialExampleBlock(frame) {
  const block = frame.locator('.code_container').filter({ hasText: 'Actor an Position x=280, y=80' }).first();
  await block.waitFor({ state: 'visible', timeout: 30000 });
  return block;
}

async function replaceEditorCode(block, page, code) {
  const codeButton = block.locator('.button-show_code').first();
  if (await codeButton.isVisible().catch(() => false)) {
    await codeButton.click();
    await page.waitForTimeout(250);
  }

  const editorContent = block.locator('.editor_container .cm-content').first();
  await editorContent.waitFor({ state: 'visible', timeout: 30000 });
  await editorContent.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Backspace');
  await page.keyboard.insertText(code);
  await page.waitForTimeout(400);
}

async function stopIfRunning(block) {
  const stopButton = block.locator('.button-stop_button').first();
  if (await stopButton.isVisible().catch(() => false)) {
    await stopButton.click();
    await block.page().waitForTimeout(300);
  }
}

async function runBlockAndReadCanvas(block, page) {
  await stopIfRunning(block);

  const runButton = block.locator('.button-run_code').first();
  await runButton.waitFor({ state: 'visible', timeout: 30000 });
  await runButton.click();
  await page.waitForTimeout(4000);

  return block.evaluate((root) => {
    const canvas = root.querySelector('canvas.pyodide-sdl-canvas');
    if (!canvas) {
      return null;
    }

    const rect = canvas.getBoundingClientRect();
    return {
      logicalWidth: canvas.width,
      logicalHeight: canvas.height,
      styleWidth: canvas.style.width,
      styleHeight: canvas.style.height,
      styleAspect: canvas.style.aspectRatio,
      rectWidth: rect.width,
      rectHeight: rect.height,
    };
  });
}

function assertCanvasDimensions(actual, expected, label) {
  if (!actual) {
    throw new Error(`${label}: SDL canvas not found.`);
  }

  const failures = [];
  if (actual.logicalWidth !== expected.logicalWidth) {
    failures.push(`logicalWidth expected ${expected.logicalWidth}, got ${actual.logicalWidth}`);
  }
  if (actual.logicalHeight !== expected.logicalHeight) {
    failures.push(`logicalHeight expected ${expected.logicalHeight}, got ${actual.logicalHeight}`);
  }
  if (actual.styleWidth !== expected.styleWidth) {
    failures.push(`styleWidth expected ${expected.styleWidth}, got ${actual.styleWidth}`);
  }
  if (actual.styleAspect !== expected.styleAspect) {
    failures.push(`styleAspect expected ${expected.styleAspect}, got ${actual.styleAspect}`);
  }

  if (failures.length > 0) {
    throw new Error(`${label}: ${failures.join('; ')}`);
  }
}

async function main() {
  const browser = await chromium.launch({ headless: !HEADED });
  const page = await browser.newPage({ viewport: { width: 1500, height: 2400 } });

  const results = {
    tutorialContentId: TUTORIAL_CONTENT_ID,
    originalExample: { status: 'PENDING' },
    widenedExample: { status: 'PENDING' },
  };

  try {
    const frame = await getH5pFrame(page, getViewUrl(TUTORIAL_CONTENT_ID));
    const block = await findTutorialExampleBlock(frame);
    await block.scrollIntoViewIfNeeded();

    const originalCode = [
      'import miniworlds',
      '',
      'world = miniworlds.World(400, 300)',
      'world.add_background((100, 180, 100))',
      '',
      '# Actor an Position x=280, y=80',
      'actor = miniworlds.Actor((280, 80))',
      '',
      'world.run()',
    ].join('\n');

    await replaceEditorCode(block, page, originalCode);
    const originalCanvas = await runBlockAndReadCanvas(block, page);
    assertCanvasDimensions(originalCanvas, {
      logicalWidth: 400,
      logicalHeight: 300,
      styleWidth: '400px',
      styleAspect: '400 / 300',
    }, 'originalExample');
    results.originalExample = { status: 'PASS', diagnostics: originalCanvas };

    const widenedCode = originalCode.replace('World(400, 300)', 'World(900, 300)');
    await replaceEditorCode(block, page, widenedCode);
    const widenedCanvas = await runBlockAndReadCanvas(block, page);
    assertCanvasDimensions(widenedCanvas, {
      logicalWidth: 900,
      logicalHeight: 300,
      styleWidth: '900px',
      styleAspect: '900 / 300',
    }, 'widenedExample');
    results.widenedExample = { status: 'PASS', diagnostics: widenedCanvas };
  }
  catch (error) {
    const message = error?.message || String(error);

    if (results.originalExample.status === 'PENDING') {
      results.originalExample = { status: 'FAIL', error: message };
    }
    else {
      results.widenedExample = { status: 'FAIL', error: message };
    }
  }
  finally {
    await browser.close();
  }

  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);

  if (results.originalExample.status !== 'PASS' || results.widenedExample.status !== 'PASS') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});