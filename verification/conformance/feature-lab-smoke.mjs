import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.PATCHMAP_DEMO_URL ?? 'http://127.0.0.1:5175';
const catalog = JSON.parse(await readFile('conformance/scenes/feature-lab.json', 'utf8'));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1360, height: 980 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const rows = [];
const output = '.artifacts/flutter/feature-lab';
await mkdir(output, { recursive: true });
try {
  await page.goto(`${base}/verification/conformance/web/lab.html`);
  const idle = () => page.waitForFunction(() => window.patchMapLab && !window.patchMapLab.snapshot().busy, { timeout: 30000 });
  await idle();
  for (const scenario of catalog.scenarios) {
    await page.selectOption('#scenario', scenario.id); await idle();
    await page.locator('[data-tab="steps"]').click();
    await page.locator('#run-all').click(); await idle();
    const snapshot = await page.evaluate(() => window.patchMapLab.snapshot());
    const fixture = JSON.parse(await readFile(`conformance/${scenario.fixture.startsWith('scenes/') ? scenario.fixture : `fixtures/${scenario.fixture}`}.json`, 'utf8'));
    assert.equal(snapshot.index, (scenario.commands ?? fixture.commands).length, `${scenario.id}: ${JSON.stringify(snapshot.log)}`);
    assert.equal(snapshot.log.some(entry => entry.error), false, `${scenario.id}: ${JSON.stringify(snapshot.log)}`);
    rows.push({ scenario: scenario.id, steps: snapshot.index });
  }
  await page.selectOption('#scenario', 'service'); await idle();
  await page.locator('[data-tab="controls"]').click();
  let previousMode;
  for (const id of ['service-bar','service-text','service-text','service-noData','service-wifi','service-error','first-group','fit']) {
    await page.locator(`#${id}`).click(); await idle();
    const snapshot = await page.evaluate(() => window.patchMapLab.snapshot());
    assert.equal(snapshot.log.some(entry => entry.error), false, `${id}: ${JSON.stringify(snapshot.log)}`);
    if (id === 'service-text' && previousMode === id) assert.equal(snapshot.log.at(-1).result.appliedCount, 5000, 'Repeated text updates must touch only 5,000 text components');
    previousMode = id;
  }
  await page.locator('#first-group').click(); await idle();
  await page.locator('#service-bar').click(); await idle();
  await page.screenshot({path: `${output}/service-web.png`, fullPage:true});
  await page.selectOption('#scenario', 'gallery'); await idle();
  await page.locator('[data-tab="controls"]').click();
  for (const id of ['heights', 'undo', 'redo', 'rotate', 'angle-reset', 'fit', 'zoom-in', 'zoom-out', 'pan', 'clear-selection', 'apply-text', 'second', 'second']) {
    await page.locator(`#${id}`).click(); await idle();
    const value = await page.evaluate(() => window.patchMapLab.snapshot());
    assert.equal(value.log.some(entry => entry.error), false, `${id}: ${JSON.stringify(value.log)}`);
  }
  await page.locator('#capture').click(); await idle();
  assert.equal(await page.locator('#capture-dialog').evaluate(dialog => dialog.open), true);
  await page.locator('#capture-dialog button').click();
  await page.locator('#reset').click(); await idle();
  await page.screenshot({ path: `${output}/web.png`, fullPage: true });
  assert.deepEqual(errors, []);
  await writeFile(`${output}/web.json`, JSON.stringify({ completed: true, scenarios: rows, errors }, null, 2));
  console.log(JSON.stringify(rows));
} finally { await browser.close(); }
