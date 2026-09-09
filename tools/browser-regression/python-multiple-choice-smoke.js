const { chromium } = require('playwright');

const BASE_URL = process.env.H5P_BASE_URL || 'http://localhost:8080';
const MACHINE_NAME = process.env.H5P_MACHINE_NAME || 'H5P.PythonQuestion';
const CONTENT_ID = process.env.H5P_MULTIPLE_CHOICE_CONTENT_ID || 'PythonMultipleChoiceSmoke';
const HEADED = process.env.H5P_HEADED === '1';

function getViewUrl() {
  return `${BASE_URL}/view/${MACHINE_NAME}/${CONTENT_ID}`;
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

async function getH5pFrame(page) {
  await page.goto(getViewUrl(), { waitUntil: 'load' });
  const iframeElement = await page.waitForSelector('iframe.h5p-iframe', {
    state: 'attached',
    timeout: 30000,
  });

  const frame = await iframeElement.contentFrame();
  if (!frame) {
    throw new Error('H5P iframe context could not be resolved.');
  }

  await frame.waitForSelector('.h5p-codequestion', { state: 'visible', timeout: 30000 });
  return frame;
}

async function findCheckButton(frame, timeout = 30000) {
  const selectors = [
    '.h5p-codequestion .h5p-question-check-answer',
    '.h5p-question-buttons .h5p-question-check-answer',
    '.h5p-codequestion .h5p-question-buttons button',
    '.h5p-question-buttons button',
    '.h5p-codequestion .h5p-question-buttons .button',
  ];

  const endTime = Date.now() + timeout;
  while (Date.now() < endTime) {
    for (const selector of selectors) {
      const buttons = frame.locator(selector);
      const count = await buttons.count();
      for (let index = 0; index < count; index += 1) {
        const button = buttons.nth(index);
        if (await button.isVisible()) {
          const text = normalizeText(await button.innerText());
          if (/check|prüf|pruef/i.test(text)) {
            return button;
          }
        }
      }
    }

    await frame.waitForTimeout(250);
  }

  throw new Error('Check Answer button not found.');
}

async function main() {
  const browser = await chromium.launch({ headless: !HEADED });
  const page = await browser.newPage();

  try {
    const frame = await getH5pFrame(page);

    await frame.locator('.codequestion-multiple-choice').waitFor({
      state: 'visible',
      timeout: 30000,
    });

    const options = frame.locator('.codequestion-multiple-choice input');
    const optionCount = await options.count();
    if (optionCount !== 3) {
      throw new Error(`Expected 3 answer options, found ${optionCount}.`);
    }

    await frame.waitForFunction(() => {
      const text = (document.querySelector('.h5p-codequestion')?.innerText || '')
        .replace(/\s+/g, ' ')
        .trim();
      return text.includes('Robot') && text.includes('move');
    }, null, { timeout: 30000 });

    await options.nth(0).check();
    const checkButton = await findCheckButton(frame);
    await checkButton.click();

    await frame.waitForFunction(() => {
      const text = (document.querySelector('.h5p-question-feedback')?.textContent || '')
        .replace(/\s+/g, ' ')
        .trim();
      return /correct|score|1\s*\/\s*1/i.test(text);
    }, null, { timeout: 15000 });

    console.log('PASS: PythonQuestion multiple choice renders, selects and grades.');
  }
  finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
