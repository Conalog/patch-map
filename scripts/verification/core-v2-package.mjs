#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { chromium } from 'playwright';
import { createServer } from 'vite';

const execute = promisify(execFile);
const ROOT = process.cwd();
const RESULTS = path.join(ROOT, 'performance/core-v2/results');
const temporary = await mkdtemp(path.join(tmpdir(), 'patch-map-core-v2-package-'));
const consumer = path.join(temporary, 'consumer');
const errors = { console: [], page: [], network: [] };
let server;
let browser;

try {
  await mkdir(consumer, { recursive: true });
  const packed = await execute('npm', ['pack', '--json', '--pack-destination', temporary], {
    cwd: ROOT,
    maxBuffer: 10 * 1024 * 1024,
  });
  const packResult = JSON.parse(packed.stdout);
  const filename = packResult[0]?.filename;
  if (typeof filename !== 'string') throw new Error('npm pack did not return a tarball filename');
  const tarball = path.join(temporary, filename);
  await writeFile(
    path.join(consumer, 'package.json'),
    `${JSON.stringify({
      name: 'core-v2-package-consumer',
      private: true,
      type: 'module',
      dependencies: {
        '@conalog/patch-map': `file:${tarball}`,
        'pixi.js': '8.19.0',
      },
    }, null, 2)}\n`,
  );
  await writeFile(path.join(consumer, 'index.html'), `<!doctype html>
<html><body><div id="host" style="width:640px;height:360px"></div><script type="module" src="/main.js"></script></body></html>\n`);
  await writeFile(path.join(consumer, 'main.js'), `
import { createCoreV2, parsePatchMapV010 } from '@conalog/patch-map/core-v2';

const input = [{
  type: 'item', id: 'consumer-item', show: true, attrs: { x: 20, y: 30 }, size: { width: 80, height: 120 },
  components: [
    { type: 'background', id: 'bg', source: { type: 'rect', fill: '#eef2ff', borderColor: '#334155', borderWidth: 1, radius: 6 } },
    { type: 'bar', id: 'bar', source: { type: 'rect', fill: '#2563eb' }, tint: '#2563eb', size: { width: '70%', height: '80%' }, placement: 'bottom', animation: true },
    { type: 'text', id: 'label', text: '42', placement: 'top', style: { fontSize: 14, fill: '#111827' } },
  ],
}];
const before = JSON.stringify(input);
const parsed = parsePatchMapV010(input);
const core = await createCoreV2({ target: document.querySelector('#host'), width: 640, height: 360, strategy: 'mesh', preference: 'webgl', autoRender: false });
const loaded = core.load(input);
await core.prepare();
core.fit();
core.flush('consumer-first-frame');
core.animateBarHeights({ durationMs: 32, seed: 1 });
core.advance(16);
core.flush('consumer-animation');
const capture = await core.captureBase64();
const debugBeforeDestroy = core.debugSnapshot();
await core.destroy();
window.__PACKAGE_RESULT__ = {
  immutable: before === JSON.stringify(input),
  parsedEntities: parsed.identity.counts.entities,
  loadedEntities: loaded.store.entityCount,
  capturePrefix: capture.slice(0, 22),
  captureLength: capture.length,
  backend: debugBeforeDestroy.renderer.backend,
  strategy: debugBeforeDestroy.renderer.strategy,
  renderObjects: debugBeforeDestroy.renderer.aggregateRenderObjects,
  canvasCountAfterDestroy: document.querySelectorAll('canvas').length,
  destroyed: core.debugSnapshot().destroyed,
};
`);
  await writeFile(path.join(consumer, 'consumer.cjs'), `
const { parsePatchMapV010 } = require('@conalog/patch-map/core-v2');
const result = parsePatchMapV010([{ type: 'rect', id: 'cjs-rect', size: 10, fill: '#ff0000' }]);
process.stdout.write(JSON.stringify({ entities: result.identity.counts.entities, id: result.document.entities[0].id }));
`);

  await execute('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], {
    cwd: consumer,
    maxBuffer: 20 * 1024 * 1024,
  });
  const cjs = JSON.parse((await execute('node', ['consumer.cjs'], { cwd: consumer })).stdout);
  server = await createServer({
    root: consumer,
    configFile: false,
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0 },
  });
  await server.listen();
  const baseUrl = server.resolvedUrls?.local?.[0];
  if (!baseUrl) throw new Error('package consumer Vite server has no URL');
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
  page.on('console', (message) => {
    if (message.type() === 'error') errors.console.push(message.text());
  });
  page.on('pageerror', (error) => errors.page.push(error.stack ?? error.message));
  page.on('requestfailed', (request) => errors.network.push(`${request.url()} ${request.failure()?.errorText ?? ''}`));
  page.on('response', (response) => {
    if (response.status() >= 400) errors.network.push(`${response.url()} HTTP ${response.status()}`);
  });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__PACKAGE_RESULT__ !== undefined, undefined, { timeout: 30_000 });
  const esm = await page.evaluate(() => window.__PACKAGE_RESULT__);
  const failures = [];
  if (!esm.immutable) failures.push('packed ESM consumer mutated direct input');
  if (esm.parsedEntities !== esm.loadedEntities || esm.loadedEntities < 3) failures.push('packed ESM entity counts disagree');
  if (!String(esm.capturePrefix).startsWith('data:image/png')) failures.push('packed ESM capture is not PNG data');
  if (!(esm.captureLength > 100)) failures.push('packed ESM capture is unexpectedly empty');
  if (esm.strategy !== 'mesh' || esm.backend !== 'webgl') failures.push('packed ESM did not use selected WebGL Mesh runtime');
  if (!(esm.renderObjects > 0)) failures.push('packed ESM produced no aggregate render objects');
  if (esm.canvasCountAfterDestroy !== 0 || !esm.destroyed) failures.push('packed ESM lifecycle leaked a canvas or live runtime');
  if (cjs.entities !== 1 || cjs.id !== 'cjs-rect') failures.push('packed CJS parser subpath failed');
  if (errors.console.length || errors.page.length || errors.network.length) failures.push('packed browser consumer emitted errors');

  const evidence = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    package: '@conalog/patch-map/core-v2',
    pixi: '8.19.0',
    esm,
    cjs,
    errors,
    status: failures.length === 0 ? 'pass' : 'fail',
    failures,
  };
  await mkdir(RESULTS, { recursive: true });
  await writeFile(path.join(RESULTS, 'package-consumer.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  if (failures.length) throw new Error(failures.join('; '));
  process.stdout.write(`PASS: packed Core v2 ESM browser + CJS consumer, ${esm.loadedEntities} entities, ${esm.renderObjects} aggregate objects, lifecycle clean\n`);
} finally {
  await browser?.close();
  await server?.close();
  await rm(temporary, { recursive: true, force: true });
}

