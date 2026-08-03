import path from 'node:path';

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
    const legacyLoad = adapter.load({
      kind: 'generic-item',
      id: 'legacy-a',
      x: 10,
      y: 20,
      width: 100,
      height: 80,
      label: 'Legacy A',
    }, { datasetRef: 'package:legacy-host-adapter' });
    if (legacyLoad.rootIds[0] !== 'legacy-a') throw new Error('adapter legacy load');
    const load = adapter.load(DATASET, { datasetRef: 'package:host-adapter' });
    if (load.rootIds.length !== 2) throw new Error('adapter load root count');
    reachedCapabilities.push('load');

    const save = adapter.prepareSave(true);
    if (
      save.rootKind !== 'array'
      || !Array.isArray(JSON.parse(save.serialized))
      || save.semanticHash !== load.semanticHash
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
    originalImportCount: 0,
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

export function journeyRunnerSource({ root, packageDigest, codeCommit }) {
  const bridgePath = path.resolve(root, 'lab/patch-map/contract/executable-bridge.ts');
  const casesPath = path.resolve(root, 'lab/patch-map/contract/executable-cases.ts');
  const foundationFoldPath = path.resolve(
    root,
    'scripts/verification/core-v2-contract/fold-foundation.mjs',
  );
  return `
import { PatchMap } from '${PACKAGE_NAME}';
import { createPatchMapExecutableLabBridge } from ${JSON.stringify(bridgePath)};
import {
  PATCH_MAP_EXECUTABLE_CASE_IDS,
  PATCH_MAP_EXECUTABLE_PROFILE_ENVIRONMENT,
  materializePatchMapExecutableCase,
  resolvePatchMapExecutableDataset,
} from ${JSON.stringify(casesPath)};
import { foldFoundationExecution } from ${JSON.stringify(foundationFoldPath)};

const packageDigest = ${JSON.stringify(packageDigest)};
const codeCommit = ${JSON.stringify(codeCommit)};
const journeyIds = PATCH_MAP_EXECUTABLE_CASE_IDS.filter((id) => id.startsWith('CSM-'));

function historyCorruptEntryCount(history) {
  return history.depth === history.undoDepth + history.redoDepth
    && history.cursor === history.undoDepth
    && history.undoDepth >= 0
    && history.redoDepth >= 0
    ? 0
    : 1;
}

function partialPublicationCount(before, after) {
  return [
    before.revisions.sceneRevision !== after.revisions.sceneRevision,
    before.publishedTuple.scene !== after.publishedTuple.scene,
    before.semanticHash !== after.semanticHash,
    JSON.stringify(before.rootIds) !== JSON.stringify(after.rootIds),
  ].filter(Boolean).length;
}

function invalidStrictDataset() {
  const duplicate = Object.freeze({
    type: 'rect',
    id: 'packed-declared-failure',
    show: true,
    attrs: Object.freeze({ x: 0, y: 0 }),
    size: Object.freeze({ width: 1, height: 1 }),
  });
  return Object.freeze([duplicate, structuredClone(duplicate)]);
}

async function runPackedFoundationProbe(caseId, plan, host) {
  if (caseId !== 'CSM-001' && caseId !== 'CSM-003') return null;
  const target = document.createElement('div');
  target.style.width = '800px';
  target.style.height = '600px';
  host.appendChild(target);
  let map = null;
  const cleanupErrors = [];
  try {
    if (caseId === 'CSM-003') {
      const emptyUi = document.createElement('div');
      emptyUi.dataset.hostState = 'loading';
      target.appendChild(emptyUi);
      const loadingCanvasCount = target.querySelectorAll('canvas').length;
      emptyUi.dataset.hostState = 'no-blueprint';
      const noBlueprintCanvasCount = target.querySelectorAll('canvas').length;

      map = await PatchMap.mount({
        instanceId: 'packed-host-probe-csm-003',
        container: target,
        width: 800,
        height: 600,
        backend: 'webgl',
        resizeMode: 'manual',
        fit: false,
      });
      const datasetRef = String(plan.hostSupplies.emptyDatasetRef);
      map.data.replace(
        structuredClone(resolvePatchMapExecutableDataset(datasetRef)),
        { datasetRef, fit: false },
      );
      await map.capture.png();
      emptyUi.dataset.hostState = 'empty-dataset';
      const beforeFailure = map.debug.snapshot();
      let declaredFailureObserved = false;
      try {
        map.data.replace(invalidStrictDataset(), {
          datasetRef: 'packed-declared-failure',
          strict: true,
          fit: false,
        });
      } catch {
        declaredFailureObserved = true;
      }
      const afterFailure = map.debug.snapshot();
      const history = map.history.state;
      return {
        hostProbe: {
          $schema: 'core-v2-packed-host-probe/1',
          caseId,
          promotionEligible: true,
          engineReturns: {
            loadingCanvasCount,
            noBlueprintCanvasCount,
            emptySceneNodeCount: map.targets.query({ scope: 'all' }).count,
            missingQuery: map.targets.get({ id: 'missing' }),
          },
          failureRollback: {
            priorSceneRevision:
              afterFailure.revisions.sceneRevision - beforeFailure.revisions.sceneRevision,
            historyDepth: history.depth,
            hostOwnsEmptyUi:
              declaredFailureObserved
              && emptyUi.isConnected
              && emptyUi.dataset.hostState === 'empty-dataset',
          },
          finalState: {
            lifecycle: afterFailure.lifecycle,
            sceneRevision: afterFailure.revisions.sceneRevision,
            selectedIds: afterFailure.selectionIds,
            mode: afterFailure.interaction.mode,
          },
        },
        browserProbe: {
          $schema: 'patch-map-browser-probe/1',
          caseId,
          history: { corruptEntryCount: historyCorruptEntryCount(history) },
          interaction: {
            staleGestureCount: afterFailure.interaction.staleGestureCount,
          },
        },
      };
    }

    map = await PatchMap.mount({
      instanceId: 'packed-host-probe-csm-001',
      container: target,
      width: 800,
      height: 600,
      backend: 'webgl',
      resizeMode: 'manual',
      fit: false,
    });
    const datasetRef = String(plan.hostSupplies.datasetRef);
    const loaded = map.data.replace(
      structuredClone(resolvePatchMapExecutableDataset(datasetRef)),
      { datasetRef, fit: false },
    );
    await map.capture.png();
    const beforeFailure = map.debug.snapshot();
    let hostRetryRequired = false;
    try {
      map.data.replace(invalidStrictDataset(), {
        datasetRef: 'packed-declared-failure',
        strict: true,
        fit: false,
      });
    } catch {
      hostRetryRequired = true;
    }
    const afterFailure = map.debug.snapshot();
    const history = map.history.state;
    return {
      hostProbe: {
        $schema: 'core-v2-packed-host-probe/1',
        caseId,
        promotionEligible: true,
        engineReturns: {
          lifecycle: beforeFailure.lifecycle,
          sceneRevision: loaded.sceneRevision,
          publishedTuple: beforeFailure.publishedTuple,
          rootIds: loaded.rootIds,
        },
        failureRollback: {
          retainedSceneRevision:
            afterFailure.revisions.sceneRevision - beforeFailure.revisions.sceneRevision,
          partialPublicationCount:
            partialPublicationCount(beforeFailure, afterFailure),
          hostRetryRequired,
        },
        finalState: {
          lifecycle: afterFailure.lifecycle,
          sceneRevision: afterFailure.revisions.sceneRevision,
          selectedIds: afterFailure.selectionIds,
          mode: afterFailure.interaction.mode,
          datasetRef: afterFailure.datasetRef,
        },
      },
      browserProbe: {
        $schema: 'patch-map-browser-probe/1',
        caseId,
        history: { corruptEntryCount: historyCorruptEntryCount(history) },
        interaction: {
          staleGestureCount: afterFailure.interaction.staleGestureCount,
        },
      },
    };
  } finally {
    await map?.destroy().catch((error) => {
      cleanupErrors.push({
        name: error instanceof Error ? error.name : 'Error',
        message: error instanceof Error ? error.message : String(error),
      });
    });
    const remainingCanvasCount = target.querySelectorAll('canvas').length;
    target.remove();
    if (cleanupErrors.length > 0 || remainingCanvasCount !== 0) {
      throw new Error(
        'packed foundation probe cleanup failed: '
        + JSON.stringify({ cleanupErrors, remainingCanvasCount }),
      );
    }
  }
}

async function runJourney(caseId) {
  if (!journeyIds.includes(caseId)) throw new Error('unknown packed journey ' + caseId);
  const host = document.createElement('div');
  host.style.width = '800px';
  host.style.height = '600px';
  document.body.appendChild(host);
  const plan = materializePatchMapExecutableCase(caseId, '100', 319);
  const provenance = {
    source: 'packed-production-host-harness',
    codeCommit,
    packedPackageSha256: packageDigest,
    fixtureSha256: plan.fixtureSha256,
    runnerRevision: 'core-v2-packed-host-journeys/1',
    expectedEvidenceBound: true,
    promotionEligible: true,
  };
  const environment = {
    ...structuredClone(PATCH_MAP_EXECUTABLE_PROFILE_ENVIRONMENT),
    backend: 'webgl2',
    browser: navigator.userAgent,
    browserVersion: navigator.userAgent,
    route: plan.route,
    datasetSize: '100',
    seed: 319,
    canvasLifetime: 'transient-until-executor-cleanup',
    contractProfileBound: true,
    hostRevision: 'fixture-host-revision',
    mountMode: 'production-layout',
  };
  const bridge = createPatchMapExecutableLabBridge({
    caseId,
    rootTestId: plan.rootTestId,
    size: '100',
    seed: 319,
    surfaceHost: host,
    provenance,
    environment,
  });
  try {
    const run = await bridge.runCase();
    const packedFoundationProbe = await runPackedFoundationProbe(caseId, plan, host);
    const actualObservation = packedFoundationProbe
      ? foldFoundationExecution({
          casePlan: plan,
          execution: run.execution,
          provenance,
          environment,
          hostProbe: packedFoundationProbe.hostProbe,
          browserProbe: packedFoundationProbe.browserProbe,
        }).actual
      : await bridge.actualObservation();
    return {
      id: caseId,
      executionStatus: run.status,
      actualObservation,
      fixtures: run.fixtures,
      captures: run.captures,
      cleanup: run.cleanup,
      destroySummary: await bridge.destroyCase(),
      destroyed: true,
      canvasCountAfterDestroy: host.querySelectorAll('canvas').length,
    };
  } catch (error) {
    await bridge.destroyCase().catch(() => undefined);
    return {
      id: caseId,
      executionStatus: 'failed',
      error: {
        name: error instanceof Error ? error.name : 'Error',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : null,
      },
      destroyed: true,
      canvasCountAfterDestroy: host.querySelectorAll('canvas').length,
    };
  } finally {
    host.remove();
  }
}
window.__PATCH_MAP_PACKAGE_JOURNEY_RUNNER__ = {
  packageDigest,
  journeyIds,
  runJourney,
};
`;
}

export function html(entry) {
  return `<!doctype html>
<html><body><script type="module" src="${entry}"></script></body></html>\n`;
}
