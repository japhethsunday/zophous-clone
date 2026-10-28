// End-to-end checks for the clips library and editor against the fake backend.
// Usage: node tests/e2e/clips.e2e.cjs <baseUrl> [shotsDir]
const assert = require('assert');
const path = require('path');
const { chromium } = require('playwright');
const { install } = require('./mock-backend.cjs');

const [base = 'http://127.0.0.1:5173', shots] = process.argv.slice(2);
const results = [];
async function step(name, fn) {
  try { await fn(); results.push(['PASS', name]); } catch (e) { results.push(['FAIL', name, e.message.split('\n')[0]]); }
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  let renderCalls = 0;
  const { db, calls } = await install(page, {
    functions: {
      'clips-render': (body, d) => {
        renderCalls++;
        const job = { id: `rj-${renderCalls}`, ref_id: body.clipId, status: 'queued', progress: 0, kind: 'clip_render', created_at: new Date().toISOString(), error: null, output: null, _body: body };
        d.jobs.push(job);
        return [{ job }];
      },
      'clips-create': (body, d) => {
        const v = { id: 'v-new', user_id: 'u', title: body.title, mode: 'clips', status: 'queued', progress: 0, duration_seconds: Math.round(body.durationSeconds), created_at: new Date().toISOString(), source_type: 'upload' };
        d.videos.unshift(v);
        return [{ video: v, minutesReserved: 2 }];
      },
    },
  });

  await step('library lists projects with processing stage', async () => {
    await page.goto(`${base}/#/app/clips`);
    await page.getByText('Transcribing speech · 38%').waitFor({ timeout: 5000 });
    await page.getByRole('button', { name: 'Edit clips' }).waitFor();
  });

  await step('rejects a non-video file with a clear message', async () => {
    await page.setInputFiles('#clip-file', { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
    await page.getByRole('alert').filter({ hasText: /Unsupported file type|Choose a video/ }).waitFor({ timeout: 3000 });
  });

  await step('upload shows progress then queues the project', async () => {
    await page.setInputFiles('#clip-file', path.join(__dirname, 'fixtures', 'source.mp4'));
    await page.getByLabel('Project name').waitFor();
    assert.match(await page.locator('.drop-facts').innerText(), /uses 2 min/);
    await page.getByRole('button', { name: 'Find clips' }).click();
    await page.getByText(/Uploaded\. Clips are usually ready/).waitFor({ timeout: 8000 });
    const put = calls.find((c) => c.method === 'PUT' || /upload\/sign/.test(c.path));
    assert(put, 'expected a signed upload request');
  });

  await step('opens the editor from a project row', async () => {
    await page.goto(`${base}/#/app/clips`);
    await page.getByRole('button', { name: 'Edit clips' }).click();
    await page.waitForURL(/#\/app\/clips\/v-0001$/);
    await page.getByRole('navigation', { name: 'Clips in this project' }).waitFor();
    assert.strictEqual(await page.locator('.ws-item').count(), 4);
  });

  await step('Render is disabled until something changes', async () => {
    assert(await page.getByRole('button', { name: 'Render changes' }).isDisabled());
  });

  await step('changing caption style switches to live preview and shows captions', async () => {
    await page.getByText('Clean', { exact: true }).click();
    await page.getByRole('tab', { name: 'Your changes' }).waitFor();
    assert.strictEqual(await page.getByRole('tab', { name: 'Your changes' }).getAttribute('aria-selected'), 'true');
    await page.locator('.ws-frame video').evaluate((v) => { v.currentTime = 9; });
    await page.waitForTimeout(400);
    await page.locator('.cap').waitFor({ timeout: 3000 });
    if (shots) await page.screenshot({ path: `${shots}/editor-draft.png` });
  });

  await step('keyboard trim: arrow keys move the start handle by 0.1 s', async () => {
    const h = page.getByRole('slider', { name: 'Clip start' });
    const before = Number(await h.getAttribute('aria-valuenow'));
    await h.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    const after = Number(await h.getAttribute('aria-valuenow'));
    assert(Math.abs(after - before - 1.1) < 0.051, `moved ${after - before}`);
  });

  await step('clicking a transcript word seeks there', async () => {
    await page.locator('.tl-words .w').nth(5).click();
    const t = await page.locator('.ws-frame video').evaluate((v) => v.currentTime);
    assert(t > 9 && t < 12, `currentTime ${t}`);
  });

  await step('format change reshapes the preview frame', async () => {
    await page.getByText('1:1', { exact: true }).click();
    const box = await page.locator('.ws-frame').boundingBox();
    assert(Math.abs(box.width - box.height) < 3, `frame ${box.width}x${box.height}`);
  });

  await step('render sends the validated edit and shows progress', async () => {
    await page.getByLabel('Title').fill('A sharper title');
    await page.getByRole('button', { name: 'Render changes' }).click();
    await page.getByText('Rendering. You can keep editing other clips.').waitFor();
    const job = db.jobs[db.jobs.length - 1];
    assert.strictEqual(job._body.captionStyle, 'clean');
    assert.strictEqual(job._body.aspect, '1:1');
    assert.strictEqual(job._body.title, 'A sharper title');
    assert(Math.abs(job._body.start - 9.1) < 0.051, `start ${job._body.start}`);
    job.status = 'running'; job.progress = 60; job.output = { stage: 'rendering' };
    await page.getByText(/Rendering · rendering · 60%/).waitFor({ timeout: 6000 });
    assert(await page.getByRole('button', { name: 'Rendering…' }).isDisabled());
  });

  await step('finished render refreshes the clip and clears the draft', async () => {
    const job = db.jobs[db.jobs.length - 1];
    job.status = 'succeeded'; job.progress = 100;
    db.clips[0].title = 'A sharper title';
    db.clip_edits.push({ media_kind: 'clip', media_id: 'c-1', project: job._body, rendered_at: new Date().toISOString() });
    await page.getByText('Render finished.').waitFor({ timeout: 6000 });
    await page.getByRole('button', { name: 'Render changes' }).waitFor();
  });

  await step('selecting another clip keeps that clip untouched', async () => {
    await page.locator('.ws-item').nth(1).click();
    assert(await page.getByRole('button', { name: 'Render changes' }).isDisabled());
    assert.strictEqual(await page.getByRole('tab', { name: 'Rendered' }).getAttribute('aria-selected'), 'true');
  });

  await step('delete asks for confirmation first', async () => {
    await page.getByRole('button', { name: 'Delete clip' }).click();
    await page.getByText('Delete this clip for good?').waitFor();
    await page.getByRole('button', { name: 'Keep' }).click();
  });

  await step('back button returns to the library', async () => {
    await page.getByRole('button', { name: 'Back to projects' }).click();
    await page.waitForURL(/#\/app\/clips$/);
  });

  await step('no uncaught page errors', async () => {
    assert.deepStrictEqual(errors, []);
  });

  for (const r of results) console.log(r.join('  '));
  const failed = results.filter((r) => r[0] === 'FAIL').length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
