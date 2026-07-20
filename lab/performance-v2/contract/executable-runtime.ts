import { Color, type ColorSource } from 'pixi.js';

import {
  CORE_V2_BUILTIN_ASSETS,
  CoreV2AssetError,
  CoreV2AssetRuntime,
  createCoreV2ColorResolver,
  createCoreV2PixiAssetBackend,
  materializeCoreV2Dataset,
  materializeCoreV2Grid,
  resolveCoreV2ComponentSize,
  resolveCoreV2ContentBox,
  setCoreV2GridCell,
  type CoreV2AssetBackend,
  type CoreV2AssetBackendRequest,
  type CoreV2AssetDescriptor,
  type CoreV2AssetPolicy,
  type CoreV2AssetPolicyContext,
  type CoreV2Engine,
  type CoreV2EngineOptions,
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
// @ts-expect-error -- committed browser-safe action modules are authored as ESM JavaScript.
import * as renderImagesHandlersModule from '../../../scripts/verification/core-v2-contract/handlers/render-images.mjs';
// @ts-expect-error -- committed browser-safe action modules are authored as ESM JavaScript.
import * as assetHandlersModule from '../../../scripts/verification/core-v2-contract/handlers/assets.mjs';
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
// @ts-expect-error -- committed browser-safe folds are authored as ESM JavaScript.
import * as renderImagesFoldModule from '../../../scripts/verification/core-v2-contract/fold-render-images.mjs';
// @ts-expect-error -- committed browser-safe folds are authored as ESM JavaScript.
import * as assetFoldModule from '../../../scripts/verification/core-v2-contract/fold-assets.mjs';

import type {
  CoreV2ExecutableCaseId,
  CoreV2ExecutableCasePlan,
} from './executable-cases';
import { createCoreV2RenderImagesRuntime } from './render-images-runtime';

export type CoreV2ExecutableRuntimeKey =
  | 'foundation'
  | 'data-foundation'
  | 'data-closure'
  | 'lifecycle-resize'
  | 'lifecycle-destroy'
  | 'render-foundation'
  | 'render-bounds'
  | 'render-orientation'
  | 'render-relations'
  | 'render-images'
  | 'assets';

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
  createRenderImageHandlerEntries?(
    this: void,
    product: Readonly<Record<string, unknown>>,
  ): readonly HandlerEntry[];
  createAssetHandlerEntries?(
    this: void,
    product: Readonly<Record<string, unknown>>,
  ): readonly HandlerEntry[];
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
  foldRenderImageExecution?(
    this: void,
    options: Readonly<Record<string, unknown>>,
  ): CoreV2FoldedExecution;
  foldAssetExecution?(
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
  createRun(plan: CoreV2ExecutableCasePlan): Readonly<{
    readonly handlerEntries: readonly HandlerEntry[];
    readonly engineOptions: Readonly<CoreV2EngineOptions>;
    readonly postDestroyProductProbe?: () => Readonly<Record<string, unknown>>;
  }>;
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
const renderImagesHandlers = renderImagesHandlersModule as unknown as HandlerFactoryRuntime;
const assetHandlers = assetHandlersModule as unknown as HandlerFactoryRuntime;
const foundationFold = foundationFoldModule as unknown as FoldRuntime;
const dataFoundationFold = dataFoundationFoldModule as unknown as FoldRuntime;
const dataClosureFold = dataClosureFoldModule as unknown as FoldRuntime;
const lifecycleResizeFold = lifecycleResizeFoldModule as unknown as FoldRuntime;
const lifecycleDestroyFold = lifecycleDestroyFoldModule as unknown as FoldRuntime;
const renderFoundationFold = renderFoundationFoldModule as unknown as FoldRuntime;
const renderBoundsFold = renderBoundsFoldModule as unknown as FoldRuntime;
const renderOrientationFold = renderOrientationFoldModule as unknown as FoldRuntime;
const renderRelationsFold = renderRelationsFoldModule as unknown as FoldRuntime;
const renderImagesFold = renderImagesFoldModule as unknown as FoldRuntime;
const assetFold = assetFoldModule as unknown as FoldRuntime;

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

const ASSET_DESCRIPTOR = createAssetDescriptor();
const RENDER_IMAGES_DESCRIPTOR = createRenderImagesDescriptor();

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
  if (caseId === 'REN-005') return RENDER_IMAGES_DESCRIPTOR;
  if (caseId === 'AST-001') return ASSET_DESCRIPTOR;
  throw new Error(`Unsupported Core v2 executable runtime: ${String(caseId)}`);
}

function createRenderImagesDescriptor(): CoreV2ExecutableRuntimeDescriptor {
  const fold = requireFold(
    renderImagesFold.foldRenderImageExecution,
    'render-images fold',
  );
  const createEntries = requireFactory(
    renderImagesHandlers.createRenderImageHandlerEntries,
    'render-images handlers',
  );
  const createRun = (plan: CoreV2ExecutableCasePlan) => {
    const runtime = createCoreV2RenderImagesRuntime();
    return Object.freeze({
      handlerEntries: selectHandlerEntries(
        plan,
        createEntries(runtime.product as unknown as Readonly<Record<string, unknown>>),
      ),
      engineOptions: Object.freeze({
        assetRuntime: runtime.assetRuntime,
        assetPolicy: runtime.assetPolicy,
      }),
      postDestroyProductProbe: () => runtime.postDestroyProductProbe(),
    });
  };
  return Object.freeze({
    key: 'render-images',
    needsSupplementalWebGLLease: false,
    createRun,
    handlerEntries(plan: CoreV2ExecutableCasePlan): readonly HandlerEntry[] {
      return createRun(plan).handlerEntries;
    },
    fold(input: CoreV2RuntimeFoldInput): CoreV2FoldedExecution {
      return fold({
        casePlan: input.casePlan,
        execution: input.execution,
        provenance: input.provenance,
        environment: input.environment,
      });
    },
  });
}

function createDescriptor(options: Readonly<{
  key: CoreV2ExecutableRuntimeKey;
  needsSupplementalWebGLLease: boolean;
  createEntries: () => readonly HandlerEntry[];
  fold: (
    options: Readonly<Record<string, unknown>>,
  ) => CoreV2FoldedExecution;
}>): CoreV2ExecutableRuntimeDescriptor {
  const createRun = (plan: CoreV2ExecutableCasePlan) => Object.freeze({
    handlerEntries: selectHandlerEntries(plan, options.createEntries()),
    engineOptions: Object.freeze({}),
  });
  return Object.freeze({
    key: options.key,
    needsSupplementalWebGLLease: options.needsSupplementalWebGLLease,
    createRun,
    handlerEntries(plan: CoreV2ExecutableCasePlan): readonly HandlerEntry[] {
      return createRun(plan).handlerEntries;
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

const AST_REQUIRED_ASSET_SOURCE = 'fixture://required-init-failure.png';
const AST_DEVICE_SOURCE = 'core-v2-builtin://images/device.svg';

function createAssetDescriptor(): CoreV2ExecutableRuntimeDescriptor {
  const fold = requireFold(assetFold.foldAssetExecution, 'asset fold');
  const createEntries = requireFactory(
    assetHandlers.createAssetHandlerEntries,
    'asset handlers',
  );
  const createRun = (plan: CoreV2ExecutableCasePlan) => {
    const assetRuntime = new CoreV2AssetRuntime(createAstPixiAssetBackend());
    const product = createAssetProductAdapter(assetRuntime);
    return Object.freeze({
      handlerEntries: selectHandlerEntries(plan, createEntries(product)),
      engineOptions: Object.freeze({
        assetRuntime,
        assetPolicy: AST_ASSET_POLICY,
      }),
    });
  };
  return Object.freeze({
    key: 'assets',
    needsSupplementalWebGLLease: true,
    createRun,
    handlerEntries(plan: CoreV2ExecutableCasePlan): readonly HandlerEntry[] {
      return createRun(plan).handlerEntries;
    },
    fold(input: CoreV2RuntimeFoldInput): CoreV2FoldedExecution {
      return fold({
        casePlan: input.casePlan,
        execution: input.execution,
        provenance: input.provenance,
        environment: input.environment,
      });
    },
  });
}

function selectHandlerEntries(
  plan: CoreV2ExecutableCasePlan,
  entries: readonly HandlerEntry[],
): readonly HandlerEntry[] {
  const required = new Set(plan.actionTrace.map((action) => `contract/${action.type}`));
  const selected = entries.filter(([handlerId]) => required.has(handlerId));
  invariant(selected.length === required.size, `${plan.id} exact handler coverage`);
  invariant(
    new Set(selected.map(([handlerId]) => handlerId)).size === selected.length,
    `${plan.id} handler collisions`,
  );
  return Object.freeze(selected);
}

const AST_ASSET_POLICY: CoreV2AssetPolicy = (
  context: CoreV2AssetPolicyContext,
): void => {
  if (context.packageOwned || isRequiredFailureDescriptor(context.descriptor)) return;
  throw new CoreV2AssetError('ASSET_POLICY_REJECTED', 'ASSET_FAILURE', false);
};

function createAstPixiAssetBackend(): CoreV2AssetBackend {
  const pixi = createCoreV2PixiAssetBackend();
  const loadedKeys = new Set<string>();
  const nonBrowserResources = new Map<string, Readonly<Record<string, unknown>>>();
  const hasBrowserAssetEnvironment = typeof document !== 'undefined';
  return Object.freeze({
    get(request: CoreV2AssetBackendRequest): unknown {
      const kind = classifyAstAssetRequest(request);
      if (kind === 'required-failure') return undefined;
      return hasBrowserAssetEnvironment
        ? pixi.get(request)
        : nonBrowserResources.get(request.key);
    },
    async load(request: CoreV2AssetBackendRequest): Promise<unknown> {
      const kind = classifyAstAssetRequest(request);
      if (kind === 'required-failure') {
        throw new CoreV2AssetError('ASSET_LOAD_FAILED', 'ASSET_FAILURE', true);
      }
      invariant(request.descriptor.src === AST_DEVICE_SOURCE, 'AST-001 loads only device builtin');
      // The focused Lab always has a DOM and therefore exercises public Pixi
      // Assets. Node Vitest intentionally has no DOM adapter; its resource only
      // supplies a stable object identity for the exact handler/fold contract.
      if (!hasBrowserAssetEnvironment) {
        const resource = deepFreeze({
          kind: 'non-browser-asset-identity',
          cacheIdentity: request.cacheIdentity,
        });
        nonBrowserResources.set(request.key, resource);
        loadedKeys.add(request.key);
        return resource;
      }
      const resource = await pixi.load(request);
      loadedKeys.add(request.key);
      return resource;
    },
    async unload(key: string): Promise<void> {
      invariant(loadedKeys.has(key), 'AST-001 unload owns the Pixi asset key');
      try {
        if (hasBrowserAssetEnvironment) {
          await pixi.unload(key);
        } else {
          nonBrowserResources.delete(key);
        }
      } finally {
        loadedKeys.delete(key);
      }
    },
  });
}

function classifyAstAssetRequest(
  request: CoreV2AssetBackendRequest,
): 'package-builtin' | 'required-failure' {
  if (request.packageOwned) return 'package-builtin';
  if (isRequiredFailureDescriptor(request.descriptor)) return 'required-failure';
  throw new CoreV2AssetError('ASSET_POLICY_REJECTED', 'ASSET_FAILURE', false);
}

function isRequiredFailureDescriptor(descriptor: CoreV2AssetDescriptor): boolean {
  return Object.keys(descriptor).length === 1
    && descriptor.src === AST_REQUIRED_ASSET_SOURCE;
}

function createAssetProductAdapter(
  assetRuntime: CoreV2AssetRuntime,
): Readonly<Record<string, unknown>> {
  const acquisitions = new WeakMap<object, Map<string, Readonly<{
    cacheIdentity: string;
    resourceToken: string;
  }>>>();
  const resourceTokens = new WeakMap<object, string>();
  let resourceSequence = 0;

  const tokenFor = (resource: unknown): string => {
    invariant(isObjectLike(resource), 'asset acquisition resource identity');
    const existing = resourceTokens.get(resource);
    if (existing) return existing;
    const token = `asset-resource-${++resourceSequence}`;
    resourceTokens.set(resource, token);
    return token;
  };

  return Object.freeze({
    registerAssets(engineValue: unknown, optionsValue: unknown): Readonly<Record<string, unknown>> {
      const engine = requireAssetEngine(engineValue);
      const options = requireRuntimeRecord(optionsValue, 'registerAssets options');
      const instanceId = requireRuntimeString(options.instanceId, 'registerAssets instanceId');
      const aliases = requireRuntimeStringArray(options.aliases, 'registerAssets aliases');
      invariant(
        sameRuntimeArray(aliases, CORE_V2_BUILTIN_ASSETS.map(({ alias }) => alias)),
        'AST-001 builtin alias inventory',
      );
      const result = engine.registerAssets(instanceId, CORE_V2_BUILTIN_ASSETS);
      return deepFreeze({
        registeredAliases: [...result.registeredAliases],
        duplicateAliases: [...result.duplicateAliases],
      });
    },
    initializeWithRequiredAssetFailure(
      engineValue: unknown,
      optionsValue: unknown,
    ) {
      const engine = requireAssetEngine(engineValue);
      const options = requireRuntimeRecord(optionsValue, 'required failure options');
      const alias = requireRuntimeString(options.alias, 'required failure alias');
      const source = requireRuntimeString(options.source, 'required failure source');
      const instanceId = requireRuntimeString(options.instanceId, 'required failure instanceId');
      invariant(source === AST_REQUIRED_ASSET_SOURCE, 'AST-001 required failure source');
      return engine.initialize({
        instanceId,
        width: 800,
        height: 600,
        pixelRatio: 1,
        strategy: 'mesh',
        preference: 'webgl',
        requiredAssets: Object.freeze([
          Object.freeze({ alias, descriptor: source, kind: 'image' as const }),
        ]),
      });
    },
    async acquireAsset(
      engineValue: unknown,
      optionsValue: unknown,
    ): Promise<Readonly<Record<string, unknown>>> {
      const engine = requireAssetEngine(engineValue);
      const options = requireRuntimeRecord(optionsValue, 'acquireAsset options');
      const instanceId = requireRuntimeString(options.instanceId, 'acquireAsset instanceId');
      const alias = requireRuntimeString(options.alias, 'acquireAsset alias');
      invariant(engine.assetProbe().session?.instanceId === instanceId, 'acquireAsset instance identity');
      const acquisition = await engine.acquireAsset(alias);
      const resourceToken = tokenFor(acquisition.resource);
      const byAlias = acquisitions.get(engine) ?? new Map<string, Readonly<{
        cacheIdentity: string;
        resourceToken: string;
      }>>();
      byAlias.set(alias, Object.freeze({
        cacheIdentity: acquisition.cacheIdentity,
        resourceToken,
      }));
      acquisitions.set(engine, byAlias);
      return Object.freeze({
        cacheIdentity: acquisition.cacheIdentity,
        resourceToken,
      });
    },
    registerAlias(optionsValue: unknown): Readonly<Record<string, unknown>> {
      const options = requireRuntimeRecord(optionsValue, 'registerAlias options');
      const alias = requireRuntimeString(options.alias, 'registerAlias alias');
      const descriptor = requireRuntimeRecord(options.descriptor, 'registerAlias descriptor');
      invariant(Object.keys(descriptor).length === 1, 'registerAlias descriptor keys');
      const src = requireRuntimeString(descriptor.src, 'registerAlias descriptor src');
      const result = assetRuntime.registerAlias({ alias, descriptor: { src } });
      return deepFreeze({
        registeredAliases: [...result.registeredAliases],
        duplicateAliases: [...result.duplicateAliases],
      });
    },
    inspectAssetState(optionsValue: unknown): Readonly<Record<string, unknown>> {
      const options = requireRuntimeRecord(optionsValue, 'inspectAssetState options');
      const alias = requireRuntimeString(options.alias, 'inspectAssetState alias');
      const engine = options.engine === null ? null : requireAssetEngine(options.engine);
      const runtimeProbe = engine?.assetProbe(alias).runtime ?? assetRuntime.probe(alias);
      const acquisition = engine ? acquisitions.get(engine)?.get(alias) : undefined;
      return deepFreeze({
        catalog: {
          imageAliases: [...runtimeProbe.builtins.aliases],
          fontWeights: [...runtimeProbe.fonts.weights],
        },
        selected: {
          alias,
          cacheKey: acquisition?.cacheIdentity ?? null,
          resourceCount: runtimeProbe.resource?.resourceCount ?? 0,
          leaseCount: runtimeProbe.resource?.leaseCount ?? 0,
          pendingUserCount: runtimeProbe.resource?.pendingCount ?? 0,
          resourceToken: acquisition?.resourceToken ?? null,
        },
        totals: {
          resourceCount: runtimeProbe.resourceCount,
          leaseCount: runtimeProbe.leaseCount,
          pendingCount: runtimeProbe.pendingCount,
        },
      });
    },
  });
}

function requireAssetEngine(value: unknown): CoreV2Engine {
  invariant(isObjectLike(value), 'asset engine');
  for (const method of [
    'registerAssets',
    'initialize',
    'acquireAsset',
    'assetProbe',
  ]) {
    invariant(typeof (value as Record<string, unknown>)[method] === 'function', `asset engine ${method}()`);
  }
  return value as CoreV2Engine;
}

function requireRuntimeRecord(
  value: unknown,
  label: string,
): Readonly<Record<string, unknown>> {
  invariant(isRecord(value), label);
  return value;
}

function requireRuntimeString(value: unknown, label: string): string {
  invariant(typeof value === 'string' && value.length > 0, label);
  return value;
}

function requireRuntimeStringArray(value: unknown, label: string): readonly string[] {
  invariant(Array.isArray(value), label);
  return value.map((entry, index) => requireRuntimeString(entry, `${label} ${index}`));
}

function sameRuntimeArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isObjectLike(value: unknown): value is object {
  return value !== null && (typeof value === 'object' || typeof value === 'function');
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
