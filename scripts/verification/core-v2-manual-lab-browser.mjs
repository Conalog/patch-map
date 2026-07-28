#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from 'playwright';
import { createServer } from 'vite';

const ROOT = process.cwd();
const allRoutes = process.argv.includes('--all-routes');
const catalogPath = path.join(
  ROOT,
  'docs/reference/core-v2-functional-contract/evidence/catalog-fixtures.v1.json',
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

let server;
let browser;
let context;
let page;
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
    configFile: path.join(ROOT, 'vite.core-v2-lab.config.ts'),
    logLevel: 'error',
  });
  await server.listen();
  const baseUrl = server.resolvedUrls?.local?.[0];
  if (!baseUrl) throw new Error('Core v2 manual Lab server has no URL');
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({
    viewport: { width: 1_440, height: 1_000 },
    deviceScaleFactor: 1,
  });
  page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') errors.console.push(message.text());
  });
  page.on('pageerror', (error) => errors.page.push(error.stack ?? error.message));
  page.on('requestfailed', (request) => {
    errors.network.push(`${request.url()} ${request.failure()?.errorText ?? ''}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      errors.network.push(`${response.url()} HTTP ${response.status()}`);
    }
  });

  await openCase('HIS-001');
  const rendererSupport = await page.evaluate(() => ({
    webgl: document.createElement('canvas').getContext('webgl') !== null,
    webgl2: document.createElement('canvas').getContext('webgl2') !== null,
    state: window.__PATCH_MAP_CORE_V2_MANUAL_LAB__?.state(),
  }));
  check(
    rendererSupport.webgl &&
      rendererSupport.webgl2 &&
      rendererSupport.state?.canvasCount === 1,
    'headless Chromium owns one real WebGL2 manual canvas',
    rendererSupport,
  );

  const rectA = await geometry('manual-rect-a');
  await canvasClick(center(rectA.screenBounds));
  await page.waitForFunction(() =>
    window.__PATCH_MAP_CORE_V2_MANUAL_LAB__?.state().selectedIds.includes('manual-rect-a'),
  );
  check(true, 'direct canvas click selects a stable logical target');

  const beforeMove = await geometry('manual-rect-a');
  await page.locator('[data-manual-mode="move"]').click();
  await canvasDrag(center(beforeMove.screenBounds), [
    center(beforeMove.screenBounds)[0] + 44,
    center(beforeMove.screenBounds)[1] + 26,
  ]);
  await page.waitForFunction(() =>
    (window.__PATCH_MAP_CORE_V2_MANUAL_LAB__?.state().history.undoDepth ?? 0) >= 1,
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
    (window.__PATCH_MAP_CORE_V2_MANUAL_LAB__?.state().history.redoDepth ?? 0) >= 1,
  );
  const afterUndo = await geometry('manual-rect-a');
  check(
    closeTuple(afterUndo.worldBounds, beforeMove.worldBounds),
    'Undo button restores the complete drag as one history action',
    { before: beforeMove.worldBounds, afterUndo: afterUndo.worldBounds },
  );
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+Z' : 'Control+Shift+Z');
  await page.waitForFunction(() =>
    (window.__PATCH_MAP_CORE_V2_MANUAL_LAB__?.state().history.undoDepth ?? 0) >= 1,
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
    (window.__PATCH_MAP_CORE_V2_MANUAL_LAB__?.state().selectedIds.length ?? 0) >= 2,
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
    const engine = window.__PATCH_MAP_CORE_V2_MANUAL_LAB__?.engine();
    const region = engine?.transformerHandleProbe()?.regions.find(({ id }) => id === 'se');
    return region?.center ?? null;
  });
  if (!resizeHandle) throw new Error('manual transformer SE handle is unavailable');
  const historyBeforeResize = (await manualState()).history.undoDepth;
  await canvasDrag(resizeHandle, [resizeHandle[0] + 30, resizeHandle[1] + 22]);
  await page.waitForFunction(
    (before) =>
      (window.__PATCH_MAP_CORE_V2_MANUAL_LAB__?.state().history.undoDepth ?? 0) > before,
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
    window.__PATCH_MAP_CORE_V2_MANUAL_LAB__?.engine()?.snapshot().frameRevision ?? 0
  ));
  await page.locator('[data-manual-command="animate-all"]').click();
  await page.waitForFunction(() =>
    (window.__PATCH_MAP_CORE_V2_MANUAL_LAB__?.state().activeAnimations ?? 0) > 0,
  );
  check(
    (await manualState()).activeAnimations > 0,
    'Paused manual frames expose a visible in-flight all-bar animation state',
  );
  await page.locator('[data-manual-command="frames-toggle"]').click();
  await page.waitForFunction(
    () =>
      (window.__PATCH_MAP_CORE_V2_MANUAL_LAB__?.state().activeAnimations ?? 1) === 0,
    undefined,
    { timeout: 10_000 },
  );
  const frameAfterAnimation = await page.evaluate(() =>
    window.__PATCH_MAP_CORE_V2_MANUAL_LAB__?.engine()?.snapshot().frameRevision ?? 0
  );
  check(
    frameAfterAnimation > frameBeforeAnimation,
    'Resumed central frame loop visibly completes the bar animation',
    { frameBeforeAnimation, frameAfterAnimation },
  );

  await openCase('CSM-038');
  await page.evaluate(() => {
    window.__MANUAL_CANVAS_IDENTITY__ =
      window.__PATCH_MAP_CORE_V2_MANUAL_LAB__?.engine()?.canvasHandle().element;
  });
  await page.locator('[data-manual-command="capture"]').click();
  const captureImage = page.locator('[data-manual-capture-image]');
  await captureImage.waitFor({ state: 'visible' });
  const capture = await captureImage.getAttribute('src');
  const canvasRetained = await page.evaluate(() =>
    window.__MANUAL_CANVAS_IDENTITY__ ===
      window.__PATCH_MAP_CORE_V2_MANUAL_LAB__?.engine()?.canvasHandle().element
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
    window.__PATCH_MAP_CORE_V2_MANUAL_LAB__?.state().status === 'destroyed',
  );
  check(
    (await manualState()).canvasCount === 0 &&
      await page.locator('[data-testid="manual-canvas-host"] canvas').count() === 0,
    'Destroy removes the manual canvas and releases the live session',
  );
  await page.locator('[data-manual-command="reinitialize-session"]').click();
  await page.waitForFunction((generation) => {
    const state = window.__PATCH_MAP_CORE_V2_MANUAL_LAB__?.state();
    return state?.status === 'ready' && state.generation > generation && state.canvasCount === 1;
  }, generationBefore);
  check(true, 'Re-initialize creates exactly one fresh manual canvas');

  for (const record of routeCases) {
    await openCase(record.id);
    const routeProbe = await page.evaluate(() => ({
      caseId: window.__PATCH_MAP_CORE_V2_MANUAL_LAB__?.state().caseId,
      status: window.__PATCH_MAP_CORE_V2_MANUAL_LAB__?.state().status,
      canvasCount: window.__PATCH_MAP_CORE_V2_MANUAL_LAB__?.state().canvasCount,
      documentLanguage: document.documentElement.lang,
      documentTitle: document.title,
      localizedTitle:
        document.querySelector('#manual-case-guide-title')?.textContent ?? '',
      hasGettingStartedGuide:
        document.querySelector('#manual-onboarding-title')?.textContent
          ?.includes('버튼은 세 단계로 사용하면 됩니다') ?? false,
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
      mappedActions:
        document.querySelectorAll('[data-manual-approved-action]').length,
      toolButtons:
        document.querySelectorAll('[data-manual-tool-button]').length,
    }));
    check(
      routeProbe.caseId === record.id &&
        routeProbe.status === 'ready' &&
        routeProbe.canvasCount === 1 &&
        routeProbe.documentLanguage === 'ko' &&
        routeProbe.documentTitle === 'PATCH MAP Core v2 기능 검증 실험실' &&
        /[가-힣]/u.test(routeProbe.localizedTitle) &&
        routeProbe.hasGettingStartedGuide &&
        routeProbe.expandedLayoutGuide &&
        routeProbe.localizedToolDescriptionCount === routeProbe.toolButtons &&
        routeProbe.oldEnglishPhrases.length === 0 &&
        routeProbe.mappedActions === record.actionCount &&
        routeProbe.toolButtons > 0,
      `${record.id} mounts a localized live manual route with every approved action mapped`,
      routeProbe,
    );
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
  revision: 'core-v2-manual-lab-browser/1',
  mode: allRoutes ? 'all-routes' : 'representative',
  routeCount: routeCases.length,
  checks,
  failures,
  errors,
};
const output = allRoutes
  ? {
      revision: report.revision,
      mode: report.mode,
      routeCount: report.routeCount,
      checkCount: checks.length,
      passedCheckCount: checks.filter(({ status }) => status === 'pass').length,
      failedCheckCount: failures.length,
      failures,
      errors,
    }
  : report;
console.log(JSON.stringify(output, null, 2));
if (failures.length > 0) process.exitCode = 1;

async function openCase(caseId) {
  const url = new URL(
    `lab/core-v2?scenario=${caseId}&size=100&seed=319`,
    server.resolvedUrls.local[0],
  ).href;
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => {
    const state = window.__PATCH_MAP_CORE_V2_MANUAL_LAB__?.state();
    return state?.status === 'ready' || state?.status === 'failed';
  }, undefined, { timeout: 20_000 });
  const state = await manualState();
  if (state.status !== 'ready') {
    throw new Error(`${caseId} manual Lab failed: ${state.error ?? 'unknown error'}`);
  }
}

async function manualState() {
  return page.evaluate(() => window.__PATCH_MAP_CORE_V2_MANUAL_LAB__?.state());
}

async function geometry(id) {
  return page.evaluate((targetId) => {
    const engine = window.__PATCH_MAP_CORE_V2_MANUAL_LAB__?.engine();
    const target = engine?.geometryProbe().entities.find((entity) => entity.id === targetId);
    if (!target) throw new Error(`missing geometry ${targetId}`);
    return {
      screenBounds: target.screenBounds,
      worldBounds: target.worldBounds,
    };
  }, id);
}

async function canvasClick(point) {
  const canvas = page.locator('[data-testid="manual-canvas-host"] canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('manual canvas has no bounds');
  await page.mouse.click(box.x + point[0], box.y + point[1]);
}

async function canvasDrag(start, end) {
  const canvas = page.locator('[data-testid="manual-canvas-host"] canvas');
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
