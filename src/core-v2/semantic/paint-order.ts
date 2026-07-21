/**
 * Semantic paint kinds understood by the aggregate Core v2 renderer. A kind
 * describes the primitive contract, while a lane describes its aggregate Pixi
 * destination. Neither value implies a DisplayObject per entity.
 */
export type CoreV2ScenePaintKind =
  | 'background'
  | 'bar'
  | 'icon'
  | 'image'
  | 'rect'
  | 'relation'
  | 'text';

export type CoreV2OverlayPaintKind = 'selection' | 'transformer';
export type CoreV2PaintKind = CoreV2ScenePaintKind | CoreV2OverlayPaintKind;

export type CoreV2PaintLane =
  | 'background-geometry'
  | 'background-assets'
  | 'ordinary-geometry'
  | 'relations-dynamic'
  | 'content-assets'
  | 'text'
  | 'interaction-overlay';

export type CoreV2PaintPhase = 'scene' | 'overlay';

export interface CoreV2PaintPrimitiveInput {
  /** Stable PATCH MAP element/component identity exposed to consumers. */
  readonly publicId: string;
  /** Stable dense-renderer identity used to join the plan to a store slot. */
  readonly entityId: string;
  readonly kind: CoreV2ScenePaintKind;
  readonly lane: CoreV2PaintLane;
  readonly zIndex: number;
  /** Stable pre-order assigned by the semantic hierarchy traversal. */
  readonly authoredOrder: number;
  /** Intra-identity pass, for example bar track before bar fill. */
  readonly pass: number;
  readonly visible: boolean;
  /**
   * Renderer-supplied material/profile key. Equal keys only permit a run when
   * every other compatibility field is also equal and the entries are adjacent.
   */
  readonly compatibilityKey?: string;
}

export interface CoreV2PaintOverlayVisibility {
  readonly selection: boolean;
  readonly transformer: boolean;
}

export interface CoreV2PaintOrderOptions {
  readonly overlays?: Partial<CoreV2PaintOverlayVisibility>;
  /** Positive safe-integer cap for every consecutive render run. */
  readonly runLimit?: number;
}

export interface CoreV2PaintPlanEntry {
  readonly publicId: string;
  readonly entityId: string;
  readonly kind: CoreV2PaintKind;
  readonly lane: CoreV2PaintLane;
  readonly zIndex: number;
  readonly authoredOrder: number;
  readonly pass: number;
  readonly visible: boolean;
  readonly phase: CoreV2PaintPhase;
  readonly compatibilityKey: string;
  /** Index in the complete plan, including invisible entries. */
  readonly paintIndex: number;
}

/**
 * One bounded span of visible, consecutive, compatible primitives. Runs never
 * reorder entries and never merge across a kind, lane, pass, phase, or material
 * key. They are a batching opportunity, not a draw-call guarantee.
 */
export interface CoreV2PaintRun {
  readonly kind: CoreV2PaintKind;
  readonly lane: CoreV2PaintLane;
  readonly pass: number;
  readonly phase: CoreV2PaintPhase;
  readonly compatibilityKey: string;
  readonly start: number;
  readonly endExclusive: number;
  readonly count: number;
}

export interface CoreV2PaintPlan {
  readonly entries: readonly CoreV2PaintPlanEntry[];
  readonly visibleEntries: readonly CoreV2PaintPlanEntry[];
  /** Public identities in exact visible back-to-front order. */
  readonly renderOrder: readonly string[];
  readonly runs: readonly CoreV2PaintRun[];
  readonly runLimit: number;
}

export const DEFAULT_CORE_V2_PAINT_RUN_LIMIT = 512;

const SCENE_KINDS = new Set<CoreV2ScenePaintKind>([
  'background',
  'bar',
  'icon',
  'image',
  'rect',
  'relation',
  'text',
]);

const PAINT_LANES = new Set<CoreV2PaintLane>([
  'background-geometry',
  'background-assets',
  'ordinary-geometry',
  'relations-dynamic',
  'content-assets',
  'text',
  'interaction-overlay',
]);

interface IndexedSceneEntry {
  readonly sourceIndex: number;
  readonly publicId: string;
  readonly entityId: string;
  readonly kind: CoreV2ScenePaintKind;
  readonly lane: CoreV2PaintLane;
  readonly zIndex: number;
  readonly authoredOrder: number;
  readonly pass: number;
  readonly visible: boolean;
  readonly compatibilityKey: string;
}

/**
 * Build an immutable semantic plan without mutating or retaining the caller's
 * input array. Scene entries use ascending zIndex (back to front), then stable
 * authored order, then intra-identity pass. Selection and transformer overlays
 * are always represented and are appended in that fixed order.
 */
export function planCoreV2PaintOrder(
  primitives: readonly CoreV2PaintPrimitiveInput[],
  options: CoreV2PaintOrderOptions = {},
): CoreV2PaintPlan {
  const runLimit = options.runLimit ?? DEFAULT_CORE_V2_PAINT_RUN_LIMIT;
  assertPositiveSafeInteger(runLimit, 'runLimit');

  const sorted = primitives
    .map((primitive, sourceIndex) => validateAndDetachPrimitive(primitive, sourceIndex))
    .sort(compareSceneEntries);
  const overlays = options.overlays;
  const complete: Omit<CoreV2PaintPlanEntry, 'paintIndex'>[] = [
    ...sorted.map((entry) => ({
      publicId: entry.publicId,
      entityId: entry.entityId,
      kind: entry.kind,
      lane: entry.lane,
      zIndex: entry.zIndex,
      authoredOrder: entry.authoredOrder,
      pass: entry.pass,
      visible: entry.visible,
      phase: 'scene' as const,
      compatibilityKey: entry.compatibilityKey,
    })),
    overlayEntry('selection', overlays?.selection ?? false, 0),
    overlayEntry('transformer', overlays?.transformer ?? false, 1),
  ];
  const entries = Object.freeze(
    complete.map((entry, paintIndex) => Object.freeze({ ...entry, paintIndex })),
  );
  const visibleEntries = Object.freeze(entries.filter((entry) => entry.visible));
  const renderOrder = Object.freeze(visibleEntries.map((entry) => entry.publicId));
  const runs = buildRuns(visibleEntries, runLimit);

  return Object.freeze({ entries, visibleEntries, renderOrder, runs, runLimit });
}

function validateAndDetachPrimitive(
  primitive: CoreV2PaintPrimitiveInput,
  sourceIndex: number,
): IndexedSceneEntry {
  if (primitive === null || typeof primitive !== 'object') {
    throw new TypeError(`primitives[${sourceIndex}] must be an object`);
  }
  assertIdentity(primitive.publicId, `primitives[${sourceIndex}].publicId`);
  assertIdentity(primitive.entityId, `primitives[${sourceIndex}].entityId`);
  if (!SCENE_KINDS.has(primitive.kind)) {
    throw new TypeError(`primitives[${sourceIndex}].kind is unsupported`);
  }
  if (!PAINT_LANES.has(primitive.lane) || primitive.lane === 'interaction-overlay') {
    throw new TypeError(`primitives[${sourceIndex}].lane is not a scene paint lane`);
  }
  if (!Number.isFinite(primitive.zIndex)) {
    throw new RangeError(`primitives[${sourceIndex}].zIndex must be finite`);
  }
  assertNonNegativeSafeInteger(
    primitive.authoredOrder,
    `primitives[${sourceIndex}].authoredOrder`,
  );
  assertNonNegativeSafeInteger(primitive.pass, `primitives[${sourceIndex}].pass`);
  if (typeof primitive.visible !== 'boolean') {
    throw new TypeError(`primitives[${sourceIndex}].visible must be boolean`);
  }
  if (
    primitive.compatibilityKey !== undefined &&
    typeof primitive.compatibilityKey !== 'string'
  ) {
    throw new TypeError(`primitives[${sourceIndex}].compatibilityKey must be a string`);
  }

  return {
    sourceIndex,
    publicId: primitive.publicId,
    entityId: primitive.entityId,
    kind: primitive.kind,
    lane: primitive.lane,
    zIndex: primitive.zIndex,
    authoredOrder: primitive.authoredOrder,
    pass: primitive.pass,
    visible: primitive.visible,
    compatibilityKey: primitive.compatibilityKey ?? '',
  };
}

function compareSceneEntries(left: IndexedSceneEntry, right: IndexedSceneEntry): number {
  return left.zIndex - right.zIndex ||
    left.authoredOrder - right.authoredOrder ||
    left.pass - right.pass ||
    left.sourceIndex - right.sourceIndex;
}

function overlayEntry(
  kind: CoreV2OverlayPaintKind,
  visible: boolean,
  authoredOrder: number,
): Omit<CoreV2PaintPlanEntry, 'paintIndex'> {
  return {
    publicId: kind,
    entityId: `overlay:${kind}`,
    kind,
    lane: 'interaction-overlay',
    zIndex: Number.MAX_SAFE_INTEGER,
    authoredOrder,
    pass: authoredOrder,
    visible,
    phase: 'overlay',
    compatibilityKey: `overlay:${kind}`,
  };
}

function buildRuns(
  entries: readonly CoreV2PaintPlanEntry[],
  runLimit: number,
): readonly CoreV2PaintRun[] {
  const runs: CoreV2PaintRun[] = [];
  let start = 0;

  while (start < entries.length) {
    const first = entries[start];
    if (first === undefined) throw new Error('paint run start is missing');
    let end = start + 1;
    while (
      end < entries.length &&
      end - start < runLimit &&
      entriesCompatible(first, entries[end])
    ) {
      end += 1;
    }
    runs.push(Object.freeze({
      kind: first.kind,
      lane: first.lane,
      pass: first.pass,
      phase: first.phase,
      compatibilityKey: first.compatibilityKey,
      start,
      endExclusive: end,
      count: end - start,
    }));
    start = end;
  }

  return Object.freeze(runs);
}

function entriesCompatible(
  left: CoreV2PaintPlanEntry,
  right: CoreV2PaintPlanEntry | undefined,
): boolean {
  return right !== undefined &&
    left.kind === right.kind &&
    left.lane === right.lane &&
    left.pass === right.pass &&
    left.phase === right.phase &&
    left.compatibilityKey === right.compatibilityKey;
}

function assertIdentity(value: string, path: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${path} must be a non-empty string`);
  }
}

function assertNonNegativeSafeInteger(value: number, path: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${path} must be a non-negative safe integer`);
  }
}

function assertPositiveSafeInteger(value: number, path: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${path} must be a positive safe integer`);
  }
}
