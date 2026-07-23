import type {
  CoreOperation,
  CoreView,
  EntityInput,
  EntityPatch,
  SceneDocument,
  TransactionBatch,
} from '../../core-v1/contracts';
import { CoreValidationError } from '../../core-v1/errors';
import {
  type CanonicalEntity,
  normalizeDocument,
} from '../../core-v1/validation';
import type { ParseDiagnostic, ParsePatchMapOptions } from '../contracts';
import { parsePatchMapV010 } from '../parser';
import type { MaterializedCoreV2Dataset } from './dataset';

export type CoreV2ReconcileDiagnosticSeverity = 'warning' | 'error';

export type CoreV2ReconcileDiagnosticCode =
  | 'BACKGROUND_CHANGE_UNSUPPORTED'
  | 'ENTITY_ORDER_CHANGE_UNSUPPORTED'
  | 'UNPROJECTED_SEMANTIC_DELTA'
  | 'DENSE_PROJECTION_DIAGNOSTIC';

export interface CoreV2ReconcileDiagnostic {
  readonly severity: CoreV2ReconcileDiagnosticSeverity;
  readonly code: CoreV2ReconcileDiagnosticCode;
  readonly message: string;
  readonly path?: string;
  readonly sourceCode?: string;
  readonly scope?: 'current' | 'candidate';
}

export interface CoreV2ReconcileSummary {
  readonly operationCount: number;
  readonly added: number;
  readonly patched: number;
  readonly visibilityChanged: number;
  readonly removed: number;
  readonly replaced: number;
  readonly unchanged: number;
  readonly viewChanged: boolean;
  readonly unsupported: number;
}

export interface CoreV2DenseReconcilePlan {
  /** One atomic transaction for the inherited dense-store commit seam. */
  readonly batch: TransactionBatch;
  /** False means applying the batch would leave an unsupported observable delta. */
  readonly safeToCommit: boolean;
  readonly diagnostics: readonly CoreV2ReconcileDiagnostic[];
  readonly summary: CoreV2ReconcileSummary;
}

export interface CoreV2ReconcileOptions {
  readonly id?: string;
  readonly recordHistory?: boolean;
  /** Optional logical selection replacement committed in the same dense batch. */
  readonly selectionIds?: readonly string[];
  /**
   * Stable dense IDs whose same-z authored order may change without rebuilding
   * their rows. Every ID participating in an order inversion must be present.
   */
  readonly allowedRetainedOrderIds?: readonly string[];
}

/**
 * Plan one incremental dense-store transaction from two authoritative scene
 * projections. The planner never loads a replacement scene and never retains a
 * mutable alias into either caller document.
 */
export function planCoreV2SceneReconcile(
  current: SceneDocument,
  candidate: SceneDocument,
  options: CoreV2ReconcileOptions = {},
): CoreV2DenseReconcilePlan {
  const currentEntities = normalizeDocument(current);
  const candidateEntities = normalizeDocument(candidate);
  const currentById = indexEntities(currentEntities);
  const candidateById = indexEntities(candidateEntities);
  const diagnostics: CoreV2ReconcileDiagnostic[] = [];
  const removedRelations: CoreOperation[] = [];
  const removedEntities: CoreOperation[] = [];
  const addedEntities: CoreOperation[] = [];
  const changedEntities: CoreOperation[] = [];
  const addedRelations: CoreOperation[] = [];
  const changedRelations: CoreOperation[] = [];
  let added = 0;
  let patched = 0;
  let visibilityChanged = 0;
  let removed = 0;
  let replaced = 0;
  let unchanged = 0;
  const allowedRetainedOrderIds = normalizedAllowedRetainedOrderIds(
    options.allowedRetainedOrderIds,
  );

  for (const entity of currentEntities) {
    const next = candidateById.get(entity.id);
    if (next && next.kind === entity.kind) continue;
    const operation = freezeOperation({ type: 'remove', target: entity.id });
    if (entity.kind === 'relation') removedRelations.push(operation);
    else removedEntities.push(operation);
    removed += 1;
    if (next) replaced += 1;
  }

  for (const entity of candidateEntities) {
    const previous = currentById.get(entity.id);
    if (!previous || previous.kind !== entity.kind) {
      const operation = freezeOperation({ type: 'add', entity: canonicalToInput(entity) });
      if (entity.kind === 'relation') addedRelations.push(operation);
      else addedEntities.push(operation);
      added += 1;
      continue;
    }

    const operations = entityDelta(previous, entity);
    if (operations.length === 0) {
      unchanged += 1;
      continue;
    }
    for (const operation of operations) {
      if (operation.type === 'patch') patched += 1;
      else visibilityChanged += 1;
      if (entity.kind === 'relation') changedRelations.push(operation);
      else changedEntities.push(operation);
    }
  }

  if (authoredOrderChanged(currentEntities, candidateEntities, allowedRetainedOrderIds)) {
    diagnostics.push(freezeDiagnostic({
      severity: 'error',
      code: 'ENTITY_ORDER_CHANGE_UNSUPPORTED',
      message: 'Retained same-z entity order changed, but the dense transaction seam has no reorder operation',
      path: '$.entities',
    }));
  }

  const currentBackground = normalizedBackground(current.background, '$.current.background');
  const candidateBackground = normalizedBackground(candidate.background, '$.candidate.background');
  if (currentBackground !== candidateBackground) {
    diagnostics.push(freezeDiagnostic({
      severity: 'error',
      code: 'BACKGROUND_CHANGE_UNSUPPORTED',
      message: 'Scene background changes require an explicit renderer-owned background operation',
      path: '$.background',
    }));
  }

  const currentView = normalizedView(current.view, '$.current.view');
  const candidateView = normalizedView(candidate.view, '$.candidate.view');
  const viewChanged = !sameView(currentView, candidateView);
  const selectionOperations = options.selectionIds === undefined
    ? []
    : [freezeOperation({
        type: 'selection',
        targets: normalizedSelectionIds(options.selectionIds),
      })];
  const viewOperations: CoreOperation[] = viewChanged
    ? [freezeOperation({ type: 'view', view: candidateView })]
    : [];
  const operations = Object.freeze([
    ...removedRelations,
    ...removedEntities,
    ...addedEntities,
    ...changedEntities,
    ...addedRelations,
    ...changedRelations,
    ...selectionOperations,
    ...viewOperations,
  ]);
  const batch = freezeBatch(operations, options);
  const unsupported = diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length;

  return freezePlan({
    batch,
    safeToCommit: unsupported === 0,
    diagnostics,
    summary: {
      operationCount: operations.length,
      added,
      patched,
      visibilityChanged,
      removed,
      replaced,
      unchanged,
      viewChanged,
      unsupported,
    },
  });
}

function normalizedSelectionIds(values: readonly string[]): readonly string[] {
  if (!Array.isArray(values)) throw new TypeError('selectionIds must be an array');
  return Object.freeze([...new Set(values.map((value, index) => {
    if (typeof value !== 'string' || value.length === 0) {
      throw new TypeError(`selectionIds[${index}] must be a non-empty string`);
    }
    return value;
  }))]);
}

/**
 * Adapter for normalized PATCH MAP authority. Parsing stays outside the dense
 * store, while the returned batch remains the exact SceneDocument reconcile
 * plan consumed by `CoreScene.commit`.
 */
export function planCoreV2DatasetReconcile(
  current: MaterializedCoreV2Dataset,
  candidate: MaterializedCoreV2Dataset,
  parseOptions: ParsePatchMapOptions = {},
  options: CoreV2ReconcileOptions = {},
): CoreV2DenseReconcilePlan {
  const currentProjection = parsePatchMapV010(current.dataset, parseOptions);
  const candidateProjection = parsePatchMapV010(candidate.dataset, parseOptions);
  const planned = planCoreV2SceneReconcile(
    currentProjection.document,
    candidateProjection.document,
    options,
  );
  const diagnostics = [
    ...planned.diagnostics,
    ...projectionDiagnostics('current', currentProjection.diagnostics),
    ...projectionDiagnostics('candidate', candidateProjection.diagnostics),
  ];

  if (
    current.semanticHash !== candidate.semanticHash &&
    planned.batch.operations.length === 0 &&
    planned.diagnostics.length === 0
  ) {
    diagnostics.push(freezeDiagnostic({
      severity: 'warning',
      code: 'UNPROJECTED_SEMANTIC_DELTA',
      message: 'The authoritative semantic dataset changed without a dense renderer projection change',
      path: '$',
      scope: 'candidate',
    }));
  }

  const unsupported = diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length;
  return freezePlan({
    batch: planned.batch,
    safeToCommit: unsupported === 0,
    diagnostics,
    summary: {
      ...planned.summary,
      unsupported,
    },
  });
}

function indexEntities(entities: readonly CanonicalEntity[]): ReadonlyMap<string, CanonicalEntity> {
  return new Map(entities.map((entity) => [entity.id, entity]));
}

function entityDelta(
  current: CanonicalEntity,
  candidate: CanonicalEntity,
): readonly CoreOperation[] {
  const changes: Record<string, unknown> = {};
  for (const field of patchFields(candidate.kind)) {
    if (!fieldEqual(current[field], candidate[field])) changes[field] = detachedValue(candidate[field]);
  }

  const operations: CoreOperation[] = [];
  if (Object.keys(changes).length > 0) {
    operations.push(freezeOperation({
      type: 'patch',
      target: candidate.id,
      changes: Object.freeze(changes) as EntityPatch,
    }));
  }
  if (current.visible !== candidate.visible) {
    operations.push(freezeOperation({
      type: 'visibility',
      target: candidate.id,
      visible: candidate.visible,
    }));
  }
  return Object.freeze(operations);
}

type CanonicalPatchField = Exclude<keyof EntityPatch, 'visible'>;

const COMMON_PATCH_FIELDS = Object.freeze([
  'opacity',
  'interactive',
  'zIndex',
  'tags',
] as const satisfies readonly CanonicalPatchField[]);

const GEOMETRY_PATCH_FIELDS = Object.freeze([
  'x',
  'y',
  'width',
  'height',
  'rotation',
] as const satisfies readonly CanonicalPatchField[]);

function patchFields(kind: CanonicalEntity['kind']): readonly CanonicalPatchField[] {
  switch (kind) {
    case 'rect':
      return [...GEOMETRY_PATCH_FIELDS, ...COMMON_PATCH_FIELDS, 'fill', 'stroke', 'strokeWidth', 'radius'];
    case 'text':
      return [
        ...GEOMETRY_PATCH_FIELDS,
        ...COMMON_PATCH_FIELDS,
        'text',
        'color',
        'fontSize',
        'fontFamily',
        'fontWeight',
        'align',
        'maxLines',
      ];
    case 'image':
      return [...GEOMETRY_PATCH_FIELDS, ...COMMON_PATCH_FIELDS, 'source', 'tint', 'fit'];
    case 'bar':
      return [
        ...GEOMETRY_PATCH_FIELDS,
        ...COMMON_PATCH_FIELDS,
        'value',
        'min',
        'max',
        'fill',
        'trackFill',
        'radius',
      ];
    case 'relation':
      return [...COMMON_PATCH_FIELDS, 'from', 'to', 'color', 'lineWidth'];
  }
}

function canonicalToInput(entity: CanonicalEntity): EntityInput {
  const tags = Object.freeze([...entity.tags]);
  const common = {
    id: entity.id,
    opacity: entity.opacity,
    visible: entity.visible,
    interactive: entity.interactive,
    zIndex: entity.zIndex,
    tags,
  };
  const geometry = {
    ...common,
    x: entity.x,
    y: entity.y,
    width: entity.width,
    height: entity.height,
    rotation: entity.rotation,
  };

  switch (entity.kind) {
    case 'rect':
      return Object.freeze({
        ...geometry,
        kind: entity.kind,
        fill: entity.fill,
        stroke: entity.stroke,
        strokeWidth: entity.strokeWidth,
        radius: entity.radius,
      });
    case 'text':
      return Object.freeze({
        ...geometry,
        kind: entity.kind,
        text: entity.text,
        color: entity.color,
        fontSize: entity.fontSize,
        fontFamily: entity.fontFamily,
        fontWeight: entity.fontWeight,
        align: entity.align,
        maxLines: entity.maxLines,
      });
    case 'image':
      return Object.freeze({
        ...geometry,
        kind: entity.kind,
        source: entity.source,
        tint: entity.tint,
        fit: entity.fit,
      });
    case 'bar':
      return Object.freeze({
        ...geometry,
        kind: entity.kind,
        value: entity.value,
        min: entity.min,
        max: entity.max,
        fill: entity.fill,
        trackFill: entity.trackFill,
        radius: entity.radius,
      });
    case 'relation':
      return Object.freeze({
        ...common,
        kind: entity.kind,
        from: entity.from,
        to: entity.to,
        color: entity.color,
        lineWidth: entity.lineWidth,
      });
  }
}

function authoredOrderChanged(
  current: readonly CanonicalEntity[],
  candidate: readonly CanonicalEntity[],
  allowedRetainedOrderIds: ReadonlySet<string>,
): boolean {
  const candidateById = indexEntities(candidate);
  const retainedSameZ = new Set<string>();
  for (const entity of current) {
    const next = candidateById.get(entity.id);
    if (next?.kind === entity.kind && next.zIndex === entity.zIndex) retainedSameZ.add(entity.id);
  }
  const currentOrder = orderByZIndex(current, retainedSameZ);
  const candidateOrder = orderByZIndex(candidate, retainedSameZ);
  for (const [zIndex, currentIds] of currentOrder) {
    const candidateIds = candidateOrder.get(zIndex) ?? [];
    if (
      !fieldEqual(currentIds, candidateIds) &&
      !orderChangeIsScoped(currentIds, candidateIds, allowedRetainedOrderIds)
    ) {
      return true;
    }
  }
  return false;
}

function orderChangeIsScoped(
  currentIds: readonly string[],
  candidateIds: readonly string[],
  allowedRetainedOrderIds: ReadonlySet<string>,
): boolean {
  if (currentIds.length !== candidateIds.length) return false;
  const candidatePosition = new Map(candidateIds.map((id, index) => [id, index]));
  if (candidatePosition.size !== candidateIds.length) return false;
  if (currentIds.some((id) => !candidatePosition.has(id))) return false;

  const positions = currentIds.map((id) => candidatePosition.get(id));
  let prefixMaximum = -1;
  for (let index = 0; index < currentIds.length; index += 1) {
    const id = currentIds[index];
    const position = positions[index];
    if (id === undefined || position === undefined) return false;
    if (!allowedRetainedOrderIds.has(id) && prefixMaximum > position) return false;
    prefixMaximum = Math.max(prefixMaximum, position);
  }

  let suffixMinimum = Number.POSITIVE_INFINITY;
  for (let index = currentIds.length - 1; index >= 0; index -= 1) {
    const id = currentIds[index];
    const position = positions[index];
    if (id === undefined || position === undefined) return false;
    if (!allowedRetainedOrderIds.has(id) && suffixMinimum < position) return false;
    suffixMinimum = Math.min(suffixMinimum, position);
  }
  return true;
}

function normalizedAllowedRetainedOrderIds(
  values: readonly string[] | undefined,
): ReadonlySet<string> {
  if (values === undefined) return new Set();
  const detached = [...values];
  detached.forEach((value, index) => {
    if (typeof value !== 'string' || value.length === 0) {
      throw new CoreValidationError(
        `$.options.allowedRetainedOrderIds[${index}]`,
        'expected a non-empty stable dense entity ID',
      );
    }
  });
  return new Set(detached);
}

function orderByZIndex(
  entities: readonly CanonicalEntity[],
  retainedIds: ReadonlySet<string>,
): ReadonlyMap<number, readonly string[]> {
  const result = new Map<number, string[]>();
  for (const entity of entities) {
    if (!retainedIds.has(entity.id)) continue;
    const ids = result.get(entity.zIndex) ?? [];
    ids.push(entity.id);
    result.set(entity.zIndex, ids);
  }
  return result;
}

function normalizedView(view: CoreView | undefined, path: string): Readonly<Required<CoreView>> {
  const value = view ?? { x: 0, y: 0, scale: 1, rotation: 0 };
  if (
    !Number.isFinite(value.x) ||
    !Number.isFinite(value.y) ||
    !Number.isFinite(value.scale) ||
    value.scale <= 0 ||
    !Number.isFinite(value.rotation ?? 0)
  ) {
    throw new CoreValidationError(path, 'expected finite x/y/rotation and positive scale');
  }
  return Object.freeze({
    x: value.x,
    y: value.y,
    scale: value.scale,
    rotation: value.rotation ?? 0,
  });
}

function normalizedBackground(value: number | undefined, path: string): number {
  const background = value ?? 0xf7f8faff;
  if (!Number.isInteger(background) || background < 0 || background > 0xffffffff) {
    throw new CoreValidationError(path, 'expected a packed 0xRRGGBBAA integer');
  }
  return background >>> 0;
}

function sameView(left: Required<CoreView>, right: Required<CoreView>): boolean {
  return left.x === right.x &&
    left.y === right.y &&
    left.scale === right.scale &&
    left.rotation === right.rotation;
}

function projectionDiagnostics(
  scope: 'current' | 'candidate',
  diagnostics: readonly ParseDiagnostic[],
): readonly CoreV2ReconcileDiagnostic[] {
  return diagnostics.map((diagnostic) => freezeDiagnostic({
    severity: diagnostic.level,
    code: 'DENSE_PROJECTION_DIAGNOSTIC',
    message: diagnostic.message,
    path: diagnostic.path,
    sourceCode: diagnostic.code,
    scope,
  }));
}

function freezeBatch(
  operations: readonly CoreOperation[],
  options: CoreV2ReconcileOptions,
): TransactionBatch {
  return Object.freeze({
    operations,
    ...(options.id === undefined ? {} : { id: options.id }),
    ...(options.recordHistory === undefined ? {} : { recordHistory: options.recordHistory }),
  });
}

function freezeOperation<T extends CoreOperation>(operation: T): T {
  return Object.freeze(operation);
}

function freezeDiagnostic(diagnostic: CoreV2ReconcileDiagnostic): CoreV2ReconcileDiagnostic {
  return Object.freeze(diagnostic);
}

function freezePlan(input: {
  readonly batch: TransactionBatch;
  readonly safeToCommit: boolean;
  readonly diagnostics: readonly CoreV2ReconcileDiagnostic[];
  readonly summary: CoreV2ReconcileSummary;
}): CoreV2DenseReconcilePlan {
  return Object.freeze({
    batch: input.batch,
    safeToCommit: input.safeToCommit,
    diagnostics: Object.freeze([...input.diagnostics]),
    summary: Object.freeze(input.summary),
  });
}

function detachedValue(value: unknown): unknown {
  if (Array.isArray(value)) return Object.freeze([...(value as readonly unknown[])]);
  return value;
}

function fieldEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  return left.every((value, index) => Object.is(value, right[index]));
}
