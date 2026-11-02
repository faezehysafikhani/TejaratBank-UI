// Measures the org chart (OrgChartBoard) on the mock charts: how long it takes to draw, how much
// memory and how many page elements it uses, opening every card, how smooth dragging is, and the
// PDF download (time, size, image size). For comparing before and after a change to the chart.
//
// Runs on the preview page (dev/org-sandbox.html), either from the dev server (npm run dev; React's
// slower development build) or, closer to what users get, from its production build:
//   npx vite build --config scripts/vite.org-sandbox.config.ts   (to dist-org-sandbox/)
//   python3 -m http.server 4173 -d dist-org-sandbox               (any static server)
// then, with Playwright and Chromium installed:
//   node scripts/measure-org-chart.mjs [baseUrl=http://localhost:3000] [runs=3] [mocks=flat,postBank,large40,large400]
// CHROMIUM_PATH picks the browser binary when Playwright's own is not installed. drawMs: from the
// chart data's arrival to the chart painted.
import { createRequire } from 'node:module';

// Playwright is not a dependency of the app: wherever it is installed (also through NODE_PATH).
const { chromium } = createRequire(import.meta.url)('playwright');

const baseUrl = process.argv[2] || 'http://localhost:3000';
const runs = Number(process.argv[3] || 3);
const mocks = (process.argv[4] || 'flat,postBank,large40,large400').split(',');
const expected = { flat: 3, nested: 5, postBank: 52, large40: 40, large400: 400 };

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};
const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
};

/** Resolves when the page has `count` unit cards and has painted twice since. */
const readyScript = (count) => `
  window.__chartReady = new Promise((resolve) => {
    const check = () => {
      if (document.querySelectorAll('[data-node^="unit:"]').length >= ${count}) {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now())));
        return true;
      }
      return false;
    };
    const start = () => { if (!check()) new MutationObserver((_, o) => { if (check()) o.disconnect(); }).observe(document.body, { childList: true, subtree: true }); };
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
  });
`;

async function measure(browser, mock) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(readyScript(expected[mock]));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');

  await page.goto(`${baseUrl}/dev/org-sandbox.html?view=board&mock=${mock}`);
  const drawnAt = await page.evaluate(() => window.__chartReady);
  // From the response of the chart request to the painted chart, and from navigation.
  const chartTiming = await page.evaluate(() => {
    // The preview page marks when it answers the chart request (src/dev/orgSandbox.tsx).
    const mark = performance.getEntriesByName('org-chart-response')[0];
    return { navigation: 0, chartResponse: mark ? mark.startTime : null };
  });
  const metrics = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  const layout = await page.evaluate(() => {
    const content = document.querySelector('[aria-label^="چارت سازمانی؛"] > div');
    return {
      cards: document.querySelectorAll('[data-node^="unit:"]').length,
      lines: document.querySelectorAll('svg[data-org-links] path[data-source]').length,
      contentWidth: content?.offsetWidth ?? 0,
      contentHeight: content?.offsetHeight ?? 0,
      domNodes: document.getElementsByTagName('*').length,
    };
  });

  // Dragging: the time between frames while the chart is moved.
  const viewport = page.locator('[aria-label^="چارت سازمانی؛"]');
  const box = await viewport.boundingBox();
  await page.evaluate(() => {
    window.__frames = [];
    let last = performance.now();
    const tick = (now) => { window.__frames.push(now - last); last = now; if (window.__frames.length < 400) window.__frameLoop = requestAnimationFrame(tick); };
    window.__frameLoop = requestAnimationFrame(tick);
  });
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 0; i < 40; i++) await page.mouse.move(box.x + box.width / 2 - i * 8, box.y + box.height / 2 + i * 4);
  await page.mouse.up();
  const frames = await page.evaluate(() => { cancelAnimationFrame(window.__frameLoop); return window.__frames.slice(1); });

  // Opening every card (each post's people too).
  const expandMs = await page.evaluate(async () => {
    const button = document.querySelector('button[aria-label="باز کردن همه"]');
    if (!button) return null;
    const start = performance.now();
    button.click();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return performance.now() - start;
  });
  const afterExpand = await page.evaluate(() => document.getElementsByTagName('*').length);
  // Back to closed for the PDF (as most people download it).
  await page.evaluate(async () => {
    document.querySelector('button[aria-label="بستن همه"]')?.click();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });

  // The PDF.
  let pdf = null;
  try {
    const started = Date.now();
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 180000 }),
      page.getByRole('button', { name: 'دریافت PDF چارت' }).click(),
    ]);
    const path = await download.path();
    const ms = Date.now() - started;
    const { readFileSync, statSync } = await import('node:fs');
    const bytes = readFileSync(path);
    const text = bytes.toString('latin1');
    const image = /\/Width (\d+)\s*\/Height (\d+)/.exec(text) || /\/Height (\d+)\s*\/Width (\d+)/.exec(text);
    const page0 = /\/MediaBox \[([^\]]+)\]/.exec(text);
    pdf = { ms, kb: Math.round(statSync(path).size / 1024), image: image ? `${image[1]}×${image[2]}` : '?', mediaBox: page0 ? page0[1].trim() : '?', pages: (text.match(/\/Type \/Page\b/g) || []).length };
  } catch (err) {
    pdf = { error: String(err).split('\n')[0] };
  }

  await page.close();
  return {
    mock,
    drawMs: Math.round(drawnAt - (chartTiming.chartResponse ?? chartTiming.navigation)),
    loadToDrawnMs: Math.round(drawnAt),
    ...layout,
    jsHeapMB: Math.round((metrics.JSHeapUsedSize / 1048576) * 10) / 10,
    layoutMs: Math.round(metrics.LayoutDuration * 1000),
    styleMs: Math.round(metrics.RecalcStyleDuration * 1000),
    scriptMs: Math.round(metrics.ScriptDuration * 1000),
    dragFrameMedianMs: Math.round(median(frames) * 10) / 10,
    dragFrameP95Ms: Math.round(percentile(frames, 0.95) * 10) / 10,
    expandAllMs: expandMs === null ? null : Math.round(expandMs),
    domNodesExpanded: afterExpand,
    pdf,
    errors,
  };
}

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const results = [];
for (const mock of mocks) {
  const all = [];
  for (let i = 0; i < runs; i++) all.push(await measure(browser, mock));
  // The median run by drawing time (the other numbers of that same run).
  const chosen = [...all].sort((a, b) => a.drawMs - b.drawMs)[Math.floor(all.length / 2)];
  results.push({ ...chosen, drawMsAllRuns: all.map((r) => r.drawMs) });
}
await browser.close();
console.log(JSON.stringify({ when: new Date().toISOString(), userAgent: 'headless chromium', runs, results }, null, 2));
