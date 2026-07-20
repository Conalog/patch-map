#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import { createServer } from 'vite';

import { compareObservation } from './core-v2-contract/compare.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const EXPECTED_PATH = fileURLToPath(new URL(
  '../../docs/reference/core-v2-functional-contract/evidence/catalog-normalized-expected.v1.json',
  import.meta.url,
));
const VITE_CONFIG_PATH = path.join(ROOT, 'vite.core-v2-lab.config.ts');
const BRIDGE_NAME = '__PATCH_MAP_CORE_V2_CONTRACT_LAB__';
const DATASET_SIZE = '100';
const SEED = 319;
const EXPECTED_ASSERTION_TOTAL = 128;
const EXPECTED_ASSERTION_PASS_TOTAL = 125;
const EXPECTED_ASSERTION_FAILURE_TOTAL = 3;
const REN_005_IMMUTABLE_FAILURES = Object.freeze([
  Object.freeze({
    path: '/resources/images/alias',
    code: 'VALUE_MISMATCH',
    failurePath: '/resources/images/alias',
  }),
  Object.freeze({
    path: '/resources/images/data-uri',
    code: 'VALUE_MISMATCH',
    failurePath: '/resources/images/data-uri',
  }),
  Object.freeze({
    path: '/resources/images/url',
    code: 'VALUE_MISMATCH',
    failurePath: '/resources/images/url',
  }),
]);
const RENDER_CASES = Object.freeze([
  Object.freeze({ id: 'LAY-001', expectedAssertions: 9 }),
  Object.freeze({ id: 'REN-001', expectedAssertions: 9 }),
  Object.freeze({ id: 'REN-004', expectedAssertions: 10 }),
  Object.freeze({
    id: 'REN-005',
    expectedAssertions: 28,
    expectedFailures: REN_005_IMMUTABLE_FAILURES,
  }),
  Object.freeze({ id: 'REN-003', expectedAssertions: 12 }),
  Object.freeze({ id: 'REN-002', expectedAssertions: 9 }),
  Object.freeze({ id: 'LAY-005', expectedAssertions: 14 }),
  Object.freeze({ id: 'LAY-004', expectedAssertions: 11 }),
  Object.freeze({ id: 'REN-007', expectedAssertions: 26 }),
]);

const headed = parseArguments(process.argv.slice(2));
const errors = { console: [], page: [], network: [] };
const report = {
  $schema: 'core-v2-contract-render-browser-checkpoint/1',
  status: 'failed',
  headed,
  routeParams: { size: DATASET_SIZE, seed: SEED },
  cases: [],
  assertions: {
    expected: EXPECTED_ASSERTION_TOTAL,
    passed: 0,
    failed: EXPECTED_ASSERTION_TOTAL,
    repeatPassed: 0,
    repeatFailed: EXPECTED_ASSERTION_TOTAL,
    freshPassed: 0,
    freshFailed: EXPECTED_ASSERTION_TOTAL,
  },
  errors,
  browser: null,
  failure: null,
};

let server = null;
let browser = null;

try {
  const expectedCases = await loadExpectedCases();
  server = await createServer({
    root: ROOT,
    configFile: VITE_CONFIG_PATH,
    logLevel: 'silent',
    clearScreen: false,
    server: {
      host: '127.0.0.1',
      port: 0,
      strictPort: false,
    },
  });
  await server.listen();
  const baseUrl = server.resolvedUrls?.local?.[0];
  invariant(typeof baseUrl === 'string', 'Vite did not expose the Core v2 Lab URL');

  browser = await chromium.launch({ headless: !headed });
  report.browser = {
    name: 'Chromium',
    version: browser.version(),
    platform: process.platform,
  };

  for (const caseSpec of RENDER_CASES) {
    const expectedCase = expectedCases.get(caseSpec.id);
    invariant(expectedCase !== undefined, `${caseSpec.id} normalized expected record is missing`);
    const caseReport = await executeCase({
      browser,
      baseUrl,
      caseSpec,
      expectedCase,
      errors,
    });
    report.cases.push(caseReport);
  }

  const passed = sum(report.cases, (record) => record.comparison.passed);
  const failed = sum(report.cases, (record) => record.comparison.failed);
  const repeatPassed = sum(report.cases, (record) => record.repeatComparison.passed);
  const repeatFailed = sum(report.cases, (record) => record.repeatComparison.failed);
  const freshPassed = sum(report.cases, (record) => record.freshComparison.passed);
  const freshFailed = sum(report.cases, (record) => record.freshComparison.failed);
  report.assertions = {
    expected: EXPECTED_ASSERTION_TOTAL,
    passed,
    failed,
    repeatPassed,
    repeatFailed,
    freshPassed,
    freshFailed,
  };

  invariant(report.cases.length === RENDER_CASES.length, 'all nine render routes completed');
  invariant(
    passed === EXPECTED_ASSERTION_PASS_TOTAL && failed === EXPECTED_ASSERTION_FAILURE_TOTAL,
    'canonical comparison must be exactly 125 pass and 3 immutable conflicts',
  );
  invariant(
    repeatPassed === EXPECTED_ASSERTION_PASS_TOTAL &&
      repeatFailed === EXPECTED_ASSERTION_FAILURE_TOTAL,
    'repeat comparison must be exactly 125 pass and 3 immutable conflicts',
  );
  invariant(
    freshPassed === EXPECTED_ASSERTION_PASS_TOTAL &&
      freshFailed === EXPECTED_ASSERTION_FAILURE_TOTAL,
    'fresh comparison must be exactly 125 pass and 3 immutable conflicts',
  );
  invariant(errors.console.length === 0, 'console error count must be zero');
  invariant(errors.page.length === 0, 'page error count must be zero');
  invariant(errors.network.length === 0, 'network error count must be zero');
  report.status = 'pass';
} catch (error) {
  report.failure = serializeError(error);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => undefined);
  if (server) await server.close().catch(() => undefined);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

async function executeCase({ browser: activeBrowser, baseUrl, caseSpec, expectedCase, errors: capturedErrors }) {
  const context = await activeBrowser.newContext({
    viewport: { width: 1_280, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  attachErrorCapture(page, caseSpec.id, capturedErrors);
  const route = `/lab/core-v2?scenario=${caseSpec.id}&size=${DATASET_SIZE}&seed=${SEED}`;
  const routeUrl = new URL(route, baseUrl).href;

  try {
    await openFocusedCase(page, routeUrl, route, caseSpec.id);

    const first = caseSpec.id === 'REN-005'
      ? await executeBrowserUiRun(page, 'runCase', 'load-dataset')
      : await executeBrowserRun(page, 'runCase');
    const comparison = compareCaseRun(expectedCase, first);
    assertCaseRun(caseSpec, first, comparison, 'first');

    const repeat = caseSpec.id === 'REN-005'
      ? await executeBrowserUiRun(page, 'repeatCase', 'repeat-action')
      : await executeBrowserRun(page, 'repeatCase');
    const repeatComparison = compareCaseRun(expectedCase, repeat);
    assertCaseRun(caseSpec, repeat, repeatComparison, 'repeat');
    invariant(
      comparison.stableActualSha256 === repeatComparison.stableActualSha256,
      `${caseSpec.id} repeat stable actual digest`,
    );

    const destroyed = await destroyBrowserCase(page);
    invariant(destroyed.status === 'destroyed', `${caseSpec.id} bridge destroy terminal status`);
    invariant(destroyed.canvasCount === 0, `${caseSpec.id} destroy releases every canvas`);

    const fresh = await executeFreshSession({
      browser: activeBrowser,
      routeUrl,
      route,
      caseSpec,
      expectedCase,
      errors: capturedErrors,
    });
    invariant(
      comparison.stableActualSha256 === fresh.comparison.stableActualSha256,
      `${caseSpec.id} fresh-session stable actual digest`,
    );

    return {
      id: caseSpec.id,
      route,
      state: {
        first: first.terminalStatus,
        repeat: repeat.terminalStatus,
        fresh: fresh.run.terminalStatus,
        destroyed: destroyed.status,
      },
      comparison: summarizeComparison(comparison),
      repeatComparison: summarizeComparison(repeatComparison),
      freshComparison: summarizeComparison(fresh.comparison),
      deterministic: true,
      stableActualSha256: comparison.stableActualSha256,
      canvas: {
        first: first.canvas,
        repeat: repeat.canvas,
        fresh: fresh.run.canvas,
        afterDestroy: destroyed.canvasCount,
      },
      cleanup: {
        first: first.cleanupStatus,
        repeat: repeat.cleanupStatus,
        fresh: fresh.run.cleanupStatus,
        destroy: cleanupStatus(destroyed.cleanup),
        freshDestroy: cleanupStatus(fresh.destroyed.cleanup),
      },
      focusedUi: caseSpec.id === 'REN-005'
        ? { first: first.ui, repeat: repeat.ui, fresh: fresh.run.ui }
        : null,
    };
  } finally {
    await page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
  }
}

async function executeFreshSession({
  browser: activeBrowser,
  routeUrl,
  route,
  caseSpec,
  expectedCase,
  errors: capturedErrors,
}) {
  const context = await activeBrowser.newContext({
    viewport: { width: 1_280, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  attachErrorCapture(page, caseSpec.id, capturedErrors);

  try {
    await openFocusedCase(page, routeUrl, route, caseSpec.id);
    const run = caseSpec.id === 'REN-005'
      ? await executeBrowserUiRun(page, 'runCase', 'load-dataset')
      : await executeBrowserRun(page, 'runCase');
    const comparison = compareCaseRun(expectedCase, run);
    assertCaseRun(caseSpec, run, comparison, 'fresh');
    const destroyed = await destroyBrowserCase(page);
    invariant(destroyed.status === 'destroyed', `${caseSpec.id} fresh bridge destroy terminal status`);
    invariant(destroyed.canvasCount === 0, `${caseSpec.id} fresh destroy releases every canvas`);
    return { run, comparison, destroyed };
  } finally {
    await page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
  }
}

async function openFocusedCase(page, routeUrl, route, caseId) {
  await page.goto(routeUrl, { waitUntil: 'networkidle' });
  await page.waitForFunction(
    (bridgeName) => {
      const bridge = window[bridgeName];
      return bridge?.state().status === 'armed';
    },
    BRIDGE_NAME,
    { timeout: 30_000 },
  );
  invariant(new URL(page.url()).pathname + new URL(page.url()).search === route, `${caseId} canonical route`);
  invariant(
    await page.getByTestId(`scenario-${caseId.toLowerCase()}`).count() === 1,
    `${caseId} focused root identity`,
  );
}

async function destroyBrowserCase(page) {
  return page.evaluate(async (bridgeName) => {
    const bridge = window[bridgeName];
    if (!bridge) throw new Error(`Missing public Lab bridge ${bridgeName}`);
    const cleanup = await bridge.destroyCase();
    const surface = document.querySelector('[data-contract-surface]');
    if (!surface) throw new Error('Missing focused contract surface');
    return {
      cleanup,
      status: bridge.state().status,
      canvasCount: surface.querySelectorAll('canvas').length,
    };
  }, BRIDGE_NAME);
}

function executeBrowserUiRun(page, operation, buttonTestId) {
  return executeBrowserRun(page, operation, buttonTestId);
}

async function executeBrowserRun(page, operation, buttonTestId = null) {
  return page.evaluate(async ({ bridgeName, operationName, triggerTestId }) => {
    const bridge = window[bridgeName];
    if (!bridge) throw new Error(`Missing public Lab bridge ${bridgeName}`);
    const surface = document.querySelector('[data-contract-surface]');
    if (!surface) throw new Error('Missing focused contract surface');
    const canvasCount = () => surface.querySelectorAll('canvas').length;
    const initialCanvasCount = canvasCount();
    let maximumCanvasCount = initialCanvasCount;
    let observedCanvasCount = initialCanvasCount;
    const sample = () => {
      maximumCanvasCount = Math.max(maximumCanvasCount, canvasCount());
    };
    const countMutationCanvases = (nodes) => [...nodes].reduce((total, node) => {
      const ownCanvas = node.nodeName === 'CANVAS' ? 1 : 0;
      const nestedCanvases = typeof node.querySelectorAll === 'function'
        ? node.querySelectorAll('canvas').length
        : 0;
      return total + ownCanvas + nestedCanvases;
    }, 0);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        observedCanvasCount -= countMutationCanvases(record.removedNodes);
        observedCanvasCount += countMutationCanvases(record.addedNodes);
        maximumCanvasCount = Math.max(maximumCanvasCount, observedCanvasCount);
      }
      sample();
    });
    observer.observe(surface, { childList: true, subtree: true });
    const interval = window.setInterval(sample, 0);

    try {
      let pending;
      let runningStatus;
      let run;
      let ui = null;
      if (triggerTestId !== null) {
        const button = document.querySelector(`[data-testid="${triggerTestId}"]`);
        if (!(button instanceof HTMLButtonElement)) {
          throw new Error(`Missing focused Lab control ${triggerTestId}`);
        }
        if (button.disabled) throw new Error(`Focused Lab control ${triggerTestId} is disabled`);
        const completion = waitForUiRunCompletion(bridge.state().rootTestId, operationName);
        button.click();
        runningStatus = bridge.state().status;
        sample();
        run = await completion;
        ui = await collectRen005FocusedUi({ bridge, triggerTestId, operationName });
      } else {
        const invoke = bridge[operationName];
        if (typeof invoke !== 'function') throw new Error(`Missing bridge operation ${operationName}`);
        pending = invoke.call(bridge);
        runningStatus = bridge.state().status;
        sample();
        run = await pending;
      }
      sample();
      await Promise.resolve();
      sample();
      const actualObservation = await bridge.actualObservation();
      const execution = bridge.execution();
      return {
        operation: operationName,
        runningStatus,
        terminalStatus: bridge.state().status,
        runStatus: run.status,
        executionStatus: execution?.status ?? null,
        actionStatuses: Array.isArray(execution?.actionResults)
          ? execution.actionResults.map((result) => result?.status ?? null)
          : [],
        actualObservation,
        fixtures: run.fixtures,
        captures: run.captures,
        actualMatchesRun: JSON.stringify(actualObservation) === JSON.stringify(run.actualObservation),
        cleanupStatus: run.cleanup?.status ?? null,
        ui,
        canvas: {
          initial: initialCanvasCount,
          maximumDuringRun: maximumCanvasCount,
          afterCleanup: canvasCount(),
        },
      };
    } finally {
      window.clearInterval(interval);
      observer.disconnect();
    }
    function waitForUiRunCompletion(rootTestId, expectedOperation) {
      const root = document.querySelector(`[data-testid="${rootTestId}"]`);
      if (!(root instanceof HTMLElement)) throw new Error(`Missing focused root ${rootTestId}`);
      return new Promise((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          root.removeEventListener('core-v2-contract-run-complete', onComplete);
          reject(new Error(`Focused ${rootTestId} run completion event timed out`));
        }, 30_000);
        const onComplete = (event) => {
          if (!(event instanceof CustomEvent) || event.detail?.operation !== expectedOperation) return;
          window.clearTimeout(timeout);
          root.removeEventListener('core-v2-contract-run-complete', onComplete);
          if (!event.detail.run || typeof event.detail.run !== 'object') {
            reject(new Error(`Focused ${rootTestId} completion did not include a run result`));
            return;
          }
          resolve(event.detail.run);
        };
        root.addEventListener('core-v2-contract-run-complete', onComplete);
      });
    }

    async function collectRen005FocusedUi({ bridge: activeBridge, triggerTestId, operationName }) {
      const expectedPerformanceRows = operationName === 'repeatCase' ? 2 : 1;
      const timeoutAt = performance.now() + 30_000;
      for (;;) {
        const root = document.querySelector(`[data-testid="${activeBridge.state().rootTestId}"]`);
        const statuses = root
          ? [...root.querySelectorAll('[data-action-status]')].map((row) => row.dataset.actionStatus)
          : [];
        const inspector = root?.querySelector('[data-testid="ren-005-image-inspector"]');
        const performanceRows = root?.querySelectorAll(
          '[data-testid="ren-005-performance-journal-row"]',
        ).length ?? 0;
        if (
          root?.dataset.contractStatus === 'observed'
          && statuses.length === 4
          && statuses.every((status) => status === 'completed')
          && inspector?.dataset.observationStatus === 'observed'
          && performanceRows === expectedPerformanceRows
        ) {
          return readFocusedUi(root, triggerTestId);
        }
        if (performance.now() >= timeoutAt) {
          throw new Error(`Focused REN-005 DOM did not settle after ${triggerTestId}`);
        }
        await new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
      }
    }

    function readFocusedUi(root, triggerTestId) {
      const chooser = root.querySelector('[data-testid="ren-005-specimen-select"]');
      if (!(chooser instanceof HTMLSelectElement)) throw new Error('Missing REN-005 specimen chooser');
      const selectedFacts = (value) => {
        chooser.value = value;
        chooser.dispatchEvent(new Event('change', { bubbles: true }));
        return {
          source: textAt(root, 'ren-005-selected-source'),
          sourceKind: textAt(root, 'ren-005-selected-source-kind'),
          state: textAt(root, 'ren-005-selected-state'),
          role: textAt(root, 'ren-005-selected-role'),
          bounds: textAt(root, 'ren-005-selected-bounds'),
          initialSource: textAt(root, 'ren-005-selected-initial-source'),
          initialState: textAt(root, 'ren-005-selected-initial-state'),
          staleAttachCount: textAt(root, 'ren-005-selected-stale-attach'),
          staleCompletionCount: textAt(root, 'ren-005-selected-stale-completion'),
          diagnosticCount: textAt(root, 'ren-005-selected-diagnostics'),
        };
      };
      const descriptor = selectedFacts('descriptor');
      const failed = selectedFacts('failed-image');
      const journalRows = [...root.querySelectorAll('[data-testid="ren-005-request-journal-row"]')];
      const performanceRows = [...root.querySelectorAll(
        '[data-testid="ren-005-performance-journal-row"]',
      )];
      const latestPerformance = performanceRows.at(-1)?.dataset ?? {};
      return {
        trigger: `click:${triggerTestId}`,
        actionStatuses: [...root.querySelectorAll('[data-action-status]')]
          .map((row) => row.dataset.actionStatus ?? null),
        chooserOptions: [...chooser.options].map(({ value }) => value),
        descriptor,
        failed,
        counters: {
          requests: textAt(root, 'ren-005-request-count'),
          backend: textAt(root, 'ren-005-backend-counts'),
          resources: textAt(root, 'ren-005-resource-count'),
          leases: textAt(root, 'ren-005-lease-count'),
          stale: textAt(root, 'ren-005-stale-count'),
          pendingRelease: textAt(root, 'ren-005-pending-release-count'),
        },
        requestJournal: {
          count: journalRows.length,
          events: journalRows.map((row) => row.dataset.requestEvent ?? null),
          kinds: journalRows.map((row) => row.dataset.requestKind ?? null),
        },
        performance: {
          count: performanceRows.length,
          latest: {
            runIndex: latestPerformance.runIndex ?? null,
            runKind: latestPerformance.runKind ?? null,
            framesPerSecond: latestPerformance.fps ?? null,
            frameCount: latestPerformance.frameCount ?? null,
            longTaskCount: latestPerformance.longTaskCount ?? null,
            longTaskTotalMs: latestPerformance.longTaskTotalMs ?? null,
            maxFrameGapMs: latestPerformance.maxFrameGapMs ?? null,
            durationMs: latestPerformance.durationMs ?? null,
          },
        },
      };
    }

    function textAt(root, testId) {
      const element = root.querySelector(`[data-testid="${testId}"]`);
      const value = element?.textContent?.trim();
      if (typeof value !== 'string' || value.length === 0) {
        throw new Error(`Missing REN-005 DOM fact ${testId}: ${element?.outerHTML ?? 'absent'}`);
      }
      return value;
    }
  }, { bridgeName: BRIDGE_NAME, operationName: operation, triggerTestId: buttonTestId });
}

function compareCaseRun(expectedCase, browserRun) {
  return compareObservation({
    expectedCase,
    actual: browserRun.actualObservation,
    fixtures: browserRun.fixtures,
    captures: browserRun.captures,
  });
}

function assertCaseRun(caseSpec, run, comparison, runLabel) {
  const prefix = `${caseSpec.id} ${runLabel}`;
  const expectedFailures = caseSpec.expectedFailures ?? [];
  invariant(run.runningStatus === 'running', `${prefix} enters running state`);
  invariant(run.terminalStatus === 'observed', `${prefix} observed terminal state`);
  invariant(run.runStatus === 'observed', `${prefix} public bridge run result`);
  invariant(run.executionStatus === 'completed', `${prefix} executor completion`);
  invariant(run.actionStatuses.length > 0, `${prefix} action results are present`);
  invariant(run.actionStatuses.every((status) => status === 'completed'), `${prefix} actions complete`);
  invariant(run.actualMatchesRun === true, `${prefix} actualObservation public accessor parity`);
  invariant(run.cleanupStatus === 'completed', `${prefix} cleanup completion`);
  invariant(run.canvas.initial === 0, `${prefix} starts without a retained canvas`);
  invariant(run.canvas.maximumDuringRun === 1, `${prefix} owns exactly one transient canvas`);
  invariant(run.canvas.afterCleanup === 0, `${prefix} cleanup releases the transient canvas`);
  invariant(comparison.assertions.length === caseSpec.expectedAssertions, `${prefix} assertion inventory`);
  invariant(
    comparison.passed === caseSpec.expectedAssertions - expectedFailures.length,
    `${prefix} exact assertion pass count`,
  );
  invariant(comparison.failed === expectedFailures.length, `${prefix} exact assertion failure count`);
  invariant(
    sameJson(comparisonFailures(comparison), expectedFailures),
    `${prefix} only declared immutable assertion conflicts`,
  );
  if (caseSpec.id === 'REN-005') assertRen005FocusedUi(run.ui, runLabel);
}

function assertRen005FocusedUi(ui, runLabel) {
  invariant(ui && typeof ui === 'object', `REN-005 ${runLabel} focused UI evidence`);
  const expectedTrigger = runLabel === 'repeat'
    ? 'click:repeat-action'
    : 'click:load-dataset';
  invariant(ui.trigger === expectedTrigger, `REN-005 ${runLabel} actual UI control`);
  invariant(
    sameJson(ui.actionStatuses, ['completed', 'completed', 'completed', 'completed']),
    `REN-005 ${runLabel} four completed DOM action rows`,
  );
  invariant(
    sameJson(ui.chooserOptions, [
      'alias',
      'url',
      'descriptor',
      'data-uri',
      'transformed',
      'hidden-image',
      'failed-image',
    ]),
    `REN-005 ${runLabel} seven specimen chooser`,
  );
  invariant(ui.descriptor.source === 'fixture-image', `REN-005 ${runLabel} descriptor source`);
  invariant(ui.descriptor.sourceKind === 'alias', `REN-005 ${runLabel} descriptor source kind`);
  invariant(ui.descriptor.state === 'resolved', `REN-005 ${runLabel} descriptor state`);
  invariant(ui.descriptor.role === 'image', `REN-005 ${runLabel} descriptor role`);
  invariant(ui.descriptor.bounds === '[0,0,32,32]', `REN-005 ${runLabel} descriptor bounds`);
  invariant(
    ui.descriptor.initialSource.includes('https://assets.example.test/image.svg'),
    `REN-005 ${runLabel} descriptor initial source`,
  );
  invariant(ui.descriptor.initialState === 'resolved', `REN-005 ${runLabel} descriptor initial state`);
  invariant(ui.descriptor.staleAttachCount === '0', `REN-005 ${runLabel} descriptor stale attach`);
  invariant(
    ui.descriptor.staleCompletionCount === '1',
    `REN-005 ${runLabel} descriptor stale completion`,
  );
  invariant(ui.failed.source === 'fixture://failed-image.png', `REN-005 ${runLabel} failed source`);
  invariant(ui.failed.state === 'failed', `REN-005 ${runLabel} failed state`);
  invariant(ui.failed.role === 'asset-placeholder', `REN-005 ${runLabel} failed role`);
  invariant(ui.failed.bounds === '[220,40,32,32]', `REN-005 ${runLabel} failed bounds`);
  invariant(ui.failed.diagnosticCount === '1', `REN-005 ${runLabel} failed diagnostic`);
  invariant(ui.counters.requests === '5', `REN-005 ${runLabel} request count`);
  invariant(
    ui.counters.backend === 'pending 0 · resolved 3 · rejected 1 · unloaded 1',
    `REN-005 ${runLabel} backend counters (${String(ui.counters.backend)})`,
  );
  invariant(ui.counters.resources === '4', `REN-005 ${runLabel} resource count`);
  invariant(Number(ui.counters.leases) > 0, `REN-005 ${runLabel} lease count`);
  invariant(ui.counters.stale === '1', `REN-005 ${runLabel} stale count`);
  invariant(ui.counters.pendingRelease === '0', `REN-005 ${runLabel} pending release count`);
  invariant(ui.requestJournal.count >= 15, `REN-005 ${runLabel} request journal rows`);
  invariant(ui.requestJournal.events.includes('load-rejected'), `REN-005 ${runLabel} rejected journal`);
  invariant(ui.requestJournal.events.includes('load-resolved'), `REN-005 ${runLabel} resolved journal`);
  invariant(ui.requestJournal.kinds.includes('descriptor'), `REN-005 ${runLabel} descriptor journal`);
  invariant(ui.requestJournal.kinds.includes('failed'), `REN-005 ${runLabel} failed journal`);
  const expectedPerformanceRows = runLabel === 'repeat' ? 2 : 1;
  invariant(
    ui.performance.count === expectedPerformanceRows,
    `REN-005 ${runLabel} per-run performance journal`,
  );
  invariant(
    Number(ui.performance.latest.runIndex) === expectedPerformanceRows,
    `REN-005 ${runLabel} performance run index`,
  );
  invariant(
    ui.performance.latest.runKind === (runLabel === 'repeat' ? 'repeat' : 'run'),
    `REN-005 ${runLabel} performance run kind`,
  );
  for (const [label, value] of [
    ['FPS', ui.performance.latest.framesPerSecond],
    ['frame count', ui.performance.latest.frameCount],
    ['long-task count', ui.performance.latest.longTaskCount],
    ['long-task duration', ui.performance.latest.longTaskTotalMs],
    ['max frame gap', ui.performance.latest.maxFrameGapMs],
    ['run duration', ui.performance.latest.durationMs],
  ]) {
    invariant(Number.isFinite(Number(value)) && Number(value) >= 0, `REN-005 ${runLabel} ${label}`);
  }
}

async function loadExpectedCases() {
  const document = JSON.parse(await readFile(EXPECTED_PATH, 'utf8'));
  invariant(Array.isArray(document.cases), 'normalized expected cases array');
  const selected = new Map();
  for (const caseSpec of RENDER_CASES) {
    const expectedCase = document.cases.find((record) => record?.id === caseSpec.id);
    invariant(expectedCase !== undefined, `${caseSpec.id} normalized expected record`);
    invariant(
      expectedCase.expected?.assertions?.length === caseSpec.expectedAssertions,
      `${caseSpec.id} normalized expected assertion count`,
    );
    selected.set(caseSpec.id, expectedCase);
  }
  invariant(
    sum(RENDER_CASES, (record) => record.expectedAssertions) === EXPECTED_ASSERTION_TOTAL,
    'render checkpoint assertion inventory must remain 128',
  );
  invariant(
    sum(RENDER_CASES, (record) => record.expectedFailures?.length ?? 0) ===
      EXPECTED_ASSERTION_FAILURE_TOTAL,
    'render checkpoint immutable conflict inventory must remain 3',
  );
  return selected;
}

function attachErrorCapture(page, caseId, capturedErrors) {
  page.on('console', (message) => {
    if (message.type() === 'error') capturedErrors.console.push({ caseId, message: message.text() });
  });
  page.on('pageerror', (error) => {
    capturedErrors.page.push({ caseId, message: error.stack ?? error.message });
  });
  page.on('requestfailed', (request) => {
    capturedErrors.network.push({
      caseId,
      url: request.url(),
      error: request.failure()?.errorText ?? 'unknown request failure',
    });
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      capturedErrors.network.push({ caseId, url: response.url(), error: `HTTP ${response.status()}` });
    }
  });
}

function summarizeComparison(comparison) {
  return {
    assertionCount: comparison.assertions.length,
    passed: comparison.passed,
    failed: comparison.failed,
    firstFailure: comparison.firstFailure,
    failures: comparisonFailures(comparison),
  };
}

function comparisonFailures(comparison) {
  return comparison.assertions
    .filter((assertion) => !assertion.passed)
    .map((assertion) => ({
      path: assertion.path,
      code: assertion.failure?.code ?? null,
      failurePath: assertion.failure?.path ?? null,
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function cleanupStatus(cleanup) {
  return cleanup && typeof cleanup === 'object' && typeof cleanup.status === 'string'
    ? cleanup.status
    : null;
}

function parseArguments(arguments_) {
  const allowed = new Set(['--headed']);
  for (const argument of arguments_) {
    invariant(allowed.has(argument), `unknown argument ${argument}`);
  }
  return arguments_.includes('--headed');
}

function sum(records, select) {
  return records.reduce((total, record) => total + select(record), 0);
}

function invariant(condition, message) {
  if (!condition) throw new Error(`Core v2 render browser checkpoint failed: ${message}`);
}

function serializeError(error) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack ?? null };
  }
  return { name: 'Error', message: String(error), stack: null };
}
