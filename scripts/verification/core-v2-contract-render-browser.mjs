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
const EXPECTED_ASSERTION_TOTAL = 74;
const RENDER_CASES = Object.freeze([
  Object.freeze({ id: 'LAY-001', expectedAssertions: 9 }),
  Object.freeze({ id: 'REN-001', expectedAssertions: 9 }),
  Object.freeze({ id: 'REN-004', expectedAssertions: 10 }),
  Object.freeze({ id: 'REN-003', expectedAssertions: 12 }),
  Object.freeze({ id: 'REN-002', expectedAssertions: 9 }),
  Object.freeze({ id: 'LAY-005', expectedAssertions: 14 }),
  Object.freeze({ id: 'LAY-004', expectedAssertions: 11 }),
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
  report.assertions = {
    expected: EXPECTED_ASSERTION_TOTAL,
    passed,
    failed,
    repeatPassed,
    repeatFailed,
  };

  invariant(report.cases.length === RENDER_CASES.length, 'all seven render routes completed');
  invariant(passed === EXPECTED_ASSERTION_TOTAL && failed === 0, 'canonical comparison must be 74/74');
  invariant(
    repeatPassed === EXPECTED_ASSERTION_TOTAL && repeatFailed === 0,
    'repeat comparison must be 74/74',
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
    await page.goto(routeUrl, { waitUntil: 'networkidle' });
    await page.waitForFunction(
      (bridgeName) => {
        const bridge = window[bridgeName];
        return bridge?.state().status === 'armed';
      },
      BRIDGE_NAME,
      { timeout: 30_000 },
    );
    invariant(new URL(page.url()).pathname + new URL(page.url()).search === route, `${caseSpec.id} canonical route`);
    invariant(
      await page.getByTestId(`scenario-${caseSpec.id.toLowerCase()}`).count() === 1,
      `${caseSpec.id} focused root identity`,
    );

    const first = await executeBrowserRun(page, 'runCase');
    const comparison = compareCaseRun(expectedCase, first);
    assertCaseRun(caseSpec, first, comparison, 'first');

    const repeat = await executeBrowserRun(page, 'repeatCase');
    const repeatComparison = compareCaseRun(expectedCase, repeat);
    assertCaseRun(caseSpec, repeat, repeatComparison, 'repeat');
    invariant(
      comparison.stableActualSha256 === repeatComparison.stableActualSha256,
      `${caseSpec.id} repeat stable actual digest`,
    );

    const destroyed = await page.evaluate(async (bridgeName) => {
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
    invariant(destroyed.status === 'destroyed', `${caseSpec.id} bridge destroy terminal status`);
    invariant(destroyed.canvasCount === 0, `${caseSpec.id} destroy releases every canvas`);

    return {
      id: caseSpec.id,
      route,
      state: {
        first: first.terminalStatus,
        repeat: repeat.terminalStatus,
        destroyed: destroyed.status,
      },
      comparison: summarizeComparison(comparison),
      repeatComparison: summarizeComparison(repeatComparison),
      deterministic: true,
      stableActualSha256: comparison.stableActualSha256,
      canvas: {
        first: first.canvas,
        repeat: repeat.canvas,
        afterDestroy: destroyed.canvasCount,
      },
      cleanup: {
        first: first.cleanupStatus,
        repeat: repeat.cleanupStatus,
        destroy: cleanupStatus(destroyed.cleanup),
      },
    };
  } finally {
    await page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
  }
}

async function executeBrowserRun(page, operation) {
  return page.evaluate(async ({ bridgeName, operationName }) => {
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
      const invoke = bridge[operationName];
      if (typeof invoke !== 'function') throw new Error(`Missing bridge operation ${operationName}`);
      const pending = invoke.call(bridge);
      const runningStatus = bridge.state().status;
      sample();
      const run = await pending;
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
  }, { bridgeName: BRIDGE_NAME, operationName: operation });
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
  invariant(comparison.passed === caseSpec.expectedAssertions, `${prefix} all assertions pass`);
  invariant(comparison.failed === 0, `${prefix} has zero assertion failures`);
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
    'render checkpoint assertion inventory must remain 74',
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
  };
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
