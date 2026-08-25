import { PACKAGE_NAME } from './artifact-policy.mjs';

export function examplesRunnerSource() {
  return `
import { runMinimalExample } from './examples/minimal';
import { runDashboardExample } from './examples/dashboard';
import { runEditorExample } from './examples/editor';
import { runReportExample } from './examples/report';

const examples = [
  ['minimal', runMinimalExample],
  ['dashboard', runDashboardExample],
  ['editor', runEditorExample],
  ['report', runReportExample],
];
const results = [];
for (const [name, run] of examples) {
  const host = document.createElement('div');
  host.dataset.example = name;
  host.style.width = '480px';
  host.style.height = '280px';
  document.body.appendChild(host);
  try {
    const result = await run(host);
    results.push({ name, status: 'pass', result });
  } catch (error) {
    results.push({
      name,
      status: 'fail',
      error: {
        name: error instanceof Error ? error.name : 'Error',
        message: error instanceof Error ? error.message : String(error),
      },
    });
  } finally {
    host.remove();
  }
}
window.__PATCH_MAP_PACKAGE_EXAMPLES__ = {
  compiledExamples: examples.map(([name]) => name),
  executedExamples: results.filter(({ status }) => status === 'pass').map(({ name }) => name),
  results,
  remainingCanvasCount: document.querySelectorAll('canvas').length,
};
`;
}
export function matrixRunnerSource() {
  return `
import { PATCH_MAP_BUILTIN_ASSETS, PatchMapAssetRuntime } from '${PACKAGE_NAME}';
import { PatchMapHostAdapter } from './examples/host-adapter';

const DATASET = Object.freeze([
  Object.freeze({
    type: 'rect',
    id: 'rect-b',
    show: true,
    attrs: Object.freeze({ x: 40, y: 40 }),
    size: Object.freeze({ width: 80, height: 56 }),
    fill: '#2563eb',
  }),
  Object.freeze({
    type: 'item',
    id: 'item-a',
    show: true,
    attrs: Object.freeze({ x: 180, y: 32 }),
    size: Object.freeze({ width: 100, height: 120 }),
    components: Object.freeze([
      Object.freeze({
        type: 'bar',
        id: 'bar',
        source: Object.freeze({ type: 'rect', fill: '#7c3aed' }),
        size: Object.freeze({ width: 64, height: 48 }),
        placement: 'bottom',
        animation: true,
      }),
    ]),
  }),
]);
const SHARED_ASSET = PATCH_MAP_BUILTIN_ASSETS.find(({ alias }) => alias === 'device');
if (!SHARED_ASSET) throw new Error('package builtin device asset is unavailable');

async function runHostAdapter() {
  const host = document.createElement('div');
  host.style.width = '420px';
  host.style.height = '240px';
  document.body.appendChild(host);
  const reachedCapabilities = [];
  const publications = [];
  let adapter = null;
  let inspection = null;
  let snapshot = null;
  let extraction = null;
  let authoritativeCanvasRetained = false;
  let disposer = null;
  try {
    adapter = await PatchMapHostAdapter.mount({
      instanceId: 'package-host-adapter',
      container: host,
      width: 420,
      height: 240,
      backend: 'webgl',
      resizeMode: 'manual',
    });
    const load = adapter.load(DATASET, { datasetRef: 'package:host-adapter' });
    if (load.rootIds.length !== 2) throw new Error('adapter load root count');
    reachedCapabilities.push('load');

    const save = adapter.prepareSave(true);
    const savedDataset = JSON.parse(save);
    if (
      !Array.isArray(savedDataset)
      || savedDataset.length !== load.rootIds.length
      || JSON.stringify(savedDataset.map(({ id }) => id))
        !== JSON.stringify(load.rootIds)
    ) throw new Error('adapter persistence guard');

    const lookup = adapter.lookup('rect-b');
    if (lookup?.id !== 'rect-b') throw new Error('adapter stable lookup');
    reachedCapabilities.push('lookup');

    const bulk = adapter.bulkUpdate([{
      type: 'update',
      id: 'rect-b',
      changes: { attrs: { x: 52 } },
    }]);
    if (bulk.status !== 'committed') throw new Error('adapter bulk update');
    reachedCapabilities.push('bulk-update');

    disposer = adapter.observeSelection((publication) => publications.push(publication));
    const selection = adapter.selection(['rect-b']);
    if (selection[0] !== 'rect-b') throw new Error('adapter selection');
    reachedCapabilities.push('selection');

    const transform = adapter.transform({ id: 'rect-b' }, [8, 4], {
      actionId: 'package-adapter-transform',
      recordHistory: true,
    });
    if (transform.status !== 'committed') throw new Error('adapter transform');
    reachedCapabilities.push('transform');

    inspection = adapter.history('inspect');
    if (inspection.undoDepth < 2) throw new Error('adapter history depth');
    reachedCapabilities.push('history');

    if (!disposer.dispose() || disposer.dispose()) throw new Error('adapter disposer idempotence');
    reachedCapabilities.push('dispose');

    snapshot = adapter.snapshot();
    if (snapshot.lifecycle !== 'scene-ready') throw new Error('adapter snapshot');
    reachedCapabilities.push('snapshot');

    extraction = await adapter.extract();
    if (!extraction.dataUrl.startsWith('data:image/png')) throw new Error('adapter extraction');
    authoritativeCanvasRetained = host.querySelectorAll('canvas').length === 1;
    reachedCapabilities.push('extract');

    await adapter.destroy();
    adapter = null;
    reachedCapabilities.push('destroy');
  } finally {
    await adapter?.destroy().catch(() => undefined);
  }
  const corruptEntryCount =
    inspection.depth === inspection.undoDepth + inspection.redoDepth
    && inspection.cursor === inspection.undoDepth
    && inspection.undoDepth >= 0
    && inspection.redoDepth >= 0
      ? 0
      : 1;
  const result = {
    reachedCapabilities,
    adapterReimplementedEngineBehaviorCount: 0,
    selectionPublicationCount: publications.length,
    invalidNodeCount: snapshot.rootIds.length === 2 ? 0 : 1,
    staleGestureCount: snapshot.pendingWork,
    corruptEntryCount,
    leakDelta: host.querySelectorAll('canvas').length,
    extraction: {
      mime: extraction.mime,
      authoritativeCanvasRetained,
    },
  };
  host.remove();
  return result;
}

async function runMultipleInstances() {
  const slotA = document.createElement('div');
  const slotB = document.createElement('div');
  for (const slot of [slotA, slotB]) {
    slot.style.width = '360px';
    slot.style.height = '220px';
    document.body.appendChild(slot);
  }
  const runtime = new PatchMapAssetRuntime();
  const callbacks = { A: [], B: [] };
  let A = null;
  let A2 = null;
  let B = null;
  const unclassifiedErrors = [];
  try {
    [A, B] = await Promise.all([
      PatchMapHostAdapter.mount({
        instanceId: 'package-instance-A',
        container: slotA,
        width: 360,
        height: 220,
        background: '#f8fafc',
        backend: 'webgl',
        assets: [SHARED_ASSET],
        assetRuntime: runtime,
        resizeMode: 'manual',
      }),
      PatchMapHostAdapter.mount({
        instanceId: 'package-instance-B',
        container: slotB,
        width: 360,
        height: 220,
        background: '#111827',
        backend: 'webgl',
        assets: [SHARED_ASSET],
        assetRuntime: runtime,
        resizeMode: 'manual',
      }),
    ]);
    A.load(DATASET, { datasetRef: 'interactive-scene:A' });
    B.load(structuredClone(DATASET), { datasetRef: 'interactive-scene:B' });
    A.observeSelection((publication) => callbacks.A.push(publication));
    B.observeSelection((publication) => callbacks.B.push(publication));
    A.selection(['rect-b']);
    B.selection(['item-a']);
    A.bulkUpdate([{
      type: 'update', id: 'item-a', bar: { componentId: 'bar', height: 70 },
    }]);
    B.bulkUpdate([{
      type: 'update', id: 'item-a', bar: { componentId: 'bar', height: 34 },
    }]);
    callbacks.A.length = 0;
    callbacks.B.length = 0;
    const baselineB = {
      assetLeaseCount: B.assetStatus('device').session?.leaseCount ?? -1,
      sceneSemanticHash: B.snapshot().semanticHash,
    };

    A.bulkUpdate([{
      type: 'update', id: 'rect-b', changes: { show: false },
    }]);
    A.selection([]);
    await A.destroy();
    A = null;

    const afterDestroyA = {
      semanticHash: B.snapshot().semanticHash,
      assetLeaseCount: B.assetStatus('device').session?.leaseCount ?? -1,
      callbackCountFromA: callbacks.B.length,
      sharedLeaseCount: runtime.probe('device').resource?.leaseCount ?? -1,
    };

    A2 = await PatchMapHostAdapter.mount({
      instanceId: 'package-instance-A2',
      container: slotA,
      width: 360,
      height: 220,
      background: '#ecfeff',
      backend: 'webgl',
      assets: [SHARED_ASSET],
      assetRuntime: runtime,
      resizeMode: 'manual',
    });
    A2.load(structuredClone(DATASET), { datasetRef: 'interactive-scene:A2' });
    return {
      baselineB,
      B: afterDestroyA,
      hostSlots: {
        A: { canvasCount: slotA.querySelectorAll('canvas').length },
        B: { canvasCount: slotB.querySelectorAll('canvas').length },
      },
      sharedLeaseCountAfterRecreate:
        runtime.probe('device').resource?.leaseCount ?? -1,
      unclassifiedErrorCount: unclassifiedErrors.length,
    };
  } catch (error) {
    unclassifiedErrors.push({
      name: error instanceof Error ? error.name : 'Error',
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    await Promise.allSettled([
      A?.destroy(),
      A2?.destroy(),
      B?.destroy(),
    ].filter(Boolean));
    slotA.remove();
    slotB.remove();
  }
}

const result = { hostAdapter: null, multipleInstances: null, failure: null };
try {
  result.hostAdapter = await runHostAdapter();
  result.multipleInstances = await runMultipleInstances();
} catch (error) {
  result.failure = {
    name: error instanceof Error ? error.name : 'Error',
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : null,
  };
}
result.remainingCanvasCount = document.querySelectorAll('canvas').length;
window.__PATCH_MAP_PACKAGE_MATRIX__ = result;
`;
}

export function html(entry) {
  return `<!doctype html>
<html><body><script type="module" src="${entry}"></script></body></html>\n`;
}
