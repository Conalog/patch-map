// Current panel demo checkpoint; run against an already started comparison server.
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const output = process.argv[2];
if (!output) throw new Error('Usage: node verification/conformance/panel-performance.mjs OUTPUT.json');
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://127.0.0.1:5173/verification/conformance/web/panels.html');
  await page.waitForFunction(() => window.patchMapPanelDemo);
  await page.locator('#mode').selectOption('text');
  const data = await page.evaluate(async () => {
    const { instance, targets } = window.patchMapPanelDemo;
    let seed = 0x5eed;
    const inputs = Array.from({ length: 25 }, () => targets.map(() => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return String(1 + seed % 9999);
    }));
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const rows = [];
    for (let sample = 0; sample < inputs.length; sample++) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const start = performance.now();
      const result = instance.updateBatch({ targets, text: { componentId: 'text', text: inputs[sample] } }, { recordHistory: false });
      const commitMs = performance.now() - start;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      rows.push({ sample, warmup: sample < 5, commitMs, twoRafMs: performance.now() - start, status: result.status });
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return { rows, viewport: instance.viewport.state, panels: targets.length };
  });
  assert.equal(data.panels, 5000);
  assert(data.rows.every((row) => row.status === 'committed'));
  assert.deepEqual(errors, []);
  const report = {
    protocol: 'patch-map-service-panel-text/1', runtime: 'Chromium headless / npm + PixiJS', browser: browser.version(),
    revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    diffSha256: createHash('sha256').update(execFileSync('git', ['diff', '--', 'packages/javascript/src'])).digest('hex'),
    sceneSha256: createHash('sha256').update(await readFile('conformance/scenes/panel-groups.json')).digest('hex'),
    surface: [1100, 900], deviceScaleFactor: 1, seed: 0x5eed, warmups: 5, samples: 20,
    note: 'twoRafMs is the next browser frame opportunity after rendering, not a GPU completion timestamp; compare within this runner only.',
    ...data,
  };
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  const median = (key) => {
    const values = data.rows.filter((r) => !r.warmup).map((r) => r[key]).sort((a, b) => a - b);
    return (values[9] + values[10]) / 2;
  };
  console.log(JSON.stringify({ output, commitMs: median('commitMs'), twoRafMs: median('twoRafMs') }));
} finally { await browser.close(); }
