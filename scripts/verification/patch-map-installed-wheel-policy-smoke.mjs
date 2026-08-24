#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { chromium } from 'playwright';
import { createServer } from 'vite';

const execute = promisify(execFile);
const artifactArgument = process.argv[2];
if (artifactArgument === undefined || !path.isAbsolute(artifactArgument)) {
  throw new Error('usage: patch-map-installed-wheel-policy-smoke.mjs /absolute/artifact.tgz');
}

const artifact = artifactArgument;
const artifactBytes = await readFile(artifact);
const artifactSha256 = createHash('sha256').update(artifactBytes).digest('hex');
const temporary = await mkdtemp(path.join(tmpdir(), 'patch-map-installed-wheel-policy-'));
let server;
let browser;

try {
  await writeFile(path.join(temporary, 'package.json'), `${JSON.stringify({
    name: 'patch-map-installed-wheel-policy-smoke',
    private: true,
    type: 'module',
    dependencies: {
      '@conalog/patch-map': `file:${artifact}`,
      'pixi.js': '8.19.0',
    },
  }, null, 2)}\n`);
  await execute('npm', [
    'install',
    '--offline',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
  ], { cwd: temporary, maxBuffer: 20 * 1024 * 1024 });
  const installedEntry = await realpath(
    createRequire(path.join(temporary, 'package.json')).resolve('@conalog/patch-map'),
  );
  const installedPackageRoot = await realpath(path.join(
    temporary,
    'node_modules',
    '@conalog',
    'patch-map',
  ));
  const installedEntryRelative = path.relative(installedPackageRoot, installedEntry);
  if (installedEntryRelative.startsWith('..') || path.isAbsolute(installedEntryRelative)) {
    throw new Error(`package resolved outside the fresh consumer: ${installedEntry}`);
  }

  await writeFile(path.join(temporary, 'index.html'), [
    '<!doctype html>',
    '<html><body style="margin:0;background:#f8fafc">',
    '<div id="default-host" style="width:320px;height:200px"></div>',
    '<div id="wheel-scroll" style="width:340px;height:220px;overflow:auto">',
    '<div style="height:620px">',
    '<div id="control-host" style="width:320px;height:200px"></div>',
    '<div style="height:420px"></div>',
    '</div>',
    '</div>',
    '<div id="invalid-host" style="width:320px;height:200px"></div>',
    '<script type="module" src="/main.js"></script>',
    '</body></html>',
  ].join('\n'));
  await writeFile(path.join(temporary, 'main.js'), `
import { PatchMap } from '@conalog/patch-map';

const data = [{
  type: 'item',
  id: 'wheel-target',
  attrs: { x: 80, y: 50 },
  size: { width: 120, height: 80 },
  components: [{
    type: 'background',
    id: 'surface',
    source: { type: 'rect', fill: '#2563eb' },
  }],
}];
const defaultHost = document.querySelector('#default-host');
const controlHost = document.querySelector('#control-host');
const invalidHost = document.querySelector('#invalid-host');
const mount = (container, instanceId, control) => PatchMap.mount({
  container,
  instanceId,
  width: 320,
  height: 200,
  resizeMode: 'manual',
  fit: false,
  zoomLimits: [0.5, 2],
  data,
  ...(control ? { viewport: { wheel: { activationModifier: 'control' } } } : {}),
  selection: {
    box: { activationModifier: 'shift' },
  },
});

let defaultMap = await mount(defaultHost, 'wheel-compatible-default', false);
let controlMap = await mount(controlHost, 'wheel-control-policy', true);

function sameViewport(left, right) {
  return left.scale === right.scale &&
    left.centerWorld[0] === right.centerWorld[0] &&
    left.centerWorld[1] === right.centerWorld[1];
}

function worldAtAnchor(viewport, anchor) {
  return [
    viewport.centerWorld[0] + (anchor[0] - 160) / viewport.scale,
    viewport.centerWorld[1] + (anchor[1] - 100) / viewport.scale,
  ];
}

function near(left, right, tolerance = 1e-8) {
  return Math.abs(left - right) <= tolerance;
}

function dispatchWheel(map, host, options = {}) {
  const anchor = options.anchor ?? [160, 100];
  const canvas = host.querySelector('canvas');
  const bounds = canvas.getBoundingClientRect();
  const before = structuredClone(map.viewport.state);
  const event = new WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    clientX: bounds.left + anchor[0],
    clientY: bounds.top + anchor[1],
    deltaY: options.deltaY ?? -120,
    ctrlKey: options.ctrlKey ?? false,
    metaKey: options.metaKey ?? false,
    shiftKey: options.shiftKey ?? false,
    altKey: options.altKey ?? false,
  });
  const dispatchResult = canvas.dispatchEvent(event);
  const after = structuredClone(map.viewport.state);
  const beforeAnchor = worldAtAnchor(before, anchor);
  const afterAnchor = worldAtAnchor(after, anchor);
  return {
    before,
    after,
    changed: !sameViewport(before, after),
    defaultPrevented: event.defaultPrevented,
    dispatchResult,
    anchorPreserved: near(beforeAnchor[0], afterAnchor[0]) &&
      near(beforeAnchor[1], afterAnchor[1]),
  };
}

window.__PATCH_MAP_WHEEL_POLICY__ = {
  phase: 'ready',
  controlState: () => structuredClone(controlMap.viewport.state),
  scrollTop: () => document.querySelector('#wheel-scroll').scrollTop,
  resetScroll: () => { document.querySelector('#wheel-scroll').scrollTop = 0; },
  run: async () => {
    const compatiblePlain = dispatchWheel(defaultMap, defaultHost, { deltaY: -120 });
    const plainTarget = dispatchWheel(controlMap, controlHost, {
      anchor: [140, 90],
      deltaY: -120,
    });
    const shiftOnly = dispatchWheel(controlMap, controlHost, {
      shiftKey: true,
      deltaY: -120,
    });
    const altOnly = dispatchWheel(controlMap, controlHost, {
      altKey: true,
      deltaY: -120,
    });
    const controlTarget = dispatchWheel(controlMap, controlHost, {
      anchor: [140, 90],
      ctrlKey: true,
      deltaY: -120,
    });
    const metaBlank = dispatchWheel(controlMap, controlHost, {
      anchor: [300, 180],
      metaKey: true,
      deltaY: 120,
    });
    const clampApplied = dispatchWheel(controlMap, controlHost, {
      ctrlKey: true,
      deltaY: -10000,
    });
    const clampRejected = dispatchWheel(controlMap, controlHost, {
      ctrlKey: true,
      deltaY: -120,
    });
    const beforeProgrammatic = structuredClone(controlMap.viewport.state);
    const programmatic = controlMap.viewport.zoomBy(0.8, [160, 100]);
    const pan = controlMap.viewport.panBy([12, -8]);
    const afterProgrammatic = structuredClone(controlMap.viewport.state);

    let invalidRejected = false;
    try {
      await PatchMap.mount({
        container: invalidHost,
        width: 320,
        height: 200,
        resizeMode: 'manual',
        fit: false,
        data,
        viewport: { wheel: { activationModifier: 'shift' } },
      });
    } catch (error) {
      invalidRejected = String(error).includes(
        'viewport.wheel.activationModifier must be none or control',
      );
    }

    const defaultDestroyed = await defaultMap.destroy();
    defaultMap = null;
    const controlDestroyed = await controlMap.destroy();
    controlMap = null;
    const canvasCountAfterDestroy = document.querySelectorAll('canvas').length;
    controlMap = await mount(controlHost, 'wheel-control-remount', true);
    const remountPlain = dispatchWheel(controlMap, controlHost, { deltaY: -120 });
    const remountControl = dispatchWheel(controlMap, controlHost, {
      ctrlKey: true,
      deltaY: -120,
    });
    const remountDestroyed = await controlMap.destroy();
    controlMap = null;

    return {
      compatiblePlain,
      plainTarget,
      shiftOnly,
      altOnly,
      controlTarget,
      metaBlank,
      clampApplied,
      clampRejected,
      beforeProgrammatic,
      programmatic,
      pan,
      afterProgrammatic,
      invalidRejected,
      invalidCanvasCount: invalidHost.querySelectorAll('canvas').length,
      defaultDestroyed,
      controlDestroyed,
      canvasCountAfterDestroy,
      remountPlain,
      remountControl,
      remountDestroyed,
      finalCanvasCount: document.querySelectorAll('canvas').length,
    };
  },
};
`);

  server = await createServer({
    root: temporary,
    configFile: false,
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0 },
  });
  await server.listen();
  const baseUrl = server.resolvedUrls?.local?.[0];
  if (!baseUrl) throw new Error('installed wheel policy smoke server has no URL');
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 800, height: 700 } });
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
  page.on('requestfailed', (request) => {
    errors.push(`request: ${request.url()} ${request.failure()?.errorText ?? ''}`);
  });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForFunction(
    () => window.__PATCH_MAP_WHEEL_POLICY__?.phase === 'ready',
    undefined,
    { timeout: 30_000 },
  );

  const controlCanvas = page.locator('#control-host canvas');
  await controlCanvas.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.__PATCH_MAP_WHEEL_POLICY__.resetScroll());
  const scrollBefore = await page.evaluate(() => ({
    viewport: window.__PATCH_MAP_WHEEL_POLICY__.controlState(),
    scrollTop: window.__PATCH_MAP_WHEEL_POLICY__.scrollTop(),
  }));
  const box = await controlCanvas.boundingBox();
  if (box === null) throw new Error('control canvas has no browser bounds');
  await page.mouse.move(box.x + 160, box.y + 100);
  await page.mouse.wheel(0, 120);
  await page.waitForFunction(
    () => window.__PATCH_MAP_WHEEL_POLICY__.scrollTop() > 0,
    undefined,
    { timeout: 2_000 },
  ).catch(() => undefined);
  const scrollAfter = await page.evaluate(() => ({
    viewport: window.__PATCH_MAP_WHEEL_POLICY__.controlState(),
    scrollTop: window.__PATCH_MAP_WHEEL_POLICY__.scrollTop(),
  }));
  await page.evaluate(() => window.__PATCH_MAP_WHEEL_POLICY__.resetScroll());
  const probe = await page.evaluate(() => window.__PATCH_MAP_WHEEL_POLICY__.run());
  const result = {
    artifact,
    artifactSha256,
    installedEntry,
    nativePlainScroll: { before: scrollBefore, after: scrollAfter },
    probe,
    errors,
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

  const rejected = [probe.plainTarget, probe.shiftOnly, probe.altOnly, probe.remountPlain];
  const accepted = [
    probe.compatiblePlain,
    probe.controlTarget,
    probe.metaBlank,
    probe.clampApplied,
    probe.remountControl,
  ];
  const scrollPreserved = scrollAfter.scrollTop > scrollBefore.scrollTop &&
    JSON.stringify(scrollAfter.viewport) === JSON.stringify(scrollBefore.viewport);
  if (
    !scrollPreserved ||
    !rejected.every((entry) =>
      entry.changed === false && entry.defaultPrevented === false && entry.dispatchResult === true) ||
    !accepted.every((entry) =>
      entry.changed === true && entry.defaultPrevented === true && entry.dispatchResult === false) ||
    !probe.controlTarget.anchorPreserved ||
    !probe.metaBlank.anchorPreserved ||
    probe.clampRejected.changed !== false ||
    probe.clampRejected.defaultPrevented !== false ||
    probe.programmatic.changed !== true ||
    probe.pan.changed !== true ||
    JSON.stringify(probe.beforeProgrammatic) === JSON.stringify(probe.afterProgrammatic) ||
    probe.invalidRejected !== true ||
    probe.invalidCanvasCount !== 0 ||
    probe.defaultDestroyed !== true ||
    probe.controlDestroyed !== true ||
    probe.canvasCountAfterDestroy !== 0 ||
    probe.remountDestroyed !== true ||
    probe.finalCanvasCount !== 0 ||
    errors.length !== 0
  ) {
    throw new Error('installed artifact wheel policy smoke failed');
  }
} finally {
  await Promise.allSettled([browser?.close(), server?.close()]);
  await rm(temporary, { recursive: true, force: true });
}
