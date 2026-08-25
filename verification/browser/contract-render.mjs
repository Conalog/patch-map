#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import { createServer } from 'vite';

import { maskVolatile } from '../contract/evidence.mjs';
import {
  assertCaseRun,
  assertDestroyControl,
  cleanupStatus,
  compareCaseRun,
  firstJsonDifference,
  invariant,
  summarizeComparison,
} from './contract-render/assertions.mjs';
import {
  CASE_TIMEOUT_MS,
  CHECKPOINT_TIMEOUT_MS,
  CONTROL_CASES,
  DOM_CONTROL_CASES,
  GPU_EVIDENCE_CASES,
  PERFORMANCE_CASE_TIMEOUT_MS,
  PERFORMANCE_TRANCHE_CASES,
  RENDER_CASES,
} from './contract-render/catalog.mjs';
import {
  BRIDGE_NAME,
  executeBrowserRun,
  executeBrowserUiRun,
  GPU_PROBE_NAME,
} from './contract-render/browser-run.mjs';
import {
  verifyPointerRootInput,
  verifyViewportRootInput,
} from './contract-render/focused-input.mjs';
import { loadExpectedCases } from './contract-render/expected-cases.mjs';
import { installWebGlCanvasProbe } from './contract-render/webgl-probe.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const EXPECTED_PATH = fileURLToPath(new URL(
  '../../contracts/evidence/catalog-normalized-expected.v1.json',
  import.meta.url,
));
const VITE_CONFIG_PATH = path.join(ROOT, 'vite.lab.config.ts');
const DATASET_SIZE = '100';
const SEED = 319;
const options = parseArguments(process.argv.slice(2));
const headed = options.headed;
const selectedRenderCases = options.caseId === null
  ? RENDER_CASES
  : RENDER_CASES.filter((record) => record.id === options.caseId);
invariant(selectedRenderCases.length > 0, `unknown render case ${String(options.caseId)}`);
const selectedAssertionTotal = sum(selectedRenderCases, (record) => record.expectedAssertions);
const selectedObservedConflictTotal = sum(
  selectedRenderCases,
  (record) => record.expectedFailures?.length ?? 0,
);
const selectedPerformanceDeficitTotal = sum(
  selectedRenderCases,
  (record) => record.expectedDeficits?.length ?? 0,
);
const selectedObservedFailureTotal =
  selectedObservedConflictTotal + selectedPerformanceDeficitTotal;
const selectedDeclaredConflictTotal = sum(
  selectedRenderCases,
  (record) => (record.expectedFailures?.length ?? 0) + (record.latentConflicts?.length ?? 0),
);
const errors = { console: [], page: [], network: [], externalFixture: [] };
const report = {
  $schema: 'patch-map-contract-render-browser-checkpoint/1',
  status: 'failed',
  headed,
  scope: options.caseId === null ? 'full' : 'case',
  selectedCase: options.caseId,
  routeParams: { size: DATASET_SIZE, seed: SEED },
  activeCase: null,
  cases: [],
  assertions: {
    expected: selectedAssertionTotal,
    passed: 0,
    failed: selectedAssertionTotal,
    repeatPassed: 0,
    repeatFailed: selectedAssertionTotal,
    freshPassed: 0,
    freshFailed: selectedAssertionTotal,
  },
  conflicts: {
    declared: selectedDeclaredConflictTotal,
    observed: selectedObservedConflictTotal,
    latent: selectedDeclaredConflictTotal - selectedObservedConflictTotal,
    latentCases: selectedRenderCases
      .filter((record) => (record.latentConflicts?.length ?? 0) > 0)
      .map((record) => record.id),
  },
  performanceDeficits: {
    declared: selectedPerformanceDeficitTotal,
    observed: selectedPerformanceDeficitTotal,
  },
  errors,
  browser: null,
  failure: null,
};

let server = null;
let browser = null;
let lastFocusedUi = null;
let cleanupPromise = null;
let shutdownReason = null;

const checkpointDeadline = setTimeout(() => {
  requestShutdown('checkpoint-timeout');
}, CHECKPOINT_TIMEOUT_MS);
checkpointDeadline.unref();
const onInterrupt = () => requestShutdown('SIGINT');
const onTerminate = () => requestShutdown('SIGTERM');
process.once('SIGINT', onInterrupt);
process.once('SIGTERM', onTerminate);

try {
  const expectedCases = await loadExpectedCases(EXPECTED_PATH);
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
  invariant(typeof baseUrl === 'string', 'Vite did not expose the PatchMap Lab URL');

  browser = await chromium.launch({
    args: ['--js-flags=--expose-gc', '--enable-precise-memory-info'],
    headless: !headed,
  });
  report.browser = {
    name: 'Chromium',
    version: browser.version(),
    platform: process.platform,
  };

  for (const caseSpec of selectedRenderCases) {
    report.activeCase = caseSpec.id;
    process.stderr.write(`[patch-map-render-browser] ${caseSpec.id} start\n`);
    const expectedCase = expectedCases.get(caseSpec.id);
    invariant(expectedCase !== undefined, `${caseSpec.id} normalized expected record is missing`);
    const caseReport = await withTimeout(
      executeCase({
        browser,
        baseUrl,
        caseSpec,
        expectedCase,
        errors,
      }),
      PERFORMANCE_TRANCHE_CASES.has(caseSpec.id)
        ? PERFORMANCE_CASE_TIMEOUT_MS
        : CASE_TIMEOUT_MS,
      `${caseSpec.id} first/repeat/fresh execution`,
    );
    report.cases.push(caseReport);
    process.stderr.write(`[patch-map-render-browser] ${caseSpec.id} complete\n`);
  }
  report.activeCase = null;

  const passed = sum(report.cases, (record) => record.comparison.passed);
  const failed = sum(report.cases, (record) => record.comparison.failed);
  const repeatPassed = sum(report.cases, (record) => record.repeatComparison.passed);
  const repeatFailed = sum(report.cases, (record) => record.repeatComparison.failed);
  const freshPassed = sum(report.cases, (record) => record.freshComparison.passed);
  const freshFailed = sum(report.cases, (record) => record.freshComparison.failed);
  report.assertions = {
    expected: selectedAssertionTotal,
    passed,
    failed,
    repeatPassed,
    repeatFailed,
    freshPassed,
    freshFailed,
  };

  invariant(
    report.cases.length === selectedRenderCases.length,
    options.caseId === null
      ? 'all one-hundred-fifty-five render routes completed'
      : `${options.caseId} targeted render route completed`,
  );
  invariant(
    passed === selectedAssertionTotal - selectedObservedFailureTotal
      && failed === selectedObservedFailureTotal,
    options.caseId === null
      ? 'canonical comparison must be exactly 1951 pass, 26 immutable conflicts, and 14 performance deficits'
      : `${options.caseId} targeted canonical comparison`,
  );
  invariant(
    repeatPassed === selectedAssertionTotal - selectedObservedFailureTotal
      && repeatFailed === selectedObservedFailureTotal,
    options.caseId === null
      ? 'repeat comparison must be exactly 1951 pass, 26 immutable conflicts, and 14 performance deficits'
      : `${options.caseId} targeted repeat comparison`,
  );
  invariant(
    freshPassed === selectedAssertionTotal - selectedObservedFailureTotal
      && freshFailed === selectedObservedFailureTotal,
    options.caseId === null
      ? 'fresh comparison must be exactly 1951 pass, 26 immutable conflicts, and 14 performance deficits'
      : `${options.caseId} targeted fresh comparison`,
  );
  invariant(errors.console.length === 0, 'console error count must be zero');
  invariant(errors.page.length === 0, 'page error count must be zero');
  invariant(errors.network.length === 0, 'network error count must be zero');
  invariant(errors.externalFixture.length === 0, 'external fixture request count must be zero');
  report.status = selectedPerformanceDeficitTotal === 0
    ? 'pass'
    : 'observed-contract-deficit';
  if (selectedPerformanceDeficitTotal > 0) process.exitCode = 2;
} catch (error) {
  if (report.failure === null) {
    report.failure = {
      ...serializeError(error),
      focusedUi: lastFocusedUi,
    };
  }
  if (shutdownReason === null) process.exitCode = 1;
} finally {
  clearTimeout(checkpointDeadline);
  process.removeListener('SIGINT', onInterrupt);
  process.removeListener('SIGTERM', onTerminate);
  await closeOwnedResources();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

function requestShutdown(reason) {
  if (shutdownReason !== null) return;
  shutdownReason = reason;
  report.failure = {
    name: 'AbortError',
    message: `PatchMap render browser checkpoint stopped: ${reason}`,
    stack: null,
    focusedUi: lastFocusedUi,
  };
  process.exitCode = reason === 'SIGINT' ? 130 : reason === 'SIGTERM' ? 143 : 1;
  process.stderr.write(`[patch-map-render-browser] stopping: ${reason}\n`);
  void closeOwnedResources();
}

function closeOwnedResources() {
  if (cleanupPromise !== null) return cleanupPromise;
  cleanupPromise = (async () => {
    const ownedBrowser = browser;
    const ownedServer = server;
    browser = null;
    server = null;
    if (ownedBrowser) await ownedBrowser.close().catch(() => undefined);
    if (ownedServer) await ownedServer.close().catch(() => undefined);
  })();
  return cleanupPromise;
}

async function executeCase({ browser: activeBrowser, baseUrl, caseSpec, expectedCase, errors: capturedErrors }) {
  const context = await activeBrowser.newContext({
    viewport: { width: 1_280, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  attachErrorCapture(page, caseSpec.id, capturedErrors);
  await installWebGlCanvasProbe(page, caseSpec.id, GPU_PROBE_NAME);
  const route = `/lab/patch-map?scenario=${caseSpec.id}&size=${DATASET_SIZE}&seed=${SEED}`;
  const routeUrl = new URL(route, baseUrl).href;

  try {
    await openFocusedCase(page, routeUrl, route, caseSpec.id);
    traceCasePhase(caseSpec.id, 'initial route armed');

    const first = DOM_CONTROL_CASES.has(caseSpec.id)
      ? await executeBrowserUiRun(page, caseSpec.id, 'runCase', 'load-dataset')
      : await executeBrowserRun(page, 'runCase');
    traceCasePhase(caseSpec.id, 'first run observed');
    lastFocusedUi = first.ui;
    const comparison = compareCaseRun(expectedCase, first);
    assertCaseRun(caseSpec, first, comparison, 'first');

    const repeat = DOM_CONTROL_CASES.has(caseSpec.id)
      ? await executeBrowserUiRun(page, caseSpec.id, 'repeatCase', 'repeat-action')
      : await executeBrowserRun(page, 'repeatCase');
    traceCasePhase(caseSpec.id, 'repeat run observed');
    lastFocusedUi = repeat.ui;
    const repeatComparison = compareCaseRun(expectedCase, repeat);
    assertCaseRun(caseSpec, repeat, repeatComparison, 'repeat');
    invariant(
      comparison.stableActualSha256 === repeatComparison.stableActualSha256,
      `${caseSpec.id} repeat stable actual digest (difference=${
        firstJsonDifference(
          maskVolatile(first.actualObservation, expectedCase.volatileFields),
          maskVolatile(repeat.actualObservation, expectedCase.volatileFields),
          '',
        )
      })`,
    );

    let rootInput = null;
    if (caseSpec.id === 'VIE-001') {
      rootInput = await verifyViewportRootInput(page, BRIDGE_NAME);
    } else if (
      caseSpec.id === 'EVT-003' ||
      caseSpec.id === 'EVT-008' ||
      caseSpec.id === 'ACC-002'
    ) {
      rootInput = await verifyPointerRootInput(page, caseSpec.id, BRIDGE_NAME);
    }
    if (rootInput !== null) traceCasePhase(caseSpec.id, 'trusted root input verified');

    const destroyed = await destroyBrowserCase(page, caseSpec.id);
    traceCasePhase(caseSpec.id, 'first session destroyed');
    invariant(destroyed.status === 'destroyed', `${caseSpec.id} bridge destroy terminal status`);
    invariant(destroyed.canvasCount === 0, `${caseSpec.id} destroy releases every canvas`);
    assertDestroyControl(caseSpec.id, destroyed, 'first/repeat');

    const fresh = await executeFreshSession({
      browser: activeBrowser,
      routeUrl,
      route,
      caseSpec,
      expectedCase,
      errors: capturedErrors,
    });
    traceCasePhase(caseSpec.id, 'fresh session observed and destroyed');
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
      gpu: GPU_EVIDENCE_CASES.has(caseSpec.id)
        ? { first: first.gpu, repeat: repeat.gpu, fresh: fresh.run.gpu }
        : null,
      cleanup: {
        first: first.cleanupStatus,
        repeat: repeat.cleanupStatus,
        fresh: fresh.run.cleanupStatus,
        destroy: cleanupStatus(destroyed.cleanup),
        freshDestroy: cleanupStatus(fresh.destroyed.cleanup),
      },
      focusedUi: DOM_CONTROL_CASES.has(caseSpec.id)
        ? { first: first.ui, repeat: repeat.ui, fresh: fresh.run.ui }
        : null,
      rootInput,
      controls: CONTROL_CASES.has(caseSpec.id)
        ? {
            first: first.ui?.trigger ?? null,
            repeat: repeat.ui?.trigger ?? null,
            destroy: destroyed.trigger,
            fresh: fresh.run.ui?.trigger ?? null,
            freshDestroy: fresh.destroyed.trigger,
          }
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
  await installWebGlCanvasProbe(page, caseSpec.id, GPU_PROBE_NAME);

  try {
    await openFocusedCase(page, routeUrl, route, caseSpec.id);
    traceCasePhase(caseSpec.id, 'fresh route armed');
    const run = DOM_CONTROL_CASES.has(caseSpec.id)
      ? await executeBrowserUiRun(page, caseSpec.id, 'runCase', 'load-dataset')
      : await executeBrowserRun(page, 'runCase');
    traceCasePhase(caseSpec.id, 'fresh run observed');
    lastFocusedUi = run.ui;
    const comparison = compareCaseRun(expectedCase, run);
    assertCaseRun(caseSpec, run, comparison, 'fresh');
    const destroyed = await destroyBrowserCase(page, caseSpec.id);
    traceCasePhase(caseSpec.id, 'fresh session destroyed');
    invariant(destroyed.status === 'destroyed', `${caseSpec.id} fresh bridge destroy terminal status`);
    invariant(destroyed.canvasCount === 0, `${caseSpec.id} fresh destroy releases every canvas`);
    assertDestroyControl(caseSpec.id, destroyed, 'fresh');
    return { run, comparison, destroyed };
  } finally {
    await page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
  }
}

async function openFocusedCase(page, routeUrl, route, caseId) {
  await page.goto(routeUrl, { waitUntil: 'networkidle' });
  await page.waitForFunction(
    ({ bridgeName, expectedCaseId }) => {
      const bridge = window[bridgeName];
      const state = bridge?.state();
      return state?.status === 'armed'
        && state.caseId === expectedCaseId
        && document.querySelector(
          `[data-testid="scenario-${expectedCaseId.toLowerCase()}"]`,
        ) !== null;
    },
    { bridgeName: BRIDGE_NAME, expectedCaseId: caseId },
    { timeout: 30_000 },
  );
  invariant(new URL(page.url()).pathname + new URL(page.url()).search === route, `${caseId} canonical route`);
  invariant(
    await page.getByTestId(`scenario-${caseId.toLowerCase()}`).count() === 1,
    `${caseId} focused root identity`,
  );
}

async function destroyBrowserCase(page, caseId) {
  return page.evaluate(async ({ bridgeName, useDomControl }) => {
    const bridge = window[bridgeName];
    if (!bridge) throw new Error(`Missing public Lab bridge ${bridgeName}`);
    const surface = document.querySelector('[data-contract-surface]');
    if (!surface) throw new Error('Missing focused contract surface');
    const root = document.querySelector(`[data-testid="${bridge.state().rootTestId}"]`);
    if (!(root instanceof HTMLElement)) throw new Error('Missing focused contract root');
    let cleanup;
    let trigger;
    if (useDomControl) {
      const button = document.querySelector('[data-testid="destroy-case"]');
      if (!(button instanceof HTMLButtonElement)) {
        throw new Error('Missing focused Lab control destroy-case');
      }
      if (button.disabled) throw new Error('Focused Lab control destroy-case is disabled');
      const completion = new Promise((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          root.removeEventListener('patch-map-contract-destroy-complete', onComplete);
          reject(new Error(`Focused ${bridge.state().rootTestId} destroy completion event timed out`));
        }, 30_000);
        const onComplete = (event) => {
          if (!(event instanceof CustomEvent) || event.detail?.operation !== 'destroyCase') return;
          window.clearTimeout(timeout);
          root.removeEventListener('patch-map-contract-destroy-complete', onComplete);
          resolve(event.detail.cleanup);
        };
        root.addEventListener('patch-map-contract-destroy-complete', onComplete);
      });
      button.click();
      cleanup = await completion;
      trigger = 'click:destroy-case';
    } else {
      cleanup = await bridge.destroyCase();
      trigger = 'bridge:destroyCase';
    }
    return {
      cleanup,
      trigger,
      status: bridge.state().status,
      rootStatus: root.dataset.contractStatus ?? null,
      canvasCount: surface.querySelectorAll('canvas').length,
    };
  }, {
    bridgeName: BRIDGE_NAME,
    useDomControl: CONTROL_CASES.has(caseId),
  });
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
  page.on('request', (request) => {
    const url = request.url();
    if (/^(?:fixture:|https?:\/\/assets\.example\.test(?:\/|$))/u.test(url)) {
      capturedErrors.externalFixture.push({ caseId, url });
    }
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      capturedErrors.network.push({ caseId, url: response.url(), error: `HTTP ${response.status()}` });
    }
  });
}

function parseArguments(arguments_) {
  let headed = false;
  let caseId = null;
  for (const argument of arguments_) {
    if (argument === '--headed') {
      headed = true;
      continue;
    }
    if (argument.startsWith('--case=')) {
      invariant(caseId === null, 'render case may be selected only once');
      caseId = argument.slice('--case='.length);
      invariant(/^[A-Z]{3}-\d{3}$/u.test(caseId), `invalid render case ${caseId}`);
      continue;
    }
    invariant(false, `unknown argument ${argument}`);
  }
  return { headed, caseId };
}

function traceCasePhase(caseId, phase) {
  process.stderr.write(`[patch-map-render-browser] ${caseId}: ${phase}\n`);
}

async function withTimeout(promise, timeoutMs, label) {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`PatchMap render browser checkpoint timed out: ${label}`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

function sum(records, select) {
  return records.reduce((total, record) => total + select(record), 0);
}

function serializeError(error) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack ?? null };
  }
  return { name: 'Error', message: String(error), stack: null };
}
