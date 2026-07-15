import { AggregatePixiRenderer, FlatEntityStore } from './core.mjs';

const COLORS = [0x2563eb, 0x16a34a, 0xdc2626, 0x9333ea, 0xea580c, 0x0891b2, 0x4f46e5, 0xca8a04];

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function now() {
  return performance.now();
}

function percentile(values, ratio) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)] ?? 0;
}

export function generateWorkload(count) {
  const columns = Math.ceil(Math.sqrt(count * (16 / 9)));
  const rows = Math.ceil(count / columns);
  const cellWidth = 900 / columns;
  const cellHeight = 500 / rows;
  const random = seededRandom(0xc0ffee ^ count);
  return Array.from({ length: count }, (_, index) => ({
    id: `generated-${count}-${index}`,
    type: index % 11 === 0 ? 'relations' : index % 5 === 0 ? 'grid' : 'item',
    attrs: {
      x: 12 + (index % columns) * cellWidth,
      y: 12 + Math.floor(index / columns) * cellHeight,
    },
    size: {
      width: Math.max(3, cellWidth - 2),
      height: Math.max(3, cellHeight - 2),
    },
    color: COLORS[index % COLORS.length],
    value: 0.15 + random() * 0.8,
    show: true,
  }));
}

function makeBulkPatches(store, seed) {
  const random = seededRandom(seed);
  const updateCount = Math.max(1, Math.ceil(store.count * 0.2));
  const patches = new Array(updateCount);
  for (let index = 0; index < updateCount; index += 1) {
    const slot = Math.floor(random() * store.count);
    patches[index] = {
      id: store.ids[slot],
      value: random(),
      color: COLORS[Math.floor(random() * COLORS.length)],
      selected: index % 17 === 0,
    };
  }
  return patches;
}

function makeAnimationPatches(store, seed, start) {
  const random = seededRandom(seed);
  const updateCount = Math.max(1, Math.ceil(store.count * 0.25));
  const patches = new Array(updateCount);
  for (let index = 0; index < updateCount; index += 1) {
    const slot = Math.floor(random() * store.count);
    patches[index] = {
      id: store.ids[slot],
      value: random(),
      animate: true,
      duration: 192,
    };
  }
  store.batchUpdate(patches, { now: start });
}

function readHeap() {
  return Number(performance.memory?.usedJSHeapSize ?? 0);
}

async function collectGarbage() {
  if (typeof globalThis.gc === 'function') {
    globalThis.gc();
    globalThis.gc();
  }
  await new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function benchmarkSample(dataset, { sampleIndex, animationFrames, hitTests }) {
  document.querySelectorAll('canvas').forEach((canvas) => canvas.remove());
  const inputFingerprint = JSON.stringify(dataset);
  const store = new FlatEntityStore({ chunkSize: 256, cellSize: 96 });

  let started = now();
  store.load(dataset);
  const load = now() - started;
  if (JSON.stringify(dataset) !== inputFingerprint) throw new Error('load mutated its input');

  started = now();
  const renderer = await AggregatePixiRenderer.create(store, { width: 960, height: 540 });
  const rendererInit = now() - started;
  started = now();
  const firstFlush = renderer.flush({ force: true });
  const firstRender = now() - started;

  const bulkPatches = makeBulkPatches(store, 0x51f15e ^ sampleIndex ^ store.count);
  const renderVersionBeforeUpdate = renderer.renderVersion;
  started = now();
  store.batchUpdate(bulkPatches);
  const bulkUpdateSync = now() - started;
  if (renderer.renderVersion !== renderVersionBeforeUpdate) {
    throw new Error('synchronous update crossed the explicit flush boundary');
  }
  started = now();
  const bulkFlush = renderer.flush();
  const bulkUpdateRender = now() - started;

  const animationStart = 10_000 + sampleIndex * 1_000;
  makeAnimationPatches(store, 0xa11ce ^ sampleIndex ^ store.count, animationStart);
  const animationFrameRaw = [];
  for (let frame = 1; frame <= animationFrames; frame += 1) {
    started = now();
    store.animateStep(animationStart + frame * (192 / animationFrames));
    renderer.flush();
    animationFrameRaw.push(now() - started);
  }

  const selected = new Set();
  const bounds = store.worldBounds;
  const random = seededRandom(0x7eed ^ sampleIndex ^ store.count);
  started = now();
  for (let index = 0; index < hitTests; index += 1) {
    const x = bounds.x + random() * bounds.width;
    const y = bounds.y + random() * bounds.height;
    const ref = store.hitTest(x, y);
    if (ref) selected.add(ref.id);
  }
  if (selected.size > 0) {
    store.batchUpdate([...selected].map((id) => ({ id, selected: true })));
  }
  const hitTestSelection = now() - started;

  const checksum = store.checksum();
  const heapBeforeDestroy = readHeap();
  started = now();
  renderer.destroy();
  store.destroy();
  const teardown = now() - started;
  await collectGarbage();
  const heapAfterDestroy = readHeap();

  return {
    load,
    rendererInit,
    firstRender,
    firstPaintTotal: rendererInit + firstRender,
    bulkUpdateSync,
    bulkUpdateRender,
    bulkUpdate: bulkUpdateSync + bulkUpdateRender,
    animationFrame: percentile(animationFrameRaw, 0.95),
    animationFrameRaw,
    hitTestSelection,
    teardown,
    retainedHeapDelta: heapAfterDestroy - heapBeforeDestroy,
    diagnostics: {
      checksum,
      selected: selected.size,
      surfaces: firstFlush.surfaces,
      firstRedrawnChunks: firstFlush.redrawnChunks,
      bulkRedrawnChunks: bulkFlush.redrawnChunks,
      heapBeforeDestroy,
      heapAfterDestroy,
    },
  };
}

function summarize(raw) {
  const metrics = [
    'load',
    'rendererInit',
    'firstRender',
    'firstPaintTotal',
    'bulkUpdateSync',
    'bulkUpdateRender',
    'bulkUpdate',
    'animationFrame',
    'hitTestSelection',
    'teardown',
    'retainedHeapDelta',
  ];
  return Object.fromEntries(metrics.map((metric) => {
    const values = raw.map((sample) => sample[metric]);
    const sorted = [...values].sort((a, b) => a - b);
    return [metric, {
      unit: metric === 'retainedHeapDelta' ? 'bytes' : 'ms',
      raw: values,
      min: sorted[0] ?? 0,
      median: percentile(sorted, 0.5),
      p95: percentile(sorted, 0.95),
      max: sorted.at(-1) ?? 0,
      noiseRatio: percentile(sorted, 0.5) === 0 ? null : percentile(sorted, 0.95) / percentile(sorted, 0.5),
    }];
  }));
}

async function verifyAtomicContract() {
  const dataset = generateWorkload(8);
  const store = new FlatEntityStore();
  store.load(dataset);
  const before = store.snapshot(dataset[0].id);
  const version = store.version;
  let rejected = false;
  try {
    store.batchUpdate([
      { id: dataset[0].id, value: 0.1 },
      { id: 'missing-id', value: 0.9 },
    ]);
  } catch {
    rejected = true;
  }
  const after = store.snapshot(dataset[0].id);
  const atomic = rejected && version === store.version && before.value === after.value;
  const ref = store.ref(dataset[0].id);
  store.load(dataset);
  const staleAfterReload = !store.isValidRef(ref);
  store.destroy();
  return {
    inputImmutable: true,
    atomicBatchRejection: atomic,
    staleRefAfterDestroy: !store.isValidRef(ref),
    staleRefAfterReload: staleAfterReload,
    explicitFlushBoundary: true,
  };
}

export async function runFlatPixiBenchmark({ workloads, warmups, samples, animationFrames, hitTests }) {
  const contractChecks = await verifyAtomicContract();
  if (Object.values(contractChecks).some((value) => value !== true)) {
    throw new Error(`contract check failed: ${JSON.stringify(contractChecks)}`);
  }
  const results = {};
  for (const workload of workloads) {
    const dataset = workload.dataset;
    const warmupRaw = [];
    for (let index = 0; index < warmups; index += 1) {
      warmupRaw.push(await benchmarkSample(dataset, {
        sampleIndex: -index - 1,
        animationFrames,
        hitTests,
      }));
    }
    const raw = [];
    for (let index = 0; index < samples; index += 1) {
      raw.push(await benchmarkSample(dataset, { sampleIndex: index, animationFrames, hitTests }));
    }
    results[workload.name] = {
      entityCount: dataset.length,
      warmupCount: warmups,
      sampleCount: samples,
      warmupRaw,
      raw,
      summary: summarize(raw),
    };
  }
  return { contractChecks, workloads: results };
}

globalThis.generateFlatPixiWorkload = generateWorkload;
globalThis.runFlatPixiBenchmark = runFlatPixiBenchmark;
globalThis.flatPixiReady = true;
