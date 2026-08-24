import { Color, type ColorSource } from 'pixi.js';

import {
  createPatchMapColorResolver,
  materializePatchMapCompatibilityDataset,
  materializePatchMapGrid,
  resolvePatchMapComponentSize,
  resolvePatchMapContentBox,
  setPatchMapGridCell,
  type PatchMapEngineSnapshot,
  type PatchMapSemanticProductProbe,
} from '../../../../src/patch-map';
import {
  deepFreezePatchMapLabValue as deepFreeze,
  isPatchMapLabRecord as isRecord,
} from '../runtime-values';
import {
  patchMapExecutableInvariant as invariant,
} from './descriptor';

export const PATCH_MAP_DATA_FOUNDATION_PRODUCT = Object.freeze({
  createColorResolver: createPatchMapColorResolver,
  constructPixiColor(value: unknown): Color {
    return new Color(value as ColorSource);
  },
  resolveComponentSize: resolvePatchMapComponentSize,
  resolveContentBox: resolvePatchMapContentBox,
  materializeGrid: materializePatchMapGrid,
  setGridCell: setPatchMapGridCell,
});

export const PATCH_MAP_DATA_CLOSURE_PRODUCT = Object.freeze({
  materializeDataset(input: unknown): Readonly<Record<string, unknown>> {
    const compatible = materializePatchMapCompatibilityDataset(input);
    return deepFreeze({
      dataset: structuredClone(compatible.canonicalDataset),
      semanticHash: compatible.semanticHash,
    });
  },
});

export const PATCH_MAP_LIFECYCLE_DESTROY_PRODUCT = Object.freeze({
  inspectEngineResources(engine: unknown): Readonly<Record<string, unknown>> {
    const inspectable = requireInspectableEngine(engine);
    const snapshot = inspectable.snapshot();
    const semantic = inspectable.semanticProbe();
    // These are public logical counters only. pendingWork is the closest public
    // scheduler-work boundary; logicalDatasetRootCount is not a heap-retention
    // claim and stays zero only after the authoritative scene is released.
    return deepFreeze({
      dom: { canvasCount: snapshot.resources.canvasCount },
      subscriptions: { count: snapshot.resources.subscriptions.active },
      tickerTasks: { count: snapshot.pendingWork },
      animations: { count: semantic.interaction.activeAnimationCount ?? 0 },
      history: { depth: semantic.history.depth ?? snapshot.historyDepth },
      retained: {
        logicalDatasetRootCount: semantic.dataset.rootIds.length,
      },
    });
  },
});

interface InspectableEngine {
  snapshot(): PatchMapEngineSnapshot;
  semanticProbe(): PatchMapSemanticProductProbe;
}

function requireInspectableEngine(value: unknown): InspectableEngine {
  invariant(isRecord(value), 'lifecycle engine inspection target');
  invariant(typeof value.snapshot === 'function', 'lifecycle engine snapshot()');
  invariant(typeof value.semanticProbe === 'function', 'lifecycle engine semanticProbe()');
  return value as unknown as InspectableEngine;
}
