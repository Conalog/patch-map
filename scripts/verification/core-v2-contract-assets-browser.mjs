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
const CASE_ID = 'AST-001';
const DATASET_SIZE = '100';
const SEED = 319;
const ROUTE = '/lab/core-v2?scenario=AST-001&size=100&seed=319';
const EXPECTED_ASSERTION_COUNT = 18;
const EXPECTED_PASSED_COUNT = 17;
const EXPECTED_FAILED_COUNT = 1;
const EXPECTED_ACTION_COUNT = 8;
const EXPECTED_STATUS = 'observed-contract-conflict';
const EXPECTED_CONFLICT = Object.freeze({
  index: 5,
  path: '/outcome/aliasConflict/code',
  operator: 'eq',
  expected: 'ASSET_ALIAS_CONFLICT',
  actual: 'CONFLICT',
});
const PROHIBITED_ASSET_REQUESTS = new Set([
  'fixture://required-init-failure.png',
  'https://assets.example.test/other.png',
]);

const headed = parseArguments(process.argv.slice(2));
const errors = { console: [], page: [], network: [], prohibitedAssetRequests: [] };
const report = {
  $schema: 'core-v2-contract-assets-browser-checkpoint/1',
  status: 'failed',
  headed,
  caseId: CASE_ID,
  route: ROUTE,
  routeParams: { size: DATASET_SIZE, seed: SEED },
  sessions: null,
  assertions: {
    expectedPerRun: EXPECTED_ASSERTION_COUNT,
    expectedPassedPerRun: EXPECTED_PASSED_COUNT,
    expectedFailedPerRun: EXPECTED_FAILED_COUNT,
    first: null,
    repeat: null,
    fresh: null,
  },
  deterministic: null,
  errors,
  browser: null,
  failure: null,
};

let server = null;
let browser = null;

try {
  const expectedCase = await loadExpectedCase();
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

  const primarySession = await executeSession({
    browser,
    baseUrl,
    expectedCase,
    errors,
    sessionLabel: 'primary',
    operations: ['runCase', 'repeatCase'],
  });
  const freshSession = await executeSession({
    browser,
    baseUrl,
    expectedCase,
    errors,
    sessionLabel: 'fresh',
    operations: ['runCase'],
  });

  const first = primarySession.runs[0];
  const repeat = primarySession.runs[1];
  const fresh = freshSession.runs[0];
  invariant(first?.operation === 'runCase', 'primary first operation is runCase');
  invariant(repeat?.operation === 'repeatCase', 'primary second operation is repeatCase');
  invariant(fresh?.operation === 'runCase', 'fresh context operation is runCase');

  const stableDigests = [
    first.comparison.stableActualSha256,
    repeat.comparison.stableActualSha256,
    fresh.comparison.stableActualSha256,
  ];
  invariant(new Set(stableDigests).size === 1, 'first, repeat, and fresh actual digests match');
  invariant(errors.console.length === 0, 'console error count must be zero');
  invariant(errors.page.length === 0, 'page error count must be zero');
  invariant(errors.network.length === 0, 'network error count must be zero');
  invariant(
    errors.prohibitedAssetRequests.length === 0,
    'required failure and alias conflict must not attempt an external asset request',
  );

  report.sessions = { primary: primarySession, fresh: freshSession };
  report.assertions = {
    ...report.assertions,
    first: first.comparison,
    repeat: repeat.comparison,
    fresh: fresh.comparison,
  };
  report.deterministic = {
    stableActualSha256: stableDigests[0],
    firstRepeatFresh: true,
  };
  report.status = EXPECTED_STATUS;
} catch (error) {
  report.failure = serializeError(error);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => undefined);
  if (server) await server.close().catch(() => undefined);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

async function executeSession({
  browser: activeBrowser,
  baseUrl,
  expectedCase,
  errors: capturedErrors,
  sessionLabel,
  operations,
}) {
  const context = await activeBrowser.newContext({
    viewport: { width: 1_280, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  attachErrorCapture(page, sessionLabel, capturedErrors);
  const routeUrl = new URL(ROUTE, baseUrl).href;
  let destroyed = false;

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
    invariant(
      new URL(page.url()).pathname + new URL(page.url()).search === ROUTE,
      `${sessionLabel} canonical route`,
    );
    invariant(
      await page.getByTestId('scenario-ast-001').count() === 1,
      `${sessionLabel} focused root identity`,
    );

    const runs = [];
    for (const operation of operations) {
      const browserRun = await executeBrowserRun(page, operation);
      const comparison = compareCaseRun(expectedCase, browserRun);
      const runLabel = `${sessionLabel} ${operation}`;
      assertCaseRun(expectedCase, browserRun, comparison, runLabel);
      runs.push(summarizeRun(browserRun, comparison));
    }

    const destroyResult = await destroyBrowserCase(page);
    destroyed = true;
    assertDestroyResult(destroyResult, sessionLabel);

    return {
      context: sessionLabel,
      freshBrowserContext: true,
      runs,
      destroy: {
        state: destroyResult.status,
        cleanupStatus: cleanupStatus(destroyResult.cleanup),
        canvasCount: destroyResult.canvasCount,
      },
    };
  } finally {
    if (!destroyed) await destroyBrowserCase(page).catch(() => undefined);
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
        actionResults: Array.isArray(execution?.actionResults)
          ? execution.actionResults.map((result) => ({
            index: result?.index ?? null,
            type: result?.type ?? null,
            status: result?.status ?? null,
          }))
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

function compareCaseRun(expectedCase, browserRun) {
  return compareObservation({
    expectedCase,
    actual: browserRun.actualObservation,
    fixtures: browserRun.fixtures,
    captures: browserRun.captures,
  });
}

function assertCaseRun(expectedCase, run, comparison, runLabel) {
  const prefix = `${CASE_ID} ${runLabel}`;
  invariant(run.runningStatus === 'running', `${prefix} enters running state`);
  invariant(run.terminalStatus === 'observed', `${prefix} observed terminal state`);
  invariant(run.runStatus === 'observed', `${prefix} public bridge run result`);
  invariant(run.executionStatus === 'completed', `${prefix} executor completion`);
  invariant(run.actionResults.length === EXPECTED_ACTION_COUNT, `${prefix} has eight action results`);
  invariant(
    run.actionResults.every((result) => result.status === 'completed'),
    `${prefix} actions complete`,
  );
  invariant(run.actualMatchesRun === true, `${prefix} actualObservation public accessor parity`);
  invariant(run.cleanupStatus === 'completed', `${prefix} cleanup completion`);
  invariant(run.canvas.initial === 0, `${prefix} starts without a retained canvas`);
  invariant(run.canvas.maximumDuringRun === 1, `${prefix} owns exactly one transient canvas`);
  invariant(run.canvas.afterCleanup === 0, `${prefix} cleanup releases the transient canvas`);
  assertExpectedContractConflict(expectedCase, run.actualObservation, comparison, prefix);
}

function assertExpectedContractConflict(expectedCase, actual, comparison, prefix) {
  invariant(
    comparison.assertions.length === EXPECTED_ASSERTION_COUNT,
    `${prefix} assertion inventory`,
  );
  invariant(comparison.passed === EXPECTED_PASSED_COUNT, `${prefix} has exactly 17 passes`);
  invariant(comparison.failed === EXPECTED_FAILED_COUNT, `${prefix} has exactly one failure`);

  const failures = comparison.assertions.filter((assertion) => !assertion.passed);
  const failure = failures[0];
  invariant(failures.length === 1, `${prefix} exposes one comparison failure`);
  invariant(failure?.index === EXPECTED_CONFLICT.index, `${prefix} known conflict index`);
  invariant(failure?.path === EXPECTED_CONFLICT.path, `${prefix} known conflict path`);
  invariant(failure?.operator === EXPECTED_CONFLICT.operator, `${prefix} known conflict operator`);
  invariant(failure?.failure?.code === 'VALUE_MISMATCH', `${prefix} known conflict failure code`);

  const expectedAssertion = expectedCase.expected.assertions[EXPECTED_CONFLICT.index];
  invariant(expectedAssertion?.path === EXPECTED_CONFLICT.path, `${prefix} canonical conflict path`);
  invariant(
    expectedAssertion?.value === EXPECTED_CONFLICT.expected,
    `${prefix} canonical conflict expected value`,
  );
  invariant(
    actual?.outcome?.aliasConflict?.code === EXPECTED_CONFLICT.actual,
    `${prefix} observed conflict actual value`,
  );
}

function assertDestroyResult(result, sessionLabel) {
  invariant(result.status === 'destroyed', `${sessionLabel} bridge destroy terminal status`);
  invariant(
    cleanupStatus(result.cleanup) === 'completed',
    `${sessionLabel} bridge destroy cleanup completion`,
  );
  invariant(result.canvasCount === 0, `${sessionLabel} destroy releases every canvas`);
}

async function loadExpectedCase() {
  const document = JSON.parse(await readFile(EXPECTED_PATH, 'utf8'));
  invariant(Array.isArray(document.cases), 'normalized expected cases array');
  const expectedCase = document.cases.find((record) => record?.id === CASE_ID);
  invariant(expectedCase !== undefined, `${CASE_ID} normalized expected record`);
  invariant(
    expectedCase.expected?.assertions?.length === EXPECTED_ASSERTION_COUNT,
    `${CASE_ID} normalized expected assertion count`,
  );
  return expectedCase;
}

function attachErrorCapture(page, sessionLabel, capturedErrors) {
  page.on('console', (message) => {
    if (message.type() === 'error') {
      capturedErrors.console.push({ caseId: CASE_ID, sessionLabel, message: message.text() });
    }
  });
  page.on('pageerror', (error) => {
    capturedErrors.page.push({
      caseId: CASE_ID,
      sessionLabel,
      message: error.stack ?? error.message,
    });
  });
  page.on('request', (request) => {
    if (PROHIBITED_ASSET_REQUESTS.has(request.url())) {
      capturedErrors.prohibitedAssetRequests.push({
        caseId: CASE_ID,
        sessionLabel,
        url: request.url(),
      });
    }
  });
  page.on('requestfailed', (request) => {
    capturedErrors.network.push({
      caseId: CASE_ID,
      sessionLabel,
      url: request.url(),
      error: request.failure()?.errorText ?? 'unknown request failure',
    });
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      capturedErrors.network.push({
        caseId: CASE_ID,
        sessionLabel,
        url: response.url(),
        error: `HTTP ${response.status()}`,
      });
    }
  });
}

function summarizeRun(run, comparison) {
  const expectedAssertion = EXPECTED_CONFLICT;
  return {
    operation: run.operation,
    state: { running: run.runningStatus, terminal: run.terminalStatus },
    executionStatus: run.executionStatus,
    actionResults: run.actionResults,
    cleanupStatus: run.cleanupStatus,
    canvas: run.canvas,
    comparison: {
      assertionCount: comparison.assertions.length,
      passed: comparison.passed,
      failed: comparison.failed,
      conflict: {
        index: expectedAssertion.index,
        path: expectedAssertion.path,
        expected: expectedAssertion.expected,
        actual: run.actualObservation.outcome.aliasConflict.code,
      },
      stableActualSha256: comparison.stableActualSha256,
    },
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

function invariant(condition, message) {
  if (!condition) throw new Error(`Core v2 asset browser checkpoint failed: ${message}`);
}

function serializeError(error) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack ?? null };
  }
  return { name: 'Error', message: String(error), stack: null };
}
