#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import { createServer } from 'vite';

import { maskVolatile } from './core-v2-contract/evidence.mjs';
import {
  assertCaseRun,
  assertDestroyControl,
  cleanupStatus,
  compareCaseRun,
  firstJsonDifference,
  invariant,
  sameJson,
  summarizeComparison,
} from './core-v2-contract-render-browser/assertions.mjs';
import {
  CASE_TIMEOUT_MS,
  CHECKPOINT_TIMEOUT_MS,
  CONTROL_CASES,
  DECLARED_IMMUTABLE_CONFLICT_TOTAL,
  DOM_CONTROL_CASES,
  EXPECTED_ASSERTION_FAILURE_TOTAL,
  EXPECTED_ASSERTION_PASS_TOTAL,
  EXPECTED_ASSERTION_TOTAL,
  EXPECTED_PERFORMANCE_DEFICIT_TOTAL,
  GPU_EVIDENCE_CASES,
  PERFORMANCE_CASE_TIMEOUT_MS,
  PERFORMANCE_TRANCHE_CASES,
  RENDER_CASES,
} from './core-v2-contract-render-browser/catalog.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const EXPECTED_PATH = fileURLToPath(new URL(
  '../../docs/reference/core-v2-functional-contract/evidence/catalog-normalized-expected.v1.json',
  import.meta.url,
));
const VITE_CONFIG_PATH = path.join(ROOT, 'vite.patch-map-lab.config.ts');
const BRIDGE_NAME = '__PATCH_MAP_CONTRACT_LAB__';
const GPU_PROBE_NAME = '__PATCH_MAP_WEBGL_PROBE__';
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
  $schema: 'core-v2-contract-render-browser-checkpoint/1',
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
    process.stderr.write(`[core-v2-render-browser] ${caseSpec.id} start\n`);
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
    process.stderr.write(`[core-v2-render-browser] ${caseSpec.id} complete\n`);
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
      ? 'all one-hundred-fifty-eight render routes completed'
      : `${options.caseId} targeted render route completed`,
  );
  invariant(
    passed === selectedAssertionTotal - selectedObservedFailureTotal
      && failed === selectedObservedFailureTotal,
    options.caseId === null
      ? 'canonical comparison must be exactly 1988 pass, 26 immutable conflicts, and 14 performance deficits'
      : `${options.caseId} targeted canonical comparison`,
  );
  invariant(
    repeatPassed === selectedAssertionTotal - selectedObservedFailureTotal
      && repeatFailed === selectedObservedFailureTotal,
    options.caseId === null
      ? 'repeat comparison must be exactly 1988 pass, 26 immutable conflicts, and 14 performance deficits'
      : `${options.caseId} targeted repeat comparison`,
  );
  invariant(
    freshPassed === selectedAssertionTotal - selectedObservedFailureTotal
      && freshFailed === selectedObservedFailureTotal,
    options.caseId === null
      ? 'fresh comparison must be exactly 1988 pass, 26 immutable conflicts, and 14 performance deficits'
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
    message: `Core v2 render browser checkpoint stopped: ${reason}`,
    stack: null,
    focusedUi: lastFocusedUi,
  };
  process.exitCode = reason === 'SIGINT' ? 130 : reason === 'SIGTERM' ? 143 : 1;
  process.stderr.write(`[core-v2-render-browser] stopping: ${reason}\n`);
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

async function installWebGlCanvasProbe(page, caseId) {
  if (!GPU_EVIDENCE_CASES.has(caseId)) return;
  await page.addInitScript(({ probeName, caseIdentity }) => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    const contextMetadata = new WeakMap();
    const instrumentedContexts = new WeakSet();
    const state = {
      session: 0,
      caseId: caseIdentity,
      operation: null,
      contexts: [],
      frames: [],
      currentFrames: new Map(),
      errors: [],
    };

    const probe = Object.freeze({
      revision: 'core-v2-webgl-browser-probe/1',
      begin(input) {
        if (!input || input.caseId !== caseIdentity || typeof input.operation !== 'string') {
          throw new Error('Invalid Core v2 WebGL probe run identity');
        }
        state.session += 1;
        state.operation = input.operation;
        state.contexts = [];
        state.frames = [];
        state.currentFrames = new Map();
        state.errors = [];
      },
      snapshot() {
        return JSON.parse(JSON.stringify({
          revision: 'core-v2-webgl-browser-probe/1',
          caseId: state.caseId,
          operation: state.operation,
          contexts: state.contexts,
          frames: state.frames,
          errors: state.errors,
        }));
      },
    });

    Object.defineProperty(window, probeName, {
      configurable: false,
      enumerable: false,
      writable: false,
      value: probe,
    });

    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      writable: true,
      value(type, ...options) {
        const context = Reflect.apply(originalGetContext, this, [type, ...options]);
        if (
          context
          && (type === 'webgl2' || type === 'webgl' || type === 'experimental-webgl')
        ) {
          let metadata = contextMetadata.get(context);
          if (!metadata) {
            metadata = {
              canvas: this,
              requestedContext: type,
              actualContext: typeof WebGL2RenderingContext !== 'undefined'
                && context instanceof WebGL2RenderingContext
                ? 'webgl2'
                : 'webgl',
              session: -1,
              contextIndex: -1,
              frameIndex: 0,
            };
            contextMetadata.set(context, metadata);
          }
          instrumentContext(context, metadata);
        }
        return context;
      },
    });

    function instrumentContext(context, metadata) {
      if (instrumentedContexts.has(context)) return;
      instrumentedContexts.add(context);
      wrapContextMethod(context, metadata, 'clear', (args) => {
        const mask = args[0];
        if (
          typeof mask === 'number'
          && (mask & context.COLOR_BUFFER_BIT) !== 0
          && isDefaultFramebuffer(context)
        ) {
          startFrame(context, metadata, 'clear');
        }
      });
      for (const method of [
        'drawArrays',
        'drawElements',
        'drawArraysInstanced',
        'drawElementsInstanced',
        'drawRangeElements',
      ]) {
        wrapContextMethod(context, metadata, method, () => {
          if (isDefaultFramebuffer(context)) recordDraw(context, metadata, method);
        });
      }
    }

    function wrapContextMethod(context, metadata, method, after) {
      const original = context[method];
      if (typeof original !== 'function') return;
      try {
        Object.defineProperty(context, method, {
          configurable: true,
          writable: true,
          value(...args) {
            const result = Reflect.apply(original, this, args);
            try {
              after(args);
            } catch (error) {
              recordProbeError(metadata, method, error);
            }
            return result;
          },
        });
      } catch (error) {
        recordProbeError(metadata, `instrument:${method}`, error);
      }
    }

    function ensureSessionContext(metadata) {
      if (metadata.session === state.session) return metadata.contextIndex;
      metadata.session = state.session;
      metadata.contextIndex = state.contexts.length;
      metadata.frameIndex = 0;
      state.contexts.push({
        index: metadata.contextIndex,
        requestedContext: metadata.requestedContext,
        actualContext: metadata.actualContext,
        width: metadata.canvas.width,
        height: metadata.canvas.height,
        trackedCanvas: metadata.canvas.dataset.patchMapProduct === 'patch-map',
      });
      return metadata.contextIndex;
    }

    function startFrame(context, metadata, source) {
      if (state.operation === null) return;
      const contextIndex = ensureSessionContext(metadata);
      const frame = {
        contextIndex,
        frameIndex: metadata.frameIndex,
        source,
        width: metadata.canvas.width,
        height: metadata.canvas.height,
        trackedCanvas: metadata.canvas.dataset.patchMapProduct === 'patch-map',
        draws: [],
      };
      metadata.frameIndex += 1;
      state.frames.push(frame);
      state.currentFrames.set(contextIndex, frame);
    }

    function recordDraw(context, metadata, method) {
      if (state.operation === null) return;
      const contextIndex = ensureSessionContext(metadata);
      let frame = state.currentFrames.get(contextIndex);
      if (!frame) {
        startFrame(context, metadata, 'implicit-draw');
        frame = state.currentFrames.get(contextIndex);
      }
      if (!frame || frame.draws.length >= 96) return;
      frame.draws.push({
        index: frame.draws.length,
        method,
        centerRgba: readPixelAtCssPoint(context, metadata.canvas, 10, 10),
        barColumn: readBarColumn(context, metadata.canvas),
      });
    }

    function readPixelAtCssPoint(context, canvas, cssX, cssY) {
      const x = Math.max(0, Math.min(canvas.width - 1, Math.floor(cssX * canvas.width / 800)));
      const topY = Math.max(0, Math.min(canvas.height - 1, Math.floor(cssY * canvas.height / 600)));
      const y = canvas.height - topY - 1;
      const pixel = new Uint8Array(4);
      context.readPixels(x, y, 1, 1, context.RGBA, context.UNSIGNED_BYTE, pixel);
      return rgbaHex(pixel);
    }

    function readBarColumn(context, canvas) {
      const candidateCssXs = [32, 40, 48, 56, 64, 72, 80, 88];
      let bestColumn = null;
      for (const cssX of candidateCssXs) {
        const column = readBarColumnAtCssX(context, canvas, cssX);
        if (column !== null && (bestColumn === null || column.height > bestColumn.height)) {
          bestColumn = column;
        }
      }
      return bestColumn;
    }

    function readBarColumnAtCssX(context, canvas, cssX) {
      const x = Math.max(0, Math.min(canvas.width - 1, Math.floor(cssX * canvas.width / 800)));
      const pixels = new Uint8Array(canvas.height * 4);
      context.readPixels(x, 0, 1, canvas.height, context.RGBA, context.UNSIGNED_BYTE, pixels);
      let bestStart = -1;
      let bestEnd = -1;
      let runStart = -1;
      for (let y = 0; y < canvas.height; y += 1) {
        const offset = y * 4;
        const matches = Math.abs(pixels[offset] - 0) <= 4
          && Math.abs(pixels[offset + 1] - 170) <= 4
          && Math.abs(pixels[offset + 2] - 102) <= 4
          && pixels[offset + 3] >= 250;
        if (matches && runStart < 0) runStart = y;
        if ((!matches || y === canvas.height - 1) && runStart >= 0) {
          const runEnd = matches && y === canvas.height - 1 ? y : y - 1;
          if (bestStart < 0 || runEnd - runStart > bestEnd - bestStart) {
            bestStart = runStart;
            bestEnd = runEnd;
          }
          runStart = -1;
        }
      }
      if (bestStart < 0) return null;
      return {
        sampleX: x,
        top: canvas.height - bestEnd - 1,
        bottomExclusive: canvas.height - bestStart,
        height: bestEnd - bestStart + 1,
        rgba: '#00aa66ff',
      };
    }

    function rgbaHex(pixel) {
      return `#${[...pixel].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
    }

    function isDefaultFramebuffer(context) {
      return context.getParameter(context.FRAMEBUFFER_BINDING) === null;
    }

    function recordProbeError(metadata, operation, error) {
      if (state.operation === null) return;
      state.errors.push({
        contextIndex: metadata.contextIndex,
        operation,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, { probeName: GPU_PROBE_NAME, caseIdentity: caseId });
}

async function executeCase({ browser: activeBrowser, baseUrl, caseSpec, expectedCase, errors: capturedErrors }) {
  const context = await activeBrowser.newContext({
    viewport: { width: 1_280, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  attachErrorCapture(page, caseSpec.id, capturedErrors);
  await installWebGlCanvasProbe(page, caseSpec.id);
  const route = `/lab/patch-map/?scenario=${caseSpec.id}&size=${DATASET_SIZE}&seed=${SEED}`;
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
      rootInput = await verifyViewportRootInput(page);
    } else if (
      caseSpec.id === 'EVT-003' ||
      caseSpec.id === 'EVT-008' ||
      caseSpec.id === 'ACC-002'
    ) {
      rootInput = await verifyPointerRootInput(page, caseSpec.id);
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
  await installWebGlCanvasProbe(page, caseSpec.id);

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

async function verifyViewportRootInput(page) {
  const wheelProbeName = '__PATCH_MAP_NATIVE_WHEEL_PROBE__';
  let armed = false;
  let cleanup = null;
  try {
    const gesturePlan = await page.evaluate(async (bridgeName) => {
      const bridge = window[bridgeName];
      if (!bridge) throw new Error('VIE-001 focused Lab bridge is unavailable');
      return bridge.armGesture(0);
    }, BRIDGE_NAME);
    armed = true;

    const canvas = page.locator(gesturePlan.ownerQualifiedTarget);
    await canvas.waitFor({ state: 'visible', timeout: 30_000 });
    await canvas.scrollIntoViewIfNeeded();
    await canvas.evaluate((element, name) => {
      const state = { count: 0, lastDeltaY: null };
      const listener = (event) => {
        state.count += 1;
        state.lastDeltaY = event.deltaY;
      };
      element.addEventListener('wheel', listener, { capture: true });
      window[name] = { element, listener, state };
    }, wheelProbeName);
    const bounds = await canvas.boundingBox();
    invariant(bounds !== null, 'VIE-001 trusted input canvas bounds');
    const center = {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2,
    };

    await page.mouse.move(center.x, center.y);
    await page.mouse.down({ button: 'left' });
    await page.mouse.move(center.x + 40, center.y - 20, { steps: 1 });
    await page.mouse.up({ button: 'left' });
    await page.waitForFunction(
      async (bridgeName) => {
        const observation = await window[bridgeName]?.actualObservation();
        return Array.isArray(observation?.events) && observation.events.length >= 1;
      },
      BRIDGE_NAME,
      { timeout: 10_000 },
    );

    const beforeWheel = await page.evaluate(async (bridgeName) => {
      const observation = await window[bridgeName].actualObservation();
      return observation.anchorWorld;
    }, BRIDGE_NAME);
    await page.mouse.move(center.x, center.y);
    await page.mouse.wheel(0, -240);
    await page.waitForFunction(
      async (bridgeName) => {
        const observation = await window[bridgeName]?.actualObservation();
        return Array.isArray(observation?.events) && observation.events.length >= 2;
      },
      BRIDGE_NAME,
      { timeout: 10_000 },
    );

    const observed = await page.evaluate(async (bridgeName) => {
      const bridge = window[bridgeName];
      await bridge.awaitMilestone(0, 'settled');
      const observation = await bridge.actualObservation();
      const nativeWheel = window.__PATCH_MAP_NATIVE_WHEEL_PROBE__?.state ?? null;
      return {
        events: observation.events,
        viewport: observation.viewport,
        revisions: observation.revisions,
        ownership: observation.ownership,
        anchorWorld: observation.anchorWorld,
        transformedHit: observation.transformedHit,
        resources: observation.resources,
        nativeWheel,
      };
    }, BRIDGE_NAME);

    invariant(
      observed.events.length === 2 &&
        observed.events[0]?.source === 'pointer' &&
        observed.events[1]?.source === 'wheel',
      `VIE-001 trusted pointer and wheel publish exactly one view event each: ${
        JSON.stringify(observed.events)
      }`,
    );
    invariant(
      observed.viewport.scale > 1 && observed.viewport.scale <= 4,
      'VIE-001 trusted wheel respects configured scale limits',
    );
    const cursorScreenError = Math.hypot(
      beforeWheel.x - observed.anchorWorld.x,
      beforeWheel.y - observed.anchorWorld.y,
    ) * observed.viewport.scale;
    invariant(
      Number.isFinite(cursorScreenError) && cursorScreenError < 1,
      `VIE-001 trusted wheel preserves the cursor world point (${
        JSON.stringify({
          before: beforeWheel,
          after: observed.anchorWorld,
          viewport: observed.viewport,
          cursorScreenError,
        })
      })`,
    );
    invariant(
      observed.transformedHit.target === 'rect-b',
      'VIE-001 trusted transformed hit resolves the current target',
    );
    invariant(
      observed.ownership?.rootBindingCount === 6 &&
        observed.ownership?.entityCallbackCount === 0,
      'VIE-001 trusted input retains root-only interaction ownership',
    );
    invariant(
      observed.revisions.viewRevision >= 2,
      'VIE-001 trusted input advances the Engine view authority',
    );
    invariant(
      observed.resources?.canvasCount === 1 &&
        observed.resources?.pendingWork === 0,
      'VIE-001 trusted input keeps one settled live canvas',
    );
    invariant(
      observed.nativeWheel?.count === 1 && observed.nativeWheel?.lastDeltaY === -240,
      `VIE-001 trusted browser emitted one native wheel event: ${
        JSON.stringify(observed.nativeWheel)
      }`,
    );
    return {
      status: 'passed',
      driverId: gesturePlan.driverId,
      eventSources: observed.events.map(({ source }) => source),
      viewport: observed.viewport,
      revisions: observed.revisions,
      ownership: observed.ownership,
      wheelAnchor: {
        before: beforeWheel,
        after: observed.anchorWorld,
        screenError: cursorScreenError,
      },
      transformedHit: observed.transformedHit,
    };
  } finally {
    cleanup = await page.evaluate(async ({ bridgeName, shouldRelease }) => {
      const nativeWheelProbe = window.__PATCH_MAP_NATIVE_WHEEL_PROBE__;
      if (nativeWheelProbe) {
        nativeWheelProbe.element.removeEventListener('wheel', nativeWheelProbe.listener, {
          capture: true,
        });
        delete window.__PATCH_MAP_NATIVE_WHEEL_PROBE__;
      }
      const bridge = window[bridgeName];
      if (bridge && shouldRelease) await bridge.awaitMilestone(0, 'released');
      const host = document.querySelector('[data-contract-surface]');
      return {
        canvasCount:
          host?.querySelectorAll('canvas[data-patch-map-product="patch-map"]').length ?? 0,
        released: shouldRelease,
      };
    }, { bridgeName: BRIDGE_NAME, shouldRelease: armed }).catch(() => null);
    invariant(
      cleanup?.canvasCount === 0 && cleanup?.released === armed,
      'VIE-001 trusted input probe releases its Engine and canvas',
    );
  }
}

async function verifyPointerRootInput(page, caseId) {
  invariant(
    caseId === 'EVT-003' || caseId === 'EVT-008' || caseId === 'ACC-002',
    `unsupported trusted pointer case ${caseId}`,
  );
  const contextMenuProbeName = '__PATCH_MAP_NATIVE_CONTEXT_MENU_PROBE__';
  let armed = false;
  let cleanup = null;
  try {
    const gesturePlan = await page.evaluate(async (bridgeName) => {
      const bridge = window[bridgeName];
      if (!bridge) throw new Error('Core v2 pointer focused Lab bridge is unavailable');
      return bridge.armGesture(0);
    }, BRIDGE_NAME);
    armed = true;

    const canvas = page.locator(gesturePlan.ownerQualifiedTarget);
    await canvas.waitFor({ state: 'visible', timeout: 30_000 });
    await canvas.scrollIntoViewIfNeeded();
    const bounds = await canvas.boundingBox();
    invariant(bounds !== null, `${caseId} trusted input canvas bounds`);
    const pagePoint = (anchor) => ({
      x: bounds.x + anchor.x * bounds.width / 800,
      y: bounds.y + anchor.y * bounds.height / 600,
    });

    if (caseId === 'ACC-002') {
      const owned = pagePoint(gesturePlan.cssLocalAnchors[0]);
      await page.mouse.click(owned.x, owned.y);
      await page.waitForFunction(
        async (bridgeName) => {
          const observation = await window[bridgeName]?.actualObservation();
          return Array.isArray(observation?.snapshot?.selectionIds) &&
            observation.snapshot.selectionIds.length === 1 &&
            observation.snapshot.selectionIds[0] === 'rect-b' &&
            observation.accessibility?.focusedId === 'rect-b' &&
            observation.accessibility?.targets?.['rect-b']
              ?.performedActions?.includes('activate');
        },
        BRIDGE_NAME,
        { timeout: 10_000 },
      );
    } else if (caseId === 'EVT-003') {
      const hovered = pagePoint(gesturePlan.cssLocalAnchors[0]);
      const viewport = page.viewportSize();
      const right = bounds.x + bounds.width + 8;
      const left = bounds.x - 8;
      const outside = {
        x: viewport !== null && right < viewport.width ? right : left,
        y: bounds.y + Math.min(bounds.height / 2, 100),
      };
      await page.mouse.move(hovered.x, hovered.y);
      await page.mouse.move(outside.x, outside.y);
      await page.waitForFunction(
        async (bridgeName) => {
          const observation = await window[bridgeName]?.actualObservation();
          if (!Array.isArray(observation?.events)) return false;
          const hoverEvents = observation.events.filter((event) => event?.type === 'hover-change');
          return hoverEvents.some((event) => event.payload?.target?.id === 'item-a') &&
            hoverEvents.some((event) => event.payload?.target === null);
        },
        BRIDGE_NAME,
        { timeout: 10_000 },
      );
    } else {
      await page.evaluate((probeName) => {
        const state = [];
        const listener = (event) => {
          state.push({
            clientX: event.clientX,
            clientY: event.clientY,
            defaultPrevented: event.defaultPrevented,
          });
        };
        document.addEventListener('contextmenu', listener);
        window[probeName] = { listener, state };
      }, contextMenuProbeName);
      const owned = pagePoint(gesturePlan.cssLocalAnchors[0]);
      const empty = pagePoint(gesturePlan.cssLocalAnchors[1]);
      await page.mouse.click(owned.x, owned.y, { button: 'right' });
      await page.mouse.click(empty.x, empty.y, { button: 'right' });
      await page.waitForFunction(
        async ({ bridgeName, probeName }) => {
          const observation = await window[bridgeName]?.actualObservation();
          const clicks = Array.isArray(observation?.events)
            ? observation.events.filter((event) =>
                event?.type === 'click' && event.payload?.button === 2)
            : [];
          return clicks.length === 2 && window[probeName]?.state?.length === 2;
        },
        { bridgeName: BRIDGE_NAME, probeName: contextMenuProbeName },
        { timeout: 10_000 },
      );
    }

    const observed = await page.evaluate(async ({ bridgeName, probeName }) => {
      const observation = await window[bridgeName].actualObservation();
      return {
        events: observation.events,
        pointerGesture: observation.pointerGesture,
        ownership: observation.ownership,
        accessibility: observation.accessibility,
        snapshot: observation.snapshot,
        resources: observation.resources,
        nativeContextMenu: window[probeName]?.state ?? null,
      };
    }, { bridgeName: BRIDGE_NAME, probeName: contextMenuProbeName });

    invariant(
      observed.ownership?.rootBindingCount === 6 &&
        observed.ownership?.rootListenerCount === 8 &&
        observed.ownership?.entityCallbackCount === 0,
      `${caseId} trusted input retains eight root-only listeners`,
    );
    invariant(
      observed.pointerGesture?.activePointerCount === 0 &&
        observed.pointerGesture?.pointerCaptureCount === 0 &&
        observed.pointerGesture?.activeGestureCount === 0,
      `${caseId} trusted input releases pointer and gesture ownership`,
    );
    invariant(
      observed.resources?.canvasCount === 1 &&
        observed.resources?.pendingWork === 0,
      `${caseId} trusted input keeps one settled live canvas`,
    );

    if (caseId === 'ACC-002') {
      invariant(
        sameJson(observed.snapshot?.selectionIds, ['rect-b']),
        `ACC-002 trusted accessibility click selection: ${
          JSON.stringify(observed.snapshot?.selectionIds)
        }`,
      );
      invariant(
        observed.accessibility?.focusedId === 'rect-b' &&
          observed.accessibility?.surface?.focusedId === 'rect-b' &&
          observed.accessibility?.surface?.shadowDomNodeCount === 3 &&
          observed.accessibility?.surface?.rootListenerCount === 1 &&
          observed.accessibility?.surface?.entityListenerCount === 0,
        `ACC-002 trusted accessibility bridge: ${
          JSON.stringify(observed.accessibility)
        }`,
      );
      invariant(
        observed.accessibility?.targets?.['rect-b']?.performedActions?.includes('activate') &&
          observed.accessibility.targets['rect-b'].performedActions.includes('select'),
        'ACC-002 trusted accessibility click emits one semantic activation',
      );
      return {
        status: 'passed',
        driverId: gesturePlan.driverId,
        selectedTargets: observed.snapshot.selectionIds,
        focusedId: observed.accessibility.focusedId,
        shadowDomFocusedId:
          observed.accessibility.surface.shadowDomFocusedId,
        shadowDomNodeCount:
          observed.accessibility.surface.shadowDomNodeCount,
        pointerGesture: observed.pointerGesture,
        ownership: observed.ownership,
      };
    }

    if (caseId === 'EVT-003') {
      const hoverTargets = observed.events
        .filter((event) => event?.type === 'hover-change')
        .map((event) => event.payload?.target?.id ?? null);
      invariant(
        hoverTargets.includes('item-a') && hoverTargets.at(-1) === null,
        `EVT-003 trusted hover enter/leave trace: ${JSON.stringify(hoverTargets)}`,
      );
      invariant(
        observed.pointerGesture?.hoverTarget === null,
        'EVT-003 trusted pointerleave clears hover state',
      );
      return {
        status: 'passed',
        driverId: gesturePlan.driverId,
        hoverTargets,
        pointerGesture: observed.pointerGesture,
        ownership: observed.ownership,
      };
    }

    const secondaryClicks = observed.events.filter((event) =>
      event?.type === 'click' && event.payload?.button === 2);
    const secondaryTargets = secondaryClicks.map((event) => event.payload?.target?.id ?? null);
    invariant(
      secondaryTargets.length === 2 &&
        secondaryTargets[0] === 'rect-b' &&
        secondaryTargets[1] === null,
      `EVT-008 trusted secondary click targets: ${JSON.stringify(secondaryTargets)}`,
    );
    invariant(
      secondaryClicks.every((event) => event.payload?.clickCount === 1),
      'EVT-008 trusted secondary clicks each count one physical completion',
    );
    invariant(
      observed.nativeContextMenu?.length === 2 &&
        observed.nativeContextMenu[0]?.defaultPrevented === true &&
        observed.nativeContextMenu[1]?.defaultPrevented === false,
      `EVT-008 contextmenu ownership: ${JSON.stringify(observed.nativeContextMenu)}`,
    );
    return {
      status: 'passed',
      driverId: gesturePlan.driverId,
      secondaryTargets,
      contextMenuDefaultPrevented: observed.nativeContextMenu.map(
        ({ defaultPrevented }) => defaultPrevented,
      ),
      pointerGesture: observed.pointerGesture,
      ownership: observed.ownership,
    };
  } finally {
    cleanup = await page.evaluate(async ({ bridgeName, probeName, shouldRelease }) => {
      const nativeContextMenuProbe = window[probeName];
      if (nativeContextMenuProbe) {
        document.removeEventListener('contextmenu', nativeContextMenuProbe.listener);
        delete window[probeName];
      }
      const bridge = window[bridgeName];
      if (bridge && shouldRelease) await bridge.awaitMilestone(0, 'released');
      const host = document.querySelector('[data-contract-surface]');
      return {
        canvasCount:
          host?.querySelectorAll('canvas[data-patch-map-product="patch-map"]').length ?? 0,
        released: shouldRelease,
      };
    }, {
      bridgeName: BRIDGE_NAME,
      probeName: contextMenuProbeName,
      shouldRelease: armed,
    }).catch(() => null);
    invariant(
      cleanup?.canvasCount === 0 && cleanup?.released === armed,
      `${caseId} trusted input probe releases its Engine and canvas`,
    );
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

function executeBrowserUiRun(page, caseId, operation, buttonTestId) {
  return executeBrowserRun(
    page,
    operation,
    buttonTestId,
    caseId,
    CONTROL_CASES.has(caseId),
  );
}

async function executeBrowserRun(
  page,
  operation,
  buttonTestId = null,
  focusedCaseId = null,
  genericControlCase = false,
) {
  const completionTimeoutMs = focusedCaseId !== null
    && PERFORMANCE_TRANCHE_CASES.has(focusedCaseId)
    ? PERFORMANCE_CASE_TIMEOUT_MS
    : 30_000;
  return page.evaluate(async ({
    bridgeName,
    gpuProbeName,
    operationName,
    triggerTestId,
    uiCaseId,
    collectGenericControlUi,
    completionTimeout,
  }) => {
    const bridge = window[bridgeName];
    if (!bridge) throw new Error(`Missing public Lab bridge ${bridgeName}`);
    const surface = document.querySelector('[data-contract-surface]');
    if (!surface) throw new Error('Missing focused contract surface');
    const gpuProbe = window[gpuProbeName];
    if (gpuProbe && typeof gpuProbe.begin === 'function') {
      gpuProbe.begin({ caseId: bridge.state().caseId, operation: operationName });
    }
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
          generic: collectGenericControlUi,
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
      const terminalAction = Array.isArray(execution?.actionResults)
        ? execution.actionResults.at(-1)
        : null;
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
        diagnostics: {
          longTaskMeasurements:
            terminalAction?.delta?.actual?.longTasks?.measurements ?? null,
        },
        ui,
        gpu: gpuProbe && typeof gpuProbe.snapshot === 'function'
          ? gpuProbe.snapshot()
          : null,
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
          root.removeEventListener('patch-map-contract-run-complete', onComplete);
          reject(new Error(`Focused ${rootTestId} run completion event timed out`));
        }, completionTimeout);
        const onComplete = (event) => {
          if (!(event instanceof CustomEvent) || event.detail?.operation !== expectedOperation) return;
          window.clearTimeout(timeout);
          root.removeEventListener('patch-map-contract-run-complete', onComplete);
          if (!event.detail.run || typeof event.detail.run !== 'object') {
            const execution = bridge.execution();
            const failureMessage = typeof execution?.error?.message === 'string'
              ? `: ${execution.error.message}`
              : '';
            reject(new Error(
              `Focused ${rootTestId} completion did not include a run result${failureMessage}`,
            ));
            return;
          }
          resolve(event.detail.run);
        };
        root.addEventListener('patch-map-contract-run-complete', onComplete);
      });
    }

    function collectFocusedUi(options) {
      if (options.generic) return collectGenericFocusedUi(options);
      if (options.caseId === 'REN-005') return collectRen005FocusedUi(options);
      if (options.caseId === 'REN-006' || options.caseId === 'REN-011') {
        return collectTextFocusedUi(options);
      }
      return collectComponentAssetFocusedUi(options);
    }

    async function collectGenericFocusedUi({
      bridge: activeBridge,
      caseId,
      triggerTestId,
    }) {
      const timeoutAt = performance.now() + 30_000;
      let lastState = null;
      for (;;) {
        const root = document.querySelector(`[data-testid="${activeBridge.state().rootTestId}"]`);
        const execution = activeBridge.execution();
        const expectedActionCount = Array.isArray(execution?.actionResults)
          ? execution.actionResults.length
          : 0;
        const statuses = root
          ? [...root.querySelectorAll('.contract-case-action[data-action-status]')]
            .map((row) => row.dataset.actionStatus)
          : [];
        const run = root?.querySelector('[data-testid="load-dataset"]');
        const repeat = root?.querySelector('[data-testid="repeat-action"]');
        const destroy = root?.querySelector('[data-testid="destroy-case"]');
        lastState = {
          contractStatus: root?.dataset.contractStatus ?? null,
          expectedActionCount,
          statuses,
          runDisabled: run instanceof HTMLButtonElement ? run.disabled : null,
          repeatDisabled: repeat instanceof HTMLButtonElement ? repeat.disabled : null,
          destroyDisabled: destroy instanceof HTMLButtonElement ? destroy.disabled : null,
        };
        if (
          root?.dataset.contractStatus === 'observed'
          && expectedActionCount > 0
          && statuses.length === expectedActionCount
          && statuses.every((status) => status === 'completed')
          && run instanceof HTMLButtonElement
          && repeat instanceof HTMLButtonElement
          && destroy instanceof HTMLButtonElement
          && run.disabled
          && !repeat.disabled
          && !destroy.disabled
        ) {
          return {
            trigger: `click:${triggerTestId}`,
            caseId,
            contractStatus: root.dataset.contractStatus,
            actionStatuses: statuses,
            controls: {
              runDisabled: run.disabled,
              repeatDisabled: repeat.disabled,
              destroyDisabled: destroy.disabled,
            },
          };
        }
        if (performance.now() >= timeoutAt) {
          throw new Error(
            `Focused ${caseId} generic DOM did not settle after ${triggerTestId}: `
              + JSON.stringify(lastState),
          );
        }
        await new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
      }
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
    gpuProbeName: GPU_PROBE_NAME,
    operationName: operation,
    triggerTestId: buttonTestId,
    uiCaseId: focusedCaseId,
    collectGenericControlUi: genericControlCase,
    completionTimeout: completionTimeoutMs,
  });
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
    'render checkpoint assertion inventory must remain 2028',
  );
  invariant(
    sum(RENDER_CASES, (record) => record.expectedFailures?.length ?? 0) ===
      EXPECTED_ASSERTION_FAILURE_TOTAL,
    'render checkpoint observed immutable conflict inventory must remain 26',
  );
  invariant(
    sum(RENDER_CASES, (record) => record.expectedDeficits?.length ?? 0) ===
      EXPECTED_PERFORMANCE_DEFICIT_TOTAL,
    'render checkpoint measured performance deficit inventory must remain 14',
  );
  invariant(
    EXPECTED_ASSERTION_TOTAL
      - EXPECTED_ASSERTION_FAILURE_TOTAL
      - EXPECTED_PERFORMANCE_DEFICIT_TOTAL
      === EXPECTED_ASSERTION_PASS_TOTAL,
    'render checkpoint passing assertion inventory must remain 1988',
  );
  invariant(
    sum(
      RENDER_CASES,
      (record) => (record.expectedFailures?.length ?? 0) + (record.latentConflicts?.length ?? 0),
    ) === DECLARED_IMMUTABLE_CONFLICT_TOTAL,
    'render checkpoint declared immutable conflict inventory must remain 28',
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
  process.stderr.write(`[core-v2-render-browser] ${caseId}: ${phase}\n`);
}

async function withTimeout(promise, timeoutMs, label) {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`Core v2 render browser checkpoint timed out: ${label}`));
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
