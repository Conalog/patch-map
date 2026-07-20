import { Color, type ColorSource } from 'pixi.js';

import {
  createCoreV2ColorResolver,
  materializeCoreV2Dataset,
  materializeCoreV2Grid,
  resolveCoreV2ComponentSize,
  resolveCoreV2ContentBox,
  setCoreV2GridCell,
  type CoreV2EngineSnapshot,
  type CoreV2SemanticProductProbe,
} from '../../../src/core-v2';

// @ts-expect-error -- committed browser-safe action modules are authored as ESM JavaScript.
import * as foundationHandlersModule from '../../../scripts/verification/core-v2-contract/handlers/foundation.mjs';
// @ts-expect-error -- committed browser-safe action modules are authored as ESM JavaScript.
import * as emptyStateHandlersModule from '../../../scripts/verification/core-v2-contract/handlers/empty-state.mjs';
// @ts-expect-error -- committed browser-safe action modules are authored as ESM JavaScript.
import * as dataFoundationHandlersModule from '../../../scripts/verification/core-v2-contract/handlers/data-foundation.mjs';
// @ts-expect-error -- committed browser-safe action modules are authored as ESM JavaScript.
import * as dataClosureHandlersModule from '../../../scripts/verification/core-v2-contract/handlers/data-closure.mjs';
// @ts-expect-error -- committed browser-safe action modules are authored as ESM JavaScript.
import * as lifecycleResizeHandlersModule from '../../../scripts/verification/core-v2-contract/handlers/lifecycle-resize.mjs';
// @ts-expect-error -- committed browser-safe action modules are authored as ESM JavaScript.
import * as lifecycleDestroyHandlersModule from '../../../scripts/verification/core-v2-contract/handlers/lifecycle-destroy.mjs';
// @ts-expect-error -- committed browser-safe action modules are authored as ESM JavaScript.
import * as renderFoundationHandlersModule from '../../../scripts/verification/core-v2-contract/handlers/render-foundation.mjs';
// @ts-expect-error -- committed browser-safe action modules are authored as ESM JavaScript.
import * as renderBoundsHandlersModule from '../../../scripts/verification/core-v2-contract/handlers/render-bounds.mjs';
// @ts-expect-error -- committed browser-safe action modules are authored as ESM JavaScript.
import * as renderOrientationHandlersModule from '../../../scripts/verification/core-v2-contract/handlers/render-orientation.mjs';
// @ts-expect-error -- committed browser-safe action modules are authored as ESM JavaScript.
import * as renderRelationsHandlersModule from '../../../scripts/verification/core-v2-contract/handlers/render-relations.mjs';
// @ts-expect-error -- committed browser-safe folds are authored as ESM JavaScript.
import * as foundationFoldModule from '../../../scripts/verification/core-v2-contract/fold-foundation.mjs';
// @ts-expect-error -- committed browser-safe folds are authored as ESM JavaScript.
import * as dataFoundationFoldModule from '../../../scripts/verification/core-v2-contract/fold-data-foundation.mjs';
// @ts-expect-error -- committed browser-safe folds are authored as ESM JavaScript.
import * as dataClosureFoldModule from '../../../scripts/verification/core-v2-contract/fold-data-closure.mjs';
// @ts-expect-error -- committed browser-safe folds are authored as ESM JavaScript.
import * as lifecycleResizeFoldModule from '../../../scripts/verification/core-v2-contract/fold-lifecycle-resize.mjs';
// @ts-expect-error -- committed browser-safe folds are authored as ESM JavaScript.
import * as lifecycleDestroyFoldModule from '../../../scripts/verification/core-v2-contract/fold-lifecycle-destroy.mjs';
// @ts-expect-error -- committed browser-safe folds are authored as ESM JavaScript.
import * as renderFoundationFoldModule from '../../../scripts/verification/core-v2-contract/fold-render-foundation.mjs';
// @ts-expect-error -- committed browser-safe folds are authored as ESM JavaScript.
import * as renderBoundsFoldModule from '../../../scripts/verification/core-v2-contract/fold-render-bounds.mjs';
// @ts-expect-error -- committed browser-safe folds are authored as ESM JavaScript.
import * as renderOrientationFoldModule from '../../../scripts/verification/core-v2-contract/fold-render-orientation.mjs';
// @ts-expect-error -- committed browser-safe folds are authored as ESM JavaScript.
import * as renderRelationsFoldModule from '../../../scripts/verification/core-v2-contract/fold-render-relations.mjs';

import type {
  CoreV2ExecutableCaseId,
  CoreV2ExecutableCasePlan,
} from './executable-cases';

export type CoreV2ExecutableRuntimeKey =
  | 'foundation'
  | 'data-foundation'
  | 'data-closure'
  | 'lifecycle-resize'
  | 'lifecycle-destroy'
  | 'render-foundation'
  | 'render-bounds'
  | 'render-orientation'
  | 'render-relations';

type Handler = (
  context: Readonly<Record<string, unknown>>,
  action: Readonly<Record<string, unknown>>,
) => unknown;
type HandlerEntry = readonly [string, Handler];

interface HandlerFactoryRuntime {
  createFoundationHandlerEntries?(this: void): readonly HandlerEntry[];
  createEmptyStateHandlerEntries?(this: void): readonly HandlerEntry[];
  createDataFoundationHandlerEntries?(
    this: void,
    product: Readonly<Record<string, unknown>>,
  ): readonly HandlerEntry[];
  createDataClosureHandlerEntries?(
    this: void,
    product: Readonly<Record<string, unknown>>,
  ): readonly HandlerEntry[];
  createLifecycleResizeHandlerEntries?(this: void): readonly HandlerEntry[];
  createLifecycleDestroyHandlerEntries?(
    this: void,
    product: Readonly<Record<string, unknown>>,
  ): readonly HandlerEntry[];
  createRenderFoundationHandlerEntries?(this: void): readonly HandlerEntry[];
  createRenderBoundsHandlerEntries?(this: void): readonly HandlerEntry[];
  createRenderOrientationHandlerEntries?(this: void): readonly HandlerEntry[];
  createRenderRelationsHandlerEntries?(this: void): readonly HandlerEntry[];
}

interface FoldRuntime {
  foldFoundationExecution?(
    this: void,
    options: Readonly<Record<string, unknown>>,
  ): CoreV2FoldedExecution;
  foldDataFoundationExecution?(
    this: void,
    options: Readonly<Record<string, unknown>>,
  ): CoreV2FoldedExecution;
  foldDataClosureExecution?(
    this: void,
    options: Readonly<Record<string, unknown>>,
  ): CoreV2FoldedExecution;
  foldLifecycleResizeExecution?(
    this: void,
    options: Readonly<Record<string, unknown>>,
  ): CoreV2FoldedExecution;
  foldLifecycleDestroyExecution?(
    this: void,
    options: Readonly<Record<string, unknown>>,
  ): CoreV2FoldedExecution;
  foldRenderFoundationExecution?(
    this: void,
    options: Readonly<Record<string, unknown>>,
  ): CoreV2FoldedExecution;
  foldRenderBoundsExecution?(
    this: void,
    options: Readonly<Record<string, unknown>>,
  ): CoreV2FoldedExecution;
  foldRenderOrientationExecution?(
    this: void,
    options: Readonly<Record<string, unknown>>,
  ): CoreV2FoldedExecution;
  foldRenderRelationsExecution?(
    this: void,
    options: Readonly<Record<string, unknown>>,
  ): CoreV2FoldedExecution;
}

export interface CoreV2FoldedExecution {
  readonly actual: Readonly<Record<string, unknown>>;
  readonly fixtures: Readonly<Record<string, unknown>>;
  readonly captures: Readonly<Record<string, unknown>>;
}

export interface CoreV2ExecutableRuntimeDescriptor {
  readonly key: CoreV2ExecutableRuntimeKey;
  readonly needsSupplementalWebGLLease: boolean;
  handlerEntries(plan: CoreV2ExecutableCasePlan): readonly HandlerEntry[];
  fold(options: Readonly<{
    casePlan: CoreV2ExecutableCasePlan;
    execution: Readonly<Record<string, unknown>>;
    provenance: Readonly<Record<string, unknown>>;
    environment: Readonly<Record<string, unknown>>;
  }>): CoreV2FoldedExecution;
}

type CoreV2RuntimeFoldInput = Parameters<CoreV2ExecutableRuntimeDescriptor['fold']>[0];

const foundationHandlers = foundationHandlersModule as unknown as HandlerFactoryRuntime;
const emptyStateHandlers = emptyStateHandlersModule as unknown as HandlerFactoryRuntime;
const dataFoundationHandlers = dataFoundationHandlersModule as unknown as HandlerFactoryRuntime;
const dataClosureHandlers = dataClosureHandlersModule as unknown as HandlerFactoryRuntime;
const lifecycleResizeHandlers = lifecycleResizeHandlersModule as unknown as HandlerFactoryRuntime;
const lifecycleDestroyHandlers = lifecycleDestroyHandlersModule as unknown as HandlerFactoryRuntime;
const renderFoundationHandlers = renderFoundationHandlersModule as unknown as HandlerFactoryRuntime;
const renderBoundsHandlers = renderBoundsHandlersModule as unknown as HandlerFactoryRuntime;
const renderOrientationHandlers = renderOrientationHandlersModule as unknown as HandlerFactoryRuntime;
const renderRelationsHandlers = renderRelationsHandlersModule as unknown as HandlerFactoryRuntime;
const foundationFold = foundationFoldModule as unknown as FoldRuntime;
const dataFoundationFold = dataFoundationFoldModule as unknown as FoldRuntime;
const dataClosureFold = dataClosureFoldModule as unknown as FoldRuntime;
const lifecycleResizeFold = lifecycleResizeFoldModule as unknown as FoldRuntime;
const lifecycleDestroyFold = lifecycleDestroyFoldModule as unknown as FoldRuntime;
const renderFoundationFold = renderFoundationFoldModule as unknown as FoldRuntime;
const renderBoundsFold = renderBoundsFoldModule as unknown as FoldRuntime;
const renderOrientationFold = renderOrientationFoldModule as unknown as FoldRuntime;
const renderRelationsFold = renderRelationsFoldModule as unknown as FoldRuntime;

const FOUNDATION_CASE_IDS = new Set<CoreV2ExecutableCaseId>([
  'LIF-001',
  'LIF-002',
  'DAT-001',
  'DAT-002',
  'CSM-001',
  'CSM-003',
]);
const DATA_FOUNDATION_CASE_IDS = new Set<CoreV2ExecutableCaseId>([
  'DAT-003',
  'DAT-004',
  'DAT-005',
]);
const DATA_CLOSURE_CASE_IDS = new Set<CoreV2ExecutableCaseId>([
  'DAT-006',
  'DAT-007',
  'DAT-008',
]);
const RENDER_FOUNDATION_CASE_IDS = new Set<CoreV2ExecutableCaseId>([
  'LAY-001',
  'REN-001',
  'REN-004',
  'REN-003',
  'REN-002',
]);

const DATA_FOUNDATION_PRODUCT = Object.freeze({
  createColorResolver: createCoreV2ColorResolver,
  constructPixiColor(value: unknown): Color {
    return new Color(value as ColorSource);
  },
  resolveComponentSize: resolveCoreV2ComponentSize,
  resolveContentBox: resolveCoreV2ContentBox,
  materializeGrid: materializeCoreV2Grid,
  setGridCell: setCoreV2GridCell,
});

const DATA_CLOSURE_PRODUCT = Object.freeze({
  materializeDataset: materializeCoreV2Dataset,
});

const LIFECYCLE_DESTROY_PRODUCT = Object.freeze({
  inspectEngineResources(engine: unknown): Readonly<Record<string, unknown>> {
    const inspectable = requireInspectableEngine(engine);
    const snapshot = inspectable.snapshot();
    const semantic = inspectable.semanticProbe();
    // These are public logical counters only. pendingWork is the closest public
    // scheduler-work boundary; logicalDatasetRootCount is not a heap-retention
    // claim and stays zero only after the engine releases its authoritative scene.
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

const FOUNDATION_DESCRIPTOR = createDescriptor({
  key: 'foundation',
  needsSupplementalWebGLLease: false,
  createEntries: () => [
    ...requireFactory(foundationHandlers.createFoundationHandlerEntries, 'foundation handlers')(),
    ...requireFactory(emptyStateHandlers.createEmptyStateHandlerEntries, 'empty-state handlers')(),
  ],
  fold: requireFold(foundationFold.foldFoundationExecution, 'foundation fold'),
});

const DATA_FOUNDATION_DESCRIPTOR = createDescriptor({
  key: 'data-foundation',
  needsSupplementalWebGLLease: true,
  createEntries: () => requireFactory(
    dataFoundationHandlers.createDataFoundationHandlerEntries,
    'data-foundation handlers',
  )(DATA_FOUNDATION_PRODUCT),
  fold: requireFold(dataFoundationFold.foldDataFoundationExecution, 'data-foundation fold'),
});

const DATA_CLOSURE_DESCRIPTOR = createDescriptor({
  key: 'data-closure',
  needsSupplementalWebGLLease: false,
  createEntries: () => requireFactory(
    dataClosureHandlers.createDataClosureHandlerEntries,
    'data-closure handlers',
  )(DATA_CLOSURE_PRODUCT),
  fold: requireFold(dataClosureFold.foldDataClosureExecution, 'data-closure fold'),
});

const LIFECYCLE_RESIZE_DESCRIPTOR = createDescriptor({
  key: 'lifecycle-resize',
  needsSupplementalWebGLLease: false,
  createEntries: () => requireFactory(
    lifecycleResizeHandlers.createLifecycleResizeHandlerEntries,
    'lifecycle-resize handlers',
  )(),
  fold: requireFold(lifecycleResizeFold.foldLifecycleResizeExecution, 'lifecycle-resize fold'),
});

const LIFECYCLE_DESTROY_DESCRIPTOR = createDescriptor({
  key: 'lifecycle-destroy',
  needsSupplementalWebGLLease: false,
  createEntries: () => requireFactory(
    lifecycleDestroyHandlers.createLifecycleDestroyHandlerEntries,
    'lifecycle-destroy handlers',
  )(LIFECYCLE_DESTROY_PRODUCT),
  fold: requireFold(lifecycleDestroyFold.foldLifecycleDestroyExecution, 'lifecycle-destroy fold'),
});

const RENDER_FOUNDATION_DESCRIPTOR = createDescriptor({
  key: 'render-foundation',
  needsSupplementalWebGLLease: false,
  createEntries: () => requireFactory(
    renderFoundationHandlers.createRenderFoundationHandlerEntries,
    'render-foundation handlers',
  )(),
  fold: requireFold(
    renderFoundationFold.foldRenderFoundationExecution,
    'render-foundation fold',
  ),
});

const RENDER_BOUNDS_DESCRIPTOR = createDescriptor({
  key: 'render-bounds',
  needsSupplementalWebGLLease: false,
  createEntries: () => requireFactory(
    renderBoundsHandlers.createRenderBoundsHandlerEntries,
    'render-bounds handlers',
  )(),
  fold: requireFold(
    renderBoundsFold.foldRenderBoundsExecution,
    'render-bounds fold',
  ),
});

const RENDER_ORIENTATION_DESCRIPTOR = createDescriptor({
  key: 'render-orientation',
  needsSupplementalWebGLLease: false,
  createEntries: () => requireFactory(
    renderOrientationHandlers.createRenderOrientationHandlerEntries,
    'render-orientation handlers',
  )(),
  fold: requireFold(
    renderOrientationFold.foldRenderOrientationExecution,
    'render-orientation fold',
  ),
});

const RENDER_RELATIONS_DESCRIPTOR = createDescriptor({
  key: 'render-relations',
  needsSupplementalWebGLLease: false,
  createEntries: () => requireFactory(
    renderRelationsHandlers.createRenderRelationsHandlerEntries,
    'render-relations handlers',
  )(),
  fold: requireFold(
    renderRelationsFold.foldRenderRelationsExecution,
    'render-relations fold',
  ),
});

export function resolveCoreV2ExecutableRuntime(
  caseId: CoreV2ExecutableCaseId,
): CoreV2ExecutableRuntimeDescriptor {
  if (FOUNDATION_CASE_IDS.has(caseId)) return FOUNDATION_DESCRIPTOR;
  if (DATA_FOUNDATION_CASE_IDS.has(caseId)) return DATA_FOUNDATION_DESCRIPTOR;
  if (DATA_CLOSURE_CASE_IDS.has(caseId)) return DATA_CLOSURE_DESCRIPTOR;
  if (caseId === 'LIF-004') return LIFECYCLE_RESIZE_DESCRIPTOR;
  if (caseId === 'LIF-005') return LIFECYCLE_DESTROY_DESCRIPTOR;
  if (RENDER_FOUNDATION_CASE_IDS.has(caseId)) return RENDER_FOUNDATION_DESCRIPTOR;
  if (caseId === 'LAY-004') return RENDER_ORIENTATION_DESCRIPTOR;
  if (caseId === 'LAY-005') return RENDER_BOUNDS_DESCRIPTOR;
  if (caseId === 'REN-007') return RENDER_RELATIONS_DESCRIPTOR;
  throw new Error(`Unsupported Core v2 executable runtime: ${String(caseId)}`);
}

function createDescriptor(options: Readonly<{
  key: CoreV2ExecutableRuntimeKey;
  needsSupplementalWebGLLease: boolean;
  createEntries: () => readonly HandlerEntry[];
  fold: (
    options: Readonly<Record<string, unknown>>,
  ) => CoreV2FoldedExecution;
}>): CoreV2ExecutableRuntimeDescriptor {
  return Object.freeze({
    key: options.key,
    needsSupplementalWebGLLease: options.needsSupplementalWebGLLease,
    handlerEntries(plan: CoreV2ExecutableCasePlan): readonly HandlerEntry[] {
      const required = new Set(plan.actionTrace.map((action) => `contract/${action.type}`));
      const selected = options.createEntries().filter(([handlerId]) => required.has(handlerId));
      invariant(selected.length === required.size, `${plan.id} exact handler coverage`);
      invariant(new Set(selected.map(([handlerId]) => handlerId)).size === selected.length, `${plan.id} handler collisions`);
      return Object.freeze(selected);
    },
    fold(input: CoreV2RuntimeFoldInput): CoreV2FoldedExecution {
      return options.fold({
        casePlan: input.casePlan,
        execution: input.execution,
        provenance: input.provenance,
        environment: input.environment,
      });
    },
  });
}

function requireFactory<T extends (...args: never[]) => readonly HandlerEntry[]>(
  value: T | undefined,
  label: string,
): T {
  invariant(typeof value === 'function', `${label} export`);
  return value;
}

function requireFold(
  value: ((options: Readonly<Record<string, unknown>>) => CoreV2FoldedExecution) | undefined,
  label: string,
): (options: Readonly<Record<string, unknown>>) => CoreV2FoldedExecution {
  invariant(typeof value === 'function', `${label} export`);
  return value;
}

interface InspectableEngine {
  snapshot(): CoreV2EngineSnapshot;
  semanticProbe(): CoreV2SemanticProductProbe;
}

function requireInspectableEngine(value: unknown): InspectableEngine {
  invariant(isRecord(value), 'lifecycle engine inspection target');
  invariant(typeof value.snapshot === 'function', 'lifecycle engine snapshot()');
  invariant(typeof value.semanticProbe === 'function', 'lifecycle engine semanticProbe()');
  return value as unknown as InspectableEngine;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid Core v2 executable Lab runtime: ${message}`);
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}
