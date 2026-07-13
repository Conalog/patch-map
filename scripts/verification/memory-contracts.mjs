import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const harnessPath = '/__patchmap_memory_contracts__';
const timeout = 30_000;
const warmupCycles = 3;
const measuredCycles = 9;
const totalCycles = warmupCycles + measuredCycles;
const sceneSize = 240;

const harness = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>PATCH MAP memory contracts</title>
    <style>
      html, body { margin: 0; }
      #host { width: 640px; height: 480px; }
    </style>
  </head>
  <body>
    <div id="host"><span id="sentinel"></span></div>
    <script type="module">
      import { Patchmap, Transformer } from '/src/index.ts';
      window.__PATCHMAP_MEMORY_CONTRACTS__ = Object.freeze({ Patchmap, Transformer });
    </script>
  </body>
</html>`;

const median = (values) => {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? (ordered[middle - 1] + ordered[middle]) / 2
    : ordered[middle];
};

const startServer = async () => {
  const server = await createServer({
    appType: 'custom',
    configFile: false,
    logLevel: 'error',
    root,
    plugins: [{
      name: 'patchmap-memory-contract-harness',
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
  try {
    await server.listen();
    const address = server.httpServer?.address();
    if (!address || typeof address === 'string') {
      throw new Error('Vite did not expose a TCP address');
    }
    return {
      server,
      url: `http://127.0.0.1:${address.port}${harnessPath}`,
    };
  } catch (error) {
    await server.close().catch(() => undefined);
    throw error;
  }
};

const assertCycle = (cycle, index) => {
  const label = `memory lifecycle cycle ${index + 1}`;
  assert.deepEqual(cycle.before, {
    canvasConnected: true,
    canvasCount: 1,
    canvasEventHits: 1,
    contextMenuPrevented: true,
    historyCanUndo: true,
    hostChildCount: 2,
    isInit: true,
    libraryRootConnected: true,
    observerActive: true,
    stateManagerReady: true,
    transformerAttached: true,
  }, `${label} initialized public state`);
  assert.deepEqual(cycle.after, {
    appNull: true,
    canvasConnected: false,
    canvasCount: 0,
    canvasEventCount: 0,
    canvasEventHits: 1,
    contextMenuPrevented: false,
    destroyedEvents: 1,
    historyClean: true,
    historyDestroyedEvents: 1,
    historyRecreated: true,
    hostChildCount: 1,
    isInit: false,
    libraryRootConnected: false,
    managedNodeDestroyed: true,
    observerActive: false,
    sentinelConnected: true,
    stateDestroyedEvents: 1,
    stateManagerNull: true,
    transformerDestroyed: true,
    transformerNull: true,
    viewportDestroyed: true,
    viewportNull: true,
    worldDestroyed: true,
    worldNull: true,
  }, `${label} destroyed public state`);
};

const heapAfterGarbageCollection = async (client) => {
  await client.send('HeapProfiler.collectGarbage');
  await client.send('HeapProfiler.collectGarbage');
  const { metrics } = await client.send('Performance.getMetrics');
  const metric = metrics.find(({ name }) => name === 'JSHeapUsedSize');
  assert(
    Number.isFinite(metric?.value) && metric.value >= 0,
    'Chromium did not expose a finite JSHeapUsedSize after forced garbage collection',
  );
  return metric.value;
};

let server;
let browser;
let context;

try {
  const started = await startServer();
  ({ server } = started);
  browser = await chromium.launch({
    args: [
      '--enable-precise-memory-info',
      '--js-flags=--expose-gc',
    ],
    headless: true,
  });
  context = await browser.newContext({
    deviceScaleFactor: 1,
    viewport: { height: 600, width: 800 },
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  page.setDefaultTimeout(timeout);

  const { url } = started;
  const response = await page.goto(url, { waitUntil: 'load', timeout });
  assert(response?.ok(), `Harness request failed with status ${response?.status()}`);
  await page.waitForFunction(
    () => typeof window.__PATCHMAP_MEMORY_CONTRACTS__?.Patchmap === 'function',
  );

  await page.evaluate(() => {
    const NativeResizeObserver = window.ResizeObserver;
    const activeObservers = new Set();

    class TrackingResizeObserver {
      active = false;
      callback;
      target = null;

      constructor(callback) {
        this.callback = callback;
      }

      observe(target) {
        if (this.active) return;
        this.active = true;
        this.target = target;
        activeObservers.add(this);
      }

      disconnect() {
        if (!this.active) return;
        this.active = false;
        activeObservers.delete(this);
      }

      unobserve() {
        this.disconnect();
      }
    }

    window.ResizeObserver = TrackingResizeObserver;
    window.__PATCHMAP_MEMORY_STATE__ = {
      activeObservers,
      NativeResizeObserver,
      patchmap: new window.__PATCHMAP_MEMORY_CONTRACTS__.Patchmap(),
    };
  });

  const client = await context.newCDPSession(page);
  await client.send('Performance.enable');
  const heapSamples = [];
  const cycles = [];

  for (let index = 0; index < totalCycles; index += 1) {
    const cycle = await page.evaluate(async ({ cycleIndex, objectCount }) => {
      const { Transformer } = window.__PATCHMAP_MEMORY_CONTRACTS__;
      const memory = window.__PATCHMAP_MEMORY_STATE__;
      const patchmap = memory.patchmap;
      const host = document.querySelector('#host');
      const sentinel = document.querySelector('#sentinel');
      let destroyedEvents = 0;
      let historyDestroyedEvents = 0;
      let stateDestroyedEvents = 0;
      let canvasEventHits = 0;

      const transformer = new Transformer();
      patchmap.on('patchmap:destroyed', () => { destroyedEvents += 1; });
      await patchmap.init(host, {
        app: {
          autoStart: false,
          height: 480,
          resolution: 1,
          width: 640,
        },
        transformer,
      });

      const data = Array.from({ length: objectCount }, (_, itemIndex) => ({
        type: 'rect',
        id: `memory-${itemIndex}`,
        size: { height: 12, width: 12 },
        fill: itemIndex % 2 === 0 ? '#1099FF' : '#0C73BF',
        attrs: {
          x: (itemIndex % 24) * 14,
          y: Math.floor(itemIndex / 24) * 14,
        },
      }));
      patchmap.draw(data);
      const managedNode = patchmap.selector(
        '$..children[?(@.id==="memory-0")]',
      )[0];
      transformer.elements = managedNode;

      const stateManager = patchmap.stateManager;
      stateManager.on('state:destroyed', () => { stateDestroyedEvents += 1; });
      stateManager.setState('selection', { draggable: true });

      const history = patchmap.undoRedoManager;
      history.on('history:destroyed', () => { historyDestroyedEvents += 1; });
      patchmap.update({
        changes: { attrs: { x: cycleIndex + 1 } },
        elements: managedNode,
        emit: false,
        history: 'memory-history',
      });

      patchmap.event.add({
        action: 'click',
        fn: () => { canvasEventHits += 1; },
        id: 'memory-event',
        path: '$',
      });
      patchmap.viewport.emit('click', { target: patchmap.viewport });
      patchmap.app.render();

      const canvas = patchmap.app.canvas;
      const viewport = patchmap.viewport;
      const world = patchmap.world;
      const libraryRoot = [...host.children]
        .find((child) => child !== sentinel && child.contains(canvas));
      const attachedContextMenu = new MouseEvent('contextmenu', {
        cancelable: true,
      });
      canvas.dispatchEvent(attachedContextMenu);

      const before = {
        canvasConnected: canvas.isConnected,
        canvasCount: host.querySelectorAll('canvas').length,
        canvasEventHits,
        contextMenuPrevented: attachedContextMenu.defaultPrevented,
        historyCanUndo: history.canUndo(),
        hostChildCount: host.childElementCount,
        isInit: patchmap.isInit,
        libraryRootConnected: libraryRoot?.isConnected === true,
        observerActive: memory.activeObservers.size > 0,
        stateManagerReady: patchmap.stateManager === stateManager,
        transformerAttached: transformer.parent === patchmap.viewport,
      };

      patchmap.destroy();
      viewport.emit('click', { target: viewport });
      const detachedContextMenu = new MouseEvent('contextmenu', {
        cancelable: true,
      });
      canvas.dispatchEvent(detachedContextMenu);
      patchmap.destroy();

      const after = {
        appNull: patchmap.app === null,
        canvasConnected: canvas.isConnected,
        canvasCount: host.querySelectorAll('canvas').length,
        canvasEventCount: patchmap.event.getAll().length,
        canvasEventHits,
        contextMenuPrevented: detachedContextMenu.defaultPrevented,
        destroyedEvents,
        historyClean:
          history.commands.length === 0
          && !patchmap.undoRedoManager.canUndo()
          && !patchmap.undoRedoManager.canRedo(),
        historyDestroyedEvents,
        historyRecreated: patchmap.undoRedoManager !== history,
        hostChildCount: host.childElementCount,
        isInit: patchmap.isInit,
        libraryRootConnected: libraryRoot?.isConnected === true,
        managedNodeDestroyed: managedNode.destroyed,
        observerActive: memory.activeObservers.size > 0,
        sentinelConnected: sentinel.isConnected,
        stateDestroyedEvents,
        stateManagerNull: patchmap.stateManager === null,
        transformerDestroyed: transformer.destroyed,
        transformerNull: patchmap.transformer === null,
        viewportDestroyed: viewport.destroyed,
        viewportNull: patchmap.viewport === null,
        worldDestroyed: world.destroyed,
        worldNull: patchmap.world === null,
      };

      await new Promise((resolveFrame) => requestAnimationFrame(() => resolveFrame()));
      return { after, before };
    }, { cycleIndex: index, objectCount: sceneSize });

    assertCycle(cycle, index);
    cycles.push(cycle);
    heapSamples.push(await heapAfterGarbageCollection(client));
  }

  assert.equal(heapSamples.length, totalCycles, 'Every lifecycle cycle needs a heap sample');
  assert(
    heapSamples.every((sample) => Number.isFinite(sample) && sample >= 0),
    'Every post-destroy heap sample must be finite',
  );
  const measured = heapSamples.slice(warmupCycles);
  const earlyMedian = median(measured.slice(0, 3));
  const lateMedian = median(measured.slice(-3));
  const growth = lateMedian - earlyMedian;
  const allowedGrowth = Math.max(2 * 1024 * 1024, earlyMedian * 0.15);
  assert.ok(
    growth <= allowedGrowth,
    `Post-destroy heap grew ${growth} bytes; allowed ${allowedGrowth} bytes`,
  );
  const heapTrend = {
    allowedGrowthBytes: allowedGrowth,
    available: true,
    earlyMedianBytes: earlyMedian,
    growthBytes: growth,
    lateMedianBytes: lateMedian,
    measuredCycles,
    samplesBytes: heapSamples,
    source: 'CDP JSHeapUsedSize after two HeapProfiler.collectGarbage calls',
    warmupCycles,
  };

  await page.evaluate(() => {
    const memory = window.__PATCHMAP_MEMORY_STATE__;
    memory.patchmap.destroy();
    window.ResizeObserver = memory.NativeResizeObserver;
    delete window.__PATCHMAP_MEMORY_STATE__;
  });

  assert.deepEqual(pageErrors, [], 'Memory contracts emitted page errors');
  process.stdout.write(`${JSON.stringify({
    cycles: cycles.length,
    heapTrend,
    sceneSize,
    structuralLifecycle: 'passed',
  }, null, 2)}\n`);
} finally {
  const cleanupErrors = [];
  for (const [label, close] of [
    ['browser context', () => context?.close()],
    ['Chromium browser', () => browser?.close()],
    ['Vite server', () => server?.close()],
  ]) {
    try {
      await close();
    } catch (error) {
      cleanupErrors.push(new Error(`Failed to close ${label}`, { cause: error }));
    }
  }
  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, 'Memory contract cleanup failed');
  }
}
