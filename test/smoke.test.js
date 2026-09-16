// Smoke test: opens every tool with test.pdf, runs a download for the core ones, reports console errors.
// Run: npm test   (needs `python -m http.server 8080` or `npm run serve` running)
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.env.BASE || 'http://localhost:8080';
const PDF = path.resolve(__dirname, '..', 'test.pdf');
const OUT = path.resolve(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const results = [];
  const download = async (label, fn) => {
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), fn()]);
    const file = path.join(OUT, dl.suggestedFilename()); await dl.saveAs(file);
    results.push(`${label}: ${dl.suggestedFilename()} (${fs.statSync(file).size} bytes)`);
  };
  // Files carry over between tools by design, so only load when the tool shows a dropzone (or force via the "Add" button).
  const loadFile = async (file, force = false) => {
    const hasDrop = !!(await page.$('.dropzone'));
    if (!hasDrop && !force) return;
    const trigger = hasDrop ? '.dropzone' : 'button:has-text("Add")';
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click(trigger)]);
    await fc.setFiles(file); await page.waitForTimeout(1200);
  };
  const loadPdf = (force) => loadFile(PDF, force);

  await page.goto(BASE + '/#/'); await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, 'landing.png'), fullPage: true });

  // Free user: Pro tools must show the paywall
  await page.goto(BASE + '/#/tool/ai-chat'); await page.waitForTimeout(500);
  results.push('paywall shown for AI (free user): ' + !!(await page.$('.modal')));
  // Unlock dev Pro so the free 3-tasks/day cap does not block the rest of the run
  await page.evaluate(() => localStorage.setItem('pagemint.session', JSON.stringify({ plan: 'pro', email: 'test@localhost', token: null, expires: Date.now() + 86400e3 })));
  await page.reload(); await page.waitForTimeout(500);
  await page.goto(BASE + '/#/pricing'); await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, 'pricing.png'), fullPage: true });

  // Editor: load, edit text, add text, whiteout, save
  await page.goto(BASE + '/#/tool/editor'); await page.waitForTimeout(800);
  await loadPdf(); await page.waitForTimeout(1500);
  const existing = await page.$$('.obj-existing'); results.push(`editor: ${existing.length} text lines detected`);
  await page.click('button[title="Edit text"]');
  if (existing.length) { await existing[0].click(); await page.keyboard.type(' EDITED'); await page.keyboard.press('Escape'); }
  await page.click('button[title="Add text"]');
  const ov = await page.$('.overlay'); const box = await ov.boundingBox();
  await page.mouse.click(box.x + 60, box.y + box.height - 60); await page.keyboard.type('Hello Pagemint'); await page.keyboard.press('Escape');
  await page.click('button[title="Whiteout"]');
  await page.mouse.move(box.x + 200, box.y + 200); await page.mouse.down(); await page.mouse.move(box.x + 300, box.y + 230); await page.mouse.up();
  await page.click('button[title="Highlight"]');
  await page.mouse.move(box.x + 50, box.y + 50); await page.mouse.down(); await page.mouse.move(box.x + 250, box.y + 70); await page.mouse.up();
  await page.click('button[title="Redact"]');
  await page.mouse.move(box.x + 50, box.y + 100); await page.mouse.down(); await page.mouse.move(box.x + 150, box.y + 120); await page.mouse.up();
  await page.screenshot({ path: path.join(OUT, 'editor.png') });
  await download('editor save', () => page.click('.panel-foot .btn-primary'));

  // Core tools
  const simple = [['merge', 2], ['split', 1], ['organize', 1], ['rotate', 1], ['pdf-to-image', 1], ['compress', 1], ['watermark', 1], ['page-numbers', 1], ['metadata', 1], ['crop', 1], ['flatten', 1], ['pdf-to-text', 1]];
  for (const [id, n] of simple) {
    await page.goto(BASE + '/#/tool/' + id); await page.waitForTimeout(600);
    await loadPdf();
    if (n === 2) await loadPdf(true);
    if (id === 'split') await page.fill('.panel-body input.input >> nth=0', '1');
    await download(id, () => page.click('.panel-foot .btn-primary'));
  }
  await page.goto(BASE + '/#/tool/extract'); await page.waitForTimeout(600); await loadPdf(); await page.waitForTimeout(800);
  await page.click('.page-tile'); await download('extract', () => page.click('.panel-foot .btn-primary'));

  // Images → PDF using an exported page image
  const png = fs.readdirSync(OUT).find(f => f.endsWith('.png') && f.includes('page'));
  if (png) { await page.goto(BASE + '/#/tool/image-to-pdf'); await page.waitForTimeout(600); await loadFile(path.join(OUT, png)); await download('image-to-pdf', () => page.click('.panel-foot .btn-primary')); }

  // Re-open the edited export (contains an embedded raster page) and render it back to PNG
  await page.goto(BASE + '/#/tool/pdf-to-image'); await page.waitForTimeout(600);
  await page.evaluate(() => document.querySelectorAll('.file-item button').forEach(b => b.click())); await page.waitForTimeout(400);
  await loadFile(path.join(OUT, 'test-edited.pdf'));
  await download('re-render edited', () => page.click('.panel-foot .btn-primary'));
  fs.renameSync(path.join(OUT, 'test-edited-page-1.png'), path.join(OUT, 'edited-render.png'));
  results.push('plan chip: ' + await page.textContent('#planLabel'));

  console.log('\n== RESULTS ==\n' + results.join('\n'));
  console.log('\n== ERRORS (' + errors.length + ') ==\n' + errors.slice(0, 20).join('\n'));
  await browser.close();
  process.exit(errors.filter(e => !/favicon|net::ERR|fonts/.test(e)).length ? 1 : 0);
})();
