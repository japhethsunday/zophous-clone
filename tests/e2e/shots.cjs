// Screenshot every app page against the fake backend.
// Usage: node tests/e2e/shots.cjs <baseUrl> <outDir> [width] [height]
const { chromium } = require('playwright');
const { install } = require('./mock-backend.cjs');

const [base = 'http://127.0.0.1:5173', out = 'shots', w = '1440', h = '900'] = process.argv.slice(2);
const PAGES = (process.env.PAGES || 'home,clips,gen,brand,settings').split(',');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: +w, height: +h } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e.stack || e).slice(0, 600)));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url().slice(0, 160)}`); });
  await install(page);
  for (const p of PAGES) {
    await page.goto(`${base}/#/app/${p}`);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}/${p}-${w}.png`, fullPage: process.env.FULL === '1' });
    console.log('shot', p);
  }
  if (errors.length) console.log('console errors:\n' + errors.join('\n'));
  await browser.close();
})();
