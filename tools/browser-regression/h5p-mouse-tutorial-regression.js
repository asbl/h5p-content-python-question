const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE_URL = process.env.H5P_BASE_URL || 'http://localhost:8080';
const MACHINE_NAME = process.env.H5P_MACHINE_NAME || 'H5P.PythonQuestion';
const TUTORIAL_CONTENT_ID = process.env.H5P_TUTORIAL_CONTENT_ID || 'miniworlds-tutorial';
const HEADED = process.env.H5P_HEADED === '1';

/**
 * Builds the H5P view URL for a content id.
 * @param {string} contentId - Content identifier.
 * @returns {string} Absolute view URL.
 */
function getViewUrl(contentId) {
  return `${BASE_URL}/view/${MACHINE_NAME}/${contentId}`;
}

/**
 * Normalizes text content for robust matcher checks.
 * @param {*} value - Input value.
 * @returns {string} Collapsed single-line text.
 */
function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

/**
 * Opens an H5P content page and resolves the iframe context.
 * @param {import('playwright').Page} page - Playwright page.
 * @param {string} url - Target URL.
 * @returns {Promise<import('playwright').Frame>} Resolved H5P frame.
 */
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

/**
 * Finds the first visible question root inside the H5P frame.
 * @param {import('playwright').Frame} frame - H5P frame.
 * @param {number} [timeout] - Timeout in ms.
 * @returns {Promise<import('playwright').Locator>} Visible question locator.
 */
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

/**
 * Finds a visible button inside one question root.
 * @param {import('playwright').Locator} questionRoot - Root question locator.
 * @param {RegExp|string} matcher - Button label matcher.
 * @param {number} [timeout] - Timeout in ms.
 * @returns {Promise<import('playwright').Locator>} Matching button locator.
 */
async function findQuestionRootButton(questionRoot, matcher, timeout = 30000) {
  const regex = (matcher instanceof RegExp)
    ? matcher
    : new RegExp(String(matcher), 'i');

  const selectors = [
    '.h5p-question-buttons .button',
    '.h5p-question-buttons button',
    '.h5p-question .button',
    '.h5p-question button',
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

  throw new Error(`Button not found for matcher: ${regex.toString()}`);
}

/**
 * Loads mouse tutorial examples from content JSON.
 * @returns {{clickExample: string, followExample: string}} Extracted code samples.
 */
function loadTutorialMouseExamples() {
  const tutorialPath = path.resolve(
    __dirname,
    '../../../../content/miniworlds-tutorial/content.json'
  );

  const parsed = JSON.parse(fs.readFileSync(tutorialPath, 'utf8'));
  const codeItems = (parsed.contents || []).filter((item) => item && item.type === 'code' && typeof item.code === 'string');

  const clickExample = codeItems.find((item) => item.code.includes('def on_clicked_left'));
  const followExample = codeItems.find((item) => item.code.includes('def on_mouse_left_down'));

  if (!clickExample || !followExample) {
    throw new Error('Could not find mouse examples in miniworlds tutorial content.');
  }

  return {
    clickExample: clickExample.code,
    followExample: followExample.code,
  };
}

/**
 * Replaces the complete editor content of a question.
 * @param {import('playwright').Locator} questionRoot - Question root locator.
 * @param {import('playwright').Page} page - Playwright page.
 * @param {string} code - Replacement code.
 * @returns {Promise<void>} Resolves when editor content is replaced.
 */
async function replaceEditorCode(questionRoot, page, code) {
  const editorContent = questionRoot.locator('.editor_container .cm-content').first();
  await editorContent.waitFor({ state: 'visible', timeout: 30000 });
  await editorContent.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Backspace');
  await page.keyboard.insertText(code);
  await page.waitForTimeout(400);
}

/**
 * Waits until console-like output contains a matching string.
 * @param {import('playwright').Locator} questionRoot - Question root locator.
 * @param {RegExp|string} matcher - Expected text matcher.
 * @param {number} [timeout] - Timeout in ms.
 * @returns {Promise<string>} Captured console text.
 */
async function waitForConsoleText(questionRoot, matcher, timeout = 5000) {
  const regex = matcher instanceof RegExp ? matcher : new RegExp(String(matcher), 'i');
  const endTime = Date.now() + timeout;

  while (Date.now() < endTime) {
    const text = await questionRoot.evaluate((root) => {
      const nodes = root.querySelectorAll('.console_wrapper, .page-code.active, .h5p-question');
      return Array.from(nodes)
        .map((node) => (node.innerText || node.textContent || '').replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .join('\n');
    });

    if (regex.test(text)) {
      return text;
    }

    await questionRoot.page().waitForTimeout(200);
  }

  throw new Error(`Console text did not match ${regex.toString()} within ${timeout}ms.`);
}

/**
 * Waits until the SDL canvas is visible and interaction-ready.
 * @param {import('playwright').Locator} questionRoot - Question root locator.
 * @param {number} [timeout] - Timeout in ms.
 * @returns {Promise<object>} Canvas readiness diagnostics.
 */
async function waitForCanvasInteractable(questionRoot, timeout = 30000) {
  const canvas = questionRoot.locator('canvas.pyodide-sdl-canvas').first();
  await canvas.waitFor({ state: 'visible', timeout });

  const endTime = Date.now() + timeout;

  while (Date.now() < endTime) {
    const state = await canvas.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const topElement = document.elementFromPoint(centerX, centerY);
      const loading = document.querySelector('.canvas-loading:not([hidden])');

      return {
        canvasMatchesTop: topElement === el,
        hasVisibleLoadingOverlay: Boolean(loading),
        width: el.width,
        height: el.height,
      };
    });

    if (state.canvasMatchesTop && !state.hasVisibleLoadingOverlay && state.width > 0 && state.height > 0) {
      return state;
    }

    await questionRoot.page().waitForTimeout(250);
  }

  throw new Error('Canvas did not become interactable before timeout.');
}

/**
 * Clicks the center of the active SDL canvas and returns diagnostics.
 * @param {import('playwright').Locator} questionRoot - Question root locator.
 * @returns {Promise<object>} Canvas placement diagnostics.
 */
async function clickCanvasCenter(questionRoot) {
  const canvas = questionRoot.locator('canvas.pyodide-sdl-canvas').first();
  await canvas.waitFor({ state: 'visible', timeout: 30000 });
  await waitForCanvasInteractable(questionRoot);

  const diag = await canvas.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const topElement = document.elementFromPoint(centerX, centerY);

    return {
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      topElementTag: topElement ? topElement.tagName : null,
      topElementClass: topElement ? topElement.className : null,
      canvasMatchesTop: topElement === el,
      canvasWidth: el.width,
      canvasHeight: el.height,
    };
  });

  const clickX = Math.max(1, Math.floor(diag.rect.width / 2));
  const clickY = Math.max(1, Math.floor(diag.rect.height / 2));

  await questionRoot.page().waitForTimeout(800);
  await canvas.click({ position: { x: clickX, y: clickY } });
  await questionRoot.page().waitForTimeout(250);
  await canvas.click({ position: { x: clickX, y: clickY } });
  await questionRoot.page().waitForTimeout(250);
  await canvas.click({ position: { x: clickX, y: clickY } });
  await questionRoot.page().waitForTimeout(600);

  return diag;
}

/**
 * Installs lightweight DOM mouse probes for debugging diagnostics.
 * @param {import('playwright').Locator} questionRoot - Question root locator.
 * @returns {Promise<void>} Resolves when probe is installed.
 */
async function installDomMouseProbe(questionRoot) {
  await questionRoot.evaluate((root) => {
    const canvas = root.querySelector('canvas.pyodide-sdl-canvas');
    if (!canvas) {
      return;
    }

    if (window.__h5pMouseProbeInstalled) {
      return;
    }

    window.__h5pMouseProbeInstalled = true;
    window.__h5pMouseProbe = {
      canvas: { mousedown: 0, mouseup: 0, click: 0, pointerdown: 0, pointerup: 0 },
      document: { mousedown: 0, mouseup: 0, click: 0, pointerdown: 0, pointerup: 0 },
    };

    const canvasEvents = ['mousedown', 'mouseup', 'click', 'pointerdown', 'pointerup'];
    canvasEvents.forEach((type) => {
      canvas.addEventListener(type, () => {
        window.__h5pMouseProbe.canvas[type] += 1;
      }, true);

      document.addEventListener(type, () => {
        window.__h5pMouseProbe.document[type] += 1;
      }, true);
    });
  });
}

/**
 * Reads current probe diagnostics from browser globals.
 * @param {import('playwright').Locator} questionRoot - Question root locator.
 * @returns {Promise<object>} Probe state snapshot.
 */
async function readDomMouseProbe(questionRoot) {
  return questionRoot.evaluate(() => ({
    domProbe: window.__h5pMouseProbe || null,
    syntheticPosted: window.__h5pSyntheticMousePosted || 0,
    installMouseCaptureRuns: window.__h5pInstallMouseCaptureRuns || 0,
  }));
}

/**
 * Clicks stop button when a run is currently active.
 * @param {import('playwright').Locator} questionRoot - Question root locator.
 * @returns {Promise<void>} Resolves after optional stop.
 */
async function stopIfRunning(questionRoot) {
  try {
    const stopButton = await findQuestionRootButton(questionRoot, /stop|stopp/i, 1200);
    await stopButton.click();
    await questionRoot.page().waitForTimeout(400);
  }
  catch (_) {
    // No stop button visible is acceptable.
  }
}

/**
 * Validates tutorial click callback wiring by injecting a JS marker.
 * @param {import('playwright').Frame} frame - H5P frame.
 * @param {import('playwright').Page} page - Playwright page.
 * @param {string} code - Learner code sample.
 * @returns {Promise<object>} Diagnostic result.
 */
async function runClickColorChangeCheck(frame, page, code) {
  const instrumentedCode = code
    .replace('import miniworlds', 'import miniworlds\nfrom js import window')
    .replace('self.color = (255, 0, 0)  # wird rot', 'self.color = (255, 0, 0)  # wird rot\n    window.__tutorialMouseClickSeen = True');

  const questionRoot = await findVisibleQuestionRoot(frame);

  await stopIfRunning(questionRoot);
  await replaceEditorCode(questionRoot, page, instrumentedCode);

  await questionRoot.evaluate(() => {
    window.__tutorialMouseClickSeen = false;
  });

  const runButton = await findQuestionRootButton(questionRoot, /run|ausf/i, 20000);
  await runButton.click();
  await waitForCanvasInteractable(questionRoot);

  await installDomMouseProbe(questionRoot);

  const canvasDiag = await clickCanvasCenter(questionRoot);
  const probeState = await readDomMouseProbe(questionRoot);
  const callbackSeen = await questionRoot.evaluate(() => Boolean(window.__tutorialMouseClickSeen));

  await stopIfRunning(questionRoot);

  if (!callbackSeen) {
    throw new Error(
      `on_clicked_left callback did not set JS marker. canvasDiag=${JSON.stringify(canvasDiag)} domProbe=${JSON.stringify(probeState.domProbe)}`
      + ` syntheticPosted=${probeState.syntheticPosted}`
      + ` installRuns=${probeState.installMouseCaptureRuns}`
    );
  }

  return {
    callbackSeen,
    canvasDiag,
    domProbe: probeState.domProbe,
    syntheticPosted: probeState.syntheticPosted,
    installMouseCaptureRuns: probeState.installMouseCaptureRuns,
  };
}

/**
 * Validates tutorial follow callback wiring by injecting a JS marker.
 * @param {import('playwright').Frame} frame - H5P frame.
 * @param {import('playwright').Page} page - Playwright page.
 * @param {string} code - Learner code sample.
 * @returns {Promise<object>} Diagnostic result.
 */
async function runFollowMovementCheck(frame, page, code) {
  const instrumentedCode = code
    .replace('import miniworlds', 'import miniworlds\nfrom js import window')
    .replace('print("Folgemodus:", self.is_following)', 'print("Folgemodus:", self.is_following)\n    window.__tutorialMouseDownSeen = True');

  const questionRoot = await findVisibleQuestionRoot(frame);

  await stopIfRunning(questionRoot);
  await replaceEditorCode(questionRoot, page, instrumentedCode);

  await questionRoot.evaluate(() => {
    window.__tutorialMouseDownSeen = false;
  });

  const runButton = await findQuestionRootButton(questionRoot, /run|ausf/i, 20000);
  await runButton.click();
  await waitForCanvasInteractable(questionRoot);

  await installDomMouseProbe(questionRoot);

  const canvasDiag = await clickCanvasCenter(questionRoot);
  const canvas = questionRoot.locator('canvas.pyodide-sdl-canvas').first();
  await canvas.hover({ position: { x: 20, y: 20 } });
  await questionRoot.page().waitForTimeout(1400);
  const probeState = await readDomMouseProbe(questionRoot);
  const callbackSeen = await questionRoot.evaluate(() => Boolean(window.__tutorialMouseDownSeen));

  await stopIfRunning(questionRoot);

  if (!callbackSeen) {
    throw new Error(
      `on_mouse_left_down callback did not set JS marker. canvasDiag=${JSON.stringify(canvasDiag)} domProbe=${JSON.stringify(probeState.domProbe)}`
      + ` syntheticPosted=${probeState.syntheticPosted}`
      + ` installRuns=${probeState.installMouseCaptureRuns}`
    );
  }

  return {
    callbackSeen,
    canvasDiag,
    domProbe: probeState.domProbe,
    syntheticPosted: probeState.syntheticPosted,
    installMouseCaptureRuns: probeState.installMouseCaptureRuns,
  };
}

/**
 * Runs a queue-level diagnostic to verify mouse and keyboard events reach pygame.
 * @param {import('playwright').Frame} frame - H5P frame.
 * @param {import('playwright').Page} page - Playwright page.
 * @returns {Promise<object>} Queue diagnostic result.
 */
async function runPygameMouseQueueDiagnostic(frame, page) {
  const diagnosticCode = [
    'import miniworlds',
    'import pygame',
    'from js import window',
    '',
    'world = miniworlds.World(400, 300)',
    'world.add_background((0, 0, 0))',
    'probe = miniworlds.Circle((200, 150), 20)',
    'probe.color = (255, 255, 0)',
    '',
    '@probe.register',
    'def act(self):',
    '    events = pygame.event.get()',
    '    for event in events:',
    '        if event.type == pygame.MOUSEBUTTONDOWN:',
    '            window.__tutorialMouseQueueSeen = True',
    '            print(\'MOUSEBUTTONDOWN\', getattr(event, \'pos\', None))',
    '        if event.type == pygame.MOUSEBUTTONUP:',
    '            window.__tutorialMouseQueueSeen = True',
    '            print(\'MOUSEBUTTONUP\', getattr(event, \'pos\', None))',
    '        if event.type == pygame.MOUSEMOTION:',
    '            window.__tutorialMouseQueueSeen = True',
    '            print(\'MOUSEMOTION\', getattr(event, \'pos\', None))',
    '        if event.type == pygame.KEYDOWN:',
    '            window.__tutorialKeyboardQueueSeen = True',
    '            print(\'KEYDOWN\', getattr(event, \'key\', None))',
    '',
    'world.run()',
    '',
  ].join('\n');

  const questionRoot = await findVisibleQuestionRoot(frame);
  await stopIfRunning(questionRoot);
  await replaceEditorCode(questionRoot, page, diagnosticCode);

  await questionRoot.evaluate(() => {
    window.__tutorialMouseQueueSeen = false;
    window.__tutorialKeyboardQueueSeen = false;
  });

  const runButton = await findQuestionRootButton(questionRoot, /run|ausf/i, 20000);
  await runButton.click();

  const canvasDiag = await clickCanvasCenter(questionRoot);
  await page.keyboard.press('ArrowRight');
  await questionRoot.page().waitForTimeout(500);
  const probeState = await readDomMouseProbe(questionRoot);

  const queueState = await questionRoot.evaluate(() => ({
    mouseQueueSeen: Boolean(window.__tutorialMouseQueueSeen),
    keyboardQueueSeen: Boolean(window.__tutorialKeyboardQueueSeen),
  }));

  let queueOutputMatched = false;
  let keyboardOutputMatched = false;
  try {
    await waitForConsoleText(questionRoot, /MOUSEBUTTONDOWN|MOUSEBUTTONUP|MOUSEMOTION/i, 5000);
    queueOutputMatched = true;
  }
  catch (_) {
    queueOutputMatched = false;
  }

  try {
    await waitForConsoleText(questionRoot, /KEYDOWN/i, 4000);
    keyboardOutputMatched = true;
  }
  catch (_) {
    keyboardOutputMatched = false;
  }

  await stopIfRunning(questionRoot);

  return {
    queueOutputMatched: queueOutputMatched || queueState.mouseQueueSeen,
    keyboardOutputMatched: keyboardOutputMatched || queueState.keyboardQueueSeen,
    mouseQueueSeen: queueState.mouseQueueSeen,
    keyboardQueueSeen: queueState.keyboardQueueSeen,
    canvasDiag,
    domProbe: probeState.domProbe,
    syntheticPosted: probeState.syntheticPosted,
    installMouseCaptureRuns: probeState.installMouseCaptureRuns,
  };
}

/**
 * Executes mouse regression checks against tutorial examples.
 * @returns {Promise<void>} Resolves when script exits.
 */
async function main() {
  const examples = loadTutorialMouseExamples();

  const browser = await chromium.launch({ headless: !HEADED });
  const page = await browser.newPage();

  const results = {
    tutorialContentId: TUTORIAL_CONTENT_ID,
    clickExample: { status: 'PENDING' },
    followExample: { status: 'PENDING' },
    pygameQueueDiagnostic: { status: 'PENDING' },
  };

  try {
    const frame = await getH5pFrame(page, getViewUrl(TUTORIAL_CONTENT_ID));

    try {
      const clickResult = await runClickColorChangeCheck(
        frame,
        page,
        examples.clickExample,
      );
      results.clickExample = { status: 'PASS', diagnostics: clickResult };
    }
    catch (error) {
      results.clickExample = { status: 'FAIL', error: error?.message || String(error) };
    }

    try {
      const followResult = await runFollowMovementCheck(
        frame,
        page,
        examples.followExample,
      );
      results.followExample = { status: 'PASS', diagnostics: followResult };
    }
    catch (error) {
      results.followExample = { status: 'FAIL', error: error?.message || String(error) };
    }

    try {
      const queueDiag = await runPygameMouseQueueDiagnostic(frame, page);
      results.pygameQueueDiagnostic = {
        status: queueDiag.queueOutputMatched ? 'PASS' : 'FAIL',
        diagnostics: queueDiag,
      };
    }
    catch (error) {
      results.pygameQueueDiagnostic = { status: 'FAIL', error: error?.message || String(error) };
    }
  }
  finally {
    await browser.close();
  }

  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);

  if (
    results.clickExample.status !== 'PASS'
    || results.followExample.status !== 'PASS'
    || results.pygameQueueDiagnostic.status !== 'PASS'
  ) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
