import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const harnessPath = '/__patchmap_browser_contracts__';
const timeout = 30_000;

const harness = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>PATCH MAP browser contracts</title>
    <style>
      html, body { margin: 0; }
      #host { width: 800px; height: 600px; }
    </style>
  </head>
  <body>
    <div id="host"></div>
    <script type="module">
      import { Patchmap, Transformer } from '/src/index.ts';
      window.__PATCHMAP_BROWSER_CONTRACTS__ = Object.freeze({ Patchmap, Transformer });
    </script>
  </body>
</html>`;

const startServer = async () => {
  const server = await createServer({
    appType: 'custom',
    configFile: false,
    logLevel: 'error',
    root,
    plugins: [{
      name: 'patchmap-browser-contract-harness',
      configureServer(vite) {
        vite.middlewares.use((request, response, next) => {
          if (request.url?.split('?')[0] !== harnessPath) {
            next();
            return;
          }
          response.statusCode = 200;
          response.setHeader('content-type', 'text/html; charset=utf-8');
          response.end(harness);
        });
      },
    }],
    server: {
      host: '127.0.0.1',
      port: 0,
      strictPort: false,
    },
  });
  await server.listen();

  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') {
    await server.close();
    throw new Error('Vite did not expose a TCP address');
  }
  return {
    server,
    url: `http://127.0.0.1:${address.port}${harnessPath}`,
  };
};

const openFreshPage = async (browser, url, contextOptions = {}) => {
  const context = await browser.newContext({
    deviceScaleFactor: 1,
    viewport: { width: 1000, height: 760 },
    ...contextOptions,
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  page.setDefaultTimeout(timeout);

  try {
    const response = await page.goto(url, { waitUntil: 'load', timeout });
    if (!response?.ok()) {
      throw new Error(`Harness request failed with status ${response?.status()}`);
    }
    await page.waitForFunction(
      () => typeof window.__PATCHMAP_BROWSER_CONTRACTS__?.Patchmap === 'function',
    );
    return { context, page, pageErrors };
  } catch (error) {
    await context.close();
    throw error;
  }
};

const throwPageErrors = (pageErrors, label) => {
  if (pageErrors.length > 0) {
    throw new AggregateError(pageErrors, `${label} emitted an uncaught page error`);
  }
};

const inFreshPage = async (browser, url, label, run) => {
  const { context, page, pageErrors } = await openFreshPage(browser, url);
  try {
    const result = await run(page);
    throwPageErrors(pageErrors, label);
    return result;
  } finally {
    await context.close();
  }
};

const closeTo = (actual, expected, label, epsilon = 1e-5) => {
  assert.ok(
    Number.isFinite(actual) && Math.abs(actual - expected) <= epsilon,
    `${label}: expected ${expected}, received ${actual}`,
  );
};

const assertGeometryClose = (actual, expected, label) => {
  for (const field of ['x', 'y', 'scaleX', 'scaleY', 'angle', 'rotation']) {
    closeTo(actual[field], expected[field], `${label} ${field}`);
  }
};

const assertUprightMatrix = (matrix, label) => {
  closeTo(matrix.b, 0, `${label} x-axis rotation`);
  closeTo(matrix.c, 0, `${label} y-axis rotation`);
  assert.ok(matrix.a > 0, `${label} must keep the screen x-axis positive`);
  assert.ok(matrix.d > 0, `${label} must keep the screen y-axis positive`);
};

const appOptions = {
  autoStart: false,
  height: 600,
  resolution: 1,
  width: 800,
};

const disabledViewportMotion = {
  plugins: {
    decelerate: { disabled: true },
    drag: { disabled: true },
    pinch: { disabled: true },
    wheel: { disabled: true },
  },
};

const verifyViewContracts = async (browser, url) => {
  const observed = await inFreshPage(browser, url, 'view contracts', (page) =>
    page.evaluate(async ({ app, viewportOptions }) => {
      const { Patchmap } = window.__PATCHMAP_BROWSER_CONTRACTS__;
      const host = document.querySelector('#host');
      const patchmap = new Patchmap();
      const center = () => {
        const viewport = patchmap.viewport;
        const point = viewport.toWorld(
          viewport.screenWidth / 2,
          viewport.screenHeight / 2,
        );
        return { x: point.x, y: point.y };
      };

      try {
        await patchmap.init(host, { app, viewport: viewportOptions });
        const pluginAddReturn = patchmap.viewport.plugin.add({
          mouseEdges: { speed: 16, distance: 20, allowButtons: true },
        });
        const pluginFacade = {
          addReturnsViewport: pluginAddReturn === patchmap.viewport,
          added: Boolean(patchmap.viewport.plugins.get('mouse-edges', true)),
          paused: false,
          removed: false,
          started: false,
        };
        patchmap.viewport.plugin.stop('mouse-edges');
        pluginFacade.paused =
          patchmap.viewport.plugins.get('mouse-edges', true) == null &&
          Boolean(patchmap.viewport.plugins.get('mouse-edges'));
        patchmap.viewport.plugin.start('mouse-edges');
        pluginFacade.started = Boolean(
          patchmap.viewport.plugins.get('mouse-edges', true),
        );
        patchmap.viewport.plugin.remove('mouse-edges');
        pluginFacade.removed = patchmap.viewport.plugins.get('mouse-edges') == null;
        patchmap.draw([
          {
            type: 'rect',
            id: 'left',
            size: { width: 100, height: 60 },
            fill: '#0c73bf',
            attrs: { x: 100, y: 80 },
          },
          {
            type: 'rect',
            id: 'right',
            size: { width: 80, height: 40 },
            fill: '#ef4444',
            attrs: { x: 500, y: 300 },
          },
          { type: 'relations', id: 'relations', links: [] },
        ]);

        patchmap.viewport.setZoom(2, false);
        const explicitZoomBefore = patchmap.viewport.scale.x;
        patchmap.focus('left');
        const explicit = {
          center: center(),
          zoomAfter: patchmap.viewport.scale.x,
          zoomBefore: explicitZoomBefore,
        };

        const defaultZoomBefore = patchmap.viewport.scale.x;
        patchmap.focus();
        const defaults = {
          center: center(),
          zoomAfter: patchmap.viewport.scale.x,
          zoomBefore: defaultZoomBefore,
        };

        patchmap.draw([{
          type: 'rect',
          id: 'fit-target',
          size: { width: 200, height: 100 },
          fill: '#0c73bf',
          attrs: { x: 20, y: 30 },
        }]);
        patchmap.fit('fit-target');
        const defaultPaddingZoom = patchmap.viewport.scale.x;
        patchmap.fit('fit-target', { padding: 40 });
        const numericPaddingZoom = patchmap.viewport.scale.x;
        patchmap.fit('fit-target', { padding: { x: 50, y: 20 } });
        const axisPaddingZoom = patchmap.viewport.scale.x;

        let rejectsEdgePadding = false;
        try {
          patchmap.fit('fit-target', { padding: { top: 10 } });
        } catch (error) {
          rejectsEdgePadding = error?.name === 'ZodValidationError';
        }

        const fitTarget = patchmap.selector(
          '$..children[?(@.id==="fit-target")]',
        )[0];
        const screenBounds = () => {
          const bounds = fitTarget.getBounds();
          return {
            center: {
              x: bounds.x + bounds.width / 2,
              y: bounds.y + bounds.height / 2,
            },
            height: bounds.height,
            width: bounds.width,
          };
        };
        patchmap.rotation.value = 90;
        patchmap.flip.set({ x: true, y: false });
        patchmap.viewport.setZoom(2, false);
        patchmap.focus('fit-target');
        const transformedFocus = {
          bounds: screenBounds(),
          zoom: patchmap.viewport.scale.x,
        };
        patchmap.fit('fit-target', { padding: { x: 40, y: 30 } });
        const transformedFit = {
          bounds: screenBounds(),
          zoom: patchmap.viewport.scale.x,
        };

        return {
          axisPaddingZoom,
          defaultPaddingZoom,
          defaults,
          explicit,
          numericPaddingZoom,
          pluginFacade,
          rejectsEdgePadding,
          transformedFit,
          transformedFocus,
        };
      } finally {
        patchmap.destroy();
      }
    }, { app: appOptions, viewportOptions: disabledViewportMotion }));

  closeTo(observed.explicit.zoomAfter, observed.explicit.zoomBefore, 'explicit focus zoom');
  closeTo(observed.explicit.center.x, 150, 'explicit focus center x');
  closeTo(observed.explicit.center.y, 110, 'explicit focus center y');
  closeTo(observed.defaults.zoomAfter, observed.defaults.zoomBefore, 'default focus zoom');
  closeTo(observed.defaults.center.x, 340, 'default focus center x');
  closeTo(observed.defaults.center.y, 210, 'default focus center y');
  closeTo(observed.defaultPaddingZoom, 800 / 232, 'default fit padding zoom');
  closeTo(observed.numericPaddingZoom, 800 / 280, 'numeric fit padding zoom');
  closeTo(observed.axisPaddingZoom, 800 / 300, 'axis fit padding zoom');
  assert.deepEqual(observed.pluginFacade, {
    addReturnsViewport: true,
    added: true,
    paused: true,
    removed: true,
    started: true,
  });
  assert.equal(observed.rejectsEdgePadding, true, 'fit must reject edge padding keys');
  closeTo(observed.transformedFocus.zoom, 2, 'transformed focus zoom');
  closeTo(observed.transformedFocus.bounds.center.x, 400, 'transformed focus center x');
  closeTo(observed.transformedFocus.bounds.center.y, 300, 'transformed focus center y');
  closeTo(observed.transformedFit.zoom, 600 / 260, 'transformed fit zoom');
  closeTo(observed.transformedFit.bounds.center.x, 400, 'transformed fit center x');
  closeTo(observed.transformedFit.bounds.center.y, 300, 'transformed fit center y');
  closeTo(
    observed.transformedFit.bounds.width,
    100 * 600 / 260,
    'transformed fit width',
  );
  closeTo(
    observed.transformedFit.bounds.height,
    200 * 600 / 260,
    'transformed fit height',
  );
};

const verifyTransformerAssignmentLifecycle = async (browser, url) => {
  const observed = await inFreshPage(browser, url, 'transformer assignment lifecycle', (page) =>
    page.evaluate(async ({ app, viewportOptions }) => {
      const { Patchmap, Transformer } = window.__PATCHMAP_BROWSER_CONTRACTS__;
      const host = document.querySelector('#host');

      const initOptionMap = new Patchmap();
      const initOptionTransformer = new Transformer();
      await initOptionMap.init(host, {
        app,
        transformer: initOptionTransformer,
        viewport: viewportOptions,
      });
      const initOption = {
        attached: initOptionTransformer.parent === initOptionMap.viewport,
        selected: initOptionMap.transformer === initOptionTransformer,
      };
      initOptionMap.destroy();
      initOption.destroyed = initOptionTransformer.destroyed;

      const patchmap = new Patchmap();
      const beforeInit = new Transformer();
      patchmap.transformer = beforeInit;
      const beforeInitAssigned =
        patchmap.transformer === beforeInit && beforeInit.parent === null;
      await patchmap.init(host, { app, viewport: viewportOptions });
      const beforeInitAttached = beforeInit.parent === patchmap.viewport;

      const afterInit = new Transformer();
      patchmap.transformer = afterInit;
      const afterInitAssignment = {
        attached: afterInit.parent === patchmap.viewport,
        priorDestroyed: beforeInit.destroyed,
        selected: patchmap.transformer === afterInit,
      };

      const replacement = new Transformer();
      patchmap.transformer = replacement;
      const replacementAssignment = {
        attached: replacement.parent === patchmap.viewport,
        priorDestroyed: afterInit.destroyed,
        selected: patchmap.transformer === replacement,
      };
      patchmap.transformer = null;
      const nullAssignment = {
        priorDestroyed: replacement.destroyed,
        selected: patchmap.transformer === null,
      };

      const destroyTransformer = new Transformer();
      patchmap.transformer = destroyTransformer;
      const firstHistory = patchmap.undoRedoManager;
      patchmap.destroy();
      const destroyed = {
        canvasCount: host.querySelectorAll('canvas').length,
        historyRecreated: patchmap.undoRedoManager !== firstHistory,
        selected: patchmap.transformer === null,
        transformerDestroyed: destroyTransformer.destroyed,
      };

      const reinitTransformer = new Transformer();
      await patchmap.init(host, {
        app,
        transformer: reinitTransformer,
        viewport: viewportOptions,
      });
      const reinitialized = {
        attached: reinitTransformer.parent === patchmap.viewport,
        canvasCount: host.querySelectorAll('canvas').length,
        isInit: patchmap.isInit,
        selected: patchmap.transformer === reinitTransformer,
      };
      patchmap.destroy();
      reinitialized.destroyedWithMap = reinitTransformer.destroyed;
      reinitialized.finalCanvasCount = host.querySelectorAll('canvas').length;

      return {
        afterInitAssignment,
        beforeInitAssigned,
        beforeInitAttached,
        destroyed,
        initOption,
        nullAssignment,
        reinitialized,
        replacementAssignment,
      };
    }, { app: appOptions, viewportOptions: disabledViewportMotion }));

  assert.deepEqual(observed.initOption, {
    attached: true,
    destroyed: true,
    selected: true,
  });
  assert.equal(observed.beforeInitAssigned, true);
  assert.equal(observed.beforeInitAttached, true);
  assert.deepEqual(observed.afterInitAssignment, {
    attached: true,
    priorDestroyed: true,
    selected: true,
  });
  assert.deepEqual(observed.replacementAssignment, {
    attached: true,
    priorDestroyed: true,
    selected: true,
  });
  assert.deepEqual(observed.nullAssignment, {
    priorDestroyed: true,
    selected: true,
  });
  assert.deepEqual(observed.destroyed, {
    canvasCount: 0,
    historyRecreated: true,
    selected: true,
    transformerDestroyed: true,
  });
  assert.deepEqual(observed.reinitialized, {
    attached: true,
    canvasCount: 1,
    destroyedWithMap: true,
    finalCanvasCount: 0,
    isInit: true,
    selected: true,
  });
};

const verifyCanvasEventContracts = async (browser, url) => {
  const observed = await inFreshPage(browser, url, 'canvas-event contracts', (page) =>
    page.evaluate(async ({ app, viewportOptions }) => {
      const { Patchmap } = window.__PATCHMAP_BROWSER_CONTRACTS__;
      const host = document.querySelector('#host');
      const patchmap = new Patchmap();

      try {
        await patchmap.init(host, { app, viewport: viewportOptions });
        patchmap.draw([{
          type: 'group',
          id: 'group',
          children: [{
            type: 'rect',
            id: 'child',
            size: 40,
            fill: '#0c73bf',
            attrs: { x: 20, y: 30 },
          }],
        }]);
        const child = patchmap.selector('$..children[?(@.id==="child")]')[0];
        const initialChildMode = child.eventMode;
        let canvasHits = 0;
        let childHits = 0;

        const canvasId = patchmap.event.add({
          id: 'canvas-event',
          path: '$',
          action: 'click  tap click',
          fn: () => { canvasHits += 1; },
        });
        const childId = patchmap.event.add({
          id: 'child-event',
          path: '$..children[?(@.id==="child")]',
          action: 'pointerdown',
          fn: () => { childHits += 1; },
        });

        patchmap.viewport.emit('click', { target: patchmap.viewport });
        patchmap.viewport.emit('tap', { target: patchmap.viewport });
        child.emit('pointerdown', { target: child });
        const enabled = {
          canvasHits,
          childHits,
          childMode: child.eventMode,
          count: Object.keys(patchmap.event.getAll()).length,
          recordsEnabled: [
            patchmap.event.get(canvasId)?.enabled,
            patchmap.event.get(childId)?.enabled,
          ],
        };

        patchmap.event.off('canvas-event child-event');
        patchmap.viewport.emit('click', { target: patchmap.viewport });
        child.emit('pointerdown', { target: child });
        const disabled = {
          canvasHits,
          childHits,
          childMode: child.eventMode,
          recordsEnabled: [
            patchmap.event.get(canvasId)?.enabled,
            patchmap.event.get(childId)?.enabled,
          ],
        };

        patchmap.event.on('canvas-event child-event');
        patchmap.viewport.emit('click', { target: patchmap.viewport });
        child.emit('pointerdown', { target: child });
        const reenabled = { canvasHits, childHits, childMode: child.eventMode };
        const removed = patchmap.event.remove('child-event');
        child.emit('pointerdown', { target: child });
        const afterRemove = {
          childHits,
          childMode: child.eventMode,
          missing: patchmap.event.get('child-event') === undefined,
          removed,
        };

        patchmap.event.removeAll();
        const afterRemoveAll = {
          childMode: child.eventMode,
          count: Object.keys(patchmap.event.getAll()).length,
        };
        patchmap.event.add({
          id: 'draw-cleared',
          path: '$',
          action: 'click',
          fn: () => { canvasHits += 1; },
        });
        patchmap.draw([{ type: 'rect', id: 'replacement', size: 10 }]);

        return {
          afterRemove,
          afterRemoveAll,
          disabled,
          drawClearedCount: Object.keys(patchmap.event.getAll()).length,
          enabled,
          initialChildMode,
          reenabled,
        };
      } finally {
        patchmap.destroy();
      }
    }, { app: appOptions, viewportOptions: disabledViewportMotion }));

  assert.deepEqual(observed.enabled.recordsEnabled, [undefined, undefined]);
  assert.equal(observed.enabled.count, 2);
  assert.equal(observed.enabled.canvasHits, 2);
  assert.equal(observed.enabled.childHits, 1);
  assert.equal(observed.enabled.childMode, 'static');
  assert.deepEqual(observed.disabled.recordsEnabled, [undefined, undefined]);
  assert.equal(observed.disabled.canvasHits, 2);
  assert.equal(observed.disabled.childHits, 1);
  assert.equal(observed.disabled.childMode, observed.initialChildMode);
  assert.equal(observed.reenabled.canvasHits, 3);
  assert.equal(observed.reenabled.childHits, 2);
  assert.equal(observed.reenabled.childMode, 'static');
  assert.deepEqual(observed.afterRemove, {
    childHits: 2,
    childMode: observed.initialChildMode,
    missing: true,
    removed: undefined,
  });
  assert.deepEqual(observed.afterRemoveAll, {
    childMode: observed.initialChildMode,
    count: 0,
  });
  assert.equal(observed.drawClearedCount, 0, 'draw must clear canvas events');
};

const verifyControllerContracts = async (browser, url) => {
  const observed = await inFreshPage(browser, url, 'controller contracts', (page) =>
    page.evaluate(async ({ app, viewportOptions }) => {
      const { Patchmap } = window.__PATCHMAP_BROWSER_CONTRACTS__;
      const host = document.querySelector('#host');
      const patchmap = new Patchmap();
      let rotatedEvents = 0;
      let flippedEvents = 0;
      patchmap.on('patchmap:rotated', () => { rotatedEvents += 1; });
      patchmap.on('patchmap:flipped', () => { flippedEvents += 1; });

      const matrixOf = (node) => {
        patchmap.app.render();
        const matrix = node.worldTransform;
        return { a: matrix.a, b: matrix.b, c: matrix.c, d: matrix.d };
      };

      try {
        await patchmap.init(host, { app, viewport: viewportOptions });
        patchmap.draw([{
          type: 'item',
          id: 'item',
          size: { width: 120, height: 80 },
          attrs: { x: 100, y: 100, angle: 30 },
          components: [{
            type: 'text',
            id: 'copy',
            text: 'upright',
            style: { fontSize: 12 },
          }],
        }]);
        const copy = patchmap.selector('$..children[?(@.id==="copy")]')[0];

        patchmap.rotation.value = 60;
        const rotationUpright = {
          componentAngle: copy.angle,
          matrix: matrixOf(copy),
          value: patchmap.rotation.value,
          worldAngle: patchmap.world.angle,
        };
        const rotateByResult = patchmap.rotation.rotateBy(30);
        const rotationResetResult = patchmap.rotation.reset();

        patchmap.flip.x = true;
        const flipXUpright = {
          componentAngle: copy.angle,
          componentScale: { x: copy.scale.x, y: copy.scale.y },
          matrix: matrixOf(copy),
          value: { x: patchmap.flip.x, y: patchmap.flip.y },
          worldScale: { x: patchmap.world.scale.x, y: patchmap.world.scale.y },
        };
        const toggleYResult = patchmap.flip.toggleY();
        const bothFlipUpright = {
          componentScale: { x: copy.scale.x, y: copy.scale.y },
          matrix: matrixOf(copy),
          value: { x: patchmap.flip.x, y: patchmap.flip.y },
        };
        const flipResetResult = patchmap.flip.reset();

        return {
          bothFlipUpright,
          final: {
            flip: { x: patchmap.flip.x, y: patchmap.flip.y },
            rotation: patchmap.rotation.value,
            worldAngle: patchmap.world.angle,
            worldScale: { x: patchmap.world.scale.x, y: patchmap.world.scale.y },
          },
          flipResetResult,
          flipXUpright,
          flippedEvents,
          rotateByResult,
          rotatedEvents,
          rotationResetResult,
          rotationUpright,
          toggleYResult,
        };
      } finally {
        patchmap.destroy();
      }
    }, { app: appOptions, viewportOptions: disabledViewportMotion }));

  closeTo(observed.rotationUpright.componentAngle, -90, 'rotated component angle');
  closeTo(observed.rotationUpright.value, 60, 'rotation controller value');
  closeTo(observed.rotationUpright.worldAngle, 60, 'world rotation angle');
  assertUprightMatrix(observed.rotationUpright.matrix, 'rotated upright content');
  assert.equal(observed.rotateByResult, 90);
  assert.equal(observed.rotationResetResult, 0);
  assert.equal(observed.rotatedEvents, 3, 'each public rotation change must emit once');
  assert.deepEqual(observed.flipXUpright.value, { x: true, y: false });
  assert.deepEqual(observed.flipXUpright.worldScale, { x: -1, y: 1 });
  assert.deepEqual(observed.flipXUpright.componentScale, { x: -1, y: 1 });
  closeTo(observed.flipXUpright.componentAngle, -30, 'flipped component angle');
  assertUprightMatrix(observed.flipXUpright.matrix, 'x-flipped upright content');
  assert.deepEqual(observed.toggleYResult, { x: true, y: true });
  assert.deepEqual(observed.bothFlipUpright.value, { x: true, y: true });
  assert.deepEqual(observed.bothFlipUpright.componentScale, { x: -1, y: -1 });
  assertUprightMatrix(observed.bothFlipUpright.matrix, 'xy-flipped upright content');
  assert.deepEqual(observed.flipResetResult, { x: false, y: false });
  assert.equal(observed.flippedEvents, 3, 'each public flip change must emit once');
  assert.deepEqual(observed.final, {
    flip: { x: false, y: false },
    rotation: 0,
    worldAngle: 0,
    worldScale: { x: 1, y: 1 },
  });
};

const verifySelectionContracts = async (browser, url) => {
  const observed = await inFreshPage(browser, url, 'selection contracts', (page) =>
    page.evaluate(async ({ app, viewportOptions }) => {
      const { Patchmap } = window.__PATCHMAP_BROWSER_CONTRACTS__;
      const host = document.querySelector('#host');
      const patchmap = new Patchmap();
      const trace = {
        click: [],
        double: [],
        drag: [],
        dragEnd: [],
        dragStart: [],
        right: [],
      };

      try {
        await patchmap.init(host, { app, viewport: viewportOptions });
        patchmap.draw([
          {
            type: 'rect',
            id: 'first',
            size: { width: 80, height: 60 },
            fill: '#0c73bf',
            attrs: { x: 40, y: 40 },
          },
          {
            type: 'rect',
            id: 'second',
            size: { width: 70, height: 50 },
            fill: '#ef4444',
            attrs: { x: 220, y: 120 },
          },
        ]);
        const first = patchmap.selector('$..children[?(@.id==="first")]')[0];
        const selection = patchmap.stateManager.setState('selection', {
          draggable: true,
          onClick: (target) => trace.click.push(target?.id ?? null),
          onDoubleClick: (target) => trace.double.push(target?.id ?? null),
          onRightClick: (target) => trace.right.push(target?.id ?? null),
          onDragStart: (targets) => trace.dragStart.push(targets.map(({ id }) => id)),
          onDrag: (targets) => trace.drag.push(targets.map(({ id }) => id)),
          onDragEnd: (targets) => trace.dragEnd.push(targets.map(({ id }) => id)),
        });

        const emit = (name, event) => patchmap.viewport.emit(name, event);
        const point = (x, y) => patchmap.viewport.toGlobal({ x, y });
        emit('pointerdown', {
          target: first,
          global: point(50, 50),
          pointerId: 1,
          button: 0,
          detail: 1,
        });
        emit('pointerup', {
          target: first,
          global: point(50, 50),
          pointerId: 1,
          button: 0,
          detail: 1,
        });
        emit('pointerdown', {
          target: first,
          global: point(50, 50),
          pointerId: 2,
          button: 0,
          detail: 2,
        });
        emit('pointerup', {
          target: first,
          global: point(50, 50),
          pointerId: 2,
          button: 0,
          detail: 2,
        });

        let prevented = 0;
        emit('rightclick', {
          target: first,
          global: point(50, 50),
          preventDefault: () => { prevented += 1; },
          nativeEvent: { preventDefault: () => { prevented += 1; } },
        });

        emit('pointerdown', {
          target: patchmap.viewport,
          global: point(10, 10),
          pointerId: 3,
          button: 0,
          detail: 1,
        });
        emit('pointermove', {
          target: patchmap.viewport,
          global: point(320, 220),
          pointerId: 3,
          button: 0,
          detail: 1,
        });
        emit('pointerup', {
          target: patchmap.viewport,
          global: point(320, 220),
          pointerId: 3,
          button: 0,
          detail: 1,
        });

        const contextMenu = new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
        });
        patchmap.app.canvas.dispatchEvent(contextMenu);

        return {
          contextMenuPrevented: contextMenu.defaultPrevented,
          defaultRegistered: selection !== null,
          overlayRemoved: !patchmap.viewport.children.some(
            (child) => child.label === 'patch-map-selection-box',
          ),
          prevented,
          trace,
        };
      } finally {
        patchmap.destroy();
      }
    }, { app: appOptions, viewportOptions: disabledViewportMotion }));

  assert.equal(observed.defaultRegistered, true, 'selection must be registered by default');
  assert.deepEqual(observed.trace.click, ['first']);
  assert.deepEqual(observed.trace.double, ['first']);
  assert.deepEqual(observed.trace.right, ['first']);
  assert.equal(observed.prevented, 2, 'right-click must prevent both federated and native defaults');
  assert.deepEqual(observed.trace.dragStart, [['first', 'second']]);
  assert.deepEqual(observed.trace.dragEnd, [['first', 'second']]);
  assert.ok(observed.trace.drag.length >= 1, 'box selection must produce live drag callbacks');
  assert.deepEqual(observed.trace.drag.at(-1), ['first', 'second']);
  assert.equal(observed.overlayRemoved, true, 'selection overlay must be removed after pointerup');
  assert.equal(observed.contextMenuPrevented, true, 'canvas context menu must be suppressed');
};

const verifyTouchSelectionContracts = async (browser, url) => {
  const { context, page, pageErrors } = await openFreshPage(browser, url, {
    hasTouch: true,
    isMobile: true,
  });
  try {
    await page.evaluate(async ({ app, viewportOptions }) => {
      const { Patchmap } = window.__PATCHMAP_BROWSER_CONTRACTS__;
      const host = document.querySelector('#host');
      const patchmap = new Patchmap();
      const trace = { selectionClicks: [], viewportEvents: [] };
      await patchmap.init(host, { app, viewport: viewportOptions });
      patchmap.draw([{
        type: 'rect',
        id: 'touch-target',
        size: { width: 80, height: 60 },
        fill: '#0c73bf',
        attrs: { x: 40, y: 40 },
      }]);
      patchmap.stateManager.setState('selection', {
        onClick: (target, event) => {
          trace.selectionClicks.push({
            detail: event?.detail ?? null,
            nativeDetail: event?.nativeEvent?.detail ?? null,
            nativePointerType: event?.nativeEvent?.pointerType ?? null,
            nativeType: event?.nativeEvent?.type ?? null,
            pointerType: event?.pointerType ?? null,
            target: target?.id ?? null,
            type: event?.type ?? null,
          });
        },
      });
      for (const name of ['pointerdown', 'pointerup', 'click', 'pointertap', 'tap']) {
        patchmap.viewport.on(name, (event) => {
          trace.viewportEvents.push({
            detail: event?.detail ?? null,
            name,
            nativeDetail: event?.nativeEvent?.detail ?? null,
            nativePointerType: event?.nativeEvent?.pointerType ?? null,
            nativeType: event?.nativeEvent?.type ?? null,
            pointerType: event?.pointerType ?? null,
            target: event?.target?.id ?? event?.target?.label ?? null,
            type: event?.type ?? null,
          });
        });
      }
      patchmap.app.render();
      window.__PATCHMAP_TOUCH__ = { patchmap, trace };
    }, { app: appOptions, viewportOptions: disabledViewportMotion });

    const canvas = page.locator('#host canvas');
    const box = await canvas.boundingBox();
    assert.ok(box, 'touch canvas must have a browser bounding box');
    await page.touchscreen.tap(box.x + 60, box.y + 60);
    await page.waitForTimeout(20);
    const observed = await page.evaluate(() => ({
      ...window.__PATCHMAP_TOUCH__.trace,
    }));

    assert.deepEqual(
      observed.selectionClicks,
      [{
        detail: 1,
        nativeDetail: 0,
        nativePointerType: 'touch',
        nativeType: 'pointerup',
        pointerType: 'touch',
        target: 'touch-target',
        type: 'click',
      }],
      `touch tap must select exactly once: ${JSON.stringify(observed)}`,
    );
    assert.deepEqual(
      observed.viewportEvents.map(({
        detail,
        name,
        nativeDetail,
        nativePointerType,
        nativeType,
        pointerType,
        type,
      }) => ({
        detail,
        name,
        nativeDetail,
        nativePointerType,
        nativeType,
        pointerType,
        type,
      })),
      [
        {
          detail: null,
          name: 'pointerdown',
          nativeDetail: 0,
          nativePointerType: 'touch',
          nativeType: 'pointerdown',
          pointerType: 'touch',
          type: 'pointerdown',
        },
        {
          detail: null,
          name: 'pointerup',
          nativeDetail: 0,
          nativePointerType: 'touch',
          nativeType: 'pointerup',
          pointerType: 'touch',
          type: 'pointerup',
        },
        {
          detail: 1,
          name: 'tap',
          nativeDetail: 0,
          nativePointerType: 'touch',
          nativeType: 'pointerup',
          pointerType: 'touch',
          type: 'click',
        },
        {
          detail: 1,
          name: 'pointertap',
          nativeDetail: 0,
          nativePointerType: 'touch',
          nativeType: 'pointerup',
          pointerType: 'touch',
          type: 'click',
        },
      ],
      'touchscreen.tap must publish tap and pointertap without a duplicate click event',
    );
    throwPageErrors(pageErrors, 'touch selection contracts');
  } finally {
    await page.evaluate(() => window.__PATCHMAP_TOUCH__?.patchmap.destroy()).catch(() => {});
    await context.close();
  }
};

const verifyNativePointerAndTransformerContracts = async (browser, url) => {
  const { context, page, pageErrors } = await openFreshPage(browser, url);
  try {
    await page.evaluate(async ({ app, viewportOptions }) => {
      const { Patchmap } = window.__PATCHMAP_BROWSER_CONTRACTS__;
      const host = document.querySelector('#host');
      const patchmap = new Patchmap();
      const trace = {
        canvasDown: 0,
        clicks: [],
        doubles: [],
        dragEnd: [],
        over: [],
        refreshCount: 0,
        right: [],
        transforms: [],
        updateError: null,
      };
      await patchmap.init(host, { app, viewport: viewportOptions });
      patchmap.draw([
        {
          type: 'rect',
          id: 'native-first',
          size: { width: 80, height: 60 },
          fill: '#0c73bf',
          attrs: { x: 40, y: 40 },
        },
        {
          type: 'rect',
          id: 'native-second',
          size: { width: 70, height: 50 },
          fill: '#ef4444',
          attrs: { x: 220, y: 120 },
        },
      ]);
      const first = patchmap.selector(
        '$..children[?(@.id==="native-first")]',
      )[0];
      try {
        patchmap.update({ elements: first, emit: false });
      } catch (error) {
        trace.updateError = error?.name ?? String(error);
      }
      trace.refreshCount = patchmap.update({
        elements: first,
        refresh: true,
        emit: false,
      }).length;
      patchmap.stateManager.setState('selection', {
        draggable: true,
        onClick: (target) => trace.clicks.push(target?.id ?? null),
        onDoubleClick: (target) => trace.doubles.push(target?.id ?? null),
        onDragEnd: (targets) => trace.dragEnd.push(targets.map(({ id }) => id)),
        onOver: (target) => trace.over.push(target?.id ?? null),
        onRightClick: (target) => trace.right.push(target?.id ?? null),
      });
      patchmap.event.add({
        id: 'native-down',
        path: '$..children[?(@.id==="native-first")]',
        action: 'pointerdown',
        fn: () => { trace.canvasDown += 1; },
      });
      patchmap.app.render();
      const geometryOf = (node) => ({
        angle: node.angle,
        rotation: node.rotation,
        scaleX: node.scale.x,
        scaleY: node.scale.y,
        x: node.x,
        y: node.y,
      });
      trace.initialGeometry = geometryOf(first);
      window.__PATCHMAP_NATIVE_POINTER__ = { geometryOf, patchmap, trace };
    }, { app: appOptions, viewportOptions: disabledViewportMotion });

    const canvas = page.locator('#host canvas');
    const box = await canvas.boundingBox();
    assert.ok(box, 'native pointer canvas must have a browser bounding box');
    const at = (x, y) => ({ x: box.x + x, y: box.y + y });

    await page.mouse.move(at(60, 60).x, at(60, 60).y);
    await page.mouse.click(at(60, 60).x, at(60, 60).y);
    await page.mouse.move(at(10, 10).x, at(10, 10).y);
    await page.mouse.down();
    await page.mouse.move(at(320, 220).x, at(320, 220).y, { steps: 6 });
    await page.mouse.up();

    const interaction = await page.evaluate(() => ({
      ...window.__PATCHMAP_NATIVE_POINTER__.trace,
    }));
    assert.equal(
      interaction.canvasDown,
      1,
      `actual pointerdown must reach a managed handle: ${JSON.stringify(interaction)}`,
    );
    assert.deepEqual(interaction.clicks, ['native-first']);
    assert.ok(interaction.over.includes('native-first'));
    assert.deepEqual(interaction.dragEnd.at(-1), ['native-first', 'native-second']);
    assert.equal(interaction.updateError, 'TypeError');
    assert.equal(interaction.refreshCount, 1);

    await page.evaluate(() => {
      const { patchmap, trace } = window.__PATCHMAP_NATIVE_POINTER__;
      trace.viewportClickEvents = [];
      for (const name of ['click', 'dblclick', 'pointertap']) {
        patchmap.viewport.on(name, (event) => {
          trace.viewportClickEvents.push({
            clicks: event?.clicks ?? null,
            detail: event?.detail ?? null,
            name,
            nativeDetail: event?.nativeEvent?.detail ?? null,
            nativeType: event?.nativeEvent?.type ?? null,
            type: event?.type ?? null,
          });
        });
      }
    });
    await page.mouse.dblclick(at(60, 60).x, at(60, 60).y);
    await page.mouse.click(at(60, 60).x, at(60, 60).y, { button: 'right' });
    await page.waitForTimeout(20);
    const nativeClickTrace = await page.evaluate(() => {
      const { clicks, doubles, right, viewportClickEvents } =
        window.__PATCHMAP_NATIVE_POINTER__.trace;
      return { clicks, doubles, right, viewportClickEvents };
    });
    assert.deepEqual(
      nativeClickTrace.clicks,
      ['native-first', 'native-first'],
    );
    assert.deepEqual(nativeClickTrace.doubles, ['native-first']);
    assert.deepEqual(nativeClickTrace.right, ['native-first']);
    assert.deepEqual(
      nativeClickTrace.viewportClickEvents.map(({ detail, name }) => ({ detail, name })),
      [
        { detail: 1, name: 'click' },
        { detail: 1, name: 'pointertap' },
        { detail: 2, name: 'click' },
        { detail: 2, name: 'pointertap' },
        { detail: 1, name: 'pointertap' },
      ],
    );

    const resizeHandle = await page.evaluate(() => {
      const { Transformer } = window.__PATCHMAP_BROWSER_CONTRACTS__;
      const { patchmap, trace } = window.__PATCHMAP_NATIVE_POINTER__;
      patchmap.stateManager.resetState();
      const first = patchmap.selector('$..children[?(@.id==="native-first")]')[0];
      const transformer = new Transformer({
        elements: first,
        resizeHandles: true,
        rotateHandles: true,
        transformHistory: true,
      });
      transformer.on('transform', ({ kind, phase, historyId }) => {
        trace.transforms.push({ kind, phase, historyId });
      });
      patchmap.transformer = transformer;
      patchmap.app.render();
      const find = (node, label) => {
        if (node.label === label) return node;
        for (const child of node.children) {
          const found = find(child, label);
          if (found) return found;
        }
        return null;
      };
      window.__PATCHMAP_NATIVE_POINTER__.findTransformerNode = find;
      const handle = find(transformer, 'resize-handle:bottom-right');
      const global = handle.getGlobalPosition();
      return { x: global.x, y: global.y };
    });

    await page.mouse.move(at(resizeHandle.x, resizeHandle.y).x, at(resizeHandle.x, resizeHandle.y).y);
    await page.mouse.down();
    await page.mouse.move(
      at(resizeHandle.x + 40, resizeHandle.y + 30).x,
      at(resizeHandle.x + 40, resizeHandle.y + 30).y,
      { steps: 5 },
    );
    await page.mouse.up();
    await page.waitForTimeout(20);

    const rotateGeometry = await page.evaluate(() => {
      const {
        findTransformerNode,
        geometryOf,
        patchmap,
        trace,
      } = window.__PATCHMAP_NATIVE_POINTER__;
      patchmap.app.render();
      const transformer = patchmap.transformer;
      transformer.refresh();
      const handle = findTransformerNode(transformer, 'rotate-handle:bottom-right');
      const global = handle.getGlobalPosition();
      const first = patchmap.selector('$..children[?(@.id==="native-first")]')[0];
      trace.afterResizeGeometry = geometryOf(first);
      const bounds = first.getBounds();
      return {
        center: {
          x: bounds.x + bounds.width / 2,
          y: bounds.y + bounds.height / 2,
        },
        handle: { x: global.x, y: global.y },
      };
    });
    const vector = {
      x: rotateGeometry.handle.x - rotateGeometry.center.x,
      y: rotateGeometry.handle.y - rotateGeometry.center.y,
    };
    const rotationTarget = {
      x: rotateGeometry.center.x - vector.y,
      y: rotateGeometry.center.y + vector.x,
    };
    await page.mouse.move(
      at(rotateGeometry.handle.x, rotateGeometry.handle.y).x,
      at(rotateGeometry.handle.x, rotateGeometry.handle.y).y,
    );
    await page.mouse.down();
    await page.mouse.move(
      at(rotationTarget.x, rotationTarget.y).x,
      at(rotationTarget.x, rotationTarget.y).y,
      { steps: 5 },
    );
    await page.mouse.up();
    await page.waitForTimeout(20);

    const transformed = await page.evaluate(async () => {
      const { geometryOf, patchmap, trace } = window.__PATCHMAP_NATIVE_POINTER__;
      const first = patchmap.selector('$..children[?(@.id==="native-first")]')[0];
      const afterRotateGeometry = geometryOf(first);
      const observed = {
        angle: first.angle,
        canUndo: patchmap.undoRedoManager.canUndo(),
        historyDepth: patchmap.undoRedoManager.commands.length,
        historySequence: {
          afterResize: trace.afterResizeGeometry,
          afterRotate: afterRotateGeometry,
          initial: trace.initialGeometry,
        },
        position: { x: first.x, y: first.y },
        scale: { x: first.scale.x, y: first.scale.y },
        size: first.props.size,
        transforms: trace.transforms,
      };
      await patchmap.undoRedoManager.undo();
      observed.historySequence.afterUndoRotate = geometryOf(first);
      await patchmap.undoRedoManager.undo();
      observed.historySequence.afterUndoResize = geometryOf(first);
      observed.canUndoAfterBoth = patchmap.undoRedoManager.canUndo();
      observed.canRedoAfterBoth = patchmap.undoRedoManager.canRedo();
      await patchmap.undoRedoManager.redo();
      observed.historySequence.afterRedoResize = geometryOf(first);
      await patchmap.undoRedoManager.redo();
      observed.historySequence.afterRedoRotate = geometryOf(first);
      observed.canRedoAfterReplay = patchmap.undoRedoManager.canRedo();
      patchmap.destroy();
      return observed;
    });
    assert.deepEqual(transformed.scale, { x: 1, y: 1 });
    assert.ok(
      transformed.size.width > 80 && transformed.size.height > 60,
      'native resize must materialize larger semantic dimensions',
    );
    assert.ok(Math.abs(transformed.angle) > 45, 'native rotate drag must rotate the selection');
    assert.equal(transformed.canUndo, true, 'native transform gestures must create history');
    assert.equal(transformed.historyDepth, 2, 'resize and rotate must create two undo steps');
    assert.equal(transformed.canUndoAfterBoth, false);
    assert.equal(transformed.canRedoAfterBoth, true);
    assert.equal(transformed.canRedoAfterReplay, false);
    assertGeometryClose(
      transformed.historySequence.afterUndoRotate,
      transformed.historySequence.afterResize,
      'undo rotation',
    );
    assertGeometryClose(
      transformed.historySequence.afterUndoResize,
      transformed.historySequence.initial,
      'undo resize',
    );
    assertGeometryClose(
      transformed.historySequence.afterRedoResize,
      transformed.historySequence.afterResize,
      'redo resize',
    );
    assertGeometryClose(
      transformed.historySequence.afterRedoRotate,
      transformed.historySequence.afterRotate,
      'redo rotation',
    );
    assert.deepEqual(
      transformed.transforms.map(({ kind, phase }) => `${kind}:${phase}`),
      [
        'resize:start',
        'resize:change',
        'resize:change',
        'resize:change',
        'resize:change',
        'resize:change',
        'resize:end',
        'rotate:start',
        'rotate:change',
        'rotate:change',
        'rotate:change',
        'rotate:change',
        'rotate:change',
        'rotate:end',
      ],
    );
    assert.equal(new Set(
      transformed.transforms
        .filter(({ kind }) => kind === 'resize')
        .map(({ historyId }) => historyId),
    ).size, 1);
    assert.equal(new Set(
      transformed.transforms
        .filter(({ kind }) => kind === 'rotate')
        .map(({ historyId }) => historyId),
    ).size, 1);
    throwPageErrors(pageErrors, 'native pointer and transformer contracts');
  } finally {
    await page.evaluate(() => window.__PATCHMAP_NATIVE_POINTER__?.patchmap.destroy()).catch(() => {});
    await context.close();
  }
};

const verifyPendingInitCancellation = async (browser, url) => {
  const { context, page, pageErrors } = await openFreshPage(browser, url);
  let releaseAsset;
  const assetReleased = new Promise((resolveAsset) => { releaseAsset = resolveAsset; });
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );

  await context.route(/\/slow-asset\.png(?:\?|$)/u, async (route) => {
    await assetReleased;
    await route.fulfill({ body: png, contentType: 'image/png', status: 200 });
  });

  try {
    const request = page.waitForRequest(/\/slow-asset\.png(?:\?|$)/u);
    await page.evaluate(({ app, viewportOptions }) => {
      const { Patchmap } = window.__PATCHMAP_BROWSER_CONTRACTS__;
      const host = document.querySelector('#host');
      const patchmap = new Patchmap();
      let initialized = 0;
      patchmap.on('patchmap:initialized', () => { initialized += 1; });
      window.__PATCHMAP_PENDING_INSTANCE__ = patchmap;
      window.__PATCHMAP_PENDING_INITIALIZED__ = () => initialized;
      window.__PATCHMAP_PENDING_INIT__ = patchmap.init(host, {
        app,
        assets: { slow: '/slow-asset.png' },
        viewport: viewportOptions,
      });
    }, { app: appOptions, viewportOptions: disabledViewportMotion });
    await request;

    await page.evaluate(() => window.__PATCHMAP_PENDING_INSTANCE__.destroy());
    releaseAsset();
    const observed = await page.evaluate(async ({ app, viewportOptions }) => {
      const patchmap = window.__PATCHMAP_PENDING_INSTANCE__;
      const host = document.querySelector('#host');
      await window.__PATCHMAP_PENDING_INIT__;
      const cancelled = {
        appNull: patchmap.app === null,
        canvasCount: host.querySelectorAll('canvas').length,
        initialized: window.__PATCHMAP_PENDING_INITIALIZED__(),
        isInit: patchmap.isInit,
        viewportNull: patchmap.viewport === null,
        worldNull: patchmap.world === null,
      };

      await patchmap.init(host, { app, viewport: viewportOptions });
      const reinitialized = {
        canvasCount: host.querySelectorAll('canvas').length,
        isInit: patchmap.isInit,
      };
      patchmap.destroy();
      return {
        cancelled,
        finalCanvasCount: host.querySelectorAll('canvas').length,
        reinitialized,
      };
    }, { app: appOptions, viewportOptions: disabledViewportMotion });

    throwPageErrors(pageErrors, 'pending-init cancellation');
    assert.deepEqual(observed.cancelled, {
      appNull: true,
      canvasCount: 0,
      initialized: 0,
      isInit: false,
      viewportNull: true,
      worldNull: true,
    });
    assert.deepEqual(observed.reinitialized, { canvasCount: 1, isInit: true });
    assert.equal(observed.finalCanvasCount, 0);
  } finally {
    releaseAsset?.();
    await context.close();
  }
};

const verifySceneAssetAndAnimationContracts = async (browser, url) => {
  const { context, page, pageErrors } = await openFreshPage(browser, url);
  let releaseOld;
  let releaseDestroyed;
  const oldReleased = new Promise((resolveAsset) => { releaseOld = resolveAsset; });
  const destroyedReleased = new Promise((resolveAsset) => {
    releaseDestroyed = resolveAsset;
  });
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );
  await context.route(/\/(?:alias|scene-url|scene-inline|scene-new)\.?(?:png)?(?:\?|$)/u, (route) =>
    route.fulfill({ body: png, contentType: 'image/png', status: 200 }));
  await context.route(/\/scene-old\.png(?:\?|$)/u, async (route) => {
    await oldReleased;
    await route.fulfill({ body: png, contentType: 'image/png', status: 200 });
  });
  await context.route(/\/scene-destroyed\.png(?:\?|$)/u, async (route) => {
    await destroyedReleased;
    await route.fulfill({ body: png, contentType: 'image/png', status: 200 });
  });

  try {
    const basics = await page.evaluate(async ({ app, viewportOptions }) => {
      const { Patchmap } = window.__PATCHMAP_BROWSER_CONTRACTS__;
      const host = document.querySelector('#host');
      const patchmap = new Patchmap();
      window.__PATCHMAP_ASSET_INSTANCE__ = patchmap;
      const waitFor = async (predicate) => {
        const deadline = performance.now() + 5_000;
        while (!predicate()) {
          if (performance.now() >= deadline) throw new Error('asset wait timed out');
          await new Promise((resolveWait) => setTimeout(resolveWait, 10));
        }
      };

      await patchmap.init(host, {
        app,
        assets: { aliasTexture: '/alias.png' },
        viewport: viewportOptions,
      });
      patchmap.draw([{ type: 'image', id: 'alias-image', source: 'aliasTexture' }]);
      const aliasImage = patchmap.selector('$..children[?(@.id==="alias-image")]')[0];
      await waitFor(() => aliasImage.width === 1 && aliasImage.height === 1);
      const alias = { width: aliasImage.width, height: aliasImage.height };

      patchmap.draw([{ type: 'image', id: 'url-image', source: '/scene-url.png' }]);
      const urlImage = patchmap.selector('$..children[?(@.id==="url-image")]')[0];
      await waitFor(() => urlImage.width === 1 && urlImage.height === 1);
      const url = { width: urlImage.width, height: urlImage.height };

      patchmap.draw([{
        type: 'image',
        id: 'inline-image',
        source: { src: '/scene-inline', parser: 'texture' },
      }]);
      const inlineImage = patchmap.selector('$..children[?(@.id==="inline-image")]')[0];
      await waitFor(() => inlineImage.width === 1 && inlineImage.height === 1);
      const inline = { width: inlineImage.width, height: inlineImage.height };

      patchmap.draw([{
        type: 'item',
        id: 'rect-source-item',
        size: 20,
        components: [{
          type: 'background',
          id: 'rect-source',
          source: { type: 'rect', fill: '#fff' },
        }],
      }]);
      const rectSource = patchmap.selector('$..children[?(@.id==="rect-source")]')[0];
      return {
        alias,
        inline,
        rect: { width: rectSource.width, height: rectSource.height },
        url,
      };
    }, { app: appOptions, viewportOptions: disabledViewportMotion });

    assert.deepEqual(basics.alias, { width: 1, height: 1 });
    assert.deepEqual(basics.url, { width: 1, height: 1 });
    assert.deepEqual(basics.inline, { width: 1, height: 1 });
    assert.deepEqual(basics.rect, { width: 20, height: 20 });

    const oldRequest = page.waitForRequest(/\/scene-old\.png(?:\?|$)/u);
    await page.evaluate(() => {
      const patchmap = window.__PATCHMAP_ASSET_INSTANCE__;
      patchmap.draw([{ type: 'image', id: 'old-image', source: '/scene-old.png' }]);
      window.__PATCHMAP_OLD_IMAGE__ = patchmap.selector(
        '$..children[?(@.id==="old-image")]',
      )[0];
    });
    await oldRequest;
    await page.evaluate(() => {
      window.__PATCHMAP_ASSET_INSTANCE__.draw([{
        type: 'image',
        id: 'new-image',
        source: '/scene-new.png',
      }]);
    });
    releaseOld();
    const stale = await page.evaluate(async () => {
      const patchmap = window.__PATCHMAP_ASSET_INSTANCE__;
      const deadline = performance.now() + 5_000;
      let current;
      do {
        current = patchmap.selector('$..children[?(@.id==="new-image")]')[0];
        if (current?.width === 1) break;
        if (performance.now() >= deadline) throw new Error('new asset wait timed out');
        await new Promise((resolveWait) => setTimeout(resolveWait, 10));
      } while (true);
      await new Promise((resolveWait) => setTimeout(resolveWait, 30));
      return {
        currentId: current.id,
        currentWidth: current.width,
        oldDestroyed: window.__PATCHMAP_OLD_IMAGE__.destroyed,
        oldMatches: patchmap.selector('$..children[?(@.id==="old-image")]').length,
      };
    });
    assert.deepEqual(stale, {
      currentId: 'new-image',
      currentWidth: 1,
      oldDestroyed: true,
      oldMatches: 0,
    });

    const destroyedRequest = page.waitForRequest(/\/scene-destroyed\.png(?:\?|$)/u);
    await page.evaluate(() => {
      window.__PATCHMAP_ASSET_INSTANCE__.draw([{
        type: 'image',
        id: 'destroyed-image',
        source: '/scene-destroyed.png',
      }]);
    });
    await destroyedRequest;
    await page.evaluate(() => window.__PATCHMAP_ASSET_INSTANCE__.destroy());
    releaseDestroyed();

    const animation = await page.evaluate(async ({ app, viewportOptions }) => {
      const patchmap = window.__PATCHMAP_ASSET_INSTANCE__;
      const host = document.querySelector('#host');
      await patchmap.init(host, { app, viewport: viewportOptions });
      patchmap.draw([{
        type: 'item',
        id: 'animated-item',
        size: { width: 100, height: 50 },
        components: [{
          type: 'bar',
          id: 'animated-bar',
          source: { type: 'rect', fill: '#fff' },
          size: { width: '50%', height: '20%' },
          animationDuration: 300,
        }],
      }]);
      const bar = patchmap.selector('$..children[?(@.id==="animated-bar")]')[0];
      const renderLayer = patchmap.viewport.children.find(
        (child) => child.label === 'patch-map-aggregate-render-layer',
      );
      const initial = {
        liveWidth: bar.width,
        visualWidth: renderLayer.getLocalBounds().width,
      };
      await new Promise((resolveWait) => setTimeout(resolveWait, 400));
      patchmap.app.render();
      const settled = {
        liveWidth: bar.width,
        visualWidth: renderLayer.getLocalBounds().width,
      };
      const item = patchmap.selector('$..children[?(@.id==="animated-item")]')[0];
      patchmap.update({ elements: item, refresh: true, emit: false });
      patchmap.app.render();
      const refreshInitialWidth = renderLayer.getLocalBounds().width;
      await new Promise((resolveWait) => setTimeout(resolveWait, 400));
      patchmap.app.render();
      const refreshSettledWidth = renderLayer.getLocalBounds().width;
      patchmap.update({
        elements: item,
        changes: { size: { width: 200, height: 50 } },
        emit: false,
      });
      patchmap.app.render();
      const resizedInitialWidth = renderLayer.getLocalBounds().width;
      await new Promise((resolveWait) => setTimeout(resolveWait, 400));
      patchmap.app.render();
      const resizedSettledWidth = renderLayer.getLocalBounds().width;
      patchmap.destroy();
      return {
        finalCanvasCount: host.querySelectorAll('canvas').length,
        initial,
        refreshInitialWidth,
        refreshSettledWidth,
        resizedInitialWidth,
        resizedSettledWidth,
        settled,
      };
    }, { app: appOptions, viewportOptions: disabledViewportMotion });
    assert.equal(animation.initial.liveWidth, 1);
    assert.ok(animation.initial.visualWidth >= 1 && animation.initial.visualWidth < 10);
    assert.equal(animation.settled.liveWidth, 50);
    closeTo(animation.settled.visualWidth, 50, 'settled animated bar width', 0.5);
    assert.ok(animation.refreshInitialWidth < 10);
    closeTo(animation.refreshSettledWidth, 50, 'refreshed animated bar width', 0.5);
    closeTo(animation.resizedInitialWidth, 50, 'resized animated bar starting width', 0.5);
    closeTo(animation.resizedSettledWidth, 100, 'resized animated bar width', 0.5);
    assert.equal(animation.finalCanvasCount, 0);
    throwPageErrors(pageErrors, 'scene asset and animation contracts');
  } finally {
    releaseOld?.();
    releaseDestroyed?.();
    await context.close();
  }
};

const verifyRepeatedLifecycle = async (browser, url) => {
  const observed = await inFreshPage(browser, url, 'repeated lifecycle', (page) =>
    page.evaluate(async ({ app, viewportOptions }) => {
      const { Patchmap } = window.__PATCHMAP_BROWSER_CONTRACTS__;
      const host = document.querySelector('#host');
      const NativeResizeObserver = window.ResizeObserver;
      let activeObservers = 0;
      let currentObserver = null;
      let disconnects = 0;
      let observations = 0;

      class TrackingResizeObserver {
        active = false;
        callback;
        target = null;

        constructor(callback) {
          this.callback = callback;
          currentObserver = this;
        }

        observe(target) {
          if (this.active) return;
          this.active = true;
          this.target = target;
          activeObservers += 1;
          observations += 1;
        }

        trigger(width, height) {
          this.callback([{
            target: this.target,
            contentRect: { width, height },
          }], this);
        }

        disconnect() {
          if (!this.active) return;
          this.active = false;
          activeObservers -= 1;
          disconnects += 1;
        }
      }

      window.ResizeObserver = TrackingResizeObserver;
      const patchmap = new Patchmap();
      const cycles = [];
      try {
        patchmap.destroy();
        for (let index = 0; index < 3; index += 1) {
          await patchmap.init(host, { app, viewport: viewportOptions });
          const animationContextAtInit = patchmap.animationContext;
          currentObserver.trigger(320 + index, 240 + index);
          patchmap.draw([{
            type: 'rect',
            id: `cycle-${index}`,
            size: 30,
            attrs: { x: index * 10, y: index * 10 },
          }]);
          const node = patchmap.selector(`$..children[?(@.id==="cycle-${index}")]`)[0];
          const oldCanvas = patchmap.app.canvas;
          const oldViewport = patchmap.viewport;
          const oldWorld = patchmap.world;
          const rendererSize = {
            height: patchmap.app.screen.height,
            width: patchmap.app.screen.width,
          };
          const viewportSize = {
            height: oldViewport.screenHeight,
            width: oldViewport.screenWidth,
          };
          patchmap.theme.primary.default = '#123456';
          let animationContextAssignmentError = null;
          try {
            patchmap.animationContext = { cycle: index };
          } catch (error) {
            animationContextAssignmentError = error?.name ?? String(error);
          }
          patchmap.rotation.value = 30;
          patchmap.flip.set({ x: true, y: true });
          let canvasEventHits = 0;
          patchmap.event.add({
            id: `cycle-event-${index}`,
            path: '$',
            action: 'click',
            fn: () => { canvasEventHits += 1; },
          });
          patchmap.viewport.emit('click', { target: patchmap.viewport });
          const attachedContextMenu = new MouseEvent('contextmenu', {
            cancelable: true,
          });
          oldCanvas.dispatchEvent(attachedContextMenu);

          patchmap.destroy();
          oldViewport.emit('click', { target: oldViewport });
          const detachedContextMenu = new MouseEvent('contextmenu', {
            cancelable: true,
          });
          oldCanvas.dispatchEvent(detachedContextMenu);
          cycles.push({
            activeObservers,
            appNull: patchmap.app === null,
            attachedContextMenuPrevented: attachedContextMenu.defaultPrevented,
            canvasCount: host.querySelectorAll('canvas').length,
            canvasEventHits,
            detachedContextMenuPrevented: detachedContextMenu.defaultPrevented,
            eventCount: Object.keys(patchmap.event.getAll()).length,
            historyClean: !patchmap.undoRedoManager.canUndo() && !patchmap.undoRedoManager.canRedo(),
            isInit: patchmap.isInit,
            nodeDestroyed: node.destroyed,
            rendererSize,
            resetFlip: { x: patchmap.flip.x, y: patchmap.flip.y },
            animationContextAssignmentError,
            resetAnimationContext: patchmap.animationContext !== animationContextAtInit,
            resetRotation: patchmap.rotation.value,
            resetTheme: patchmap.theme.primary.default,
            stateManagerNull: patchmap.stateManager === null,
            viewportDestroyed: oldViewport.destroyed,
            viewportNull: patchmap.viewport === null,
            viewportSize,
            worldDestroyed: oldWorld.destroyed,
            worldNull: patchmap.world === null,
          });
        }
        return { activeObservers, cycles, disconnects, observations };
      } finally {
        patchmap.destroy();
        window.ResizeObserver = NativeResizeObserver;
      }
    }, { app: appOptions, viewportOptions: disabledViewportMotion }));

  assert.ok(observed.observations >= 3, 'every init must observe at least its host');
  assert.equal(
    observed.disconnects,
    observed.observations,
    'every observed resource must be disconnected',
  );
  assert.equal(observed.activeObservers, 0);
  for (const [index, cycle] of observed.cycles.entries()) {
    assert.deepEqual(cycle, {
      activeObservers: 0,
      animationContextAssignmentError: 'TypeError',
      appNull: true,
      attachedContextMenuPrevented: true,
      canvasCount: 0,
      canvasEventHits: 1,
      detachedContextMenuPrevented: false,
      eventCount: 0,
      historyClean: true,
      isInit: false,
      nodeDestroyed: true,
      rendererSize: { height: 240 + index, width: 320 + index },
      resetFlip: { x: false, y: false },
      resetAnimationContext: true,
      resetRotation: 0,
      resetTheme: '#0C73BF',
      stateManagerNull: true,
      viewportDestroyed: true,
      viewportNull: true,
      viewportSize: { height: 240 + index, width: 320 + index },
      worldDestroyed: true,
      worldNull: true,
    }, `lifecycle cycle ${index + 1}`);
  }
};

const main = async () => {
  const { server, url } = await startServer();
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    // Each area runs in a new BrowserContext so module state, Pixi resources,
    // DOM state, event handlers, and asset caches cannot leak between checks.
    await verifyViewContracts(browser, url);
    await verifyTransformerAssignmentLifecycle(browser, url);
    await verifyCanvasEventContracts(browser, url);
    await verifyControllerContracts(browser, url);
    await verifySelectionContracts(browser, url);
    await verifyTouchSelectionContracts(browser, url);
    await verifyNativePointerAndTransformerContracts(browser, url);
    await verifyPendingInitCancellation(browser, url);
    await verifySceneAssetAndAnimationContracts(browser, url);
    await verifyRepeatedLifecycle(browser, url);
    process.stdout.write(
      'PASS browser contracts (10 fresh sessions; opaque event payloads and relation-link schema excluded)\n',
    );
  } finally {
    await browser?.close();
    await server.close();
  }
};

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
