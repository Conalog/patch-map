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
import {
  CORE_V2_MUTATION_TRANSACTION_REVISION,
  CoreV2Engine,
  createCoreV2,
  parsePatchMapV010,
} from '@conalog/patch-map/core-v2';

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
const engine = new CoreV2Engine();
await engine.initialize({
  instanceId: 'packed-engine-transaction',
  target: document.querySelector('#host'),
  width: 640,
  height: 360,
  strategy: 'mesh',
  preference: 'webgl',
});
engine.loadDataset(input);
const emptyBulk = engine.bulkPatch({
  strict: true,
  actionId: 'packed-empty-target-set',
  targets: [],
  changes: [{ path: ['attrs', 'x'], value: 999 }],
});
const transaction = engine.transact({
  strict: true,
  actionId: 'packed-bar-update',
  operations: [{
    op: 'merge',
    target: { kind: 'component', ownerId: 'consumer-item', id: 'bar' },
    changes: [{ path: ['size', 'height'], value: 30 }],
  }],
});
await engine.publishFrame(16);
const resolvedBar = engine.resolveTarget({
  kind: 'component',
  ownerId: 'consumer-item',
  id: 'bar',
});
const interactionOwnership = engine.interactionOwnershipProbe();
const engineDestroyResult = await engine.destroy();
const engineAfterDestroy = engine.snapshot();
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
  transactionRevision: CORE_V2_MUTATION_TRANSACTION_REVISION,
  emptyBulkStatus: emptyBulk.status,
  emptyBulkSceneRevision: emptyBulk.revisions.sceneRevision,
  transactionStatus: transaction.status,
  transactionSceneRevision: transaction.revisions.sceneRevision,
  transactionBarHeight: resolvedBar?.value?.size?.height ?? null,
  interactionOwnership,
  engineDestroyResult,
  engineAfterDestroy: {
    lifecycle: engineAfterDestroy.lifecycle,
    rootIds: engineAfterDestroy.rootIds,
    datasetRef: engineAfterDestroy.datasetRef,
    semanticHash: engineAfterDestroy.semanticHash,
    historyDepth: engineAfterDestroy.historyDepth,
    pendingWork: engineAfterDestroy.pendingWork,
    canvasCount: engineAfterDestroy.resources.canvasCount,
    subscriptions: engineAfterDestroy.resources.subscriptions,
    renderer: engineAfterDestroy.resources.renderer,
    assets: engineAfterDestroy.resources.assets,
  },
};
`);
  await writeFile(path.join(consumer, 'consumer.cjs'), `
const {
  CORE_V2_MUTATION_TRANSACTION_REVISION,
  parsePatchMapV010,
  planCoreV2MutationTransaction,
} = require('@conalog/patch-map/core-v2');
const result = parsePatchMapV010([{ type: 'rect', id: 'cjs-rect', size: 10, fill: '#ff0000' }]);
process.stdout.write(JSON.stringify({
  entities: result.identity.counts.entities,
  id: result.document.entities[0].id,
  transactionRevision: CORE_V2_MUTATION_TRANSACTION_REVISION,
  plannerType: typeof planCoreV2MutationTransaction,
}));
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
  if (esm.transactionRevision !== 'core-v2-mutation-transaction/1') failures.push('packed ESM transaction revision export failed');
  if (esm.emptyBulkStatus !== 'unchanged' || esm.emptyBulkSceneRevision !== 1) failures.push('packed ESM empty bulk target-set semantics failed');
  if (esm.transactionStatus !== 'committed' || esm.transactionSceneRevision !== 2 || esm.transactionBarHeight !== 30) failures.push('packed ESM engine transaction failed');
  if (esm.interactionOwnership?.rootBindingCount !== 6 || esm.interactionOwnership?.entityCallbackCount !== 0) failures.push('packed ESM interaction ownership probe failed');
  if (esm.engineDestroyResult !== true) failures.push('packed ESM raw Engine destroy did not own cleanup');
  if (
    esm.engineAfterDestroy?.lifecycle !== 'destroyed' ||
    esm.engineAfterDestroy.canvasCount !== 0 ||
    esm.engineAfterDestroy.subscriptions?.active !== 0 ||
    esm.engineAfterDestroy.subscriptions?.duplicates !== 0 ||
    esm.engineAfterDestroy.pendingWork !== 0 ||
    esm.engineAfterDestroy.historyDepth !== 0 ||
    esm.engineAfterDestroy.rootIds?.length !== 0 ||
    esm.engineAfterDestroy.datasetRef !== null ||
    esm.engineAfterDestroy.semanticHash !== null ||
    esm.engineAfterDestroy.renderer !== null ||
    esm.engineAfterDestroy.assets !== null
  ) failures.push('packed ESM raw Engine retained lifecycle resources after destroy');
  if (cjs.entities !== 1 || cjs.id !== 'cjs-rect') failures.push('packed CJS parser subpath failed');
  if (cjs.transactionRevision !== 'core-v2-mutation-transaction/1' || cjs.plannerType !== 'function') failures.push('packed CJS transaction exports failed');
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
