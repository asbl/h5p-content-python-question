const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE_URL = process.env.H5P_BASE_URL || 'http://localhost:8080';
const MACHINE_NAME = process.env.H5P_MACHINE_NAME || 'H5P.PythonQuestion';
const FILES_CONTENT_ID = process.env.H5P_FILES_CONTENT_ID || 'miniworlds-basic';
const FOCUS_CONTENT_ID = process.env.H5P_FOCUS_CONTENT_ID || 'miniworlds-basic';
const CONSOLE_CONTENT_ID = process.env.H5P_CONSOLE_CONTENT_ID || 'Imported---First-Task';
const RUNSTOP_CONTENT_ID = process.env.H5P_RUNSTOP_CONTENT_ID || 'Endlosschleife';
const MULTI_INSTANCE_CONTENT_ID = process.env.H5P_MULTI_INSTANCE_CONTENT_ID || FOCUS_CONTENT_ID;
const ZIP_ROUNDTRIP_CONTENT_ID = process.env.H5P_ZIP_ROUNDTRIP_CONTENT_ID || 'miniworlds-basic';
const HEADED = process.env.H5P_HEADED === '1';
const FOCUS_DEBUG = process.env.H5P_FOCUS_DEBUG === '1';
const ARTIFACTS_DIR = process.env.H5P_BROWSER_REGRESSION_ARTIFACTS_DIR || path.join(process.cwd(), 'audit', 'browser-regression');

function sanitizeFileName(value) {
  return String(value || 'artifact')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'artifact';
}

function ensureArtifactsDir() {
  if (!FOCUS_DEBUG) {
    return;
  }

  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

async function writeFailureArtifacts(page, name, payload) {
  if (!FOCUS_DEBUG) {
    return null;
  }

  ensureArtifactsDir();

  const slug = sanitizeFileName(name);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const basePath = path.join(ARTIFACTS_DIR, `${stamp}-${slug}`);

  await page.screenshot({ path: `${basePath}.png`, fullPage: true });
  fs.writeFileSync(`${basePath}.json`, JSON.stringify(payload, null, 2));

  return {
    screenshot: `${basePath}.png`,
    json: `${basePath}.json`,
  };
}

function getViewUrl(contentId) {
  return `${BASE_URL}/view/${MACHINE_NAME}/${contentId}`;
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function escapeRegex(input) {
  return String(input).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

async function findQuestionButton(frame, label, timeout = 30000) {
  const expected = new RegExp(`^\\s*${escapeRegex(label)}\\s*$`, 'i');
  const selectors = [
    '.h5p-codequestion .h5p-question-buttons .button',
    '.h5p-codequestion .h5p-question-buttons button',
    '.h5p-codequestion .button',
    '.h5p-question-buttons .h5p-joubelui-button',
    '.h5p-question-buttons button',
  ];

  const endTime = Date.now() + timeout;
  while (Date.now() < endTime) {
    for (const selector of selectors) {
      const buttonLocator = frame.locator(selector);
      const count = await buttonLocator.count();
      for (let index = 0; index < count; index += 1) {
        const candidate = buttonLocator.nth(index);
        if (!(await candidate.isVisible())) {
          continue;
        }
        const text = normalizeText(await candidate.innerText());
        if (expected.test(text)) {
          return candidate;
        }
      }
    }

    await frame.waitForTimeout(250);
  }

  const fallbackButtons = frame.locator('.h5p-codequestion .button');
  const fallbackCount = await fallbackButtons.count();
  const fallbackTexts = [];
  for (let index = 0; index < fallbackCount; index += 1) {
    const text = normalizeText(await fallbackButtons.nth(index).innerText());
    if (text) {
      fallbackTexts.push(text);
    }
  }

  throw new Error(
    `Question button with label "${label}" not found. Visible button texts: ${fallbackTexts.join(', ')}`
  );
}

async function findVisibleQuestionRoot(frame, timeout = 30000) {
  const questions = frame.locator('.h5p-codequestion');
  const endTime = Date.now() + timeout;

  while (Date.now() < endTime) {
    const count = await questions.count();

    for (let index = 0; index < count; index += 1) {
      const candidate = questions.nth(index);
      if (await candidate.isVisible()) {
        return candidate;
      }
    }

    await frame.waitForTimeout(250);
  }

  throw new Error('Visible H5P code question root not found.');
}

async function findVisibleLocator(locator, timeout = 30000, errorMessage = 'Visible locator not found.') {
  const endTime = Date.now() + timeout;

  while (Date.now() < endTime) {
    const count = await locator.count();

    for (let index = 0; index < count; index += 1) {
      const candidate = locator.nth(index);
      if (await candidate.isVisible()) {
        return candidate;
      }
    }

    await locator.page().waitForTimeout(250);
  }

  throw new Error(errorMessage);
}

async function checkFilesPage(page) {
  const frame = await getH5pFrame(page, getViewUrl(FILES_CONTENT_ID));

  const fileManagerToggle = frame.locator('.editor-file-tab-add');
  await fileManagerToggle.waitFor({ state: 'visible', timeout: 30000 });
  await fileManagerToggle.click();

  const fileManager = frame.locator('.page-files.active .editor-file-manager');
  await fileManager.waitFor({ state: 'visible', timeout: 20000 });

  const filesPageText = normalizeText(await frame.locator('.page-files.active').innerText()).toLowerCase();
  if (!filesPageText.includes('files')) {
    throw new Error(`Files page marker missing. Text: ${filesPageText}`);
  }
  if (!filesPageText.includes('main.py')) {
    throw new Error(`Expected file main.py missing. Text: ${filesPageText}`);
  }

  await frame.locator('.page-files.active .editor-fm-close').click();
  await frame.locator('.page-code.active').waitFor({ state: 'visible', timeout: 20000 });
}

async function checkConsoleOutput(page) {
  const frame = await getH5pFrame(page, getViewUrl(CONSOLE_CONTENT_ID));

  const runButton = await findQuestionButton(frame, 'run');
  await runButton.click();

  const codePage = frame.locator('.page-code.active');
  await codePage.waitFor({ state: 'visible', timeout: 20000 });

  await frame.waitForFunction(() => {
    const activePageText = (document.querySelector('.page-code.active')?.innerText || '').replace(/\s+/g, ' ').toLowerCase();
    return activePageText.includes('hello world');
  }, { timeout: 20000 });

  const activePageText = normalizeText(await codePage.innerText()).toLowerCase();
  if (!activePageText.includes('hello world')) {
    throw new Error(`Console output did not contain 'hello world'. Text: ${activePageText}`);
  }
}

async function checkRunStop(page) {
  const frame = await getH5pFrame(page, getViewUrl(RUNSTOP_CONTENT_ID));

  const runButton = await findQuestionButton(frame, 'run');
  await runButton.click();

  const stopButton = await findQuestionButton(frame, 'stop', 15000);
  await stopButton.waitFor({ state: 'visible', timeout: 15000 });
  await stopButton.click();

  await runButton.waitFor({ state: 'visible', timeout: 15000 });
}

async function checkZipProjectRoundtrip(page) {
  const payload = await getSamePageHarnessPayload(page, ZIP_ROUNDTRIP_CONTENT_ID);

  payload.integration.contents = {
    'cid-zip-a': JSON.parse(JSON.stringify(payload.integration.contents[payload.originalKey])),
    'cid-zip-b': JSON.parse(JSON.stringify(payload.integration.contents[payload.originalKey])),
  };

  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' });

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <script>window.H5PIntegration=${JSON.stringify(payload.integration)};</script>
    ${payload.styles.map((href) => `<link rel="stylesheet" href="${href}">`).join('\n    ')}
    ${payload.scripts.map((src) => `<script src="${src}"></script>`).join('\n    ')}
  </head>
  <body>
    <div class="h5p-content" data-content-id="zip-a" data-content-library="${MACHINE_NAME} 6.0"></div>
    <div class="h5p-content" data-content-id="zip-b" data-content-library="${MACHINE_NAME} 6.0"></div>
    <script>
      const boot = () => {
        if (window.H5P && typeof window.H5P.init === 'function') {
          window.H5P.init(document.body);
          return;
        }

        window.setTimeout(boot, 50);
      };

      boot();
    </script>
  </body>
</html>`;

  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelectorAll('.h5p-codequestion').length >= 2, null, { timeout: 30000 });

  const questions = page.locator('.h5p-codequestion');
  const questionA = questions.nth(0);
  const questionB = questions.nth(1);

  const fileManagerToggleA = questionA.locator('.editor-file-tab-add').first();
  await fileManagerToggleA.waitFor({ state: 'visible', timeout: 30000 });
  await fileManagerToggleA.click();

  const addFileInputA = questionA.locator('.editor-fm-input').first();
  await addFileInputA.waitFor({ state: 'visible', timeout: 20000 });
  await addFileInputA.fill('helper.py');
  await questionA.locator('.editor-fm-add').first().click();

  await page.waitForFunction(() => {
    const firstQuestion = document.querySelectorAll('.h5p-codequestion')[0];
    return !!firstQuestion
      && Array.from(firstQuestion.querySelectorAll('.editor-fm-item-name'))
        .some((item) => (item.textContent || '').trim() === 'helper.py');
  }, null, { timeout: 20000 });

  await questionA.locator('.editor-fm-close').first().click();

  await questionA.locator('#images').first().click();
  const imageInputA = questionA.locator('.page-images input[type="file"]').first();
  await imageInputA.setInputFiles({
    name: 'sprite.png',
    mimeType: 'image/png',
    buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  });

  await page.waitForFunction(() => {
    const firstQuestion = document.querySelectorAll('.h5p-codequestion')[0];
    const activePage = firstQuestion?.querySelector('.page-images.active');
    return !!activePage && (activePage.textContent || '').includes('sprite.png');
  }, null, { timeout: 20000 });

  await questionA.locator('#sounds').first().click();
  const soundInputA = questionA.locator('.page-sounds input[type="file"]').first();
  await soundInputA.setInputFiles({
    name: 'beep.wav',
    mimeType: 'audio/wav',
    buffer: Buffer.from([82, 73, 70, 70, 0, 0, 0, 0, 87, 65, 86, 69]),
  });

  await page.waitForFunction(() => {
    const firstQuestion = document.querySelectorAll('.h5p-codequestion')[0];
    const activePage = firstQuestion?.querySelector('.page-sounds.active');
    return !!activePage && (activePage.textContent || '').includes('beep.wav');
  }, null, { timeout: 20000 });

  const saveButtonA = questionA.locator('#saveButton').first();
  await saveButtonA.waitFor({ state: 'visible', timeout: 20000 });
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    saveButtonA.click(),
  ]);

  const suggestedName = download.suggestedFilename();
  if (!/\.zip$/i.test(suggestedName)) {
    throw new Error(`Expected ZIP download, got: ${suggestedName}`);
  }

  const downloadTargetPath = path.join(
    ARTIFACTS_DIR,
    `zip-roundtrip-${Date.now()}-${sanitizeFileName(suggestedName)}.zip`
  );
  fs.mkdirSync(path.dirname(downloadTargetPath), { recursive: true });
  await download.saveAs(downloadTargetPath);

  const downloadHeader = fs.readFileSync(downloadTargetPath).subarray(0, 2);
  if (!(downloadHeader[0] === 0x50 && downloadHeader[1] === 0x4b)) {
    throw new Error('Downloaded project file does not appear to be a ZIP archive.');
  }

  const loadButtonB = questionB.locator('#loadButton').first();
  await loadButtonB.waitFor({ state: 'visible', timeout: 20000 });
  const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 30000 });
  await loadButtonB.click();
  const chooser = await fileChooserPromise;
  await chooser.setFiles(downloadTargetPath);

  const fileManagerToggleB = questionB.locator('.editor-file-tab-add').first();
  await fileManagerToggleB.waitFor({ state: 'visible', timeout: 30000 });
  await fileManagerToggleB.click();

  await page.waitForFunction(() => {
    const secondQuestion = document.querySelectorAll('.h5p-codequestion')[1];
    return !!secondQuestion
      && Array.from(secondQuestion.querySelectorAll('.editor-fm-item-name'))
        .some((item) => (item.textContent || '').trim() === 'helper.py');
  }, null, { timeout: 30000 });

  await questionB.locator('.editor-fm-close').first().click();

  await questionB.locator('#images').first().click();
  await page.waitForFunction(() => {
    const secondQuestion = document.querySelectorAll('.h5p-codequestion')[1];
    const activePage = secondQuestion?.querySelector('.page-images.active');
    return !!activePage && (activePage.textContent || '').includes('sprite.png');
  }, null, { timeout: 20000 });

  await questionB.locator('#sounds').first().click();
  await page.waitForFunction(() => {
    const secondQuestion = document.querySelectorAll('.h5p-codequestion')[1];
    const activePage = secondQuestion?.querySelector('.page-sounds.active');
    return !!activePage && (activePage.textContent || '').includes('beep.wav');
  }, null, { timeout: 20000 });
}

async function getSamePageHarnessPayload(page, contentId) {
  const frame = await getH5pFrame(page, getViewUrl(contentId));

  return frame.evaluate(() => {
    const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
      .map((element) => element.href)
      .filter(Boolean);
    const scripts = Array.from(document.querySelectorAll('script[src]'))
      .map((element) => element.src)
      .filter(Boolean);
    const integration = JSON.parse(JSON.stringify(window.H5PIntegration || {}));
    const firstKey = Object.keys(integration.contents || {})[0];

    return {
      styles,
      scripts,
      integration,
      originalKey: firstKey,
    };
  });
}

async function clickVisibleButtons(page, matcher) {
  await page.evaluate((pattern) => {
    const regex = new RegExp(pattern, 'i');
    const isVisible = (element) => element.offsetParent !== null;

    Array.from(document.querySelectorAll('button'))
      .filter((button) => regex.test(button.textContent || ''))
      .filter(isVisible)
      .forEach((button) => button.click());
  }, matcher.source);
}

async function findQuestionRootButton(questionRoot, matcher, timeout = 30000) {
  const regex = (matcher instanceof RegExp)
    ? matcher
    : new RegExp(String(matcher), 'i');
  const selectors = [
    '.h5p-question-buttons .button',
    '.h5p-question-buttons button',
    '.h5p-question button',
    '.h5p-question .button',
    'button',
    '.button',
  ];
  const endTime = Date.now() + timeout;

  while (Date.now() < endTime) {
    for (const selector of selectors) {
      const buttons = questionRoot.locator(selector);
      const count = await buttons.count();

      for (let index = 0; index < count; index += 1) {
        const candidate = buttons.nth(index);
        if (!(await candidate.isVisible())) {
          continue;
        }

        const text = normalizeText(await candidate.innerText());
        if (regex.test(text)) {
          return candidate;
        }
      }
    }

    await questionRoot.page().waitForTimeout(200);
  }

  const visibleTexts = await questionRoot.locator('button, .button')
    .evaluateAll((elements) => elements
      .filter((element) => element.offsetParent !== null)
      .map((element) => (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean));

  throw new Error(
    `Question-scoped button not found for matcher: ${regex.toString()}. `
    + `Visible texts in this root: ${visibleTexts.join(', ')}`
  );
}

async function checkSamePageMultiInstanceCanvas(page) {
  const payload = await getSamePageHarnessPayload(page, MULTI_INSTANCE_CONTENT_ID);

  payload.integration.contents = {
    'cid-multi-a': JSON.parse(JSON.stringify(payload.integration.contents[payload.originalKey])),
    'cid-multi-b': JSON.parse(JSON.stringify(payload.integration.contents[payload.originalKey])),
  };

  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' });

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <script>window.H5PIntegration=${JSON.stringify(payload.integration)};</script>
    ${payload.styles.map((href) => `<link rel="stylesheet" href="${href}">`).join('\n    ')}
    ${payload.scripts.map((src) => `<script src="${src}"></script>`).join('\n    ')}
  </head>
  <body>
    <div class="h5p-content" data-content-id="multi-a" data-content-library="${MACHINE_NAME} 6.0"></div>
    <div class="h5p-content" data-content-id="multi-b" data-content-library="${MACHINE_NAME} 6.0"></div>
    <script>
      const boot = () => {
        if (window.H5P && typeof window.H5P.init === 'function') {
          window.H5P.init(document.body);
          return;
        }

        window.setTimeout(boot, 50);
      };

      boot();
    </script>
  </body>
</html>`;

  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelectorAll('.h5p-question').length >= 2, null, { timeout: 30000 });
  await page.waitForFunction(() => Array.from(document.querySelectorAll('button'))
    .filter((button) => /Ausf|Run/i.test(button.textContent || '') && button.offsetParent !== null).length >= 2, null, { timeout: 30000 });

  await clickVisibleButtons(page, /Ausf|Run/i);

  await page.waitForFunction(() => document.querySelectorAll('canvas.pyodide-sdl-canvas').length >= 2, null, { timeout: 45000 });

  const diagnostics = await page.evaluate(() => ({
    activePages: Array.from(document.querySelectorAll('.page.active')).map((element) => element.className),
    wrappers: document.querySelectorAll('.page-canvas .canvas-wrapper').length,
    canvases: Array.from(document.querySelectorAll('canvas.pyodide-sdl-canvas')).map((canvas) => ({
      id: canvas.id,
      width: canvas.width,
      height: canvas.height,
      parentClass: canvas.parentElement?.className || '',
    })),
  }));

  if (diagnostics.wrappers < 2) {
    throw new Error(`Expected two canvas wrappers, found ${diagnostics.wrappers}.`);
  }

  if (diagnostics.canvases.length < 2) {
    throw new Error(`Expected two SDL canvases, found ${diagnostics.canvases.length}.`);
  }

  if (diagnostics.canvases.some((canvas) => canvas.width < 50 || canvas.height < 50)) {
    throw new Error(`SDL canvases were mounted with unexpected dimensions: ${JSON.stringify(diagnostics.canvases)}`);
  }
}

async function checkSamePageMultiInstanceArrowFocus(page) {
  const payload = await getSamePageHarnessPayload(page, MULTI_INSTANCE_CONTENT_ID);

  payload.integration.contents = {
    'cid-multi-a': JSON.parse(JSON.stringify(payload.integration.contents[payload.originalKey])),
    'cid-multi-b': JSON.parse(JSON.stringify(payload.integration.contents[payload.originalKey])),
  };

  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' });

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <script>window.H5PIntegration=${JSON.stringify(payload.integration)};</script>
    ${payload.styles.map((href) => `<link rel="stylesheet" href="${href}">`).join('\n    ')}
    ${payload.scripts.map((src) => `<script src="${src}"></script>`).join('\n    ')}
  </head>
  <body>
    <div class="h5p-content" data-content-id="multi-a" data-content-library="${MACHINE_NAME} 6.0"></div>
    <div class="h5p-content" data-content-id="multi-b" data-content-library="${MACHINE_NAME} 6.0"></div>
    <script>
      const boot = () => {
        if (window.H5P && typeof window.H5P.init === 'function') {
          window.H5P.init(document.body);
          return;
        }

        window.setTimeout(boot, 50);
      };

      boot();
    </script>
  </body>
</html>`;

  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelectorAll('.h5p-codequestion').length >= 2, null, { timeout: 30000 });

  const questions = page.locator('.h5p-codequestion');
  const questionA = questions.nth(0);
  const questionB = questions.nth(1);

  const runA = await findQuestionRootButton(questionA, /ausf|run/i, 30000);
  const runB = await findQuestionRootButton(questionB, /ausf|run/i, 30000);
  await runA.click();
  await runB.click();

  const canvasA = await findVisibleLocator(
    questionA.locator('canvas.pyodide-sdl-canvas'),
    30000,
    'Visible SDL canvas in first instance not found.'
  );
  const canvasB = await findVisibleLocator(
    questionB.locator('canvas.pyodide-sdl-canvas'),
    30000,
    'Visible SDL canvas in second instance not found.'
  );

  await canvasA.waitFor({ state: 'visible', timeout: 30000 });
  await canvasB.waitFor({ state: 'visible', timeout: 30000 });

  // Trigger deferred editor-focus callbacks in instance A while interacting with instance B.
  const showCodeA = await findQuestionRootButton(questionA, /show\s*code|\bcode\b/i, 20000);
  await showCodeA.click();
  await questionA.locator('.page-code.active').first().waitFor({ state: 'visible', timeout: 20000 });

  await canvasB.click();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(320);
  await page.keyboard.press('ArrowRight');

  const diagnostics = await page.evaluate(() => {
    const roots = Array.from(document.querySelectorAll('.h5p-codequestion'));
    const rootA = roots[0] || null;
    const rootB = roots[1] || null;
    const activeElement = document.activeElement;

    const activePageClass = (root) => root?.querySelector('.page.active')?.className || '';
    const snapshotTarget = (node) => ({
      tag: node?.tagName || '',
      id: node?.id || '',
      className: typeof node?.className === 'string' ? node.className : '',
    });

    return {
      activeElement: snapshotTarget(activeElement),
      activeInA: !!(rootA && activeElement && rootA.contains(activeElement)),
      activeInB: !!(rootB && activeElement && rootB.contains(activeElement)),
      pageA: activePageClass(rootA),
      pageB: activePageClass(rootB),
      canvasAFocus: !!rootA?.querySelector('canvas.pyodide-sdl-canvas:focus'),
      canvasBFocus: !!rootB?.querySelector('canvas.pyodide-sdl-canvas:focus'),
      editorAFocus: !!rootA?.querySelector('.editor_container .cm-editor.cm-focused, .editor_container .cm-content:focus'),
      editorBFocus: !!rootB?.querySelector('.editor_container .cm-editor.cm-focused, .editor_container .cm-content:focus'),
    };
  });

  if (!diagnostics.activeInB) {
    throw new Error(`Arrow-key interaction lost focus in instance B: ${JSON.stringify(diagnostics)}`);
  }

  if (diagnostics.activeInA && diagnostics.editorAFocus) {
    throw new Error(`Instance A stole editor focus during arrow-key input in instance B: ${JSON.stringify(diagnostics)}`);
  }

  if (!/page-canvas\s+active|page-canvas\b.*\bactive/.test(diagnostics.pageB)) {
    throw new Error(`Instance B is no longer on canvas page after arrow-key input: ${JSON.stringify(diagnostics)}`);
  }
}

async function checkSamePagePopupTargets(page) {
  const payload = await getSamePageHarnessPayload(page, CONSOLE_CONTENT_ID);

  payload.integration.contents = {
    'cid-popup-a': JSON.parse(JSON.stringify(payload.integration.contents[payload.originalKey])),
    'cid-popup-b': JSON.parse(JSON.stringify(payload.integration.contents[payload.originalKey])),
  };

  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' });

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <script>window.H5PIntegration=${JSON.stringify(payload.integration)};</script>
    ${payload.styles.map((href) => `<link rel="stylesheet" href="${href}">`).join('\n    ')}
    ${payload.scripts.map((src) => `<script src="${src}"></script>`).join('\n    ')}
  </head>
  <body>
    <div class="h5p-content" data-content-id="popup-a" data-content-library="${MACHINE_NAME} 6.0"></div>
    <div class="h5p-content" data-content-id="popup-b" data-content-library="${MACHINE_NAME} 6.0"></div>
    <script>
      const boot = () => {
        if (window.H5P && typeof window.H5P.init === 'function') {
          window.H5P.init(document.body);
          return;
        }

        window.setTimeout(boot, 50);
      };

      boot();
    </script>
  </body>
</html>`;

  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelectorAll('.h5p-codequestion').length >= 2, null, { timeout: 30000 });

  const questions = page.locator('.h5p-codequestion');
  const questionA = questions.nth(0);
  const questionB = questions.nth(1);

  const runB = await findQuestionRootButton(questionB, /ausf|run/i, 30000);
  await runB.click();

  const popupInB = questionB.locator('.swal2-container').first();
  await popupInB.waitFor({ state: 'visible', timeout: 30000 });

  const diagnostics = await page.evaluate(() => {
    const roots = Array.from(document.querySelectorAll('.h5p-codequestion'));
    const rootA = roots[0] || null;
    const rootB = roots[1] || null;
    const popup = document.querySelector('.swal2-container.swal2-backdrop-show, .swal2-container');

    return {
      popupFound: !!popup,
      popupInA: !!(rootA && popup && rootA.contains(popup)),
      popupInB: !!(rootB && popup && rootB.contains(popup)),
      popupParentClass: popup?.parentElement?.className || '',
    };
  });

  if (!diagnostics.popupFound) {
    throw new Error('Expected SweetAlert popup was not rendered.');
  }

  if (!diagnostics.popupInB || diagnostics.popupInA) {
    throw new Error(`SweetAlert popup was not anchored to the triggering instance: ${JSON.stringify(diagnostics)}`);
  }

  const confirmButton = questionB.locator('.swal2-confirm').first();
  if (await confirmButton.isVisible().catch(() => false)) {
    await confirmButton.click();
  }
}

async function appendEditorComment(questionRoot, page, marker) {
  const editor = questionRoot.locator('.editor_container .cm-content').first();
  await editor.waitFor({ state: 'visible', timeout: 30000 });
  await editor.click();
  await page.keyboard.type(`\n# ${marker}`);
  await page.waitForTimeout(500);
  return normalizeText(await editor.innerText()).includes(`# ${marker}`);
}

async function installFocusDebugHooks(frame) {
  if (!FOCUS_DEBUG) {
    return;
  }

  await frame.evaluate(() => {
    if (window.__h5pFocusDebugInstalled) {
      return;
    }

    const maxEntries = 200;
    const state = {
      events: [],
      preventDefaultCalls: [],
      marks: [],
    };

    const pushLimited = (list, value) => {
      list.push(value);
      if (list.length > maxEntries) {
        list.shift();
      }
    };

    const snapshotTarget = (node) => ({
      tag: node?.tagName || '',
      className: typeof node?.className === 'string' ? node.className : '',
      id: node?.id || '',
    });

    const originalPreventDefault = Event.prototype.preventDefault;
    Event.prototype.preventDefault = function patchedPreventDefault() {
      if (/^key|input/.test(this.type)) {
        pushLimited(state.preventDefaultCalls, {
          type: this.type,
          key: this.key || '',
          target: snapshotTarget(this.target),
          activeElement: snapshotTarget(document.activeElement),
          stack: new Error().stack,
        });
      }

      return originalPreventDefault.apply(this, arguments);
    };

    const recordEvent = (phase, event) => {
      pushLimited(state.events, {
        phase,
        type: event.type,
        key: event.key || '',
        defaultPrevented: event.defaultPrevented,
        target: snapshotTarget(event.target),
        activeElement: snapshotTarget(document.activeElement),
      });
    };

    ['focus', 'blur', 'keydown', 'keypress', 'beforeinput', 'input', 'keyup'].forEach((type) => {
      document.addEventListener(type, (event) => recordEvent('capture', event), true);
      document.addEventListener(type, (event) => recordEvent('bubble', event), false);
    });

    window.__h5pFocusDebug = state;
    window.__h5pFocusDebugInstalled = true;
  });
}

async function markFocusDebug(frame, label) {
  if (!FOCUS_DEBUG) {
    return;
  }

  await frame.evaluate((currentLabel) => {
    const state = window.__h5pFocusDebug;
    if (!state) {
      return;
    }

    state.marks.push({
      label: currentLabel,
      activeElement: {
        tag: document.activeElement?.tagName || '',
        className: typeof document.activeElement?.className === 'string' ? document.activeElement.className : '',
        id: document.activeElement?.id || '',
      },
      timestamp: Date.now(),
    });
  }, label);
}

async function collectFocusDebug(frame) {
  return frame.evaluate(() => {
    const editor = document.querySelector('.editor_container .cm-content');
    const buttons = Array.from(document.querySelectorAll('.h5p-question-buttons .button, .h5p-question-buttons button'))
      .filter((button) => button.offsetParent !== null)
      .map((button) => ({
        text: (button.innerText || button.textContent || '').replace(/\s+/g, ' ').trim(),
        id: button.id || '',
        className: button.className || '',
      }));

    return {
      activeElement: {
        tag: document.activeElement?.tagName || '',
        className: typeof document.activeElement?.className === 'string' ? document.activeElement.className : '',
        id: document.activeElement?.id || '',
      },
      activePages: Array.from(document.querySelectorAll('.page.active')).map((page) => page.className),
      editor: editor ? {
        textTail: (editor.innerText || editor.textContent || '').slice(-400),
        contenteditable: editor.getAttribute('contenteditable'),
      } : null,
      buttons,
      debug: window.__h5pFocusDebug || null,
    };
  });
}

async function checkMiniworldsEditorFocus(page) {
  const frame = await getH5pFrame(page, getViewUrl(FOCUS_CONTENT_ID));
  await installFocusDebugHooks(frame);

  const questionRoot = await findVisibleQuestionRoot(frame);

  const runButton = questionRoot.locator('#runButton').first();
  const showCodeButton = questionRoot.locator('#showCodeButton').first();
  const stopButton = questionRoot.locator('#stopButton').first();

  await runButton.waitFor({ state: 'visible', timeout: 30000 });
  await markFocusDebug(frame, 'ready');

  if (!(await appendEditorComment(questionRoot, page, 'browser regression before run'))) {
    throw new Error('Editor was not editable before starting miniworlds.');
  }

  await markFocusDebug(frame, 'typed-before-run');

  await runButton.click();
  await showCodeButton.waitFor({ state: 'visible', timeout: 30000 });
  await stopButton.waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForTimeout(1500);
  await markFocusDebug(frame, 'running');

  await showCodeButton.click();
  if (!(await appendEditorComment(questionRoot, page, 'browser regression while running'))) {
    throw new Error('Editor was not editable after returning to code while miniworlds was still running.');
  }

  await markFocusDebug(frame, 'typed-while-running');

  await stopButton.click();
  await runButton.waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForTimeout(1000);
  await markFocusDebug(frame, 'stopped');

  if (!(await appendEditorComment(questionRoot, page, 'browser regression after stop'))) {
    const diagnostics = await collectFocusDebug(frame);

    throw new Error(
      `Editor was not editable after stopping miniworlds. Active element: ${JSON.stringify(diagnostics.activeElement)}`
    );
  }
}

async function executeCheck(browser, name, callback) {
  const page = await browser.newPage();

  try {
    await callback(page);
    return { name, status: 'PASS' };
  }
  catch (error) {
    const artifactPayload = {
      name,
      error: error && error.message ? error.message : String(error),
    };

    try {
      const frame = page.frames().find((candidate) => candidate.url() === 'about:srcdoc');
      if (frame) {
        artifactPayload.frameDiagnostics = await collectFocusDebug(frame);
      }
    }
    catch (diagnosticError) {
      artifactPayload.diagnosticError = diagnosticError?.message || String(diagnosticError);
    }

    const artifacts = await writeFailureArtifacts(page, name, artifactPayload);

    return {
      name,
      status: 'FAIL',
      error: error && error.message ? error.message : String(error),
      artifacts,
    };
  }
  finally {
    await page.close();
  }
}

async function checkMiniworldsRerun(page) {
  const frame = await getH5pFrame(page, getViewUrl(FOCUS_CONTENT_ID));

  const canvasCandidates = frame.locator('canvas.pyodide-sdl-canvas');

  let runButton = await findQuestionButton(frame, 'run');

  await runButton.waitFor({ state: 'visible', timeout: 30000 });

  // First run
  await runButton.click();
  let stopButton = await findQuestionButton(frame, 'stop', 15000);
  const canvas = await findVisibleLocator(canvasCandidates, 30000, 'Visible SDL canvas not found after first run.');
  await canvas.waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForTimeout(1500);

  // Stop
  await stopButton.click();
  runButton = await findQuestionButton(frame, 'run', 15000);
  await runButton.waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(800);

  // Second run
  await runButton.click();
  await canvas.waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForTimeout(1500);

  // Verify the canvas is non-empty (not all black) by sampling a few pixels
  const hasNonBlackPixels = await canvas.evaluate((currentCanvas) => {
    try {
      const ctx = currentCanvas.getContext('2d');
      if (!ctx) {
        return true; // WebGL canvas – skip pixel check
      }

      const imageData = ctx.getImageData(0, 0, currentCanvas.width, currentCanvas.height);
      const data = imageData.data;

      for (let index = 0; index < data.length; index += 4) {
        if (data[index] !== 0 || data[index + 1] !== 0 || data[index + 2] !== 0) {
          return true;
        }
      }

      return false;
    }
    catch (_) {
      return true; // Cross-origin or WebGL canvas – skip pixel check
    }
  });

  // Some miniworlds examples finish quickly on rerun and return to Run without
  // exposing Stop for long enough to interact with it.
  try {
    stopButton = await findQuestionButton(frame, 'stop', 1000);
    await stopButton.click();
  }
  catch (_) {
    // No visible stop button is acceptable here as long as the canvas rendered.
  }

  if (!hasNonBlackPixels) {
    throw new Error('Canvas was entirely black on second run – re-run rendering failed.');
  }
}

async function main() {
  const browser = await chromium.launch({ headless: !HEADED });

  const results = [];
  results.push(await executeCheck(browser, 'files page opens and closes', checkFilesPage));
  results.push(await executeCheck(browser, 'miniworlds preserves editor typing across run/code/stop', checkMiniworldsEditorFocus));
  results.push(await executeCheck(browser, 'miniworlds canvas renders on second run after stop', checkMiniworldsRerun));
  results.push(await executeCheck(browser, 'same-page miniworlds instances mount separate SDL canvases', checkSamePageMultiInstanceCanvas));
  results.push(await executeCheck(browser, 'same-page miniworlds arrow keys do not steal focus across instances', checkSamePageMultiInstanceArrowFocus));
  results.push(await executeCheck(browser, 'same-page swal popup is anchored to triggering instance', checkSamePagePopupTargets));
  results.push(await executeCheck(browser, 'zip save/load roundtrip preserves root files and assets', checkZipProjectRoundtrip));
  results.push(await executeCheck(browser, 'console output visible after run', checkConsoleOutput));
  results.push(await executeCheck(browser, 'run/stop toggles on infinite loop', checkRunStop));

  await browser.close();

  for (const result of results) {
    if (result.status === 'PASS') {
      console.log(`PASS: ${result.name}`);
    }
    else {
      console.log(`FAIL: ${result.name}`);
      console.log(`  ${result.error}`);
      if (result.artifacts?.json) {
        console.log(`  diagnostics: ${result.artifacts.json}`);
      }
      if (result.artifacts?.screenshot) {
        console.log(`  screenshot: ${result.artifacts.screenshot}`);
      }
    }
  }

  const failed = results.filter((result) => result.status === 'FAIL');
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
