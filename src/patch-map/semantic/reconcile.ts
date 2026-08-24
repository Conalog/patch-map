import type {
  CoreOperation,
  SceneDocument,
} from '../dense/contracts';
import {
  type CanonicalEntity,
  normalizeDocument,
} from '../dense/validation';
import type { ParsePatchMapOptions } from '../contracts';
import { parsePatchMapV010 } from '../parser';
import type { MaterializedPatchMapDataset } from './dataset';
import type {
  PatchMapDenseReconcilePlan,
  PatchMapReconcileDiagnostic,
  PatchMapReconcileOptions,
} from './reconcile/contracts';
import {
  canonicalToInput,
  entityDelta,
} from './reconcile/entity-delta';
import {
  authoredOrderChanged,
  normalizedAllowedRetainedOrderIds,
} from './reconcile/retained-order';
import {
  freezeBatch,
  freezeDiagnostic,
  freezeOperation,
  freezePlan,
  normalizedBackground,
  normalizedSelectionIds,
  normalizedView,
  projectionDiagnostics,
  sameOptionalView,
  sameView,
} from './reconcile/result-values';

export * from './reconcile/contracts';

/** Warm the immutable ID-position index during one-time scene publication. */
export function primePatchMapParsedSceneReconcileIncremental(
  document: SceneDocument,
): boolean {
  const entities = document.entities as unknown as readonly CanonicalEntity[];
  indexEntityPositions(entities);
  return entities.length > 0;
}

/**
 * Plan one incremental dense-store transaction from two authoritative scene
 * projections. The planner never loads a replacement scene and never retains a
 * mutable alias into either caller document.
 */
export function planPatchMapSceneReconcile(
  current: SceneDocument,
  candidate: SceneDocument,
  options: PatchMapReconcileOptions = {},
): PatchMapDenseReconcilePlan {
  const currentEntities = normalizeDocument(current);
  const candidateEntities = normalizeDocument(candidate);
  return planNormalizedPatchMapSceneReconcile(
    current,
    candidate,
    currentEntities,
    candidateEntities,
    options,
  );
}

/**
 * Reconcile parser-produced documents without normalizing the same canonical
 * entity rows a second time. Callers must own both results from
 * `parsePatchMapV010`; arbitrary SceneDocument input belongs in the validating
 * `planPatchMapSceneReconcile` entry point above.
 */
export function planPatchMapParsedSceneReconcile(
  current: SceneDocument,
  candidate: SceneDocument,
  options: PatchMapReconcileOptions = {},
): PatchMapDenseReconcilePlan {
  return planNormalizedPatchMapSceneReconcile(
    current,
    candidate,
    current.entities as unknown as readonly CanonicalEntity[],
    candidate.entities as unknown as readonly CanonicalEntity[],
    options,
  );
}

/**
 * Guarded identity-stable planner for parser-owned flat-root edits. It scans
 * the ordered row arrays to prove every unlisted entity is still the exact
 * immutable record, then computes deltas only for the supplied dirty IDs.
 */
export function planPatchMapParsedSceneReconcileIncremental(
  current: SceneDocument,
  candidate: SceneDocument,
  dirtyEntityIds: readonly string[],
  options: PatchMapReconcileOptions = {},
  exactUnchangedEntityIdentity = false,
): PatchMapDenseReconcilePlan | null {
  if (
    dirtyEntityIds.length === 0 ||
    current.entities.length !== candidate.entities.length ||
    current.background !== candidate.background ||
    !sameOptionalView(current.view, candidate.view)
  ) {
    return null;
  }
  if (exactUnchangedEntityIdentity) {
    return planExactIdentityPatchMapSceneReconcile(
      current,
      candidate,
      dirtyEntityIds,
      options,
    );
  }
  const dirty = new Set(dirtyEntityIds);
  if (dirty.size !== dirtyEntityIds.length) return null;
  const changedEntities: CoreOperation[] = [];
  const changedRelations: CoreOperation[] = [];
  let patched = 0;
  let visibilityChanged = 0;
  let changedEntityCount = 0;

  for (let index = 0; index < candidate.entities.length; index += 1) {
    const before = current.entities[index] as CanonicalEntity | undefined;
    const after = candidate.entities[index] as CanonicalEntity | undefined;
    if (
      before === undefined ||
      after === undefined ||
      before.id !== after.id ||
      before.kind !== after.kind
    ) {
      return null;
    }
    if (before === after) {
      if (dirty.has(after.id)) dirty.delete(after.id);
      continue;
    }
    if (!dirty.delete(after.id) || before.zIndex !== after.zIndex) return null;
    const operations = entityDelta(before, after);
    if (operations.length === 0) continue;
    changedEntityCount += 1;
    for (const operation of operations) {
      if (operation.type === 'patch') patched += 1;
      else visibilityChanged += 1;
      if (after.kind === 'relation') changedRelations.push(operation);
      else changedEntities.push(operation);
    }
  }
  if (dirty.size !== 0) return null;

  const selectionOperations = options.selectionIds === undefined
    ? []
    : [freezeOperation({
        type: 'selection',
        targets: normalizedSelectionIds(options.selectionIds),
      })];
  const operations = Object.freeze([
    ...changedEntities,
    ...changedRelations,
    ...selectionOperations,
  ]);
  return freezePlan({
    batch: freezeBatch(operations, options),
    safeToCommit: true,
    diagnostics: Object.freeze([]),
    summary: {
      operationCount: operations.length,
      added: 0,
      patched,
      visibilityChanged,
      removed: 0,
      replaced: 0,
      unchanged: candidate.entities.length - changedEntityCount,
      viewChanged: false,
      unsupported: 0,
    },
  });
}

/**
 * Parser-owned direct/incremental projections preserve every undeclared row
 * by exact object identity and retain entity order. The Core calls this path
 * only after that parser authority succeeds, so subsequent edits can reuse
 * the prior ID-to-position index and visit only declared dirty entities.
 *
 * Arbitrary callers must use the guarded scan above; this helper deliberately
 * does not infer or weaken the identity-lineage precondition.
 */
function planExactIdentityPatchMapSceneReconcile(
  current: SceneDocument,
  candidate: SceneDocument,
  dirtyEntityIds: readonly string[],
  options: PatchMapReconcileOptions,
): PatchMapDenseReconcilePlan | null {
  const dirty = new Set(dirtyEntityIds);
  if (dirty.size !== dirtyEntityIds.length) return null;
  const currentEntities = current.entities as unknown as readonly CanonicalEntity[];
  const candidateEntities = candidate.entities as unknown as readonly CanonicalEntity[];
  const positions = indexEntityPositions(currentEntities);
  const changedEntities: CoreOperation[] = [];
  const changedRelations: CoreOperation[] = [];
  let patched = 0;
  let visibilityChanged = 0;
  let changedEntityCount = 0;

  for (const entityId of dirtyEntityIds) {
    const index = positions.get(entityId);
    const before = index === undefined ? undefined : currentEntities[index];
    const after = index === undefined ? undefined : candidateEntities[index];
    if (
      before === undefined ||
      after === undefined ||
      before.id !== entityId ||
      after.id !== entityId ||
      before.kind !== after.kind ||
      before.zIndex !== after.zIndex
    ) {
      return null;
    }
    const operations = entityDelta(before, after);
    if (operations.length === 0) continue;
    changedEntityCount += 1;
    for (const operation of operations) {
      if (operation.type === 'patch') patched += 1;
      else visibilityChanged += 1;
      (after.kind === 'relation' ? changedRelations : changedEntities)
        .push(operation);
    }
  }

  // Parser identity lineage also guarantees identical IDs at every retained
  // position. Transfer the immutable index so the next edit stays O(dirty).
  ENTITY_POSITION_INDEX_CACHE.set(candidateEntities, positions);
  const selectionOperations = options.selectionIds === undefined
    ? []
    : [freezeOperation({
        type: 'selection',
        targets: normalizedSelectionIds(options.selectionIds),
      })];
  const operations = Object.freeze([
    ...changedEntities,
    ...changedRelations,
    ...selectionOperations,
  ]);
  return freezePlan({
    batch: freezeBatch(operations, options),
    safeToCommit: true,
    diagnostics: Object.freeze([]),
    summary: {
      operationCount: operations.length,
      added: 0,
      patched,
      visibilityChanged,
      removed: 0,
      replaced: 0,
      unchanged: candidateEntities.length - changedEntityCount,
      viewChanged: false,
      unsupported: 0,
    },
  });
}

/**
 * Guarded structural window planner. The incremental structural parser keeps
 * every unaffected entity record by identity, so a small changed middle
 * window can publish add/remove/patch operations without indexing and
 * comparing the other 20,000 dense rows. Large reorders deliberately return
 * null and use the canonical planner.
 */
export function planPatchMapParsedSceneReconcileStructuralWindow(
  current: SceneDocument,
  candidate: SceneDocument,
  options: PatchMapReconcileOptions = {},
): PatchMapDenseReconcilePlan | null {
  if (
    current.background !== candidate.background ||
    !sameOptionalView(current.view, candidate.view)
  ) {
    return null;
  }
  const before = current.entities as unknown as readonly CanonicalEntity[];
  const after = candidate.entities as unknown as readonly CanonicalEntity[];
  const referenceReorder = planReferenceOnlyStructuralReorder(
    before,
    after,
    options,
  );
  if (referenceReorder !== null) return referenceReorder;
  let prefix = 0;
  while (
    prefix < before.length &&
    prefix < after.length &&
    before[prefix] === after[prefix]
  ) {
    prefix += 1;
  }
  let beforeEnd = before.length;
  let afterEnd = after.length;
  while (
    beforeEnd > prefix &&
    afterEnd > prefix &&
    before[beforeEnd - 1] === after[afterEnd - 1]
  ) {
    beforeEnd -= 1;
    afterEnd -= 1;
  }
  const beforeWindow = before.slice(prefix, beforeEnd);
  const afterWindow = after.slice(prefix, afterEnd);
  if (
    beforeWindow.length === 0 && afterWindow.length === 0 ||
    beforeWindow.length + afterWindow.length > 512
  ) {
    return null;
  }

  const currentById = indexEntities(beforeWindow);
  const candidateById = indexEntities(afterWindow);
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
  let changedEntityCount = 0;

  for (const entity of beforeWindow) {
    const next = candidateById.get(entity.id);
    if (next?.kind === entity.kind) continue;
    const operation = freezeOperation({ type: 'remove', target: entity.id });
    (entity.kind === 'relation' ? removedRelations : removedEntities).push(operation);
    removed += 1;
    if (next !== undefined) replaced += 1;
  }
  for (const entity of afterWindow) {
    const previous = currentById.get(entity.id);
    if (previous === undefined || previous.kind !== entity.kind) {
      const operation = freezeOperation({ type: 'add', entity: canonicalToInput(entity) });
      (entity.kind === 'relation' ? addedRelations : addedEntities).push(operation);
      added += 1;
      continue;
    }
    const operations = entityDelta(previous, entity);
    if (operations.length === 0) continue;
    changedEntityCount += 1;
    for (const operation of operations) {
      if (operation.type === 'patch') patched += 1;
      else visibilityChanged += 1;
      (entity.kind === 'relation' ? changedRelations : changedEntities).push(operation);
    }
  }

  const allowedRetainedOrderIds = normalizedAllowedRetainedOrderIds(
    options.allowedRetainedOrderIds,
  );
  const diagnostics: PatchMapReconcileDiagnostic[] = [];
  if (authoredOrderChanged(
    beforeWindow,
    afterWindow,
    candidateById,
    allowedRetainedOrderIds,
  )) {
    diagnostics.push(freezeDiagnostic({
      severity: 'error',
      code: 'ENTITY_ORDER_CHANGE_UNSUPPORTED',
      message: 'Retained same-z entity order changed, but the dense transaction seam has no reorder operation',
      path: '$.entities',
    }));
  }
  const selectionOperations = options.selectionIds === undefined
    ? []
    : [freezeOperation({
        type: 'selection',
        targets: normalizedSelectionIds(options.selectionIds),
      })];
  const operations = Object.freeze([
    ...removedRelations,
    ...removedEntities,
    ...addedEntities,
    ...changedEntities,
    ...addedRelations,
    ...changedRelations,
    ...selectionOperations,
  ]);
  const unsupported = diagnostics.length;
  return freezePlan({
    batch: freezeBatch(operations, options),
    safeToCommit: unsupported === 0,
    diagnostics,
    summary: {
      operationCount: operations.length,
      added,
      patched,
      visibilityChanged,
      removed,
      replaced,
      unchanged: after.length - added - changedEntityCount,
      viewChanged: false,
      unsupported,
    },
  });
}

/**
 * A hierarchy/front-back command commonly moves a few root fragments across a
 * large flat array while retaining nearly every dense entity object exactly.
 * Prove that sparse reference permutation in one pass and avoid a second full
 * entity map, field comparison, and order audit.
 */
function planReferenceOnlyStructuralReorder(
  before: readonly CanonicalEntity[],
  after: readonly CanonicalEntity[],
  options: PatchMapReconcileOptions,
): PatchMapDenseReconcilePlan | null {
  if (before.length !== after.length) return null;
  const currentById = indexEntities(before);
  const allowed = normalizedAllowedRetainedOrderIds(
    options.allowedRetainedOrderIds,
  );
  const seen = new Set<string>();
  const changedEntities: CoreOperation[] = [];
  const changedRelations: CoreOperation[] = [];
  let nonIdenticalCount = 0;
  let changedEntityCount = 0;
  let patched = 0;
  let visibilityChanged = 0;
  for (let index = 0; index < after.length; index += 1) {
    const currentAtIndex = before[index];
    const candidate = after[index];
    const previous = candidate === undefined
      ? undefined
      : currentById.get(candidate.id);
    if (
      currentAtIndex === undefined ||
      candidate === undefined ||
      previous === undefined ||
      previous.kind !== candidate.kind ||
      seen.has(candidate.id)
    ) {
      return null;
    }
    seen.add(candidate.id);
    if (currentAtIndex === candidate) continue;
    if (!allowed.has(currentAtIndex.id) || !allowed.has(candidate.id)) {
      return null;
    }
    if (previous === candidate) continue;
    nonIdenticalCount += 1;
    if (nonIdenticalCount > 512) return null;
    const operations = entityDelta(previous, candidate);
    if (operations.length === 0) continue;
    changedEntityCount += 1;
    for (const operation of operations) {
      if (operation.type === 'patch') patched += 1;
      else visibilityChanged += 1;
      (candidate.kind === 'relation' ? changedRelations : changedEntities)
        .push(operation);
    }
  }
  const selectionOperations = options.selectionIds === undefined
    ? []
    : [freezeOperation({
        type: 'selection',
        targets: normalizedSelectionIds(options.selectionIds),
      })];
  const orderedOperations = Object.freeze([
    ...changedEntities,
    ...changedRelations,
    ...selectionOperations,
  ]);
  return freezePlan({
    batch: freezeBatch(orderedOperations, options),
    safeToCommit: true,
    diagnostics: Object.freeze([]),
    summary: {
      operationCount: orderedOperations.length,
      added: 0,
      patched,
      visibilityChanged,
      removed: 0,
      replaced: 0,
      unchanged: after.length - changedEntityCount,
      viewChanged: false,
      unsupported: 0,
    },
  });
}

function planNormalizedPatchMapSceneReconcile(
  current: SceneDocument,
  candidate: SceneDocument,
  currentEntities: readonly CanonicalEntity[],
  candidateEntities: readonly CanonicalEntity[],
  options: PatchMapReconcileOptions,
): PatchMapDenseReconcilePlan {
  const currentById = indexEntities(currentEntities);
  const candidateById = indexEntities(candidateEntities);
  const diagnostics: PatchMapReconcileDiagnostic[] = [];
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

  if (authoredOrderChanged(
    currentEntities,
    candidateEntities,
    candidateById,
    allowedRetainedOrderIds,
  )) {
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

/**
 * Adapter for normalized PATCH MAP authority. Parsing stays outside the dense
 * store, while the returned batch remains the exact SceneDocument reconcile
 * plan consumed by `CoreScene.commit`.
 */
export function planPatchMapDatasetReconcile(
  current: MaterializedPatchMapDataset,
  candidate: MaterializedPatchMapDataset,
  parseOptions: ParsePatchMapOptions = {},
  options: PatchMapReconcileOptions = {},
): PatchMapDenseReconcilePlan {
  const currentProjection = parsePatchMapV010(current.dataset, parseOptions);
  const candidateProjection = parsePatchMapV010(candidate.dataset, parseOptions);
  const planned = planPatchMapSceneReconcile(
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

const ENTITY_INDEX_CACHE = new WeakMap<
  readonly CanonicalEntity[],
  ReadonlyMap<string, CanonicalEntity>
>();
const ENTITY_POSITION_INDEX_CACHE = new WeakMap<
  readonly CanonicalEntity[],
  ReadonlyMap<string, number>
>();

function indexEntities(entities: readonly CanonicalEntity[]): ReadonlyMap<string, CanonicalEntity> {
  const cached = ENTITY_INDEX_CACHE.get(entities);
  if (cached !== undefined) return cached;
  const index = new Map(entities.map((entity) => [entity.id, entity]));
  ENTITY_INDEX_CACHE.set(entities, index);
  return index;
}

function indexEntityPositions(
  entities: readonly CanonicalEntity[],
): ReadonlyMap<string, number> {
  const cached = ENTITY_POSITION_INDEX_CACHE.get(entities);
  if (cached !== undefined) return cached;
  const index = new Map<string, number>();
  for (let position = 0; position < entities.length; position += 1) {
    const entity = entities[position];
    if (entity !== undefined) index.set(entity.id, position);
  }
  ENTITY_POSITION_INDEX_CACHE.set(entities, index);
  return index;
}
