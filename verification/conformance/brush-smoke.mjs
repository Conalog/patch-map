import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

// Same 5,000-panel service fixture as the native touch integration test.
const fixture = JSON.parse(await readFile('conformance/scenes/service-blueprint.json', 'utf8'));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1360, height: 980 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const output = '.artifacts/flutter/brush';
await mkdir(output, { recursive: true });
try {
  await page.goto(`${process.env.PATCHMAP_DEMO_URL ?? 'http://127.0.0.1:5175'}/verification/conformance/web/lab.html`);
  await page.waitForFunction(() => window.patchMapLab && !window.patchMapLab.snapshot().busy);
  const snapshot = () => page.evaluate(() => {
    const s = window.patchMapLab.snapshot();
    return { brush: s.brush, viewport: s.observation.viewport, ids: s.observation.selectionIds };
  });
  const canvas = await page.locator('canvas').first().boundingBox();
  const before = (await snapshot()).viewport;
  const grid = fixture.dataset[0];
  function cell(column, angle = 0) {
    const world = [grid.attrs.x + grid.item.size.width / 2 + column * (grid.item.size.width + grid.gap), grid.attrs.y + grid.item.size.height / 2];
    const dx = world[0] - before.centerWorld[0], dy = world[1] - before.centerWorld[1], radians = angle * Math.PI / 180;
    return [canvas.x + before.screenBounds[2] / 2 + (dx * Math.cos(radians) - dy * Math.sin(radians)) * before.scale,
      canvas.y + before.screenBounds[3] / 2 + (dx * Math.sin(radians) + dy * Math.cos(radians)) * before.scale];
  }
  const start = cell(0), end = cell(3);
  async function hold() {
    await page.mouse.move(...start); await page.mouse.down();
    await page.waitForTimeout(650); await page.mouse.up();
  }
  await hold(); assert.equal((await snapshot()).brush.enabled, true);
  await page.locator('#brush-disable').click(); assert.equal((await snapshot()).brush.enabled, false);
  await hold(); assert.equal((await snapshot()).brush.enabled, true);
  const selected = (await snapshot()).ids;
  await hold(); assert.equal((await snapshot()).brush.enabled, false);
  assert.deepEqual((await snapshot()).ids, selected);
  await page.locator('#clear-selection').click(); await page.locator('#brush-enable').click();
  async function stroke() { await page.mouse.move(...start); await page.mouse.down(); await page.mouse.move(...end, {steps: 8}); await page.mouse.up(); }
  await stroke(); assert.deepEqual((await snapshot()).ids, ['g0.0.0', 'g0.0.1', 'g0.0.2', 'g0.0.3']);
  await stroke(); assert.deepEqual((await snapshot()).ids, []);
  assert.deepEqual((await snapshot()).viewport, before);
  await page.locator('#rotate').click();
  await page.waitForFunction(() => !window.patchMapLab.snapshot().busy);
  const angle = await page.evaluate(() => window.patchMapLab.snapshot().observation.rotation);
  await page.mouse.move(...cell(0, angle)); await page.mouse.down();
  await page.mouse.move(...cell(3, angle), {steps:8}); await page.mouse.up();
  assert.deepEqual((await snapshot()).ids, ['g0.0.0', 'g0.0.1', 'g0.0.2', 'g0.0.3']);
  assert.deepEqual(errors, []);
  await page.screenshot({path: `${output}/web.png`, fullPage: true});
  await writeFile(`${output}/web.json`, JSON.stringify({completed: true, panels: 5000, errors, viewportUnchanged: true, toggleOffPreservesSelection: true, manualDisableThenLongpress: true}, null, 2));
  console.log('Brush web smoke passed');
} finally { await browser.close(); }
