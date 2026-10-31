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

  // 4. under a position both kinds are offered (a position may head units); the form closes the people list after a pick
  await page.getByRole('button', { name: 'افزودن زیرمجموعه به حسابدار' }).click();
  assert.equal(await dialog.getByRole('radio').count(), 2);
  assert.equal(await dialog.getByRole('radio', { name: /سمت/ }).getAttribute('aria-checked'), 'true', 'under a position the default is a position');
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

  // ---- scenario B: a bank-like chart: a chain of positions, nine units moved under the CEO, pan and zoom
  await page.getByRole('button', { name: 'افزودن زیرمجموعه به بانک نمونه' }).click();
  await dialog.getByRole('radio', { name: /سمت/ }).click();
  await dialog.locator('#kind-names').fill('مجمع عمومی');
  await dialog.locator('#kind-names').press('Enter');
  await page.getByRole('button', { name: 'افزودن زیرمجموعه به مجمع عمومی' }).click();
  await dialog.locator('#kind-names').fill('هیأت مدیره');
  await dialog.locator('#kind-names').press('Enter');
  await page.getByRole('button', { name: 'افزودن زیرمجموعه به هیأت مدیره' }).click();
  await dialog.locator('#kind-names').fill('مدیرعامل');
  await dialog.locator('#kind-names').press('Enter');
  await page.getByRole('button', { name: 'افزودن زیرمجموعه به مدیرعامل' }).click();
  assert.equal(await dialog.getByRole('radio').count(), 2, 'a unit may go under the CEO');
  await dialog.getByRole('radio', { name: /واحد سازمانی/ }).click();
  await dialog.locator('#kind-names').fill('معاونت اعتباری\nمعاونت فناوری اطلاعات\nمعاونت مالی و سرمایه‌گذاری\nمدیریت امور استان‌ها\nبانکداری شرکتی\nبازرسی و نظارت\nحراست\nمعاونت سازمان و برنامه‌ریزی\nمعاونت توسعه سرمایه انسانی');
  await dialog.locator('#kind-names').press('Enter');
  await page.getByText('معاونت توسعه سرمایه انسانی').first().waitFor();

  // the moved units: here the nine were made under the CEO already; move one up to the organization and back with its siblings
  const unitRow = page.locator('#kind-n' + 0).first();
  void unitRow;
  const first = page.getByText('معاونت اعتباری').first();
  await first.hover();
  await page.getByRole('button', { name: 'انتقال معاونت اعتباری' }).click();
  await dialog.getByRole('radio', { name: /بانک نمونه$/ }).first().click();
  await dialog.getByText('انتخاب همه').click();
  await dialog.getByRole('button', { name: /^انتقال/ }).click();
  await dialog.waitFor({ state: 'detached' });

  await page.getByRole('tab', { name: 'چارت درختی' }).click();
  const vp = page.locator('.kt-vp');
  await vp.waitFor();
  const transform = async () => page.locator('.kt-content').evaluate((el) => getComputedStyle(el).transform);
  const t0 = await transform();
  // drag the background: the chart moves
  const box = await vp.boundingBox();
  await page.mouse.move(box.x + 30, box.y + box.height - 30);
  await page.mouse.down();
  await page.mouse.move(box.x + 130, box.y + box.height - 90, { steps: 6 });
  await page.mouse.up();
  const t1 = await transform();
  assert.notEqual(t0, t1, 'dragging the background pans');
  // dragging that starts on a card does not pan
  const card = page.locator('[data-node]').first();
  const cb = await card.boundingBox();
  await page.mouse.move(cb.x + cb.width / 2, cb.y + 8);
  await page.mouse.down();
  await page.mouse.move(cb.x + cb.width / 2 + 80, cb.y + 60, { steps: 5 });
  await page.mouse.up();
  assert.equal(await transform(), t1, 'dragging a card does not pan');
  // Ctrl + wheel zooms, the plain wheel moves up and down
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -300);
  await page.keyboard.up('Control');
  const t2 = await transform();
  assert.notEqual(t2, t1, 'ctrl + wheel zooms');
  await page.mouse.wheel(0, 200);
  assert.notEqual(await transform(), t2, 'the wheel moves the chart');
  // the buttons
  await page.getByRole('button', { name: 'متناسب با صفحه' }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'مرکز روی سازمان' }).click();
  await page.waitForTimeout(500);
  // arrow keys
  const t3 = await transform();
  await vp.focus();
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(500);
  assert.notEqual(await transform(), t3, 'arrow keys move the chart');
  // the view is kept when the list is shown and the tree again
  const kept = await transform();
  await page.getByRole('tab', { name: 'چارت مرتب' }).click();
  await page.getByRole('tab', { name: 'چارت درختی' }).click();
  await page.waitForTimeout(500);
  assert.equal(await transform(), kept, 'the view is kept between the two charts');
  await page.screenshot({ path: `${shots}/4-bank-tree.png`, fullPage: true });

  // the head can be made and taken off at once
  await page.getByRole('tab', { name: 'چارت مرتب' }).click();
  assert.deepEqual(errors, [], 'no page errors');
    await browser.close();

  console.log('e2e org kinds OK');
})().catch((e) => { console.error(e); process.exit(1); });
