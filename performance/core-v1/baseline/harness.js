import { Patchmap } from '/src/patchmap.ts';
import { materializeMapData } from '/src/model/materialize.ts';
import { buildManagedScene } from '/src/scene/build-scene.ts';
import { createScalingFixture } from '/scripts/perf/synthetic-fixture.js';

const host = document.querySelector('#host');
const fixtures = new Map();

const prepare = async (scenario) => {
  if (fixtures.has(scenario)) return describeFixture(fixtures.get(scenario));
  const input = scenario === 'production'
    ? await fetch('/lab/fixtures/production-like.json').then((response) => {
      if (!response.ok) throw new Error(`production fixture: HTTP ${response.status}`);
      return response.json();
    })
    : createScalingFixture(Number(scenario));
  fixtures.set(scenario, input);
  return describeFixture(input);
};

const measure = async (scenario) => {
  const input = fixtures.get(scenario);
  if (!input) throw new Error(`Scenario ${scenario} was not prepared`);

  host.replaceChildren();
  await releaseMemory();
  const heapBefore = readHeap();
  const patchmap = new Patchmap();
  let result;

  try {
    const initMs = await timeAsync(() => patchmap.init(host, initOptions));
    patchmap.app.stop();

    let normalized;
    const normalizeMs = timeSync(() => {
      normalized = materializeMapData(input);
    });
    let probeScene;
    const managedSceneBuildMs = timeSync(() => {
      probeScene = buildManagedScene(normalized, patchmap.theme);
    });
    const responsibilityCounts = {
      managedNodes: probeScene.all.length,
      roots: probeScene.roots.length,
    };
    const managedSceneDestroyMs = timeSync(() => {
      for (const root of probeScene.roots) root.destroy({ children: true });
      probeScene.all.length = 0;
      probeScene.roots.length = 0;
      probeScene.byId.clear();
      probeScene.byType.clear();
      probeScene.byLabel.clear();
    });
    normalized = null;
    probeScene = null;

    const loadMs = timeSync(() => patchmap.draw(input));
    const firstRenderMs = timeSync(() => patchmap.app.render());
    await releaseMemory(false);
    const heapAfterLoad = readHeap();

    const selectorStartedAt = performance.now();
    const items = patchmap.selector(
      '$..children[?(@.type==="item")]'
    ).filter((value) => value?.type === 'item');
    const itemLookupMs = performance.now() - selectorStartedAt;

    const trustedBulkUpdate = measureUpdateBoundary(patchmap, () => {
      patchmap.update({
        elements: items,
        changes: {
          components: [{
            type: 'bar',
            size: { width: '72%', height: '68%' },
            tint: '#ef4444',
            animation: false,
          }],
        },
        emit: false,
        validateSchema: false,
      });
    });

    const randomTargets = deterministicSubset(items, 0x51f15e, 0.1);
    const validatedRandomBulkUpdate = measureUpdateBoundary(patchmap, () => {
      patchmap.update({
        elements: randomTargets,
        changes: { attrs: { baselineRandomUpdate: true } },
        emit: false,
      });
    });

    const barAnimation = await measureBarAnimation(patchmap, items);
    const hitTestSelection = measureHitTestSelection(patchmap, items);

    await releaseMemory(false);
    const heapAfterWorkload = readHeap();
    result = {
      initMs,
      normalizeMs,
      managedSceneBuildMs,
      managedSceneDestroyMs,
      loadMs,
      firstRenderMs,
      itemLookupMs,
      trustedBulkUpdate,
      validatedRandomBulkUpdate: {
        ...validatedRandomBulkUpdate,
        targetedItems: randomTargets.length,
      },
      barAnimation,
      hitTestSelection,
      responsibilityCounts,
      publicScene: countScene(patchmap.world),
      retainedHeapAfterLoadBytes: heapDelta(heapBefore, heapAfterLoad),
      retainedHeapAfterWorkloadBytes: heapDelta(heapBefore, heapAfterWorkload),
    };
  } finally {
    const teardownStartedAt = performance.now();
    patchmap.destroy();
    const teardownMs = performance.now() - teardownStartedAt;
    host.replaceChildren();
    await releaseMemory();
    const heapAfterDestroy = readHeap();
    if (result) {
      result.teardownMs = teardownMs;
      result.postDestroyRetainedHeapBytes = heapDelta(heapBefore, heapAfterDestroy);
    }
  }
  return result;
};

const initOptions = {
  app: { antialias: false, autoStart: false, resolution: 1 },
  viewport: { plugins: { decelerate: { disabled: true } } },
};

const measureUpdateBoundary = (patchmap, update) => {
  const startedAt = performance.now();
  update();
  const returnedAt = performance.now();
  patchmap.app.render();
  const renderedAt = performance.now();
  return {
    syncMs: returnedAt - startedAt,
    renderMs: renderedAt - returnedAt,
    totalMs: renderedAt - startedAt,
  };
};

const measureBarAnimation = async (patchmap, items) => {
  const originalRaf = globalThis.requestAnimationFrame;
  const nativeRaf = originalRaf.bind(globalThis);
  const frameMs = [];
  let capture = true;

  globalThis.requestAnimationFrame = (callback) => nativeRaf((timestamp) => {
    const startedAt = performance.now();
    callback(timestamp);
    if (capture && patchmap.app) patchmap.app.render();
    if (capture) frameMs.push(performance.now() - startedAt);
  });

  let updateSyncMs;
  try {
    updateSyncMs = timeSync(() => patchmap.update({
      elements: items,
      changes: {
        components: [{
          type: 'bar',
          size: { width: '72%', height: '34%' },
          tint: '#0ea5e9',
          animation: true,
          animationDuration: 80,
        }],
      },
      emit: false,
      validateSchema: false,
    }));
    patchmap.app.render();
    await waitNativeFrames(nativeRaf, 10);
  } finally {
    capture = false;
    globalThis.requestAnimationFrame = originalRaf;
  }

  patchmap.update({
    elements: items,
    changes: { components: [{ type: 'bar', animation: false }] },
    emit: false,
    validateSchema: false,
  });
  patchmap.app.render();
  return { updateSyncMs, frameMs };
};

const measureHitTestSelection = (patchmap, items) => {
  const manager = patchmap.stateManager;
  let callbacks = 0;
  const setupMs = timeSync(() => manager.setState('selection', {
    onClick: () => { callbacks += 1; },
    selectUnit: 'entity',
  }));
  const rootBoundary = patchmap.app.renderer.events?.rootBoundary;
  if (rootBoundary && !rootBoundary.rootTarget) {
    rootBoundary.rootTarget = patchmap.app.stage;
  }
  const candidates = items.slice(0, Math.min(16, items.length));
  let nativeHitCount = 0;
  let fallbackCount = 0;
  let nativeHitErrors = 0;
  const startedAt = performance.now();
  for (let index = 0; index < candidates.length; index += 1) {
    const item = candidates[index];
    const bounds = item.getBounds();
    const global = {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2,
    };
    let hit = null;
    if (typeof rootBoundary?.hitTest === 'function') {
      try {
        hit = rootBoundary.hitTest(global.x, global.y);
      } catch {
        nativeHitErrors += 1;
      }
    }
    if (hit) nativeHitCount += 1;
    else fallbackCount += 1;
    const event = {
      button: 0,
      detail: 1,
      global,
      pointerId: index + 1,
      target: hit ?? item,
    };
    manager.dispatch('pointerdown', event);
    manager.dispatch('pointerup', { ...event, detail: 0 });
    manager.dispatch('click', event);
  }
  const batchMs = performance.now() - startedAt;
  manager.resetState();
  return {
    setupMs,
    operations: candidates.length,
    batchMs,
    perOperationMs: candidates.length > 0 ? batchMs / candidates.length : 0,
    callbacks,
    nativeHitCount,
    nativeHitErrors,
    fallbackCount,
  };
};

const deterministicSubset = (items, seed, ratio) => {
  const targetCount = Math.max(1, Math.floor(items.length * ratio));
  const selected = [];
  const used = new Set();
  let state = seed >>> 0;
  while (selected.length < targetCount && selected.length < items.length) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const index = state % items.length;
    if (used.has(index)) continue;
    used.add(index);
    selected.push(items[index]);
  }
  return selected;
};

const describeFixture = (input) => {
  let gridCells = 0;
  for (const element of input) {
    if (element?.type !== 'grid' || !Array.isArray(element.cells)) continue;
    for (const row of element.cells) {
      if (Array.isArray(row)) gridCells += row.length;
    }
  }
  return { topLevelElements: input.length, gridCells };
};

const countScene = (root) => {
  let managedNodes = 0;
  let totalNodes = 0;
  const stack = [...(root?.children ?? [])];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    totalNodes += 1;
    if (node.type) managedNodes += 1;
    if (Array.isArray(node.children)) stack.push(...node.children);
  }
  return { managedNodes, totalNodes };
};

const timeSync = (operation) => {
  const startedAt = performance.now();
  operation();
  return performance.now() - startedAt;
};

const timeAsync = async (operation) => {
  const startedAt = performance.now();
  await operation();
  return performance.now() - startedAt;
};

const readHeap = () => performance.memory?.usedJSHeapSize ?? null;
const heapDelta = (before, after) => before === null || after === null
  ? null
  : Math.max(0, after - before);

const waitNativeFrames = (raf, count) => new Promise((resolve) => {
  const next = () => {
    if (count-- <= 0) resolve();
    else raf(next);
  };
  next();
});

const releaseMemory = async (clearHost = true) => {
  if (clearHost) host.replaceChildren();
  globalThis.gc?.();
  await waitNativeFrames(globalThis.requestAnimationFrame.bind(globalThis), 2);
  globalThis.gc?.();
};

globalThis.compatibilityBaseline = { measure, prepare };
globalThis.dispatchEvent(new Event('compatibility-baseline-ready'));
