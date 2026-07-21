export const CORE_V2_LAYOUT_ORDER_RUNTIME_REVISION = 'core-v2-layout-order-runtime/1';
export const CORE_V2_LAYOUT_ORDER_CLEANUP_REVISION = 'core-v2-layout-order-cleanup/1';

export const CORE_V2_LAYOUT_ORDER_ACTIVE_CASE_IDS = Object.freeze([
  'LAY-002',
  'LAY-003',
] as const);
export const CORE_V2_LAYOUT_ORDER_EXTENSION_CASE_IDS = Object.freeze([] as const);

type LayoutOrderCaseId = (typeof CORE_V2_LAYOUT_ORDER_ACTIVE_CASE_IDS)[number];

interface PlacementDatasetRequest {
  readonly caseId: 'LAY-002';
  readonly itemId: string;
  readonly sceneOrigin: Readonly<{ readonly x: number; readonly y: number }>;
  readonly item: Readonly<{
    readonly size: readonly [number, number];
    readonly padding: Readonly<{
      readonly top: number;
      readonly right: number;
      readonly bottom: number;
      readonly left: number;
    }>;
  }>;
  readonly componentSize: readonly [number, number];
  readonly margin: Readonly<{
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly left: number;
  }>;
  readonly placements: readonly string[];
}

interface RuntimeProbeInput {
  readonly caseId: LayoutOrderCaseId;
}

interface StackingDatasetRequest {
  readonly caseId: 'LAY-003';
  readonly siblings: readonly Readonly<{ readonly id: string; readonly zIndex: number }>[];
  readonly overlays: readonly string[];
  readonly specimen: Readonly<{
    readonly size: Readonly<{ readonly width: number; readonly height: number }>;
    readonly origin: Readonly<{ readonly x: number; readonly y: number }>;
    readonly fills: readonly string[];
  }>;
}

export interface CoreV2LayoutOrderProductAdapter {
  createPlacementDataset(input: unknown): readonly Readonly<Record<string, unknown>>[];
  createStackingDataset(input: unknown): readonly Readonly<Record<string, unknown>>[];
  resourceProbe(input: unknown): Readonly<Record<string, unknown>>;
}

export interface CoreV2LayoutOrderRuntime {
  readonly product: CoreV2LayoutOrderProductAdapter;
  postDestroyProductProbe(): Readonly<Record<string, unknown>>;
}

const PLACEMENTS = Object.freeze([
  'left',
  'left-top',
  'left-bottom',
  'top',
  'right',
  'right-top',
  'right-bottom',
  'bottom',
  'center',
  'none',
] as const);

/**
 * Create the shared zero-resource runtime for layout placement and paint order.
 *
 * LAY-002 placement and LAY-003 stacking deliberately share this lifecycle
 * owner while retaining distinct, exact-key dataset construction inputs.
 */
export function createCoreV2LayoutOrderRuntime(
  caseId: LayoutOrderCaseId,
): CoreV2LayoutOrderRuntime {
  requireCaseId(caseId);
  const journal = new RuntimeJournal();
  let datasetBuildCount = 0;
  let stackingDatasetBuildCount = 0;
  let resourceProbeCount = 0;
  let released = false;
  let cleanupProbe: Readonly<Record<string, unknown>> | null = null;

  const product: CoreV2LayoutOrderProductAdapter = Object.freeze({
    createPlacementDataset(inputValue: unknown) {
      invariant(!released, 'dataset construction requires an active runtime');
      invariant(caseId === 'LAY-002', 'placement dataset belongs to LAY-002');
      const input = placementRequest(inputValue);
      datasetBuildCount += 1;
      const [itemWidth, itemHeight] = input.item.size;
      const [componentWidth, componentHeight] = input.componentSize;
      const dataset = deepFreeze([{
        type: 'item',
        id: input.itemId,
        size: { width: itemWidth, height: itemHeight },
        padding: clone(input.item.padding),
        contentOrientation: 'follow-item',
        attrs: {
          x: input.sceneOrigin.x,
          y: input.sceneOrigin.y,
        },
        components: input.placements.map((placement) => ({
          type: 'bar',
          id: placement,
          source: { type: 'rect', fill: '#336699ff' },
          size: { width: componentWidth, height: componentHeight },
          placement,
          margin: clone(input.margin),
        })),
      }]) as readonly Readonly<Record<string, unknown>>[];
      journal.append('placement-dataset-created', {
        caseId,
        datasetBuildCount,
        componentCount: input.placements.length,
      });
      return dataset;
    },

    createStackingDataset(inputValue: unknown) {
      invariant(!released, 'dataset construction requires an active runtime');
      invariant(caseId === 'LAY-003', 'stacking dataset belongs to LAY-003');
      const input = stackingRequest(inputValue);
      stackingDatasetBuildCount += 1;
      const dataset = deepFreeze(input.siblings.map((sibling, index) => ({
        type: 'rect',
        id: sibling.id,
        size: clone(input.specimen.size),
        fill: input.specimen.fills[index],
        attrs: {
          x: input.specimen.origin.x,
          y: input.specimen.origin.y,
          zIndex: sibling.zIndex,
        },
      }))) as readonly Readonly<Record<string, unknown>>[];
      journal.append('stacking-dataset-created', {
        caseId,
        stackingDatasetBuildCount,
        siblingCount: input.siblings.length,
        overlayCount: input.overlays.length,
      });
      return dataset;
    },

    resourceProbe(inputValue: unknown): Readonly<Record<string, unknown>> {
      invariant(!released, 'resource probe requires an active runtime');
      const input = runtimeProbeInput(inputValue);
      invariant(input.caseId === caseId, 'resource probe case identity');
      resourceProbeCount += 1;
      journal.append('layout-order-runtime-observed', { caseId, resourceProbeCount });
      return deepFreeze({
        revision: CORE_V2_LAYOUT_ORDER_RUNTIME_REVISION,
        caseId,
        ownership: zeroOwnership(),
        stats: { datasetBuildCount, stackingDatasetBuildCount, resourceProbeCount },
        journal: journal.snapshot(),
      });
    },
  });

  return Object.freeze({
    product,
    postDestroyProductProbe(): Readonly<Record<string, unknown>> {
      if (cleanupProbe !== null) return cleanupProbe;
      released = true;
      journal.append('layout-order-runtime-released', {
        caseId,
        datasetBuildCount,
        resourceProbeCount,
      });
      cleanupProbe = deepFreeze({
        revision: CORE_V2_LAYOUT_ORDER_CLEANUP_REVISION,
        caseId,
        runtimeCounts: zeroOwnership(),
        stats: { datasetBuildCount, stackingDatasetBuildCount, resourceProbeCount },
        journal: journal.snapshot(),
      });
      return cleanupProbe;
    },
  });
}

function stackingRequest(value: unknown): StackingDatasetRequest {
  const input = requireRecord(value, 'stacking dataset request');
  assertExactKeys(
    input,
    ['caseId', 'overlays', 'siblings', 'specimen'],
    'stacking dataset request',
  );
  invariant(input.caseId === 'LAY-003', 'stacking dataset case identity');
  invariant(Array.isArray(input.siblings) && input.siblings.length > 0, 'stacking siblings');
  const siblings = input.siblings.map((value, index) => {
    const sibling = requireRecord(value, `stacking sibling ${index}`);
    assertExactKeys(sibling, ['id', 'zIndex'], `stacking sibling ${index}`);
    return deepFreeze({
      id: requireString(sibling.id, `stacking sibling ${index}.id`),
      zIndex: requireFinite(sibling.zIndex, `stacking sibling ${index}.zIndex`),
    });
  });
  invariant(new Set(siblings.map(({ id }) => id)).size === siblings.length, 'stacking sibling IDs');
  invariant(Array.isArray(input.overlays), 'stacking overlays');
  const overlays = input.overlays.map((value, index) => (
    requireString(value, `stacking overlay ${index}`)
  ));
  invariant(
    overlays.length === 2 && overlays[0] === 'selection' && overlays[1] === 'transformer',
    'stacking overlays must preserve selection then transformer',
  );
  const specimen = requireRecord(input.specimen, 'stacking specimen');
  assertExactKeys(specimen, ['fills', 'origin', 'size'], 'stacking specimen');
  const size = sizeRecord(specimen.size, 'stacking specimen size');
  const origin = point(specimen.origin, 'stacking specimen origin');
  invariant(Array.isArray(specimen.fills), 'stacking specimen fills');
  const fills = specimen.fills.map((value, index) => (
    requireString(value, `stacking specimen fill ${index}`)
  ));
  invariant(fills.length === siblings.length, 'stacking specimen fill count');
  return deepFreeze({ caseId: 'LAY-003', siblings, overlays, specimen: { size, origin, fills } });
}

class RuntimeJournal {
  private readonly entries: Readonly<Record<string, unknown>>[] = [];
  private sequence = 0;

  public append(event: string, details: Readonly<Record<string, unknown>>): void {
    this.entries.push(deepFreeze({ sequence: ++this.sequence, event, ...details }));
  }

  public snapshot(): readonly Readonly<Record<string, unknown>>[] {
    return Object.freeze(this.entries.map((entry) => deepFreeze({ ...entry })));
  }
}

function placementRequest(value: unknown): PlacementDatasetRequest {
  const input = requireRecord(value, 'placement dataset request');
  assertExactKeys(
    input,
    ['caseId', 'componentSize', 'item', 'itemId', 'margin', 'placements', 'sceneOrigin'],
    'placement dataset request',
  );
  invariant(input.caseId === 'LAY-002', 'placement dataset case identity');
  const itemId = requireString(input.itemId, 'placement itemId');
  const sceneOrigin = point(input.sceneOrigin, 'placement scene origin');
  const item = requireRecord(input.item, 'placement item');
  assertExactKeys(item, ['padding', 'size'], 'placement item');
  const size = finiteTuple(item.size, 2, 'placement item size', true);
  const componentSize = finiteTuple(input.componentSize, 2, 'placement component size', true);
  const padding = edges(item.padding, 'placement padding');
  const margin = edges(input.margin, 'placement margin');
  invariant(Array.isArray(input.placements), 'placement list must be an array');
  const placements = input.placements.map((placement, index) => (
    requireString(placement, `placement list ${index}`)
  ));
  invariant(placements.length > 0, 'placement list must not be empty');
  invariant(new Set(placements).size === placements.length, 'placement list must be unique');
  invariant(
    placements.every((placement) => PLACEMENTS.includes(placement as (typeof PLACEMENTS)[number])),
    'placement list contains an unsupported value',
  );
  return deepFreeze({
    caseId: 'LAY-002',
    itemId,
    sceneOrigin,
    item: { size, padding },
    componentSize,
    margin,
    placements,
  });
}

function point(value: unknown, label: string): PlacementDatasetRequest['sceneOrigin'] {
  const record = requireRecord(value, label);
  assertExactKeys(record, ['x', 'y'], label);
  return deepFreeze({
    x: requireFinite(record.x, `${label}.x`),
    y: requireFinite(record.y, `${label}.y`),
  });
}

function sizeRecord(
  value: unknown,
  label: string,
): StackingDatasetRequest['specimen']['size'] {
  const record = requireRecord(value, label);
  assertExactKeys(record, ['height', 'width'], label);
  const width = requireFinite(record.width, `${label}.width`);
  const height = requireFinite(record.height, `${label}.height`);
  invariant(width >= 0 && height >= 0, `${label} must be non-negative`);
  return deepFreeze({ width, height });
}

function runtimeProbeInput(value: unknown): RuntimeProbeInput {
  const input = requireRecord(value, 'runtime probe input');
  assertExactKeys(input, ['caseId'], 'runtime probe input');
  return Object.freeze({ caseId: requireCaseId(input.caseId) });
}

function requireCaseId(value: unknown): LayoutOrderCaseId {
  invariant(value === 'LAY-002' || value === 'LAY-003', 'unsupported case identity');
  return value;
}

function edges(value: unknown, label: string): PlacementDatasetRequest['margin'] {
  const record = requireRecord(value, label);
  assertExactKeys(record, ['bottom', 'left', 'right', 'top'], label);
  return deepFreeze({
    top: requireFinite(record.top, `${label}.top`),
    right: requireFinite(record.right, `${label}.right`),
    bottom: requireFinite(record.bottom, `${label}.bottom`),
    left: requireFinite(record.left, `${label}.left`),
  });
}

function finiteTuple(
  value: unknown,
  length: number,
  label: string,
  nonNegative: boolean,
): readonly [number, number] {
  invariant(Array.isArray(value) && value.length === length, `${label} must have length ${length}`);
  const tuple = value.map((entry, index) => {
    const number = requireFinite(entry, `${label}[${index}]`);
    invariant(!nonNegative || number >= 0, `${label}[${index}] must be non-negative`);
    return number;
  });
  return Object.freeze([tuple[0] as number, tuple[1] as number]);
}

function zeroOwnership(): Readonly<Record<string, number>> {
  return Object.freeze({
    activeSessionCount: 0,
    retainedDatasetCount: 0,
    rendererObjectCount: 0,
    subscriptionCount: 0,
    pendingWorkCount: 0,
  });
}

function assertExactKeys(
  value: Readonly<Record<string, unknown>>,
  keys: readonly string[],
  label: string,
): void {
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) invariant(allowed.has(key), `${label} unknown key ${key}`);
  for (const key of keys) invariant(Object.hasOwn(value, key), `${label} missing key ${key}`);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  invariant(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  return value as Record<string, unknown>;
}

function requireString(value: unknown, label: string): string {
  invariant(typeof value === 'string' && value.length > 0, `${label} must be a non-empty string`);
  return value;
}

function requireFinite(value: unknown, label: string): number {
  invariant(typeof value === 'number' && Number.isFinite(value), `${label} must be finite`);
  return value;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}

function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid Core v2 layout-order runtime: ${message}`);
}
