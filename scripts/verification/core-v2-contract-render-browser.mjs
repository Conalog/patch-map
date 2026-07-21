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
const EXPECTED_ASSERTION_TOTAL = 199;
const EXPECTED_ASSERTION_PASS_TOTAL = 196;
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
  Object.freeze({ id: 'REN-006', expectedAssertions: 30 }),
  Object.freeze({ id: 'REN-003', expectedAssertions: 12 }),
  Object.freeze({ id: 'REN-002', expectedAssertions: 9 }),
  Object.freeze({ id: 'LAY-005', expectedAssertions: 14 }),
  Object.freeze({ id: 'LAY-004', expectedAssertions: 11 }),
  Object.freeze({ id: 'REN-007', expectedAssertions: 26 }),
  Object.freeze({ id: 'REN-008', expectedAssertions: 10 }),
  Object.freeze({ id: 'REN-010', expectedAssertions: 11 }),
  Object.freeze({ id: 'REN-011', expectedAssertions: 20 }),
]);
const FOCUSED_UI_CASES = new Set(['REN-005', 'REN-006', 'REN-008', 'REN-010', 'REN-011']);

const headed = parseArguments(process.argv.slice(2));
const errors = { console: [], page: [], network: [], externalFixture: [] };
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
let lastFocusedUi = null;

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

  invariant(report.cases.length === RENDER_CASES.length, 'all thirteen render routes completed');
  invariant(
    passed === EXPECTED_ASSERTION_PASS_TOTAL && failed === EXPECTED_ASSERTION_FAILURE_TOTAL,
    'canonical comparison must be exactly 196 pass and 3 immutable conflicts',
  );
  invariant(
    repeatPassed === EXPECTED_ASSERTION_PASS_TOTAL &&
      repeatFailed === EXPECTED_ASSERTION_FAILURE_TOTAL,
    'repeat comparison must be exactly 196 pass and 3 immutable conflicts',
  );
  invariant(
    freshPassed === EXPECTED_ASSERTION_PASS_TOTAL &&
      freshFailed === EXPECTED_ASSERTION_FAILURE_TOTAL,
    'fresh comparison must be exactly 196 pass and 3 immutable conflicts',
  );
  invariant(errors.console.length === 0, 'console error count must be zero');
  invariant(errors.page.length === 0, 'page error count must be zero');
  invariant(errors.network.length === 0, 'network error count must be zero');
  invariant(errors.externalFixture.length === 0, 'external fixture request count must be zero');
  report.status = 'pass';
} catch (error) {
  report.failure = {
    ...serializeError(error),
    focusedUi: lastFocusedUi,
  };
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

    const first = FOCUSED_UI_CASES.has(caseSpec.id)
      ? await executeBrowserUiRun(page, caseSpec.id, 'runCase', 'load-dataset')
      : await executeBrowserRun(page, 'runCase');
    lastFocusedUi = first.ui;
    const comparison = compareCaseRun(expectedCase, first);
    assertCaseRun(caseSpec, first, comparison, 'first');

    const repeat = FOCUSED_UI_CASES.has(caseSpec.id)
      ? await executeBrowserUiRun(page, caseSpec.id, 'repeatCase', 'repeat-action')
      : await executeBrowserRun(page, 'repeatCase');
    lastFocusedUi = repeat.ui;
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
      focusedUi: FOCUSED_UI_CASES.has(caseSpec.id)
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
    const run = FOCUSED_UI_CASES.has(caseSpec.id)
      ? await executeBrowserUiRun(page, caseSpec.id, 'runCase', 'load-dataset')
      : await executeBrowserRun(page, 'runCase');
    lastFocusedUi = run.ui;
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

function executeBrowserUiRun(page, caseId, operation, buttonTestId) {
  return executeBrowserRun(page, operation, buttonTestId, caseId);
}

async function executeBrowserRun(page, operation, buttonTestId = null, focusedCaseId = null) {
  return page.evaluate(async ({ bridgeName, operationName, triggerTestId, uiCaseId }) => {
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
        ui = await collectFocusedUi({
          bridge,
          caseId: uiCaseId,
          triggerTestId,
          operationName,
        });
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

    function collectFocusedUi(options) {
      if (options.caseId === 'REN-005') return collectRen005FocusedUi(options);
      if (options.caseId === 'REN-006' || options.caseId === 'REN-011') {
        return collectTextFocusedUi(options);
      }
      return collectComponentAssetFocusedUi(options);
    }

    async function collectRen005FocusedUi({ bridge: activeBridge, triggerTestId, operationName }) {
      const expectedPerformanceRows = operationName === 'repeatCase' ? 2 : 1;
      const timeoutAt = performance.now() + 30_000;
      for (;;) {
        const root = document.querySelector(`[data-testid="${activeBridge.state().rootTestId}"]`);
        const statuses = root
          ? [...root.querySelectorAll('.contract-case-action[data-action-status]')]
            .map((row) => row.dataset.actionStatus)
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

    async function collectTextFocusedUi({
      bridge: activeBridge,
      caseId,
      triggerTestId,
      operationName,
    }) {
      const config = caseId === 'REN-006'
        ? {
            prefix: 'ren-006',
            inspectorTestId: 'ren-006-text-inspector',
            actionCount: 6,
            choices: ['initial', 'empty', 'long', 'missing-font', 'rapid', 'terminal'],
            fieldNames: [
              'phase',
              'source',
              'visible-text',
              'lines',
              'font-runs',
              'layout-bounds',
              'world-bounds',
              'hit-bounds',
              'publication',
              'intermediate-publication-count',
              'stale-glyph-count',
              'renderer-route',
              'style',
              'geometry',
            ],
          }
        : caseId === 'REN-011'
          ? {
              prefix: 'ren-011',
              inspectorTestId: 'ren-011-text-inspector',
              actionCount: 4,
              choices: [
                'placed',
                'auto',
                'wrap',
                'overflow-visible',
                'overflow-hidden',
                'overflow-ellipsis',
                'upright',
              ],
              fieldNames: [
                'specimen',
                'source',
                'placement',
                'margin',
                'tint',
                'rgba',
                'frame',
                'auto-font',
                'wrap-width',
                'overflow',
                'visible-text',
                'lines',
                'layout-bounds',
                'item-angle',
                'orientation',
                'screen-angle',
                'local-bounds',
                'paint-tint',
                'publication',
                'all-rows-exact',
              ],
            }
          : null;
      if (!config) throw new Error(`Unsupported focused text UI case ${String(caseId)}`);
      const expectedPerformanceRows = operationName === 'repeatCase' ? 2 : 1;
      const timeoutAt = performance.now() + 30_000;
      let lastState = null;
      for (;;) {
        const root = document.querySelector(`[data-testid="${activeBridge.state().rootTestId}"]`);
        const statuses = root
          ? [...root.querySelectorAll('.contract-case-action[data-action-status]')]
            .map((row) => row.dataset.actionStatus)
          : [];
        const inspector = root?.querySelector(`[data-testid="${config.inspectorTestId}"]`);
        const performanceRows = root?.querySelectorAll(
          `[data-testid="${config.prefix}-performance-journal-row"]`,
        ).length ?? 0;
        lastState = {
          contractStatus: root?.dataset.contractStatus ?? null,
          statuses,
          inspectorStatus: inspector?.dataset.observationStatus ?? null,
          observedChoiceCount: inspector?.dataset.observedChoiceCount ?? null,
          selectedChoice: inspector?.dataset.selectedChoice ?? null,
          performanceRows,
        };
        if (
          root?.dataset.contractStatus === 'observed'
          && statuses.length === config.actionCount
          && statuses.every((status) => status === 'completed')
          && inspector?.dataset.observationStatus === 'observed'
          && Number(inspector.dataset.observedChoiceCount) === config.choices.length
          && typeof inspector.dataset.selectedChoice === 'string'
          && performanceRows === expectedPerformanceRows
        ) {
          return readTextFocusedUi(root, inspector, config, triggerTestId);
        }
        if (performance.now() >= timeoutAt) {
          throw new Error(
            `Focused ${caseId} text DOM did not settle after ${triggerTestId}: ${JSON.stringify(lastState)}`,
          );
        }
        await new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
      }
    }

    async function readTextFocusedUi(root, inspector, config, triggerTestId) {
      const chooser = root.querySelector(`[data-testid="${config.prefix}-text-choice-select"]`);
      if (!(chooser instanceof HTMLSelectElement)) {
        throw new Error(`Missing ${config.prefix} text chooser`);
      }
      const initialChoice = chooser.value;
      const selectedFacts = async (choice) => {
        chooser.value = choice;
        chooser.dispatchEvent(new Event('change', { bubbles: true }));
        const timeoutAt = performance.now() + 5_000;
        while (inspector.dataset.selectedChoice !== choice) {
          if (performance.now() >= timeoutAt) {
            throw new Error(`Focused ${config.prefix} choice ${choice} did not settle`);
          }
          await new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
        }
        return Object.fromEntries(config.fieldNames.map((field) => [
          field,
          textAt(root, `${config.prefix}-${field}`),
        ]));
      };
      const choices = {};
      for (const choice of config.choices) choices[choice] = await selectedFacts(choice);
      if (chooser.value !== initialChoice) await selectedFacts(initialChoice);
      const performanceRows = [...root.querySelectorAll(
        `[data-testid="${config.prefix}-performance-journal-row"]`,
      )];
      const latestPerformance = performanceRows.at(-1)?.dataset ?? {};
      return {
        trigger: `click:${triggerTestId}`,
        actionStatuses: [...root.querySelectorAll('.contract-case-action[data-action-status]')]
          .map((row) => row.dataset.actionStatus ?? null),
        chooser: {
          disabled: chooser.disabled,
          initialChoice,
          seededChoice: inspector.dataset.seededChoice ?? null,
          options: [...chooser.options].map((option) => ({
            value: option.value,
            disabled: option.disabled,
            observationStatus: option.dataset.observationStatus ?? null,
          })),
        },
        choices,
        observedChoiceCount: textAt(root, `${config.prefix}-observed-choice-count`),
        displayOnlyNote: textAt(root, `${config.prefix}-display-only-note`),
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

    async function collectComponentAssetFocusedUi({
      bridge: activeBridge,
      caseId,
      triggerTestId,
      operationName,
    }) {
      const config = caseId === 'REN-008'
        ? {
            prefix: 'ren-008',
            inspectorTestId: 'ren-008-background-inspector',
            phases: ['initial', 'image', 'hidden', 'shown'],
            fieldNames: [
              'phase',
              'owner-id',
              'component-id',
              'entity-id',
              'logical-identity',
              'authored-size',
              'full-bounds',
              'visible-bounds',
              'source',
              'resource-state',
              'render-role',
              'binding-key',
              'generation',
              'render-object-count',
              'stale-count',
            ],
          }
        : caseId === 'REN-010'
          ? {
              prefix: 'ren-010',
              inspectorTestId: 'ren-010-icon-inspector',
              phases: ['initial', 'replacement', 'tint'],
              fieldNames: [
                'phase',
                'owner-id',
                'component-id',
                'entity-id',
                'logical-identity',
                'content-box',
                'icon-bounds',
                'authored-size',
                'placement',
                'margins',
                'source',
                'resource-state',
                'render-role',
                'binding-key',
                'generation',
                'semantic-tint',
                'renderer-tint',
                'render-object-count',
                'stale-count',
              ],
            }
          : null;
      if (!config) throw new Error(`Unsupported focused UI case ${String(caseId)}`);
      const expectedPerformanceRows = operationName === 'repeatCase' ? 2 : 1;
      const timeoutAt = performance.now() + 30_000;
      let lastState = null;
      for (;;) {
        const root = document.querySelector(`[data-testid="${activeBridge.state().rootTestId}"]`);
        const statuses = root
          ? [...root.querySelectorAll('.contract-case-action[data-action-status]')]
            .map((row) => row.dataset.actionStatus)
          : [];
        const inspector = root?.querySelector(`[data-testid="${config.inspectorTestId}"]`);
        const performanceRows = root?.querySelectorAll(
          `[data-testid="${config.prefix}-performance-journal-row"]`,
        ).length ?? 0;
        lastState = {
          contractStatus: root?.dataset.contractStatus ?? null,
          statuses,
          inspectorStatus: inspector?.dataset.observationStatus ?? null,
          observedPhaseCount: inspector?.dataset.observedPhaseCount ?? null,
          performanceRows,
        };
        if (
          root?.dataset.contractStatus === 'observed'
          && statuses.length === config.phases.length
          && statuses.every((status) => status === 'completed')
          && inspector?.dataset.observationStatus === 'observed'
          && Number(inspector.dataset.observedPhaseCount) === config.phases.length
          && performanceRows === expectedPerformanceRows
        ) {
          return readComponentAssetFocusedUi(root, config, triggerTestId);
        }
        if (performance.now() >= timeoutAt) {
          throw new Error(
            `Focused ${caseId} DOM did not settle after ${triggerTestId}: ${JSON.stringify(lastState)}`,
          );
        }
        await new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
      }
    }

    function readComponentAssetFocusedUi(root, config, triggerTestId) {
      const chooser = root.querySelector(`[data-testid="${config.prefix}-phase-select"]`);
      if (!(chooser instanceof HTMLSelectElement)) {
        throw new Error(`Missing ${config.prefix} phase chooser`);
      }
      const selectedFacts = (phase) => {
        chooser.value = phase;
        chooser.dispatchEvent(new Event('change', { bubbles: true }));
        return Object.fromEntries(config.fieldNames.map((field) => [
          field,
          textAt(root, `${config.prefix}-${field}`),
        ]));
      };
      const phases = Object.fromEntries(config.phases.map((phase) => [phase, selectedFacts(phase)]));
      const performanceRows = [...root.querySelectorAll(
        `[data-testid="${config.prefix}-performance-journal-row"]`,
      )];
      const latestPerformance = performanceRows.at(-1)?.dataset ?? {};
      const resourceRows = [...root.querySelectorAll(
        `[data-testid="${config.prefix}-resource-journal-row"]`,
      )];
      return {
        trigger: `click:${triggerTestId}`,
        actionStatuses: [...root.querySelectorAll('.contract-case-action[data-action-status]')]
          .map((row) => row.dataset.actionStatus ?? null),
        chooser: {
          disabled: chooser.disabled,
          options: [...chooser.options].map((option) => ({
            value: option.value,
            disabled: option.disabled,
            observationStatus: option.dataset.observationStatus ?? null,
          })),
        },
        phases,
        observedPhaseCount: textAt(root, `${config.prefix}-observed-phase-count`),
        captureId: config.prefix === 'ren-008'
          ? textAt(root, 'ren-008-capture-id')
          : null,
        resources: Object.fromEntries([
          'canvas-count',
          'subscription-count',
          'pending-work-count',
          'binding-count',
          'resource-count',
          'lease-count',
          'pending-settlement-count',
          'pending-release-count',
          'stale-attachment-resource-count',
          'renderer-object-resource-count',
          'cleanup-failure-count',
        ].map((field) => [field, textAt(root, `${config.prefix}-${field}`)])),
        resourceJournal: {
          count: resourceRows.length,
          events: resourceRows.map((row) => row.dataset.resourceEvent ?? null),
          phases: resourceRows.map((row) => row.dataset.resourcePhase ?? null),
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
        actionStatuses: [...root.querySelectorAll('.contract-case-action[data-action-status]')]
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
        throw new Error(`Missing focused DOM fact ${testId}: ${element?.outerHTML ?? 'absent'}`);
      }
      return value;
    }
  }, {
    bridgeName: BRIDGE_NAME,
    operationName: operation,
    triggerTestId: buttonTestId,
    uiCaseId: focusedCaseId,
  });
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
  if (caseSpec.id === 'REN-006' || caseSpec.id === 'REN-011') {
    assertTextFocusedUi(caseSpec.id, run.ui, runLabel);
  }
  if (caseSpec.id === 'REN-008' || caseSpec.id === 'REN-010') {
    assertComponentAssetFocusedUi(caseSpec.id, run.ui, runLabel);
  }
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

function assertTextFocusedUi(caseId, ui, runLabel) {
  invariant(ui && typeof ui === 'object', `${caseId} ${runLabel} focused text UI evidence`);
  const expectedTrigger = runLabel === 'repeat'
    ? 'click:repeat-action'
    : 'click:load-dataset';
  invariant(ui.trigger === expectedTrigger, `${caseId} ${runLabel} actual UI control`);
  const choices = caseId === 'REN-006'
    ? ['initial', 'empty', 'long', 'missing-font', 'rapid', 'terminal']
    : [
        'placed',
        'auto',
        'wrap',
        'overflow-visible',
        'overflow-hidden',
        'overflow-ellipsis',
        'upright',
      ];
  const actionCount = caseId === 'REN-006' ? 6 : 4;
  const seededChoice = caseId === 'REN-006' ? 'empty' : 'overflow-hidden';
  invariant(
    sameJson(ui.actionStatuses, Array.from({ length: actionCount }, () => 'completed')),
    `${caseId} ${runLabel} completed canonical DOM action rows`,
  );
  invariant(ui.chooser.disabled === false, `${caseId} ${runLabel} actual chooser enabled`);
  invariant(ui.chooser.initialChoice === seededChoice, `${caseId} ${runLabel} seeded initial choice`);
  invariant(ui.chooser.seededChoice === seededChoice, `${caseId} ${runLabel} declared seeded choice`);
  invariant(
    sameJson(ui.chooser.options, choices.map((value) => ({
      value,
      disabled: false,
      observationStatus: 'observed',
    }))),
    `${caseId} ${runLabel} exact observed choice inventory`,
  );
  invariant(
    ui.observedChoiceCount === `${choices.length} / ${choices.length} observed`,
    `${caseId} ${runLabel} actual choice count`,
  );
  invariant(
    ui.displayOnlyNote.includes('folded actualObservation only')
      && ui.displayOnlyNote.includes('canonical action trace'),
    `${caseId} ${runLabel} display-only canonical-trace disclosure`,
  );
  invariant(
    choices.every((choice) => ui.choices[choice] && typeof ui.choices[choice] === 'object'),
    `${caseId} ${runLabel} every actual choice is readable`,
  );

  if (caseId === 'REN-006') assertRen006TextChoices(ui.choices, runLabel);
  else assertRen011TextChoices(ui.choices, runLabel);

  const expectedPerformanceRows = runLabel === 'repeat' ? 2 : 1;
  invariant(
    ui.performance.count === expectedPerformanceRows,
    `${caseId} ${runLabel} per-run performance journal`,
  );
  invariant(
    Number(ui.performance.latest.runIndex) === expectedPerformanceRows,
    `${caseId} ${runLabel} performance run index`,
  );
  invariant(
    ui.performance.latest.runKind === (runLabel === 'repeat' ? 'repeat' : 'run'),
    `${caseId} ${runLabel} performance run kind`,
  );
  for (const [label, value] of [
    ['FPS', ui.performance.latest.framesPerSecond],
    ['frame count', ui.performance.latest.frameCount],
    ['long-task count', ui.performance.latest.longTaskCount],
    ['long-task duration', ui.performance.latest.longTaskTotalMs],
    ['max frame gap', ui.performance.latest.maxFrameGapMs],
    ['run duration', ui.performance.latest.durationMs],
  ]) {
    invariant(Number.isFinite(Number(value)) && Number(value) >= 0, `${caseId} ${runLabel} ${label}`);
  }
}

function assertRen006TextChoices(choices, runLabel) {
  invariant(choices.initial.phase === 'initial', `REN-006 ${runLabel} initial phase`);
  invariant(
    choices.initial.source === JSON.stringify('A\r\n中😀é'),
    `REN-006 ${runLabel} exact initial Unicode source`,
  );
  invariant(choices.initial.lines === '["A","中😀é"]', `REN-006 ${runLabel} initial lines`);
  invariant(choices.initial['layout-bounds'] === '[0,0,40,40]', `REN-006 ${runLabel} initial layout`);
  invariant(choices.empty['visible-text'] === '""', `REN-006 ${runLabel} empty visible text`);
  invariant(choices.empty['layout-bounds'] === '[0,0,0,20]', `REN-006 ${runLabel} empty layout`);
  invariant(choices.long.lines === '["ABCD","EFGH","IJ"]', `REN-006 ${runLabel} long lines`);
  invariant(choices.long['layout-bounds'] === '[0,0,32,60]', `REN-006 ${runLabel} long layout`);
  invariant(
    choices['missing-font']['font-runs'] === '[{"text":"fallback","font":"unifont-base-16.0.04","fallbackReason":"requested-font-unavailable"}]',
    `REN-006 ${runLabel} missing-font fallback run`,
  );
  invariant(
    choices['missing-font']['layout-bounds'] === '[0,0,64,20]',
    `REN-006 ${runLabel} missing-font layout`,
  );
  invariant(choices.rapid['visible-text'] === '"final中"', `REN-006 ${runLabel} rapid final text`);
  invariant(choices.rapid['layout-bounds'] === '[0,0,56,20]', `REN-006 ${runLabel} rapid layout`);
  invariant(
    choices.rapid['intermediate-publication-count'] === '0',
    `REN-006 ${runLabel} no intermediate publication`,
  );
  invariant(choices.rapid['stale-glyph-count'] === '0', `REN-006 ${runLabel} rapid stale glyphs`);
  invariant(
    choices.terminal.source === JSON.stringify('مرحبا world'),
    `REN-006 ${runLabel} terminal source`,
  );
  invariant(choices.terminal.lines === '["مرحبا world"]', `REN-006 ${runLabel} terminal lines`);
  invariant(
    choices.terminal['font-runs'] === '[{"text":"مرحبا world","font":"unifont-base-16.0.04"}]',
    `REN-006 ${runLabel} terminal fallback run`,
  );
  invariant(
    choices.terminal['layout-bounds'] === '{"x":0,"y":0,"width":88,"height":20}',
    `REN-006 ${runLabel} terminal layout`,
  );
  invariant(
    choices.terminal['world-bounds'] === '{"x":4.823619,"y":20,"width":90.177854,"height":42.094592}',
    `REN-006 ${runLabel} terminal world bounds`,
  );
  invariant(
    choices.terminal['hit-bounds'] === choices.terminal['world-bounds'],
    `REN-006 ${runLabel} terminal hit parity`,
  );
  invariant(choices.terminal.publication === 'current', `REN-006 ${runLabel} terminal publication`);
  invariant(choices.terminal['stale-glyph-count'] === '0', `REN-006 ${runLabel} terminal stale glyphs`);
  invariant(choices.terminal['renderer-route'] === 'fallback-text', `REN-006 ${runLabel} text route`);
  invariant(
    choices.terminal.style === '{"fontFamily":"Unifont","fontSize":16,"lineHeight":20,"letterSpacing":0,"fill":"#222222ff"}',
    `REN-006 ${runLabel} terminal style`,
  );
  invariant(
    choices.terminal.geometry === '{"positionWorld":[10,20],"rotationDegrees":15}',
    `REN-006 ${runLabel} terminal transform`,
  );
  invariant(
    ['initial', 'empty', 'long', 'missing-font', 'rapid', 'terminal']
      .every((choice) => choices[choice].publication === 'current'),
    `REN-006 ${runLabel} displayed phases share terminal publication fact`,
  );
}

function assertRen011TextChoices(choices, runLabel) {
  invariant(choices.placed.source === '"AB"', `REN-011 ${runLabel} placed source`);
  invariant(choices.placed.placement === 'right-bottom', `REN-011 ${runLabel} placed placement`);
  invariant(choices.placed.margin === '5', `REN-011 ${runLabel} placed margin`);
  invariant(choices.placed.tint === '#ff0000', `REN-011 ${runLabel} placed authored tint`);
  invariant(choices.placed.rgba === '#ff0000ff', `REN-011 ${runLabel} placed projected tint`);
  invariant(choices.placed['local-bounds'] === '[219,135,16,20]', `REN-011 ${runLabel} placed geometry`);
  invariant(choices.placed['paint-tint'] === '#ff0000ff', `REN-011 ${runLabel} placed paint`);
  invariant(choices.auto.source === '"ABCD"', `REN-011 ${runLabel} auto source`);
  invariant(choices.auto.frame === '[32,20]', `REN-011 ${runLabel} auto frame`);
  invariant(
    choices.auto['auto-font'] === '{"min":8,"max":18,"chosen":16}',
    `REN-011 ${runLabel} auto font`,
  );
  invariant(choices.auto['visible-text'] === '"ABCD"', `REN-011 ${runLabel} auto visible text`);
  invariant(choices.auto['layout-bounds'] === '[0,0,32,20]', `REN-011 ${runLabel} auto layout`);
  invariant(choices.wrap.source === '"ABCDEFGHIJ"', `REN-011 ${runLabel} wrap source`);
  invariant(choices.wrap['wrap-width'] === '32', `REN-011 ${runLabel} wrap width`);
  invariant(choices.wrap.lines === '["ABCD","EFGH","IJ"]', `REN-011 ${runLabel} wrap lines`);
  invariant(choices.wrap['layout-bounds'] === '[0,0,32,60]', `REN-011 ${runLabel} wrap layout`);
  for (const [choice, overflow, visibleText, layoutBounds] of [
    ['overflow-visible', 'visible', 'ABCDEFGHIJ', '[0,0,80,20]'],
    ['overflow-hidden', 'hidden', 'ABCD', '[0,0,32,20]'],
    ['overflow-ellipsis', 'ellipsis', 'ABC…', '[0,0,32,20]'],
  ]) {
    invariant(choices[choice].source === '"ABCDEFGHIJ"', `REN-011 ${runLabel} ${choice} source`);
    invariant(choices[choice].frame === '[32,20]', `REN-011 ${runLabel} ${choice} frame`);
    invariant(choices[choice].overflow === overflow, `REN-011 ${runLabel} ${choice} mode`);
    invariant(
      choices[choice]['visible-text'] === JSON.stringify(visibleText),
      `REN-011 ${runLabel} ${choice} visible text`,
    );
    invariant(
      choices[choice]['layout-bounds'] === layoutBounds,
      `REN-011 ${runLabel} ${choice} layout`,
    );
  }
  invariant(choices.upright.source === '"AB"', `REN-011 ${runLabel} upright source`);
  invariant(choices.upright.placement === 'center', `REN-011 ${runLabel} upright placement`);
  invariant(choices.upright['item-angle'] === '37', `REN-011 ${runLabel} upright item angle`);
  invariant(choices.upright.orientation === 'upright', `REN-011 ${runLabel} upright orientation`);
  invariant(choices.upright['screen-angle'] === '0', `REN-011 ${runLabel} upright screen angle`);
  invariant(choices.upright['layout-bounds'] === '[0,0,16,20]', `REN-011 ${runLabel} upright layout`);
  invariant(
    Object.values(choices).every((facts) => facts.publication === 'current'),
    `REN-011 ${runLabel} current publication`,
  );
  invariant(
    Object.values(choices).every((facts) => facts['all-rows-exact'] === 'true'),
    `REN-011 ${runLabel} semantically exact matrix`,
  );
}

function assertComponentAssetFocusedUi(caseId, ui, runLabel) {
  invariant(ui && typeof ui === 'object', `${caseId} ${runLabel} focused UI evidence`);
  const expectedTrigger = runLabel === 'repeat'
    ? 'click:repeat-action'
    : 'click:load-dataset';
  invariant(ui.trigger === expectedTrigger, `${caseId} ${runLabel} actual UI control`);
  const phases = caseId === 'REN-008'
    ? ['initial', 'image', 'hidden', 'shown']
    : ['initial', 'replacement', 'tint'];
  invariant(
    sameJson(ui.actionStatuses, phases.map(() => 'completed')),
    `${caseId} ${runLabel} completed DOM action rows`,
  );
  invariant(ui.chooser.disabled === false, `${caseId} ${runLabel} observed phase chooser enabled`);
  invariant(
    sameJson(ui.chooser.options, phases.map((value) => ({
      value,
      disabled: false,
      observationStatus: 'observed',
    }))),
    `${caseId} ${runLabel} exact observed phase inventory`,
  );
  invariant(
    ui.observedPhaseCount === `${phases.length} / ${phases.length} observed`,
    `${caseId} ${runLabel} phase observation count`,
  );

  const phaseFacts = phases.map((phase) => ui.phases[phase]);
  invariant(
    phaseFacts.every((facts) => facts && typeof facts === 'object'),
    `${caseId} ${runLabel} phase facts exist`,
  );
  if (caseId === 'REN-008') {
    for (const facts of phaseFacts) {
      invariant(facts['owner-id'] === 'item', `REN-008 ${runLabel} stable owner identity`);
      invariant(facts['component-id'] === 'bg', `REN-008 ${runLabel} stable component identity`);
      invariant(
        facts['entity-id'] === 'item::background:bg',
        `REN-008 ${runLabel} stable dense entity identity`,
      );
      invariant(
        facts['authored-size'] === '{"width":20,"height":10}',
        `REN-008 ${runLabel} inert authored size`,
      );
      invariant(
        facts['full-bounds'] === '[0,0,100,80]',
        `REN-008 ${runLabel} full item bounds`,
      );
    }
    invariant(ui.phases.initial.phase === 'A0 Rect', `REN-008 ${runLabel} initial phase label`);
    invariant(ui.phases.initial['render-role'] === 'background-geometry', `REN-008 ${runLabel} rect phase`);
    invariant(
      ui.phases.initial['render-object-count'] === '0',
      `REN-008 ${runLabel} aggregate rect has no per-component render object`,
    );
    invariant(ui.phases.initial['stale-count'] === 'not applicable', `REN-008 ${runLabel} rect has no texture`);
    invariant(ui.phases.image.phase === 'A1 Image', `REN-008 ${runLabel} image phase label`);
    invariant(ui.phases.image.source === 'fixture-image', `REN-008 ${runLabel} image source`);
    invariant(ui.phases.image['resource-state'] === 'resolved', `REN-008 ${runLabel} image resolved`);
    invariant(ui.phases.image['render-role'] === 'background-asset', `REN-008 ${runLabel} image lane`);
    invariant(ui.phases.image['binding-key'] === 'alias:fixture-image', `REN-008 ${runLabel} image binding`);
    invariant(ui.phases.image.generation === '1', `REN-008 ${runLabel} image generation`);
    invariant(ui.phases.image['render-object-count'] === '1', `REN-008 ${runLabel} image object`);
    invariant(ui.phases.image['stale-count'] === '0', `REN-008 ${runLabel} image zero stale attachment`);
    invariant(ui.phases.hidden.phase === 'A2 Hidden', `REN-008 ${runLabel} hidden phase label`);
    invariant(ui.phases.hidden['visible-bounds'] === 'null', `REN-008 ${runLabel} hidden bounds`);
    invariant(ui.phases.hidden['render-object-count'] === '0', `REN-008 ${runLabel} hidden renderer object`);
    invariant(ui.phases.hidden.generation === '2', `REN-008 ${runLabel} hidden generation`);
    invariant(ui.phases.hidden['stale-count'] === '0', `REN-008 ${runLabel} hidden zero stale attachment`);
    invariant(ui.phases.shown.phase === 'A3 Shown', `REN-008 ${runLabel} shown phase label`);
    invariant(ui.phases.shown.source === 'fixture-image', `REN-008 ${runLabel} shown source`);
    invariant(ui.phases.shown['visible-bounds'] === '[0,0,100,80]', `REN-008 ${runLabel} shown bounds`);
    invariant(ui.phases.shown['render-object-count'] === '1', `REN-008 ${runLabel} shown renderer object`);
    invariant(ui.phases.shown.generation === '3', `REN-008 ${runLabel} shown generation`);
    invariant(ui.phases.shown['stale-count'] === '0', `REN-008 ${runLabel} shown zero stale attachment`);
    invariant(
      phaseFacts.every((facts) => facts['logical-identity'] === phaseFacts[0]['logical-identity']),
      `REN-008 ${runLabel} stable logical identity`,
    );
    invariant(ui.captureId === 'bg', `REN-008 ${runLabel} declared capture identity`);
  } else {
    for (const facts of phaseFacts) {
      invariant(facts['owner-id'] === 'item-a', `REN-010 ${runLabel} stable owner identity`);
      invariant(facts['component-id'] === 'icon', `REN-010 ${runLabel} stable component identity`);
      invariant(
        facts['entity-id'] === 'item-a::icon:icon',
        `REN-010 ${runLabel} stable dense entity identity`,
      );
      invariant(facts['content-box'] === '[10,10,80,60]', `REN-010 ${runLabel} content box`);
      invariant(facts['icon-bounds'] === '[47,12,40,15]', `REN-010 ${runLabel} icon bounds`);
      invariant(
        facts['authored-size'] === '{"width":"50%","height":"25%"}',
        `REN-010 ${runLabel} authored percentage size`,
      );
      invariant(facts.placement === 'right-top', `REN-010 ${runLabel} placement`);
      invariant(
        facts.margins === '{"top":2,"right":3,"bottom":0,"left":0}',
        `REN-010 ${runLabel} margins`,
      );
      invariant(facts['render-role'] === 'content-asset', `REN-010 ${runLabel} content asset lane`);
      invariant(facts['render-object-count'] === '1', `REN-010 ${runLabel} one icon object`);
      invariant(facts['stale-count'] === '0', `REN-010 ${runLabel} zero stale attachment`);
    }
    invariant(ui.phases.initial.source === 'fixture-icon', `REN-010 ${runLabel} initial source`);
    invariant(ui.phases.initial['binding-key'] === 'alias:fixture-icon', `REN-010 ${runLabel} initial binding`);
    invariant(ui.phases.initial.generation === '1', `REN-010 ${runLabel} initial generation`);
    invariant(ui.phases.initial.phase === 'A0 Initial alias', `REN-010 ${runLabel} initial phase label`);
    invariant(ui.phases.replacement.source === 'fixture-icon-2', `REN-010 ${runLabel} replacement source`);
    invariant(ui.phases.replacement['binding-key'] === 'alias:fixture-icon-2', `REN-010 ${runLabel} replacement binding`);
    invariant(ui.phases.replacement.generation === '2', `REN-010 ${runLabel} replacement generation`);
    invariant(ui.phases.replacement.phase === 'A1 Replacement alias', `REN-010 ${runLabel} replacement phase label`);
    invariant(ui.phases.tint.source === 'fixture-icon-2', `REN-010 ${runLabel} tint retains source`);
    invariant(ui.phases.tint.generation === '2', `REN-010 ${runLabel} tint retains generation`);
    invariant(ui.phases.tint.phase === 'A2 Tint patch', `REN-010 ${runLabel} tint phase label`);
    invariant(ui.phases.tint['semantic-tint'] === '#00ff00ff', `REN-010 ${runLabel} semantic tint`);
    invariant(
      ui.phases.tint['renderer-tint'] === 'packed 0x00ff00ff · rgb 0x00ff00 · alpha 1.000',
      `REN-010 ${runLabel} renderer tint`,
    );
    invariant(
      phaseFacts.every((facts) => facts['logical-identity'] === phaseFacts[0]['logical-identity']),
      `REN-010 ${runLabel} stable logical identity`,
    );
  }

  invariant(ui.resources['canvas-count'] === '1', `${caseId} ${runLabel} live action canvas`);
  invariant(ui.resources['subscription-count'] === '6', `${caseId} ${runLabel} central subscriptions`);
  invariant(ui.resources['pending-work-count'] === '0', `${caseId} ${runLabel} no pending work`);
  invariant(ui.resources['binding-count'] === '1', `${caseId} ${runLabel} one current binding`);
  invariant(ui.resources['resource-count'] === '1', `${caseId} ${runLabel} one current resource`);
  invariant(ui.resources['lease-count'] === '1', `${caseId} ${runLabel} one current lease`);
  invariant(ui.resources['pending-settlement-count'] === '0', `${caseId} ${runLabel} no pending settlement`);
  invariant(ui.resources['pending-release-count'] === '0', `${caseId} ${runLabel} no pending release`);
  invariant(ui.resources['stale-attachment-resource-count'] === '0', `${caseId} ${runLabel} no stale resource`);
  invariant(ui.resources['renderer-object-resource-count'] === '1', `${caseId} ${runLabel} one renderer object`);
  invariant(ui.resources['cleanup-failure-count'] === '0', `${caseId} ${runLabel} no cleanup failure`);
  invariant(ui.resourceJournal.count > 0, `${caseId} ${runLabel} resource journal`);
  const expectedResourceEvents = caseId === 'REN-008'
    ? [
        'fixture-assets-registered',
        'component-asset-settled',
        'backend-texture-resolved',
        'component-asset-settled',
        'backend-texture-release-start',
        'backend-texture-released',
        'backend-texture-resolved',
        'component-asset-settled',
      ]
    : [
        'fixture-assets-registered',
        'backend-texture-resolved',
        'component-asset-settled',
        'backend-texture-resolved',
        'component-asset-settled',
        'backend-texture-release-start',
        'backend-texture-released',
      ];
  invariant(
    sameJson(ui.resourceJournal.events, expectedResourceEvents),
    `${caseId} ${runLabel} deterministic resource journal`,
  );
  invariant(
    ui.resourceJournal.events.includes('backend-texture-resolved'),
    `${caseId} ${runLabel} resolved texture journal`,
  );
  const expectedPerformanceRows = runLabel === 'repeat' ? 2 : 1;
  invariant(
    ui.performance.count === expectedPerformanceRows,
    `${caseId} ${runLabel} per-run performance journal`,
  );
  invariant(
    Number(ui.performance.latest.runIndex) === expectedPerformanceRows,
    `${caseId} ${runLabel} performance run index`,
  );
  invariant(
    ui.performance.latest.runKind === (runLabel === 'repeat' ? 'repeat' : 'run'),
    `${caseId} ${runLabel} performance run kind`,
  );
  for (const [label, value] of [
    ['FPS', ui.performance.latest.framesPerSecond],
    ['frame count', ui.performance.latest.frameCount],
    ['long-task count', ui.performance.latest.longTaskCount],
    ['long-task duration', ui.performance.latest.longTaskTotalMs],
    ['max frame gap', ui.performance.latest.maxFrameGapMs],
    ['run duration', ui.performance.latest.durationMs],
  ]) {
    invariant(Number.isFinite(Number(value)) && Number(value) >= 0, `${caseId} ${runLabel} ${label}`);
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
    'render checkpoint assertion inventory must remain 199',
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
