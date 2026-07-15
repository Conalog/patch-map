import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const requestedUrl = process.env.CORE_V1_LAB_URL ?? process.env.LAB_BASE_URL;
assert(requestedUrl, 'Set CORE_V1_LAB_URL to the running Core v1 performance lab URL');
const labUrl = new URL(requestedUrl);
if (labUrl.pathname === '/') labUrl.pathname = '/lab/performance-v1/';
const measuredDataset = process.env.CORE_V1_MEMORY_DATASET ?? 'production';
labUrl.searchParams.set('dataset', 'production');

const quick = process.env.CORE_V1_MEMORY_QUICK === '1';
const warmupCycles = integerEnvironment('CORE_V1_MEMORY_WARMUPS', quick ? 1 : 2);
const measuredCycles = integerEnvironment('CORE_V1_MEMORY_CYCLES', quick ? 3 : 7);
const totalCycles = warmupCycles + measuredCycles;
const timeoutMs = integerEnvironment('CORE_V1_MEMORY_TIMEOUT_MS', 30_000);
const artifactDirectory = resolve(
  process.env.CORE_V1_MEMORY_ARTIFACT_DIR ?? join(root, 'artifacts/core-v1/memory'),
);
const startedAt = new Date();
const artifactStamp = startedAt.toISOString().replaceAll(':', '-').replaceAll('.', '-');
const artifactPath = join(artifactDirectory, `core-v1-memory-${artifactStamp}.json`);
const latestPath = join(artifactDirectory, 'latest.json');

let browser;
let context;
let page;
let report = {
  environment: {
    directReinitializeDataset: 'production',
    labUrl: labUrl.href,
    measuredCycles,
    measuredDataset,
    platform: process.platform,
    runtime: process.version,
    warmupCycles,
  },
  raw: { consoleErrors: [], cycles: [], networkErrors: [], pageErrors: [] },
  startedAt: startedAt.toISOString(),
  status: 'running',
};

try {
  browser = await chromium.launch({
    args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'],
    headless: true,
  });
  context = await browser.newContext({
    deviceScaleFactor: 1,
    viewport: { height: 900, width: 1440 },
  });
  page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  page.setDefaultNavigationTimeout(timeoutMs);
  page.on('console', (message) => {
    if (message.type() === 'error') report.raw.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => report.raw.pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    if (request.url().startsWith(labUrl.origin)) {
      report.raw.networkErrors.push(
        `${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'failed'}`,
      );
    }
  });
  page.on('response', (response) => {
    if (response.url().startsWith(labUrl.origin) && response.status() >= 400) {
      report.raw.networkErrors.push(`${response.status()} ${response.url()}`);
    }
  });

  const response = await page.goto(labUrl.href, { waitUntil: 'networkidle' });
  assert(response?.ok(), `Core v1 lab request failed with ${String(response?.status())}`);
  await page.waitForFunction(() => document.body.dataset.labReady === 'true');
  await expectStatus(page, 'READY');

  const initialCanvas = await page.getByTestId('core-canvas').elementHandle();
  assert(initialCanvas, 'Core v1 lab did not expose its aggregate canvas');
  assert.equal(await page.locator('canvas').count(), 1, 'Lab must own exactly one aggregate canvas');

  const client = await context.newCDPSession(page);
  await client.send('Performance.enable');
  await client.send('HeapProfiler.enable');

  let expectedLifecycle = numericText(await page.getByTestId('lifecycle-generation').textContent());
  assert.equal(expectedLifecycle, 1, 'A fresh lab page must start at lifecycle L01');

  await clickAndSettle(page, 'load', 'READY');
  assert.equal(
    numericText(await page.getByTestId('metric-entities').textContent()),
    37_071,
    'Direct re-init proof must load the fully expanded production fixture',
  );
  await clickAndSettle(page, 'flush', 'READY');
  const beforeDirectReinitialize = await page.evaluate((canvas) => ({
    canvasConnected: canvas?.isConnected === true,
    canvasCount: document.querySelectorAll('canvas').length,
    coreAlive: canvas?.dataset.coreAlive,
    coreDocument: canvas?.dataset.coreDocument,
    coreInstance: canvas?.dataset.coreInstance,
    entityCount: Number(document.querySelector('[data-testid="metric-entities"]')?.textContent?.replaceAll(',', '') ?? 'NaN'),
    sameCanvas: canvas === document.querySelector('[data-testid="core-canvas"]'),
  }), initialCanvas);
  assert.deepEqual(beforeDirectReinitialize, {
    canvasConnected: true,
    canvasCount: 1,
    coreAlive: 'true',
    coreDocument: 'attached',
    coreInstance: 'L01',
    entityCount: 37_071,
    sameCanvas: true,
  }, 'Production load did not expose the expected live lifecycle proof markers');

  await clickAndSettle(page, 'reinit', 'READY');
  expectedLifecycle += 1;
  const afterDirectReinitialize = await page.evaluate((canvas) => ({
    canvasConnected: canvas?.isConnected === true,
    canvasCount: document.querySelectorAll('canvas').length,
    coreAlive: canvas?.dataset.coreAlive,
    coreDocument: canvas?.dataset.coreDocument,
    coreInstance: canvas?.dataset.coreInstance,
    entityCount: Number(document.querySelector('[data-testid="metric-entities"]')?.textContent ?? 'NaN'),
    frame: Number(document.querySelector('[data-testid="metric-frame"]')?.textContent ?? 'NaN'),
    priorCoreDestroyed: canvas?.dataset.priorCoreDestroyed,
    revision: Number(document.querySelector('[data-testid="metric-revision"]')?.textContent ?? 'NaN'),
    sameCanvas: canvas === document.querySelector('[data-testid="core-canvas"]'),
  }), initialCanvas);
  assert.deepEqual(afterDirectReinitialize, {
    canvasConnected: true,
    canvasCount: 1,
    coreAlive: 'true',
    coreDocument: 'none',
    coreInstance: 'L02',
    entityCount: 0,
    frame: 0,
    priorCoreDestroyed: 'true',
    revision: 0,
    sameCanvas: true,
  }, 'Direct re-init retained the production document, prior Core, or a replacement canvas');
  assert.notEqual(
    afterDirectReinitialize.coreInstance,
    beforeDirectReinitialize.coreInstance,
    'Direct re-init must publish a new Core lifecycle identity',
  );
  report.raw.directReinitialize = {
    after: afterDirectReinitialize,
    before: beforeDirectReinitialize,
    result: 'prior Core destroyed; production document released; aggregate canvas retained',
  };

  if (measuredDataset !== 'production') {
    await page.getByTestId('dataset-select').selectOption(measuredDataset);
  }

  for (let index = 0; index < totalCycles; index += 1) {
    await clickAndSettle(page, 'load', 'READY');
    const loadedEntities = numericText(await page.getByTestId('metric-entities').textContent());
    assert(loadedEntities > 0, `Cycle ${index + 1} did not load authoritative entities`);

    await clickAndSettle(page, 'flush', 'READY');
    const frameBeforeDestroy = numericText(await page.getByTestId('metric-frame').textContent());
    assert(frameBeforeDestroy >= 1, `Cycle ${index + 1} did not publish a frame`);

    await clickAndSettle(page, 'teardown', 'OFFLINE');
    const afterDestroy = await page.evaluate((canvas) => ({
      canvasConnected: canvas?.isConnected === true,
      canvasCount: document.querySelectorAll('canvas').length,
      entityCount: Number(document.querySelector('[data-testid="metric-entities"]')?.textContent ?? 'NaN'),
      eventCount: document.querySelector('[data-testid="event-count"]')?.textContent ?? '',
      frame: Number(document.querySelector('[data-testid="metric-frame"]')?.textContent ?? 'NaN'),
      revision: Number(document.querySelector('[data-testid="metric-revision"]')?.textContent ?? 'NaN'),
      status: document.querySelector('[data-testid="status-badge"]')?.textContent ?? '',
      teardownInvariant: [...document.querySelectorAll('[data-testid="invariant-row"]')].some(
        (row) => row.dataset.status === 'pass' && row.textContent?.includes('Lifecycle releases runtime state'),
      ),
    }), initialCanvas);
    assert.deepEqual(afterDestroy, {
      canvasConnected: true,
      canvasCount: 1,
      entityCount: 0,
      eventCount: '0 records',
      frame: 0,
      revision: 0,
      status: 'OFFLINE',
      teardownInvariant: true,
    }, `Cycle ${index + 1} retained active Core state after teardown`);

    await client.send('HeapProfiler.collectGarbage');
    await client.send('HeapProfiler.collectGarbage');
    const [{ metrics }, dom] = await Promise.all([
      client.send('Performance.getMetrics'),
      client.send('Memory.getDOMCounters'),
    ]);
    const heapBytes = metrics.find(({ name }) => name === 'JSHeapUsedSize')?.value;
    assert(Number.isFinite(heapBytes), 'Chromium did not expose JSHeapUsedSize');
    report.raw.cycles.push({
      afterDestroy,
      cycle: index + 1,
      dom,
      frameBeforeDestroy,
      heapBytes,
      loadedEntities,
      phase: index < warmupCycles ? 'warmup' : 'measured',
    });

    await clickAndSettle(page, 'reinit', 'READY');
    expectedLifecycle += 1;
    const afterReinitialize = {
      canvasCount: await page.locator('canvas').count(),
      entityCount: numericText(await page.getByTestId('metric-entities').textContent()),
      frame: numericText(await page.getByTestId('metric-frame').textContent()),
      lifecycle: numericText(await page.getByTestId('lifecycle-generation').textContent()),
      revision: numericText(await page.getByTestId('metric-revision').textContent()),
    };
    assert.deepEqual(afterReinitialize, {
      canvasCount: 1,
      entityCount: 0,
      frame: 0,
      lifecycle: expectedLifecycle,
      revision: 0,
    }, `Cycle ${index + 1} re-init did not start a fresh Core instance`);
  }

  await clickAndSettle(page, 'teardown', 'OFFLINE');
  await client.send('HeapProfiler.collectGarbage');
  const measured = report.raw.cycles.slice(warmupCycles);
  assert.equal(measured.length, measuredCycles);
  const heapSamples = measured.map((cycle) => cycle.heapBytes);
  const earlyMedian = median(heapSamples.slice(0, Math.min(3, heapSamples.length)));
  const lateMedian = median(heapSamples.slice(-Math.min(3, heapSamples.length)));
  const heapGrowth = lateMedian - earlyMedian;
  const allowedHeapGrowth = Math.max(2 * 1024 * 1024, earlyMedian * 0.15);
  assert(
    heapGrowth <= allowedHeapGrowth,
    `Post-destroy heap grew ${heapGrowth} bytes; allowed ${allowedHeapGrowth} bytes`,
  );

  const firstDom = measured[0].dom;
  const lastDom = measured.at(-1).dom;
  assert.equal(lastDom.documents, firstDom.documents, 'Lifecycle cycles retained Documents');
  assert(
    lastDom.nodes <= firstDom.nodes + 24,
    `Lifecycle cycles retained ${lastDom.nodes - firstDom.nodes} DOM nodes`,
  );
  assert(
    lastDom.jsEventListeners <= firstDom.jsEventListeners + 2,
    `Lifecycle cycles retained ${lastDom.jsEventListeners - firstDom.jsEventListeners} listeners`,
  );
  assert.deepEqual(report.raw.consoleErrors, [], 'Core v1 memory run emitted console errors');
  assert.deepEqual(report.raw.pageErrors, [], 'Core v1 memory run emitted page errors');
  assert.deepEqual(report.raw.networkErrors, [], 'Core v1 memory run emitted network errors');

  report = {
    ...report,
    finishedAt: new Date().toISOString(),
    result: {
      aggregateCanvasCount: 1,
      allowedHeapGrowthBytes: allowedHeapGrowth,
      domGrowth: {
        documents: lastDom.documents - firstDom.documents,
        jsEventListeners: lastDom.jsEventListeners - firstDom.jsEventListeners,
        nodes: lastDom.nodes - firstDom.nodes,
      },
      earlyMedianHeapBytes: earlyMedian,
      heapGrowthBytes: heapGrowth,
      lateMedianHeapBytes: lateMedian,
      lifecycleCycles: totalCycles,
      directReinitialize: 'passed',
      staleActiveCore: false,
    },
    status: 'passed',
  };
} catch (error) {
  report = {
    ...report,
    error: error instanceof Error
      ? { message: error.message, name: error.name, stack: error.stack }
      : { message: String(error) },
    finishedAt: new Date().toISOString(),
    status: 'failed',
  };
  throw error;
} finally {
  const cleanupErrors = [];
  for (const [label, close] of [
    ['page', () => page?.close()],
    ['browser context', () => context?.close()],
    ['Chromium browser', () => browser?.close()],
  ]) {
    try {
      await close();
    } catch (error) {
      cleanupErrors.push({ label, message: error instanceof Error ? error.message : String(error) });
    }
  }
  if (cleanupErrors.length > 0) report.cleanupErrors = cleanupErrors;
  await mkdir(artifactDirectory, { recursive: true });
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  await Promise.all([
    writeFile(artifactPath, serialized),
    writeFile(latestPath, serialized),
  ]);
  process.stdout.write(`${JSON.stringify({
    artifact: artifactPath,
    result: report.result,
    status: report.status,
  }, null, 2)}\n`);
}

async function clickAndSettle(targetPage, testId, expectedStatus) {
  await targetPage.getByTestId(testId).click();
  await targetPage.waitForFunction(
    (status) => document.body.dataset.busy === 'false'
      && document.querySelector('[data-testid="status-badge"]')?.textContent === status,
    expectedStatus,
  );
}

async function expectStatus(targetPage, expectedStatus) {
  await targetPage.waitForFunction(
    (status) => document.querySelector('[data-testid="status-badge"]')?.textContent === status,
    expectedStatus,
  );
}

function integerEnvironment(name, fallback) {
  const source = process.env[name];
  if (source === undefined) return fallback;
  const value = Number(source);
  assert(Number.isInteger(value) && value > 0, `${name} must be a positive integer`);
  return value;
}

function median(values) {
  assert(values.length > 0, 'median needs at least one sample');
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? (ordered[middle - 1] + ordered[middle]) / 2
    : ordered[middle];
}

function numericText(value) {
  const parsed = Number(String(value ?? '').replaceAll(/[^\d.-]/gu, ''));
  assert(Number.isFinite(parsed), `Expected numeric text, received ${JSON.stringify(value)}`);
  return parsed;
}
