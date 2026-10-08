import type { PatchMapOperationsAuthority } from '../operations';
import type { PatchMapRuntimeDiagnosticsSnapshot } from '../operations/contracts';
import type { PatchMapRendererLossProbe } from '../rendering-port';
import type { NormalizedPatchMapElement } from '../semantic/dataset';
import {
  emptyPatchMapEngineSurfaceDebug,
  readPatchMapEngineSemanticProbe,
  type PatchMapEngineProductProbeReadPort,
} from './product-probe-reader';

type RuntimeDiagnosticsOperations = Pick<
  PatchMapOperationsAuthority,
  'isCollectionEnabled' | 'captureRuntimeDiagnostics' | 'probe'
>;

/** Reads one detached operational snapshot without owning runtime state. */
export function readPatchMapEngineRuntimeDiagnostics(
  state: PatchMapEngineProductProbeReadPort,
  operations: RuntimeDiagnosticsOperations,
  readLiveRendererLoss: () => PatchMapRendererLossProbe | null,
): PatchMapRuntimeDiagnosticsSnapshot {
  const lifecycle = state.lifecycle();
  if (!operations.isCollectionEnabled) {
    return operations.captureRuntimeDiagnostics({
      instanceId: state.instanceId(),
      lifecycle,
      backend: { kind: null, lossState: 'uncollected' },
      revisions: state.revisionStamp(),
      counts: {
        roots: 0,
        elements: 0,
        components: 0,
        materialized: 0,
        text: 0,
        relations: 0,
      },
      activeWork: {
        gestures: 0,
        animations: 0,
        pendingAssets: 0,
        pendingWork: 0,
      },
      resources: {
        canvases: 0,
        listeners: 0,
        observers: 0,
        tickers: 0,
        textureLeases: 0,
        callbackRegistrations: 0,
      },
      cleanup: {
        destroyed: lifecycle === 'destroyed',
        released: lifecycle === 'destroyed',
      },
    });
  }

  const semantic = readPatchMapEngineSemanticProbe(state);
  const viewport = state.viewportSnapshot();
  const surfaceDebug = state.surfaceDebug() ?? emptyPatchMapEngineSurfaceDebug(
    viewport.width,
    viewport.height,
    viewport.pixelRatio,
  );
  const assetProbe = state.assetProbe();
  const operationsProbe = operations.probe();
  const rendererLoss = readLiveRendererLoss() ?? state.terminalRendererLossProbe();
  const elements = semantic.scene.counts.elements;
  const components = semantic.scene.counts.components;
  const canvasCount = state.canvasCount();
  const pendingWork = state.pendingWork();

  return operations.captureRuntimeDiagnostics({
    instanceId: state.instanceId(),
    lifecycle,
    backend: {
      kind: state.rendererConfiguration()?.backend ?? rendererLoss?.backend ?? null,
      lossState: rendererLoss?.state ?? 'unavailable',
    },
    revisions: state.revisionStamp(),
    counts: {
      roots: semantic.scene.counts.rootElements,
      elements,
      components,
      materialized: elements + components,
      text: semantic.text.sourceCount,
      relations: countPatchMapRelationLinks(state.materialized()?.dataset ?? []),
    },
    activeWork: {
      gestures: surfaceDebug.activeGestureCount ?? 0,
      animations: surfaceDebug.activeAnimationCount,
      pendingAssets: assetProbe?.pendingCount ?? 0,
      pendingWork,
    },
    resources: {
      canvases: canvasCount,
      listeners: state.subscriptionCount(),
      observers:
        operationsProbe.diagnosticObserverCount + operationsProbe.telemetryObserverCount,
      tickers: 0,
      textureLeases: assetProbe?.leaseCount ?? 0,
      callbackRegistrations: operationsProbe.callbackRegistrations,
    },
    cleanup: {
      destroyed: lifecycle === 'destroyed',
      released:
        lifecycle === 'destroyed'
        && canvasCount === 0
        && pendingWork === 0
        && operationsProbe.callbackRegistrations === 0,
    },
  });
}

function countPatchMapRelationLinks(
  dataset: readonly NormalizedPatchMapElement[],
): number {
  let count = 0;
  const visit = (elements: readonly NormalizedPatchMapElement[]): void => {
    for (const element of elements) {
      if (element.type === 'relations') count += element.links.length;
      if (element.type === 'group') visit(element.children);
    }
  };
  visit(dataset);
  return count;
}
