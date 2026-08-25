#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from 'playwright';
import { createServer } from 'vite';

import {
  parsePatchMapBrowserLaunch,
  parsePatchMapNativeWindowsCell,
} from '../browser-launch.mjs';

const ROOT = process.cwd();
const allRoutes = process.argv.includes('--all-routes');
const orientationOnly = process.argv.includes('--orientation-only');
const codeCommit = process.env.PATCH_MAP_CODE_COMMIT ?? 'uncommitted';
const browserLaunch = parsePatchMapBrowserLaunch(process.argv.slice(2));
const nativeWindows = parsePatchMapNativeWindowsCell(
  process.argv.slice(2),
  browserLaunch,
);
const outputPath = process.env.PATCH_MAP_MANUAL_LAB_OUTPUT
  ? path.resolve(process.env.PATCH_MAP_MANUAL_LAB_OUTPUT)
  : null;
const catalogPath = path.join(
  ROOT,
  'contracts/evidence/catalog-fixtures.v1.json',
);
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
const cases = catalog.cases.map((record) => ({
  id: record.id,
  actionCount: record.actionTrace.length,
}));
const representatives = [
  'HIS-001',
  'SEL-005',
  'TRN-009',
  'REN-009',
  'CSM-038',
];
const routeCases = allRoutes
  ? cases
  : cases.filter(({ id }) => representatives.includes(id));
const routeWorkerCount = allRoutes
  && !browserLaunch.headed
  && !nativeWindows.requested
  ? Math.min(2, routeCases.length)
  : 1;

let server;
let browser;
let context;
let page;
let browserVersion = null;
const checks = [];
const failures = [];
const errors = {
  console: [],
  page: [],
  network: [],
};

try {
  server = await createServer({
    root: ROOT,
    configFile: path.join(ROOT, 'vite.lab.config.ts'),
    logLevel: 'error',
  });
  await server.listen();
  const baseUrl = server.resolvedUrls?.local?.[0];
  if (!baseUrl) throw new Error('PatchMap manual Lab server has no URL');
  browser = await chromium.launch(browserLaunch.launchOptions);
  browserVersion = browser.version();
  context = await browser.newContext({
    viewport: { width: 1_440, height: 1_000 },
    deviceScaleFactor: 1,
  });
  page = await context.newPage();
  observePage(page);

  await openCase('HIS-001');
  const rendererSupport = await page.evaluate(() => ({
    webgl: document.createElement('canvas').getContext('webgl') !== null,
    webgl2: document.createElement('canvas').getContext('webgl2') !== null,
    state: window.__PATCH_MAP_MANUAL_LAB__?.state(),
  }));
  check(
    rendererSupport.webgl &&
      rendererSupport.webgl2 &&
      rendererSupport.state?.canvasCount === 1,
    'headless Chromium owns one real WebGL2 manual canvas',
    rendererSupport,
  );

  if (orientationOnly) {
    await verifyReadableBarOrientation();
  } else {
  const rectA = await geometry('manual-rect-a');
  await canvasClick(center(rectA.screenBounds));
  await page.waitForFunction(() =>
    window.__PATCH_MAP_MANUAL_LAB__?.state().selectedIds.includes('manual-rect-a'),
  );
  check(true, 'direct canvas click selects a stable logical target');

  const beforeMove = await geometry('manual-rect-a');
  await page.locator('[data-manual-mode="move"]').click();
  await canvasDrag(center(beforeMove.screenBounds), [
    center(beforeMove.screenBounds)[0] + 44,
    center(beforeMove.screenBounds)[1] + 26,
  ]);
  await page.waitForFunction(() =>
    (window.__PATCH_MAP_MANUAL_LAB__?.state().history.undoDepth ?? 0) >= 1,
  );
  const afterMove = await geometry('manual-rect-a');
  check(
    afterMove.worldBounds[0] !== beforeMove.worldBounds[0] &&
      afterMove.worldBounds[1] !== beforeMove.worldBounds[1],
    'Move drag previews and commits changed world geometry',
    { before: beforeMove.worldBounds, after: afterMove.worldBounds },
  );

  await page.locator('[data-manual-command="undo"]').click();
  await page.waitForFunction(() =>
    (window.__PATCH_MAP_MANUAL_LAB__?.state().history.redoDepth ?? 0) >= 1,
  );
  const afterUndo = await geometry('manual-rect-a');
  check(
    closeTuple(afterUndo.worldBounds, beforeMove.worldBounds),
    'Undo button restores the complete drag as one history action',
    { before: beforeMove.worldBounds, afterUndo: afterUndo.worldBounds },
  );
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+Z' : 'Control+Shift+Z');
  await page.waitForFunction(() =>
    (window.__PATCH_MAP_MANUAL_LAB__?.state().history.undoDepth ?? 0) >= 1,
  );
  const afterShortcutRedo = await geometry('manual-rect-a');
  check(
    closeTuple(afterShortcutRedo.worldBounds, afterMove.worldBounds),
    'Redo keyboard shortcut replays the same human action',
  );

  await openCase('SEL-005');
  const selectionA = await geometry('manual-rect-a');
  const selectionB = await geometry('manual-rect-b');
  const region = unionBounds([selectionA.screenBounds, selectionB.screenBounds], 8);
  await page.locator('[data-manual-mode="box"]').click();
  await canvasDrag([region[0], region[1]], [region[2], region[3]]);
  await page.waitForFunction(() =>
    (window.__PATCH_MAP_MANUAL_LAB__?.state().selectedIds.length ?? 0) >= 2,
  );
  check(
    (await manualState()).selectedIds.includes('manual-rect-a') &&
      (await manualState()).selectedIds.includes('manual-rect-b'),
    'Box drag selects multiple transformed targets and remains editable',
  );

  await openCase('TRN-009');
  const resizeTarget = await geometry('manual-rect-b');
  await canvasClick(center(resizeTarget.screenBounds));
  await page.locator('[data-manual-mode="resize"]').click();
  const resizeHandle = await page.evaluate(() => {
    const engine = window.__PATCH_MAP_MANUAL_LAB__?.engine();
    const region = engine?.transformerHandleProbe()?.regions.find(({ id }) => id === 'se');
    return region?.center ?? null;
  });
  if (!resizeHandle) throw new Error('manual transformer SE handle is unavailable');
  const historyBeforeResize = (await manualState()).history.undoDepth;
  await canvasDrag(resizeHandle, [resizeHandle[0] + 30, resizeHandle[1] + 22]);
  await page.waitForFunction(
    (before) =>
      (window.__PATCH_MAP_MANUAL_LAB__?.state().history.undoDepth ?? 0) > before,
    historyBeforeResize,
  );
  const afterResize = await geometry('manual-rect-b');
  check(
    afterResize.worldBounds[2] > resizeTarget.worldBounds[2],
    'Visible SE transformer handle resizes the selected rectangle',
  );
  const historyBeforeCancel = (await manualState()).history.undoDepth;
  await page.locator('[data-manual-mode="move"]').click();
  const cancelStart = center(afterResize.screenBounds);
  const canvas = page.locator('[data-testid="manual-canvas-host"] canvas');
  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) throw new Error('manual canvas has no bounds');
  await page.mouse.move(canvasBox.x + cancelStart[0], canvasBox.y + cancelStart[1]);
  await page.mouse.down();
  await page.mouse.move(canvasBox.x + cancelStart[0] + 55, canvasBox.y + cancelStart[1] + 20);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  const afterCancel = await geometry('manual-rect-b');
  check(
    (await manualState()).history.undoDepth === historyBeforeCancel &&
      closeTuple(afterCancel.worldBounds, afterResize.worldBounds),
    'Escape cancels an active transform without adding history',
  );

  await openCase('REN-009');
  await page.locator('[data-manual-command="frames-toggle"]').click();
  const frameBeforeAnimation = (await page.evaluate(() =>
    window.__PATCH_MAP_MANUAL_LAB__?.engine()?.snapshot().frameRevision ?? 0
  ));
  await page.locator('[data-manual-command="animate-all"]').click();
  await page.waitForFunction(() =>
    (window.__PATCH_MAP_MANUAL_LAB__?.state().activeAnimations ?? 0) > 0,
  );
  check(
    (await manualState()).activeAnimations > 0,
    'Paused manual frames expose a visible in-flight all-bar animation state',
  );
  await page.locator('[data-manual-command="frames-toggle"]').click();
  await page.waitForFunction(
    () =>
      (window.__PATCH_MAP_MANUAL_LAB__?.state().activeAnimations ?? 1) === 0,
    undefined,
    { timeout: 10_000 },
  );
  const frameAfterAnimation = await page.evaluate(() =>
    window.__PATCH_MAP_MANUAL_LAB__?.engine()?.snapshot().frameRevision ?? 0
  );
  check(
    frameAfterAnimation > frameBeforeAnimation,
    'Resumed central frame loop visibly completes the bar animation',
    { frameBeforeAnimation, frameAfterAnimation },
  );

  await verifyReadableBarOrientation();

  await openCase('CSM-038');
  await page.evaluate(() => {
    window.__MANUAL_CANVAS_IDENTITY__ =
      window.__PATCH_MAP_MANUAL_LAB__?.engine()?.canvasHandle().element;
  });
  await page.locator('[data-manual-command="capture"]').click();
  const captureImage = page.locator('[data-manual-capture-image]');
  await captureImage.waitFor({ state: 'visible' });
  const capture = await captureImage.getAttribute('src');
  const canvasRetained = await page.evaluate(() =>
    window.__MANUAL_CANVAS_IDENTITY__ ===
      window.__PATCH_MAP_MANUAL_LAB__?.engine()?.canvasHandle().element
  );
  check(
    capture?.startsWith('data:image/png;base64,') === true &&
      capture.length > 100 &&
      canvasRetained,
    'Repeated-use extraction returns PNG while retaining the authoritative canvas',
    { captureBytes: capture?.length ?? 0, canvasRetained },
  );
  const generationBefore = (await manualState()).generation;
  await page.locator('[data-manual-tool-button="lifecycle"]').click();
  await page.locator('[data-manual-command="destroy-session"]').click();
  await page.waitForFunction(() =>
    window.__PATCH_MAP_MANUAL_LAB__?.state().status === 'destroyed',
  );
  check(
    (await manualState()).canvasCount === 0 &&
      await page.locator('[data-testid="manual-canvas-host"] canvas').count() === 0,
    'Destroy removes the manual canvas and releases the live session',
  );
  await page.locator('[data-manual-command="reinitialize-session"]').click();
  await page.waitForFunction((generation) => {
    const state = window.__PATCH_MAP_MANUAL_LAB__?.state();
    return state?.status === 'ready' && state.generation > generation && state.canvasCount === 1;
  }, generationBefore);
  check(true, 'Re-initialize creates exactly one fresh manual canvas');

  const routeProbes = await collectRouteProbes(routeCases);
  for (const [index, record] of routeCases.entries()) {
    const routeProbe = routeProbes[index];
    check(
      isValidRouteProbe(routeProbe, record),
      `${record.id} mounts localized workflow guidance with exact automation ownership`,
      routeProbe,
    );
  }
  }

  check(errors.console.length === 0, 'console error count is zero', errors.console);
  check(errors.page.length === 0, 'page error count is zero', errors.page);
  check(errors.network.length === 0, 'network error count is zero', errors.network);
} finally {
  await page?.close().catch(() => undefined);
  await context?.close().catch(() => undefined);
  await browser?.close().catch(() => undefined);
  await server?.close().catch(() => undefined);
}

const report = {
  revision: 'patch-map-manual-lab-browser/1',
  codeCommit,
  mode: orientationOnly ? 'orientation-only' : allRoutes ? 'all-routes' : 'representative',
  routeCount: orientationOnly ? 1 : routeCases.length,
  environment: {
    platform: process.platform,
    architecture: process.arch,
    headed: browserLaunch.headed,
    browserTarget: browserLaunch.target,
    browserVersion,
    routeWorkerCount,
    windowsNative: nativeWindows.evidenceStatus,
    nativeCellId: nativeWindows.cellId,
  },
  checks,
  failures,
  errors,
};
const output = allRoutes
  ? {
      revision: report.revision,
      codeCommit: report.codeCommit,
      mode: report.mode,
      routeCount: report.routeCount,
      checkCount: checks.length,
      passedCheckCount: checks.filter(({ status }) => status === 'pass').length,
      failedCheckCount: failures.length,
      failures,
      errors,
      environment: report.environment,
    }
  : report;
if (outputPath) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
}
console.log(JSON.stringify(output, null, 2));
if (failures.length > 0) process.exitCode = 1;

async function collectRouteProbes(records) {
  const probes = new Array(records.length);
  const extraPages = await Promise.all(
    Array.from(
      { length: Math.max(0, routeWorkerCount - 1) },
      () => context.newPage(),
    ),
  );
  const workerPages = [page, ...extraPages];
  for (const workerPage of extraPages) observePage(workerPage);
  let nextIndex = 0;

  try {
    await Promise.all(workerPages.map(async (workerPage) => {
      while (nextIndex < records.length) {
        const index = nextIndex;
        nextIndex += 1;
        const record = records[index];
        await openCase(record.id, workerPage);
        probes[index] = await readRouteProbe(workerPage);
      }
    }));
    return probes;
  } finally {
    await Promise.allSettled(extraPages.map((workerPage) => workerPage.close()));
  }
}

async function readRouteProbe(targetPage) {
  return targetPage.evaluate(() => ({
    caseId: window.__PATCH_MAP_MANUAL_LAB__?.state().caseId,
    status: window.__PATCH_MAP_MANUAL_LAB__?.state().status,
    canvasCount: window.__PATCH_MAP_MANUAL_LAB__?.state().canvasCount,
    documentLanguage: document.documentElement.lang,
    documentTitle: document.title,
    localizedTitle:
      document.querySelector('#manual-case-guide-title')?.textContent ?? '',
    onboardingTitle:
      document.querySelector('#manual-onboarding-title')?.textContent ?? '',
    expandedLayoutGuide:
      document.querySelector('.manual-onboarding details')?.hasAttribute('open') ?? false,
    localizedToolDescriptionCount:
      [...document.querySelectorAll('[data-manual-tool-button] small')]
        .filter((element) => /[가-힣]/u.test(element.textContent ?? '')).length,
    oldEnglishPhrases:
      [
        'Human-operated product Lab',
        'Keep the engine alive',
        'Selection you can keep changing',
        'Approved action map',
      ].filter((phrase) =>
        document.querySelector('[data-testid="manual-workbench"]')?.textContent
          ?.includes(phrase)),
    coverageMode:
      document.querySelector('[data-testid="manual-workbench"]')
        ?.getAttribute('data-manual-coverage'),
    exactActionCount: Number(
      document.querySelector('[data-testid="manual-workbench"]')
        ?.getAttribute('data-manual-exact-action-count'),
    ),
    duplicateManualActionRows:
      document.querySelectorAll('[data-manual-approved-action]').length,
    toolButtons:
      document.querySelectorAll('[data-manual-tool-button]').length,
  }));
}

function isValidRouteProbe(routeProbe, record) {
  return routeProbe.caseId === record.id
    && routeProbe.status === 'ready'
    && routeProbe.canvasCount === 1
    && routeProbe.documentLanguage === 'ko'
    && routeProbe.documentTitle === 'PATCH MAP 기능 검증 실험실'
    && /[가-힣]/u.test(routeProbe.localizedTitle)
    && (routeProbe.coverageMode === 'automated-only'
      ? routeProbe.onboardingTitle.includes('자동 증거')
      : routeProbe.onboardingTitle.includes('직접 조작'))
    && routeProbe.expandedLayoutGuide
    && routeProbe.localizedToolDescriptionCount === routeProbe.toolButtons
    && routeProbe.oldEnglishPhrases.length === 0
    && ['dedicated', 'shared-workflow', 'automated-only'].includes(routeProbe.coverageMode)
    && routeProbe.exactActionCount === record.actionCount
    && routeProbe.duplicateManualActionRows === 0
    && routeProbe.toolButtons > 0;
}

function observePage(targetPage) {
  targetPage.on('console', (message) => {
    if (message.type() === 'error') errors.console.push(message.text());
  });
  targetPage.on('pageerror', (error) => errors.page.push(error.stack ?? error.message));
  targetPage.on('requestfailed', (request) => {
    errors.network.push(`${request.url()} ${request.failure()?.errorText ?? ''}`);
  });
  targetPage.on('response', (response) => {
    if (response.status() >= 400) {
      errors.network.push(`${response.url()} HTTP ${response.status()}`);
    }
  });
}

async function openCase(caseId, targetPage = page) {
  const url = new URL(
    `lab/patch-map?scenario=${caseId}&size=100&seed=319`,
    server.resolvedUrls.local[0],
  ).href;
  await targetPage.goto(url, { waitUntil: 'domcontentloaded' });
  try {
    await targetPage.waitForFunction(() => {
      const state = window.__PATCH_MAP_MANUAL_LAB__?.state();
      return state?.status === 'ready' || state?.status === 'failed';
    }, undefined, { timeout: 20_000 });
  } catch (cause) {
    const state = await manualState(targetPage).catch(() => null);
    if (state?.status === 'ready') return;
    throw new Error(
      `${caseId} manual Lab ready timeout: ${JSON.stringify({
        url,
        state,
        errors,
      })}`,
      { cause },
    );
  }
  const state = await manualState(targetPage);
  if (state.status !== 'ready') {
    throw new Error(`${caseId} manual Lab failed: ${state.error ?? 'unknown error'}`);
  }
}

async function manualState(targetPage = page) {
  return targetPage.evaluate(() => window.__PATCH_MAP_MANUAL_LAB__?.state());
}

async function geometry(id) {
  return page.evaluate((targetId) => {
    const engine = window.__PATCH_MAP_MANUAL_LAB__?.engine();
    const target = engine?.geometryProbe().entities.find((entity) => entity.id === targetId);
    if (!target) throw new Error(`missing geometry ${targetId}`);
    return {
      screenBounds: target.screenBounds,
      worldBounds: target.worldBounds,
    };
  }, id);
}

async function verifyReadableBarOrientation() {
  await openCase('LAY-004');
  await page.evaluate(() => {
    const duration = document.querySelector('[data-manual-animation-duration]');
    if (!(duration instanceof HTMLInputElement)) {
      throw new Error('manual animation duration input is unavailable');
    }
    duration.value = '2000';
    return window.__PATCH_MAP_MANUAL_LAB__?.run('animation-duration');
  });
  const readableBarBeforeFlip = await readableBarPlacement('node-0');
  await page.evaluate(() =>
    window.__PATCH_MAP_MANUAL_LAB__?.run('world-flip-y')
  );
  await page.waitForFunction(() =>
    window.__PATCH_MAP_MANUAL_LAB__?.engine()
      ?.viewportTransformProbe().world.flipY === true,
  );
  const readableBarAfterFlip = await readableBarPlacement('node-0');
  check(
    readableBarAfterFlip.barCenterY > readableBarAfterFlip.ownerCenterY &&
      Math.abs(readableBarAfterFlip.bottomGap - readableBarBeforeFlip.bottomGap) <= 0.25,
    'Vertical flip keeps the readable bar attached to the visible bottom of its item',
    {
      before: readableBarBeforeFlip,
      after: readableBarAfterFlip,
    },
  );
  await page.evaluate(() =>
    window.__PATCH_MAP_MANUAL_LAB__?.run('animate-all')
  );
  await page.waitForFunction(() =>
    (window.__PATCH_MAP_MANUAL_LAB__?.state().activeAnimations ?? 0) > 0,
  );
  await page.waitForFunction((beforeHeight) => {
    const engine = window.__PATCH_MAP_MANUAL_LAB__?.engine();
    const bar = engine?.geometryProbe().entities.find((entity) =>
      entity.ownerItemId === 'node-0' && entity.componentType === 'bar'
    );
    return bar !== undefined && Math.abs(bar.screenBounds[3] - beforeHeight) > 0.25;
  }, readableBarAfterFlip.barHeight);
  const readableBarDuringAnimation = await readableBarPlacement('node-0');
  check(
    Math.abs(
      readableBarDuringAnimation.bottomGap - readableBarAfterFlip.bottomGap,
    ) <= 0.25 &&
      Math.abs(
        readableBarDuringAnimation.barHeight - readableBarAfterFlip.barHeight,
      ) > 0.25,
    'Vertically flipped bar animation keeps the visible bottom edge stationary',
    {
      beforeAnimation: readableBarAfterFlip,
      duringAnimation: readableBarDuringAnimation,
    },
  );
  await page.waitForFunction(
    () =>
      (window.__PATCH_MAP_MANUAL_LAB__?.state().activeAnimations ?? 1) === 0,
    undefined,
    { timeout: 10_000 },
  );
  await page.evaluate(async () => {
    const bridge = window.__PATCH_MAP_MANUAL_LAB__;
    await bridge?.run('view-reset');
    for (let step = 0; step < 12; step += 1) {
      await bridge?.run('world-rotate-right');
    }
  });
  await page.waitForFunction(() => {
    const world = window.__PATCH_MAP_MANUAL_LAB__?.engine()
      ?.viewportTransformProbe().world;
    return world?.rotationDegrees === 180 && world.flipY === false;
  });
  const readableBarAfterHalfTurn = await readableBarPlacement('node-0');
  check(
    readableBarAfterHalfTurn.barCenterY > readableBarAfterHalfTurn.ownerCenterY &&
      Math.abs(
        readableBarAfterHalfTurn.bottomGap / readableBarAfterHalfTurn.ownerHeight
        - readableBarBeforeFlip.bottomGap / readableBarBeforeFlip.ownerHeight,
      ) <= 0.001,
    'A 180 degree readable correction keeps the bar on the visible bottom',
    {
      before: readableBarBeforeFlip,
      after: readableBarAfterHalfTurn,
    },
  );
}

async function readableBarPlacement(ownerId) {
  return page.evaluate((targetOwnerId) => {
    const engine = window.__PATCH_MAP_MANUAL_LAB__?.engine();
    const entities = engine?.geometryProbe().entities ?? [];
    const owner = entities.find(({ id }) => id === targetOwnerId);
    const bar = entities.find((entity) =>
      entity.ownerItemId === targetOwnerId &&
      entity.componentType === 'bar'
    );
    if (!owner || !bar) {
      throw new Error(`missing readable bar placement for ${targetOwnerId}`);
    }
    const ownerCenterY = owner.screenBounds[1] + owner.screenBounds[3] / 2;
    const barCenterY = bar.screenBounds[1] + bar.screenBounds[3] / 2;
    return {
      ownerCenterY,
      ownerHeight: owner.screenBounds[3],
      barCenterY,
      bottomGap:
        owner.screenBounds[1] + owner.screenBounds[3]
        - (bar.screenBounds[1] + bar.screenBounds[3]),
      barHeight: bar.screenBounds[3],
      barScreenAngle: bar.screenAngle,
    };
  }, ownerId);
}

async function canvasClick(point) {
  const canvas = page.locator('[data-testid="manual-canvas-host"] canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('manual canvas has no bounds');
  await page.mouse.click(box.x + point[0], box.y + point[1]);
}

async function canvasDrag(start, end) {
  const canvas = page.locator('[data-testid="manual-canvas-host"] canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('manual canvas has no bounds');
  const safeStart = clampCanvasPoint(start, box);
  const safeEnd = clampCanvasPoint(end, box);
  await page.mouse.move(box.x + safeStart[0], box.y + safeStart[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + safeEnd[0], box.y + safeEnd[1], { steps: 5 });
  await page.mouse.up();
}

function clampCanvasPoint(point, box) {
  return [
    Math.max(1, Math.min(box.width - 1, point[0])),
    Math.max(1, Math.min(box.height - 1, point[1])),
  ];
}

function center(bounds) {
  return [
    bounds[0] + bounds[2] / 2,
    bounds[1] + bounds[3] / 2,
  ];
}

function unionBounds(boundsList, padding) {
  return [
    Math.min(...boundsList.map((bounds) => bounds[0])) - padding,
    Math.min(...boundsList.map((bounds) => bounds[1])) - padding,
    Math.max(...boundsList.map((bounds) => bounds[0] + bounds[2])) + padding,
    Math.max(...boundsList.map((bounds) => bounds[1] + bounds[3])) + padding,
  ];
}

function closeTuple(left, right, epsilon = 0.001) {
  return left.length === right.length &&
    left.every((value, index) => Math.abs(value - right[index]) <= epsilon);
}

function check(condition, label, evidence = undefined) {
  const record = {
    label,
    status: condition ? 'pass' : 'fail',
    ...(evidence === undefined ? {} : { evidence }),
  };
  checks.push(record);
  if (!condition) failures.push(record);
}
