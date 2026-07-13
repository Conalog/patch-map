import { createScalingFixture } from './synthetic-fixture.js';

const host = document.querySelector('#host');
const entry = new URLSearchParams(globalThis.location.search).get('entry');
const { Patchmap } = await import(
  /* @vite-ignore */ entry ?? '/src/patchmap.js'
);

const measureScalingWorkload = async (itemCount) => {
  await releaseMemory();
  const heapBefore = readHeap();
  const patchmap = new Patchmap();
  const data = createScalingFixture(itemCount);
  let result;

  try {
    const initStartedAt = performance.now();
    await patchmap.init(host, {
      app: { resolution: 1 },
      viewport: { plugins: { decelerate: { disabled: true } } },
    });
    const initMs = performance.now() - initStartedAt;
    const initial = await measureInitialDraw(patchmap, data);
    globalThis.gc?.();
    const heapAfterDraw = readHeap();
    const items = flatten(
      patchmap.selector('$..children[?(@.type==="item")]'),
    ).filter((item) => item?.type === 'item');
    const update = await measureBulkUpdate(patchmap, items);

    globalThis.gc?.();
    const heapAfterUpdate = readHeap();
    result = {
      itemCount,
      initMs,
      initial,
      update,
      heapBeforeBytes: heapBefore,
      retainedHeapAfterDrawBytes:
        heapBefore === null || heapAfterDraw === null
          ? null
          : Math.max(0, heapAfterDraw - heapBefore),
      retainedHeapAfterUpdateBytes:
        heapBefore === null || heapAfterUpdate === null
          ? null
          : Math.max(0, heapAfterUpdate - heapBefore),
    };
  } finally {
    const teardownStartedAt = performance.now();
    patchmap.destroy();
    host.replaceChildren();
    const teardownSyncMs = performance.now() - teardownStartedAt;
    await releaseMemory();
    const heapAfterDestroy = readHeap();
    if (result) {
      result.teardownSyncMs = teardownSyncMs;
      result.postDestroyRetainedHeapBytes =
        heapBefore === null || heapAfterDestroy === null
          ? null
          : Math.max(0, heapAfterDestroy - heapBefore);
    }
  }

  return result;
};

const measureInitialDraw = async (patchmap, data) => {
  const startedAt = performance.now();

  patchmap.draw(data);

  const returnedAt = performance.now();
  patchmap.app.render();
  const renderedAt = performance.now();

  return {
    syncMs: returnedAt - startedAt,
    renderMs: renderedAt - returnedAt,
    totalMs: renderedAt - startedAt,
    scene: countScene(patchmap.world),
  };
};

const measureBulkUpdate = async (patchmap, items) => {
  const startedAt = performance.now();

  patchmap.update({
    elements: items,
    changes: {
      components: [
        {
          type: 'bar',
          size: { width: '72%', height: '68%' },
          tint: '#ef4444',
          animation: false,
        },
      ],
    },
    validateSchema: false,
    emit: false,
  });

  const returnedAt = performance.now();
  patchmap.app.render();
  const renderedAt = performance.now();
  return {
    targetedItems: items.length,
    syncMs: returnedAt - startedAt,
    renderMs: renderedAt - returnedAt,
    totalMs: renderedAt - startedAt,
    scene: countScene(patchmap.world),
  };
};

const countScene = (root) => {
  const byType = {};
  let managed = 0;
  let total = 0;
  const stack = [...(root?.children ?? [])];

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    total += 1;
    if (node.type) {
      managed += 1;
      byType[node.type] = (byType[node.type] ?? 0) + 1;
    }
    if (Array.isArray(node.children)) stack.push(...node.children);
  }

  return { managed, total, byType };
};

const flatten = (value) => {
  if (!Array.isArray(value)) return value ? [value] : [];
  return value.flatMap((item) => (Array.isArray(item) ? item : [item]));
};

const readHeap = () => performance.memory?.usedJSHeapSize ?? null;

const releaseMemory = async () => {
  host.replaceChildren();
  globalThis.gc?.();
  await new Promise((resolve) => requestAnimationFrame(resolve));
};

globalThis.patchMapPerf = { measureScalingWorkload };
globalThis.dispatchEvent(new Event('patchmap-perf-ready'));
