const { chromium } = require('playwright');

const BASE_URL = process.env.H5P_BASE_URL || 'http://localhost:8080';
const MACHINE_NAME = process.env.H5P_PYTHON_AUTOCOMPLETE_MACHINE || 'H5P.PythonQuestion';
const CONTENT_ID = process.env.H5P_PYTHON_AUTOCOMPLETE_CONTENT_ID || 'miniworlds-mouse-follow';
const QUERY = process.env.H5P_PYTHON_AUTOCOMPLETE_QUERY
  || 'import miniworlds\nworld = miniworlds.World()\nworld.mo';
const EXPECTED_FIRST = (process.env.H5P_PYTHON_AUTOCOMPLETE_EXPECTED_FIRST || 'mouse').toLowerCase();
const HEADED = process.env.H5P_HEADED === '1';

function getViewUrl() {
  return `${BASE_URL}/view/${MACHINE_NAME}/${CONTENT_ID}`;
}

async function typeIntoEditor(page, frame, query) {
  const editor = frame.locator('.h5p-codequestion .cm-editor').first();
  await editor.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Backspace');
  const lines = String(query).split('\n');

  for (let index = 0; index < lines.length; index += 1) {
    await page.keyboard.insertText(lines[index]);
    if (index < lines.length - 1) {
      await page.keyboard.press('Enter');
    }
  }
}

async function readSuggestions(frame) {
  const tooltip = frame.locator('.cm-tooltip-autocomplete').first();
  await tooltip.waitFor({ state: 'visible', timeout: 10000 });

  return frame.locator('.cm-tooltip-autocomplete ul li').evaluateAll((items) => {
    return items.map((item) => ({
      label: item.querySelector('.cm-completionLabel')?.textContent?.trim() || item.textContent.trim(),
      detail: item.querySelector('.cm-completionDetail')?.textContent?.trim() || '',
      selected: item.getAttribute('aria-selected') === 'true',
    }));
  });
}

async function readEditorText(frame) {
  return frame.locator('.h5p-codequestion .cm-editor').first().evaluate((element) => {
    const view = element.cmView?.rootView?.view;
    return view?.state?.doc?.toString?.() || element.textContent || '';
  });
}

async function main() {
  const browser = await chromium.launch({ headless: !HEADED });

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(getViewUrl(), { waitUntil: 'load' });

    const iframeElement = await page.waitForSelector('iframe.h5p-iframe', { timeout: 30000 });
    const frame = await iframeElement.contentFrame();
    if (!frame) {
      throw new Error('H5P iframe context could not be resolved.');
    }

    await frame.waitForSelector('.h5p-codequestion .cm-editor', { timeout: 30000 });
    await typeIntoEditor(page, frame, QUERY);

    const [editorText, suggestions] = await Promise.all([
      readEditorText(frame),
      readSuggestions(frame),
    ]);

    if (!suggestions.length) {
      throw new Error(JSON.stringify({
        message: 'Autocomplete list is empty.',
        query: QUERY,
        editorText,
      }, null, 2));
    }

    const firstLabel = (suggestions[0].label || '').toLowerCase();
    if (firstLabel !== EXPECTED_FIRST) {
      throw new Error(JSON.stringify({
        message: 'Unexpected first autocomplete suggestion.',
        query: QUERY,
        expectedFirst: EXPECTED_FIRST,
        actualFirst: suggestions[0],
        suggestions,
        editorText,
      }, null, 2));
    }

    console.log(JSON.stringify({
      message: 'Python autocomplete smoke test passed.',
      query: QUERY,
      editorText,
      expectedFirst: EXPECTED_FIRST,
      actualFirst: suggestions[0],
      suggestions,
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