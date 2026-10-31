// End-to-end check of the simple chart in a real browser (needs `npx vite --port 5199` running): make a unit,
// add positions with several people, make one the head, see the tree chart. Saves screenshots to the folder given.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const shots = process.argv[2] || '/tmp/org-shots';
const base = process.argv[3] || 'http://127.0.0.1:5199';
require('node:fs').mkdirSync(shots, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, locale: 'fa-IR' });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${base}/dev/org-sandbox.html?view=kinds`);
  await page.getByRole('button', { name: 'افزودن زیرمجموعه به بانک نمونه' }).waitFor();
  await page.screenshot({ path: `${shots}/1-empty-org.png` });

  // 1. a unit under the organization (the default kind there is «واحد سازمانی»)
  await page.getByRole('button', { name: 'افزودن زیرمجموعه به بانک نمونه' }).click();
  const dialog = page.getByRole('dialog');
  assert.equal(await dialog.getByRole('radio', { name: /واحد سازمانی/ }).getAttribute('aria-checked'), 'true');
  await dialog.locator('#kind-names').fill('معاونت مالی');
  await dialog.locator('#kind-names').press('Enter');
  await page.getByText('معاونت مالی').first().waitFor();

  // 2. a position under the unit with one person, made the head (the default kind under a unit is «سمت»)
  await page.getByRole('button', { name: 'افزودن زیرمجموعه به معاونت مالی' }).click();
  assert.equal(await dialog.getByRole('radio', { name: /سمت/ }).getAttribute('aria-checked'), 'true');
  await dialog.locator('#kind-names').fill('مدیر مالی');
  await dialog.getByLabel('جستجوی کاربر').fill('نیما');
  await dialog.getByRole('option', { name: 'نیما قهرمانیان' }).waitFor();
  await dialog.getByLabel('جستجوی کاربر').press('Enter');
  await dialog.getByText('نیما قهرمانیان').first().waitFor();
  await dialog.getByText('رئیس «معاونت مالی» است').click();
  await dialog.getByRole('button', { name: 'افزودن', exact: true }).click();
  await page.getByText('★ رئیس: مدیر مالی · نیما قهرمانیان').waitFor();

  // 3. several lines at once, then a position with two people
  await page.getByRole('button', { name: 'افزودن زیرمجموعه به معاونت مالی' }).click();
  await dialog.locator('#kind-names').fill('حسابدار\nکارشناس مالی');
  await dialog.locator('#kind-names').press('Enter');
  await page.getByText('کارشناس مالی').first().waitFor();
  await page.getByRole('button', { name: 'افزودن زیرمجموعه به حسابدار' }).waitFor();
  const row = page.locator('#kind-n4 > div').first(); // the node's own line (the third node made)
  await row.getByRole('button', { name: '+ تعیین شخص' }).click();
  for (const name of ['سارا احمدی', 'علی رضایی']) {
    const box = dialog.getByLabel('جستجوی کاربر');
    await box.fill(name.split(' ')[0]);
    await dialog.getByRole('option', { name }).waitFor();
    await box.press('Enter');
    await dialog.getByText(name).first().waitFor();
  }
  await dialog.getByLabel('جستجوی کاربر').press('Enter'); // empty box: sends the form
  await page.getByText('سارا احمدی').first().waitFor();
  await page.getByText('علی رضایی').first().waitFor();

  // 4. a position cannot hold a unit: the form offers only positions under it
  await page.getByRole('button', { name: 'افزودن زیرمجموعه به حسابدار' }).click();
  assert.equal(await dialog.getByRole('radio').count(), 1);
  assert.match(await dialog.getByRole('radio').first().innerText(), /سمت/);
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });

  // 5. the head is first under its unit, and the people are all there
  const text = await page.locator('[role=tree]').innerText();
  assert.ok(text.indexOf('مدیر مالی') < text.indexOf('حسابدار'), 'head first');
  await page.screenshot({ path: `${shots}/2-list.png`, fullPage: true });

  // 6. search opens the way to a person
  await page.getByLabel('جستجو در چارت').fill('علی');
  await page.getByText('علی رضایی').first().waitFor();
  await page.getByLabel('جستجو در چارت').fill('');

  // 7. the tree chart shows the same data
  await page.getByRole('tab', { name: 'چارت درختی' }).click();
  await page.getByText('★ رئیس · سمت / پست سازمانی').first().waitFor();
  assert.ok((await page.locator('[role=tree]').innerText()).includes('کارشناس مالی'));
  await page.screenshot({ path: `${shots}/3-tree.png`, fullPage: true });

  // 8. two-step delete
  await page.getByRole('tab', { name: 'چارت مرتب' }).click();
  await page.locator('#kind-n3 > div').first().hover();
  await page.getByRole('button', { name: 'حذف حسابدار' }).click();
  await page.getByRole('button', { name: 'تأیید حذف حسابدار' }).click();
  await page.waitForFunction(() => !document.body.innerText.includes('حسابدار'));
  assert.deepEqual(errors, [], 'no page errors');
  await browser.close();
  console.log('e2e org kinds OK');
})().catch((e) => { console.error(e); process.exit(1); });
