const { chromium } = require('playwright');

const baseUrl = process.env.H5P_BASE_URL || 'http://localhost:8080';
const machineName = process.env.H5P_MACHINE_NAME || 'H5P.PythonQuestion';
const normalize = (text) => String(text || '').replace(/\s+/g, ' ').trim();

async function open(browser, contentId) {
  const page = await browser.newPage();
  await page.goto(`${baseUrl}/view/${machineName}/${contentId}`, { waitUntil: 'load' });
  const iframe = await page.waitForSelector('iframe.h5p-iframe', { timeout: 30000 });
  const frame = await iframe.contentFrame();
  await frame.waitForSelector('.h5p-codequestion', { timeout: 30000 });
  return { page, frame };
}

const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

async function matching(browser) {
  const { frame } = await open(browser, 'PythonMatchingSmoke');
  const check = frame.locator('.h5p-question-check-answer');
  const selects = frame.locator('.codequestion-matching select');
  expect(await selects.count() === 3, 'Expected three drop-downs.');
  const answers = ['O(1)', 'O(n)', 'O(2ⁿ)'];
  for (let i = 0; i < 3; i += 1) await selects.nth(i).selectOption(answers[i]);
  await check.click();
  await frame.waitForSelector('.codequestion-matching__count:not([hidden])', { timeout: 10000 });
  expect(/2/.test(normalize(await frame.locator('.codequestion-matching__count').textContent())), 'Expected 2 correct pairs.');
  expect(await selects.first().isDisabled(), 'Answer fields must be locked after checking.');
  await frame.locator('.h5p-question-retry').click();
  expect(await selects.first().isEnabled(), 'Retry must unlock the fields.');
  const fixed = ['O(1)', 'O(n)', 'O(n²)'];
  for (let i = 0; i < 3; i += 1) await selects.nth(i).selectOption(fixed[i]);
  await check.click();
  await frame.waitForFunction(
    () => /3\s+(of|von)\s+3/.test(document.querySelector('.codequestion-matching__count')?.textContent || ''),
    undefined,
    { timeout: 10000 },
  );
}

async function shortAnswer(browser) {
  const { frame } = await open(browser, 'PythonShortAnswerSmoke');
  const input = frame.locator('.codequestion-short-answer__input');
  await input.fill('o(n^2)');
  await input.press('Enter');
  await frame.waitForSelector('.codequestion-short-answer.is-correct', { timeout: 10000 });
}

async function opsLimit(browser) {
  const { frame } = await open(browser, 'PythonOpsLimitSmoke');
  await frame.locator('.h5p-question-check-answer').click();
  await frame.waitForFunction(() => document.querySelectorAll('.testcases-area .passed').length === 2
    && (document.body.textContent.includes('Schritte') || document.body.textContent.includes('steps')), undefined, { timeout: 60000 });
  const marks = (await frame.locator('.testcases-area .passed').allTextContents()).map(normalize);
  expect(marks[0] === '✓' && marks[1] === '✗', `Expected [✓, ✗], got ${JSON.stringify(marks)}`);
  expect(/counted 4 steps|4 Schritte/.test(await frame.locator('.testcases-area').textContent()), 'Expected the operation limit explanation.');
}

async function noLoops(browser) {
  const { frame } = await open(browser, 'PythonNoLoopsSmoke');
  await frame.locator('.h5p-question-check-answer').click();
  await frame.waitForFunction(() => /not allowed|nicht erlaubt/.test(document.body.textContent), undefined, { timeout: 60000 });
}

async function execLimit(browser) {
  const { frame } = await open(browser, 'PythonExecLimitSmoke');
  await frame.locator('.h5p-question-check-answer').click();
  await frame.waitForFunction(() => document.querySelectorAll('.testcases-area .passed').length === 2
    && [...document.querySelectorAll('.testcases-area .passed')].every((cell) => /✗/.test(cell.textContent)), undefined, { timeout: 60000 });
}

async function opsMeasure(browser) {
  const { frame } = await open(browser, 'PythonOpsMeasureSmoke');
  await frame.locator('.h5p-question-buttons button, .h5p-codequestion button').filter({ hasText: /^(Run|Ausführen)$/ }).first().click();
  await frame.waitForFunction(() => document.body.textContent.includes('steps ~ n^2.0'), undefined, { timeout: 60000 });
  expect(!/NameError/.test(await frame.locator('body').textContent()), 'trace stub missing in plain run.');
}

async function main() {
  const browser = await chromium.launch({
    headless: process.env.H5P_HEADED !== '1',
    executablePath: process.env.H5P_CHROMIUM_PATH || undefined,
  });
  try {
    for (const [name, run] of Object.entries({ shortAnswer, matching, opsMeasure, noLoops, opsLimit, execLimit })) {
      await run(browser);
      console.log(`ok: ${name}`);
    }
    console.log('Python answer-form and step-counter smoke tests passed.');
  }
  finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
