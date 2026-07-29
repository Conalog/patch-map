import { CoreV2AssetError, CoreV2Engine } from '../../src/core-v2';
import type {
  MainParityAction,
  MainParityEntityObservation,
  MainParityObservation,
  MainParityOracle,
} from './oracle-contract';

const host = requireHost();

let engine: CoreV2Engine | null = null;
let lastInput: unknown = null;
let lastInputDigest: string | null = null;
interface RequestedVisual {
  readonly id: string;
  readonly type: string;
  readonly scope: 'element' | 'component';
  readonly ownerId: string | null;
  readonly authoredVisible: boolean;
}

let requestedElements: readonly RequestedVisual[] = Object.freeze([]);
let diagnostics: string[] = [];
let width = 800;
let height = 600;
let pixelRatio = 1;
let frameTimeMs = 0;
let instanceSequence = 0;

const oracle: MainParityOracle = Object.freeze({
  kind: 'core-v2',
  initialize,
  load,
  act,
  observe,
  destroy,
});
window.__PATCH_MAP_MAIN_PARITY__ = oracle;
document.body.dataset.oracleReady = 'true';

async function initialize(
  options: Readonly<{
    readonly width?: number;
    readonly height?: number;
    readonly pixelRatio?: number;
  }> = {},
): Promise<MainParityObservation> {
  if (engine !== null) await destroy();
  width = finitePositive(options.width, 800);
  height = finitePositive(options.height, 600);
  pixelRatio = finitePositive(options.pixelRatio, 1);
  host.style.width = `${width}px`;
  host.style.height = `${height}px`;
  host.replaceChildren();
  diagnostics = [];
  requestedElements = Object.freeze([]);
  lastInput = null;
  lastInputDigest = null;
  frameTimeMs = 0;
  // The product defaults to package-owned assets only. The black-box parity
  // host explicitly opts into its own deterministic data-URI specimen so the
  // comparison measures rendering rather than the host security policy.
  engine = new CoreV2Engine({
    assetPolicy: ({ descriptor, packageOwned }) => {
      if (packageOwned || /^data:/iu.test(descriptor.src)) return;
      throw new CoreV2AssetError('ASSET_POLICY_REJECTED', 'ASSET_FAILURE', false);
    },
  });
  instanceSequence += 1;
  await engine.initialize({
    instanceId: `main-parity-${instanceSequence}`,
    target: host,
    width,
    height,
    pixelRatio,
    antialias: true,
    background: '#FAFAFA',
    strategy: 'mesh',
    preference: 'webgl',
    backend: 'webgl2',
    zoomLimits: [0.025, 30],
  });
  engine.publishFrame(0);
  await settle();
  return observe();
}

async function load(input: unknown): Promise<MainParityObservation> {
  const runtime = requireEngine('load');
  const detached = structuredClone(input);
  requestedElements = collectRequestedElements(detached);
  lastInput = detached;
  lastInputDigest = stableJson(detached);
  runtime.loadDataset(detached, { datasetRef: 'main-parity' });
  frameTimeMs = 16.666_667;
  runtime.publishFrame(frameTimeMs);
  const imageTargetCount = runtime.sceneImageProbe()?.targetCount ?? 0;
  await runtime.settleSceneImages();
  // Asset settlement invalidates the manual renderer but does not itself
  // publish a frame. Compare both runtimes only after the resolved texture has
  // replaced Core v2's intentional pending placeholder.
  if (imageTargetCount > 0) {
    frameTimeMs = 33.333_334;
    runtime.publishFrame(frameTimeMs);
  }
  await settle(2);
  return observe();
}

async function act(action: MainParityAction): Promise<MainParityObservation> {
  const runtime = requireEngine('act');
  let sceneImagesMayHaveChanged = false;
  switch (action.type) {
    case 'fit':
      runtime.fitViewport({
        ...(action.ids === undefined ? {} : { targets: action.ids }),
        paddingCssPx: action.padding ?? 24,
      });
      break;
    case 'focus':
      runtime.focusViewport(
        action.ids === undefined ? {} : { targets: action.ids },
      );
      break;
    case 'set-view':
      runtime.setViewport({
        centerWorld: action.centerWorld ?? [width / 2, height / 2],
        scale: finitePositive(action.scale, 1),
      });
      break;
    case 'world-transform':
      runtime.setWorldTransform(action.world ?? {
        rotationDegrees: 0,
        flipX: false,
        flipY: false,
      });
      break;
    case 'select':
      runtime.select(action.ids ?? []);
      break;
    case 'transform': {
      const selectionIds = action.ids ?? [];
      if (action.transformKind === 'move') {
        runtime.applyTransformerEdit({
          kind: 'move',
          selectionIds,
          deltaWorld: action.deltaWorld ?? [0, 0],
        }, { actionId: 'main-parity-transform-move' });
      } else if (action.transformKind === 'resize') {
        runtime.applyTransformerEdit({
          kind: 'resize',
          selectionIds,
          handle: action.handle ?? 'se',
          deltaWorld: action.deltaWorld ?? [0, 0],
        }, { actionId: 'main-parity-transform-resize' });
      } else if (action.transformKind === 'rotate') {
        runtime.applyTransformerEdit({
          kind: 'rotate',
          selectionIds,
          deltaDegrees: action.deltaDegrees ?? 0,
          ...(action.centerWorld === undefined
            ? {}
            : { centerWorld: action.centerWorld }),
          ...(action.lockedIds === undefined
            ? {}
            : { lockedIds: action.lockedIds }),
        }, { actionId: 'main-parity-transform-rotate' });
      } else {
        throw new TypeError('transform action requires transformKind');
      }
      break;
    }
    case 'update-component':
      if (
        typeof action.ownerId !== 'string' ||
        typeof action.componentId !== 'string'
      ) {
        throw new TypeError('update-component requires ownerId and componentId');
      }
      runtime.patch(
        {
          kind: 'component',
          ownerId: action.ownerId,
          id: action.componentId,
        },
        action.changes ?? {},
      );
      sceneImagesMayHaveChanged = ['source', 'tint', 'show'].some((key) =>
        Object.hasOwn(action.changes ?? {}, key),
      );
      break;
    case 'update-element':
      if (typeof action.id !== 'string') throw new TypeError('update-element requires id');
      runtime.patch(
        { kind: 'element', id: action.id },
        action.changes ?? {},
      );
      sceneImagesMayHaveChanged = Object.hasOwn(action.changes ?? {}, 'source');
      break;
    case 'undo':
      runtime.undo();
      sceneImagesMayHaveChanged = true;
      break;
    case 'redo':
      runtime.redo();
      sceneImagesMayHaveChanged = true;
      break;
    case 'wait':
      await delay(action.durationMs ?? 0);
      frameTimeMs += Math.max(0, action.durationMs ?? 0);
      break;
    case 'resize':
      width = finitePositive(action.width, width);
      height = finitePositive(action.height, height);
      pixelRatio = finitePositive(action.pixelRatio, pixelRatio);
      host.style.width = `${width}px`;
      host.style.height = `${height}px`;
      runtime.resize(width, height, pixelRatio);
      break;
    case 'publish':
      break;
    case 'browser-click':
    case 'browser-wheel':
      // Browser-owned actions are driven by Playwright in the parent verifier.
      break;
    case 'browser-drag':
      if (
        action.button !== 'middle' &&
        action.x !== undefined &&
        action.y !== undefined &&
        action.toX !== undefined &&
        action.toY !== undefined
      ) {
        runtime.selectBox(
          [action.x, action.y],
          [action.toX, action.toY],
          { mode: 'replace', partialIntersection: true },
        );
      }
      break;
    default:
      throw new TypeError(`unsupported Core v2 parity action: ${String(action.type)}`);
  }
  if (action.timeMs !== undefined) {
    frameTimeMs = Math.max(frameTimeMs, action.timeMs);
  }
  runtime.publishFrame(frameTimeMs);
  if (sceneImagesMayHaveChanged) {
    await runtime.settleSceneImages();
    frameTimeMs += 16.666_667;
    runtime.publishFrame(frameTimeMs);
  }
  await settle(action.type === 'resize' ? 3 : 1);
  return observe();
}

function observe(): Promise<MainParityObservation> {
  const runtime = engine;
  const snapshot = runtime?.snapshot() ?? null;
  const geometry = runtime === null || snapshot?.lifecycle === 'destroyed'
    ? null
    : runtime.geometryProbe();
  const byId = new Map(geometry?.entities.map((entity) => [entity.id, entity]) ?? []);
  const canvas = host.querySelector('canvas');
  const entities = requestedElements.map((requested) => {
    const logicalPresent = requested.scope === 'component'
      ? true
      : runtime?.queryScene({
          recursive: true,
          where: { id: requested.id },
        }).status === 'matched';
    const component = requested.scope === 'component' && requested.ownerId !== null
      ? runtime?.componentVisualProbe({
          ownerId: requested.ownerId,
          componentId: requested.id,
        }) ?? null
      : null;
    const text = requested.type === 'text'
      ? runtime?.textProbe(
          requested.scope === 'component' && requested.ownerId !== null
            ? { kind: 'component', ownerId: requested.ownerId, id: requested.id }
            : { kind: 'element', id: requested.id },
        ) ?? null
      : null;
    const componentEntity = component?.entityId === null || component?.entityId === undefined
      ? undefined
      : byId.get(component.entityId);
    const entity = requested.scope === 'element'
      ? byId.get(requested.id)
      : undefined;
    const geometryRecord = componentEntity ?? entity ?? null;
    if (!logicalPresent || geometryRecord === null) {
      return Object.freeze({
        ...missingEntity(requested),
        present: logicalPresent,
        visible: logicalPresent ? requested.authoredVisible : null,
        renderable: logicalPresent ? requested.authoredVisible : null,
      });
    }
    const bounds = geometryRecord.screenBounds;
    return Object.freeze({
      id: requested.id,
      scope: requested.scope,
      ownerId: requested.ownerId,
      requestedType: requested.type,
      present: true,
      visible: component?.semantic?.show ?? entity?.visible ?? true,
      renderable: component?.semantic?.show ?? entity?.visible ?? true,
      bounds: Object.freeze([...bounds]) as readonly [number, number, number, number],
      center: Object.freeze([
        bounds[0] + bounds[2] / 2,
        bounds[1] + bounds[3] / 2,
      ]) as readonly [number, number],
      rotationDegrees:
        componentEntity?.screenAngle
        ?? entity?.screenAngle
        ?? null,
      alpha: null,
      textContent: text?.projection?.visibleText ?? null,
      textPublication:
        text?.publication.status === 'current'
          ? 'current'
          : text?.publication.status === 'absent'
            ? 'absent'
            : null,
    } satisfies MainParityEntityObservation);
  });
  const world = runtime?.viewportTransformProbe().world ?? {
    rotationDegrees: 0,
    flipX: false,
    flipY: false,
  };
  const history = runtime?.historyState() ?? {
    undoDepth: 0,
    redoDepth: 0,
  };
  return Promise.resolve(Object.freeze({
    runtime: 'core-v2',
    lifecycle: snapshot?.lifecycle ?? 'new',
    canvasCount: host.querySelectorAll('canvas').length,
    canvasCssSize: canvas instanceof HTMLCanvasElement
      ? Object.freeze([canvas.clientWidth, canvas.clientHeight] as const)
      : null,
    canvasBackingSize: canvas instanceof HTMLCanvasElement
      ? Object.freeze([canvas.width, canvas.height] as const)
      : null,
    inputUnchanged: lastInput === null ? null : stableJson(lastInput) === lastInputDigest,
    entityCount: entities.filter(({ present }) => present).length,
    entities: Object.freeze(entities),
    selectionIds: snapshot?.selectionIds ?? Object.freeze([]),
    history: Object.freeze({
      canUndo: history.undoDepth > 0,
      canRedo: history.redoDepth > 0,
      undoDepth: history.undoDepth,
      redoDepth: history.redoDepth,
    }),
    viewport: Object.freeze({
      centerWorld: snapshot?.viewport.centerWorld ?? null,
      scale: snapshot?.viewport.scale ?? null,
      wheelProbeWorld: runtime === null
        ? null
        : pointTuple(runtime.screenToWorld({ x: 300, y: 220 })),
    }),
    world: Object.freeze({
      rotationDegrees: world.rotationDegrees,
      flipX: world.flipX,
      flipY: world.flipY,
    }),
    diagnostics: Object.freeze([...diagnostics]),
  }));
}

async function destroy(): Promise<MainParityObservation> {
  const runtime = engine;
  if (runtime !== null) {
    try {
      await runtime.destroy();
    } catch (error) {
      diagnostics.push(safeError(error));
    }
  }
  engine = null;
  await settle();
  const entities = requestedElements.map(missingEntity);
  return Object.freeze({
    runtime: 'core-v2',
    lifecycle: 'destroyed',
    canvasCount: host.querySelectorAll('canvas').length,
    canvasCssSize: null,
    canvasBackingSize: null,
    inputUnchanged: lastInput === null ? null : stableJson(lastInput) === lastInputDigest,
    entityCount: 0,
    entities: Object.freeze(entities),
    selectionIds: Object.freeze([]),
    history: Object.freeze({
      canUndo: false,
      canRedo: false,
      undoDepth: 0,
      redoDepth: 0,
    }),
    viewport: Object.freeze({
      centerWorld: null,
      scale: null,
      wheelProbeWorld: null,
    }),
    world: Object.freeze({ rotationDegrees: 0, flipX: false, flipY: false }),
    diagnostics: Object.freeze([...diagnostics]),
  });
}

function pointTuple(
  point: Readonly<{ readonly x: number; readonly y: number }>,
): readonly [number, number] {
  return Object.freeze([point.x, point.y]);
}

function missingEntity(
  requested: RequestedVisual,
): MainParityEntityObservation {
  return Object.freeze({
    id: requested.id,
    scope: requested.scope,
    ownerId: requested.ownerId,
    requestedType: requested.type,
    present: false,
    visible: null,
    renderable: null,
    bounds: null,
    center: null,
    rotationDegrees: null,
    alpha: null,
    textContent: null,
    textPublication: null,
  });
}

function collectRequestedElements(
  input: unknown,
): readonly RequestedVisual[] {
  const output: RequestedVisual[] = [];
  const visit = (
    value: unknown,
    ownerId: string | null = null,
    scope: 'element' | 'component' = 'element',
  ): void => {
    if (Array.isArray(value)) {
      value.forEach((entry) => visit(entry, ownerId, scope));
      return;
    }
    if (value === null || typeof value !== 'object') return;
    const record = value as Readonly<Record<string, unknown>>;
    if (
      typeof record.id === 'string'
      && typeof record.type === 'string'
      && record.type !== 'relations'
      && !output.some((entry) => (
        entry.id === record.id
        && entry.scope === scope
        && entry.ownerId === ownerId
      ))
    ) {
      output.push(Object.freeze({
        id: record.id,
        type: record.type,
        scope,
        ownerId,
        authoredVisible: record.show !== false,
      }));
    }
    if (Array.isArray(record.children)) {
      record.children.forEach((entry) => visit(entry, null, 'element'));
    }
    if (typeof record.id === 'string' && Array.isArray(record.components)) {
      record.components.forEach((entry) => visit(
        entry,
        record.id as string,
        'component',
      ));
    }
    const item = record.item;
    if (
      typeof record.id === 'string'
      && item !== null
      && typeof item === 'object'
      && Array.isArray((item as Readonly<Record<string, unknown>>).components)
    ) {
      const components = (item as Readonly<Record<string, unknown>>).components as unknown[];
      components.forEach((entry) => visit(entry, record.id as string, 'component'));
    }
  };
  visit(input, null, 'element');
  return Object.freeze(output);
}

function requireEngine(operation: string): CoreV2Engine {
  if (engine === null) throw new Error(`${operation} requires initialized Core v2 Engine`);
  return engine;
}

function requireHost(): HTMLElement {
  const element = document.querySelector('#oracle-host');
  if (!(element instanceof HTMLElement)) {
    throw new Error('missing Core v2 parity host');
  }
  return element;
}

async function settle(frames = 2): Promise<void> {
  await document.fonts.ready;
  for (let index = 0; index < frames; index += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

function finitePositive(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && (value ?? 0) > 0 ? value! : fallback;
}

function safeError(error: unknown): string {
  return error instanceof Error ? `${error.name}:${error.message}` : String(error);
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, durationMs)));
}
