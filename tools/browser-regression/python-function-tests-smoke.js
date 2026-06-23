const { chromium } = require('playwright');

const baseUrl = process.env.H5P_BASE_URL || 'http://localhost:8080';
const contentId = process.env.H5P_FUNCTION_TESTS_CONTENT_ID || 'PythonFunctionTests';
const machineName = process.env.H5P_FUNCTION_TESTS_MACHINE || 'H5P.PythonQuestion';

const normalize = (text) => String(text || '').replace(/\s+/g, ' ').trim();

async function getFrame(page) {
  await page.goto(`${baseUrl}/view/${machineName}/${contentId}`, { waitUntil: 'load' });
  const iframe = await page.waitForSelector('iframe.h5p-iframe', { timeout: 30000 });
  const frame = await iframe.contentFrame();
  if (!frame) throw new Error('Could not resolve the H5P iframe.');
  await frame.waitForSelector('.h5p-codequestion', { timeout: 30000 });
  return frame;
}

async function main() {
  const browser = await chromium.launch({
    headless: process.env.H5P_HEADED !== '1',
    executablePath: process.env.H5P_CHROMIUM_PATH || undefined,
  });

  try {
    const page = await browser.newPage();
    const frame = await getFrame(page);
    const question = frame.locator('.h5p-codequestion').first();
    const checkButton = question.locator('.h5p-question-check-answer');

    const firstCall = normalize(await question.locator('.function-tester .input').first().textContent());
    if (firstCall !== 'binary_search([1, 3, 5, 7, 9], 7)') {
      throw new Error(`Function-test view is not rendered correctly: ${firstCall}`);
    }

    await checkButton.click();
    await frame.waitForFunction(
      () => document.querySelectorAll('.testcases-area .passed').length === 3
        && [...document.querySelectorAll('.testcases-area .passed')]
          .every((cell) => cell.textContent.trim() === '✓'),
      undefined,
      { timeout: 30000 },
    );

    const statuses = await question.locator('.testcases-area .passed').allTextContents();
    if (statuses.length !== 3 || statuses.some((status) => normalize(status) !== '✓')) {
      throw new Error(`Expected three passing function tests, got: ${JSON.stringify(statuses)}`);
    }

    console.log('Python function-test H5P smoke test passed.');
  }
  finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
