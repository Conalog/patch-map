import type {
  PatchMapComponent,
  NormalizedPatchMapElement,
} from './semantic/dataset';
import type { PatchMapMutationTarget } from './semantic/transaction';

export const PATCH_MAP_QUERY_SELECTION_REVISION = 'core-v2-query-selection/1' as const;

export type PatchMapLogicalTargetKey =
  | `element:${string}`
  | `component:${string}/${string}`;

export interface PatchMapLogicalTargetSnapshot {
  readonly key: PatchMapLogicalTargetKey;
  readonly target: PatchMapMutationTarget;
  readonly selectionId: string;
  readonly kind: 'element' | 'component';
  readonly id: string;
  readonly ownerId: string | null;
  readonly type: string;
  readonly label: string | null;
  readonly parentKey: PatchMapLogicalTargetKey | null;
  readonly ancestorKeys: readonly PatchMapLogicalTargetKey[];
  readonly depth: number;
  readonly sceneOrder: number;
  readonly zIndex: number;
  readonly topLevel: boolean;
  readonly locked: boolean;
  readonly ancestorLocked: boolean;
  readonly rendererObjectCount: 0;
  readonly value: Readonly<Record<string, unknown>>;
  readonly identity: Readonly<{
    readonly key: PatchMapLogicalTargetKey;
    readonly sceneOrder: number;
  }>;
}

export interface PatchMapSceneQueryWhere {
  readonly id?: string;
  readonly ownerId?: string;
  readonly type?: string;
  readonly label?: string;
}

export interface PatchMapSceneQuery {
  readonly root?: PatchMapMutationTarget | null;
  readonly recursive?: boolean;
  readonly where?: PatchMapSceneQueryWhere;
  readonly predicate?: (target: PatchMapLogicalTargetSnapshot) => boolean;
}

export type PatchMapSceneQueryEvaluation =
  | Readonly<{
      readonly status: 'matched' | 'empty';
      readonly code: null;
      readonly targets: readonly PatchMapLogicalTargetSnapshot[];
    }>
  | Readonly<{
      readonly status: 'rejected';
      readonly code: 'CONFLICT';
      readonly targets: readonly PatchMapLogicalTargetSnapshot[];
    }>;

export type PatchMapQueryReuseOperation =
  | 'update'
  | 'event-bind'
  | 'focus'
  | 'transform'
  | 'select';

export type PatchMapSelectionSetOperation =
  | Readonly<{
      readonly op: 'replace' | 'add' | 'remove' | 'toggle';
      readonly ids: readonly string[];
      readonly source?: 'canvas' | 'external' | 'programmatic';
    }>
  | Readonly<{
      readonly op: 'clear';
      readonly source?: 'canvas' | 'external' | 'programmatic';
    }>;

export interface PatchMapSelectionChange {
  readonly changed: boolean;
  readonly source: 'canvas' | 'external' | 'programmatic';
  readonly current: readonly string[];
  readonly added: readonly string[];
  readonly removed: readonly string[];
}

export interface PatchMapSelectionEligibilityOptions {
  readonly rejectIds?: readonly string[];
  readonly lockedIds?: readonly string[];
  readonly predicate?: (target: PatchMapLogicalTargetSnapshot) => boolean;
}

export interface PatchMapSelectionGeometry {
  readonly id: string;
  readonly ownerItemId?: string;
  readonly componentId?: string;
  readonly screenBounds: readonly [number, number, number, number];
  readonly visible: boolean;
}

export interface PatchMapSelectionHitOptions extends PatchMapSelectionEligibilityOptions {
  readonly candidateIds?: readonly string[];
}

export interface PatchMapSelectionHit {
  readonly target: PatchMapLogicalTargetSnapshot | null;
  readonly candidates: readonly PatchMapLogicalTargetSnapshot[];
}

export type PatchMapSelectionUnit =
  | 'entity'
  | 'grid'
  | 'grid-cell'
  | 'closest-group'
  | 'highest-group';

export type PatchMapSelectionClickType = 'single' | 'double' | 'multi-click';

export interface PatchMapSelectionInteractionOptions {
  readonly unit: PatchMapSelectionUnit;
  readonly clickCount?: number;
  readonly deepSelect?: boolean;
}

export interface PatchMapSelectionInteraction {
  readonly hit: PatchMapLogicalTargetSnapshot;
  readonly resolved: PatchMapLogicalTargetSnapshot;
  readonly clickType: PatchMapSelectionClickType;
  readonly clickCount: number;
  readonly engineDrillDelta: 0 | 1;
}

interface PatchMapSelectionEligibilityContext {
  readonly locked: ReadonlySet<string>;
  readonly rejected: ReadonlySet<string>;
  readonly predicate: PatchMapSelectionEligibilityOptions['predicate'];
}

/**
 * Immutable logical index shared by query, selection, events, focus, and the
 * future transformer tranche. It contains semantic records only; no Pixi
 * DisplayObject or renderer handle crosses this boundary.
 */
export class PatchMapLogicalSceneIndex {
  private targetsValue: readonly PatchMapLogicalTargetSnapshot[] | null = null;
  private readonly byKey = new Map<PatchMapLogicalTargetKey, PatchMapLogicalTargetSnapshot>();
  private readonly bySelectionId = new Map<string, PatchMapLogicalTargetSnapshot>();

  public constructor(
    private readonly dataset: readonly NormalizedPatchMapElement[],
  ) {}

  public targets(): readonly PatchMapLogicalTargetSnapshot[] {
    return this.ensureTargets();
  }

  public target(
    targetOrId: PatchMapMutationTarget | string,
  ): PatchMapLogicalTargetSnapshot | null {
    if (typeof targetOrId !== 'string') {
      const key = patchMapLogicalTargetKey(targetOrId);
      const cached = this.byKey.get(key);
      if (cached !== undefined) return cached;
      const direct = targetOrId.kind === 'element'
        ? this.topLevelElement(targetOrId.id)
        : null;
      if (direct !== null) return direct;
      this.ensureTargets();
      return this.byKey.get(key) ?? null;
    }
    if (targetOrId.startsWith('element:') || targetOrId.startsWith('component:')) {
      const key = targetOrId as PatchMapLogicalTargetKey;
      const cached = this.byKey.get(key);
      if (cached !== undefined) return cached;
      const direct = targetOrId.startsWith('element:')
        ? this.topLevelElement(targetOrId.slice('element:'.length))
        : null;
      if (direct !== null) return direct;
      this.ensureTargets();
      return this.byKey.get(key) ?? null;
    }
    const componentSeparator = targetOrId.indexOf('/');
    if (
      componentSeparator > 0 &&
      componentSeparator < targetOrId.length - 1
    ) {
      this.ensureTargets();
      const ownerId = targetOrId.slice(0, componentSeparator);
      const componentId = targetOrId.slice(componentSeparator + 1);
      return this.byKey.get(`component:${ownerId}/${componentId}`) ?? null;
    }
    const elementKey = `element:${targetOrId}` as const;
    const cached = this.byKey.get(elementKey) ?? this.bySelectionId.get(targetOrId);
    if (cached !== undefined) return cached;
    const direct = this.topLevelElement(targetOrId);
    if (direct !== null) return direct;
    this.ensureTargets();
    return this.byKey.get(elementKey) ??
      this.bySelectionId.get(targetOrId) ??
      null;
  }

  public query(input: PatchMapSceneQuery = {}): PatchMapSceneQueryEvaluation {
    validateQuery(input);
    const recursive = input.recursive ?? true;
    let candidates = queryScope(this.ensureTargets(), input.root ?? null, recursive);
    const where = input.where ?? {};

    if (where.id !== undefined && where.ownerId === undefined) {
      const elementMatches = candidates.filter((target) =>
        target.kind === 'element' && target.id === where.id);
      const componentMatches = candidates.filter((target) =>
        target.kind === 'component' && target.id === where.id);
      if (elementMatches.length > 0) {
        candidates = candidates.filter((target) =>
          target.kind !== 'component' || target.id !== where.id);
      } else if (componentMatches.length > 0) {
        return Object.freeze({
          status: 'rejected',
          code: 'CONFLICT',
          targets: Object.freeze([]),
        });
      }
    }

    let targets = candidates
      .filter((target) => queryWhereMatches(target, where))
      .filter((target) => input.predicate?.(target) ?? true);
    if (input.predicate === undefined && where.ownerId === undefined) {
      // Declarative component lookup stays owner-safe: duplicate owner-local IDs
      // collapse deterministically. A host predicate is the explicit broad-query
      // escape hatch and may return same-ID components from multiple owners.
      const seenComponentIds = new Set<string>();
      targets = targets.filter((target) => {
        if (target.kind === 'element') return true;
        if (seenComponentIds.has(target.id)) return false;
        seenComponentIds.add(target.id);
        return true;
      });
    }
    targets.sort(queryOrder);
    return Object.freeze({
      status: targets.length === 0 ? 'empty' : 'matched',
      code: null,
      targets: Object.freeze(targets),
    });
  }

  public filterSelection(
    targetIds: readonly string[],
    options: PatchMapSelectionEligibilityOptions = {},
  ): readonly PatchMapLogicalTargetSnapshot[] {
    const eligibility = compileSelectionEligibility(options);
    const seen = new Set<PatchMapLogicalTargetKey>();
    const targets: PatchMapLogicalTargetSnapshot[] = [];
    for (const targetId of targetIds) {
      const target = this.target(targetId);
      if (target === null || seen.has(target.key)) continue;
      seen.add(target.key);
      if (selectionEligible(target, eligibility)) targets.push(target);
    }
    return Object.freeze(targets);
  }

  public hitFromTarget(
    targetOrId: string,
    options: PatchMapSelectionEligibilityOptions = {},
  ): PatchMapSelectionHit {
    const target = this.target(targetOrId);
    const eligibility = compileSelectionEligibility(options);
    if (target === null || !selectionEligible(target, eligibility)) {
      return Object.freeze({ target: null, candidates: Object.freeze([]) });
    }
    const candidates = [target];
    for (const ancestorKey of target.ancestorKeys) {
      const ancestor = this.byKey.get(ancestorKey);
      if (ancestor !== undefined && selectionEligible(ancestor, eligibility)) {
        candidates.push(ancestor);
      }
    }
    candidates.sort(selectionPaintOrder);
    return Object.freeze({
      target: candidates[0] ?? null,
      candidates: Object.freeze(candidates),
    });
  }

  public hitTest(
    geometries: readonly PatchMapSelectionGeometry[],
    point: Readonly<{ readonly x: number; readonly y: number }>,
    options: PatchMapSelectionHitOptions = {},
  ): PatchMapSelectionHit {
    validateFinitePoint(point);
    this.ensureTargets();
    const eligibility = compileSelectionEligibility(options);
    const allowed = options.candidateIds === undefined
      ? null
      : new Set(options.candidateIds.flatMap((id) => targetAliases(this.target(id))));
    const candidates = new Map<PatchMapLogicalTargetKey, PatchMapLogicalTargetSnapshot>();
    for (const geometry of geometries) {
      if (!geometry.visible || !boundsContain(geometry.screenBounds, point)) continue;
      const key = geometry.ownerItemId !== undefined && geometry.componentId !== undefined
        ? patchMapLogicalTargetKey({
            kind: 'component',
            ownerId: geometry.ownerItemId,
            id: geometry.componentId,
          })
        : patchMapLogicalTargetKey({ kind: 'element', id: geometry.id });
      const target = this.byKey.get(key);
      if (target === undefined || !selectionEligible(target, eligibility)) continue;
      if (allowed !== null && !targetAliases(target).some((alias) => allowed.has(alias))) continue;
      candidates.set(target.key, target);
    }
    for (const target of [...candidates.values()]) {
      for (const ancestorKey of target.ancestorKeys) {
        const ancestor = this.byKey.get(ancestorKey);
        if (ancestor === undefined || !selectionEligible(ancestor, eligibility)) continue;
        if (
          allowed !== null &&
          !targetAliases(ancestor).some((alias) => allowed.has(alias))
        ) continue;
        candidates.set(ancestor.key, ancestor);
      }
    }
    const ordered = [...candidates.values()].sort(selectionPaintOrder);
    return Object.freeze({
      target: ordered[0] ?? null,
      candidates: Object.freeze(ordered),
    });
  }

  public resolveSelectionInteraction(
    targetOrId: string,
    options: PatchMapSelectionInteractionOptions,
  ): PatchMapSelectionInteraction | null {
    const target = this.target(targetOrId);
    if (target === null) return null;
    const clickCount = normalizeClickCount(options.clickCount ?? 1);
    const clickType = patchMapSelectionClickType(clickCount);
    const byUnit = this.resolveSelectionUnit(target.key, options.unit) ?? target;
    const drill = options.deepSelect === true || clickType === 'double';
    const resolved = drill ? target : byUnit;
    return Object.freeze({
      hit: target,
      resolved,
      clickType,
      clickCount,
      engineDrillDelta: clickType === 'double' && resolved.key !== byUnit.key ? 1 : 0,
    });
  }

  public resolveSelectionUnit(
    targetOrId: string,
    unit: PatchMapSelectionUnit,
  ): PatchMapLogicalTargetSnapshot | null {
    const target = this.target(targetOrId);
    if (target === null || unit === 'entity') return target;
    const ancestors = target.ancestorKeys
      .map((key) => this.byKey.get(key))
      .filter((entry): entry is PatchMapLogicalTargetSnapshot => entry !== undefined);
    const nearest = [...ancestors].reverse();
    if (unit === 'grid-cell') {
      return nearest.find((entry) => entry.type === 'grid-cell') ?? target;
    }
    if (unit === 'grid') {
      return nearest.find((entry) =>
        entry.type === 'grid-cell' || entry.type === 'grid' || entry.type === 'item') ??
        target;
    }
    if (unit === 'closest-group') {
      return nearest.find((entry) =>
        entry.type === 'item' || entry.type === 'grid-cell' || entry.type === 'group') ??
        target;
    }
    return ancestors.find((entry) => entry.type === 'group') ?? target;
  }

  /**
   * A root-owned spatial hit does not need the full query catalog. Keeping this
   * path lazy avoids cloning and indexing every component before the first
   * pointer interaction in a large flat scene. Nested/component resolution and
   * declarative queries still materialize the canonical complete index.
   */
  private topLevelElement(id: string): PatchMapLogicalTargetSnapshot | null {
    if (this.targetsValue !== null) return null;
    let sceneOrder = 0;
    for (const element of this.dataset) {
      if (element.id === id) {
        const target = Object.freeze({ kind: 'element', id: element.id } as const);
        const key = patchMapLogicalTargetKey(target);
        const snapshot = logicalSnapshot({
          key,
          target,
          selectionId: element.id,
          kind: 'element',
          id: element.id,
          ownerId: null,
          type: element.type,
          label: element.label ?? null,
          parentKey: null,
          ancestors: Object.freeze([]),
          depth: 0,
          sceneOrder,
          zIndex: recordZIndex(element),
          topLevel: true,
          locked: element.locked === true,
          ancestorLocked: false,
          value: element as unknown as Readonly<Record<string, unknown>>,
        });
        this.byKey.set(key, snapshot);
        this.bySelectionId.set(snapshot.selectionId, snapshot);
        return snapshot;
      }
      sceneOrder += logicalTargetCount(element);
    }
    return null;
  }

  private ensureTargets(): readonly PatchMapLogicalTargetSnapshot[] {
    if (this.targetsValue !== null) return this.targetsValue;
    const targets = buildLogicalTargets(this.dataset);
    this.byKey.clear();
    this.bySelectionId.clear();
    for (const target of targets) {
      this.byKey.set(target.key, target);
      this.bySelectionId.set(target.selectionId, target);
    }
    this.targetsValue = targets;
    return targets;
  }
}

export function patchMapLogicalTargetKey(
  target: PatchMapMutationTarget,
): PatchMapLogicalTargetKey {
  return target.kind === 'element'
    ? `element:${target.id}`
    : `component:${target.ownerId}/${target.id}`;
}

export function patchMapSelectionClickType(clickCount: number): PatchMapSelectionClickType {
  const normalized = normalizeClickCount(clickCount);
  if (normalized === 1) return 'single';
  if (normalized === 2) return 'double';
  return 'multi-click';
}

export function applyPatchMapSelectionOperation(
  current: readonly string[],
  input: PatchMapSelectionSetOperation,
  isValid: (id: string) => boolean,
): PatchMapSelectionChange {
  validateSelectionIds(current, 'current selection');
  const source = input.source ?? 'programmatic';
  const requested = input.op === 'clear'
    ? Object.freeze([] as string[])
    : uniqueStrings(input.ids, 'selection operation IDs');
  const before = Object.freeze([...current]);
  const next = [...before];

  if (input.op === 'replace') {
    next.splice(0, next.length, ...requested.filter(isValid));
  } else if (input.op === 'add') {
    for (const id of requested) {
      if (isValid(id) && !next.includes(id)) next.push(id);
    }
  } else if (input.op === 'remove') {
    const removed = new Set(requested);
    next.splice(0, next.length, ...next.filter((id) => !removed.has(id)));
  } else if (input.op === 'toggle') {
    for (const id of requested) {
      const index = next.indexOf(id);
      if (index >= 0) {
        next.splice(index, 1);
      } else if (isValid(id)) {
        next.push(id);
      }
    }
  } else {
    next.splice(0, next.length);
  }

  const currentSet = new Set(next);
  const beforeSet = new Set(before);
  const added = next.filter((id) => !beforeSet.has(id));
  const removed = before.filter((id) => !currentSet.has(id));
  return Object.freeze({
    changed: added.length > 0 || removed.length > 0,
    source,
    current: Object.freeze(next),
    added: Object.freeze(added),
    removed: Object.freeze(removed),
  });
}

function buildLogicalTargets(
  dataset: readonly NormalizedPatchMapElement[],
): readonly PatchMapLogicalTargetSnapshot[] {
  const elements: PatchMapLogicalTargetSnapshot[] = [];
  const components: PatchMapLogicalTargetSnapshot[] = [];
  let sceneOrder = 0;

  const appendElement = (
    element: NormalizedPatchMapElement,
    parentKey: PatchMapLogicalTargetKey | null,
    ancestors: readonly PatchMapLogicalTargetKey[],
    ancestorLocked: boolean,
    topLevel: boolean,
  ): void => {
    const target = Object.freeze({ kind: 'element', id: element.id } as const);
    const key = patchMapLogicalTargetKey(target);
    const locked = element.locked === true;
    const entry = logicalSnapshot({
      key,
      target,
      selectionId: element.id,
      kind: 'element',
      id: element.id,
      ownerId: null,
      type: element.type,
      label: element.label ?? null,
      parentKey,
      ancestors,
      depth: ancestors.length,
      sceneOrder: sceneOrder++,
      zIndex: recordZIndex(element),
      topLevel,
      locked,
      ancestorLocked,
      value: element as unknown as Readonly<Record<string, unknown>>,
    });
    elements.push(entry);
    const childAncestors = Object.freeze([...ancestors, key]);
    const childAncestorLocked = ancestorLocked || locked;

    if (element.type === 'group') {
      for (const child of element.children) {
        appendElement(child, key, childAncestors, childAncestorLocked, false);
      }
      return;
    }
    if (element.type === 'item') {
      appendComponents(
        element.components,
        element.id,
        key,
        childAncestors,
        childAncestorLocked,
        entry.zIndex,
      );
      return;
    }
    if (element.type !== 'grid') return;
    for (let row = 0; row < element.cells.length; row += 1) {
      const cells = element.cells[row] ?? [];
      for (let column = 0; column < cells.length; column += 1) {
        const cell = cells[column];
        if (cell === 0 && element.inactiveCellStrategy !== 'hide') continue;
        const instanceId = `${element.id}.${row}.${column}`;
        const cellTarget = Object.freeze({ kind: 'element', id: instanceId } as const);
        const cellKey = patchMapLogicalTargetKey(cellTarget);
        const cellAncestors = childAncestors;
        const cellValue = Object.freeze({
          type: 'grid-cell',
          id: instanceId,
          gridId: element.id,
          row,
          column,
          value: cell,
          show: cell !== 0,
          locked,
        });
        const cellEntry = logicalSnapshot({
          key: cellKey,
          target: cellTarget,
          selectionId: instanceId,
          kind: 'element',
          id: instanceId,
          ownerId: null,
          type: 'grid-cell',
          label: typeof cell === 'string' ? cell : null,
          parentKey: key,
          ancestors: cellAncestors,
          depth: cellAncestors.length,
          sceneOrder: sceneOrder++,
          zIndex: entry.zIndex,
          topLevel: false,
          locked,
          ancestorLocked,
          value: cellValue,
        });
        elements.push(cellEntry);
        appendComponents(
          element.item.components,
          instanceId,
          cellKey,
          Object.freeze([...cellAncestors, cellKey]),
          childAncestorLocked,
          cellEntry.zIndex,
        );
      }
    }
  };

  const appendComponents = (
    values: readonly PatchMapComponent[],
    ownerId: string,
    parentKey: PatchMapLogicalTargetKey,
    ancestors: readonly PatchMapLogicalTargetKey[],
    ancestorLocked: boolean,
    zIndex: number,
  ): void => {
    for (const component of values) {
      const target = Object.freeze({ kind: 'component', ownerId, id: component.id } as const);
      const key = patchMapLogicalTargetKey(target);
      components.push(logicalSnapshot({
        key,
        target,
        selectionId: `${ownerId}::${component.type}:${component.id}`,
        kind: 'component',
        id: component.id,
        ownerId,
        type: component.type,
        label: component.label ?? null,
        parentKey,
        ancestors,
        depth: ancestors.length,
        sceneOrder: sceneOrder++,
        zIndex,
        topLevel: false,
        locked: false,
        ancestorLocked,
        value: component as unknown as Readonly<Record<string, unknown>>,
      }));
    }
  };

  for (const element of dataset) appendElement(element, null, Object.freeze([]), false, true);
  return Object.freeze([...elements, ...components]);
}

function logicalTargetCount(element: NormalizedPatchMapElement): number {
  if (element.type === 'group') {
    return 1 + element.children.reduce(
      (count, child) => count + logicalTargetCount(child),
      0,
    );
  }
  if (element.type === 'item') return 1 + element.components.length;
  if (element.type !== 'grid') return 1;
  let count = 1;
  for (const row of element.cells) {
    for (const cell of row) {
      if (cell === 0 && element.inactiveCellStrategy !== 'hide') continue;
      count += 1 + element.item.components.length;
    }
  }
  return count;
}

function logicalSnapshot(
  input: Readonly<{
    key: PatchMapLogicalTargetKey;
    target: PatchMapMutationTarget;
    selectionId: string;
    kind: 'element' | 'component';
    id: string;
    ownerId: string | null;
    type: string;
    label: string | null;
    parentKey: PatchMapLogicalTargetKey | null;
    ancestors: readonly PatchMapLogicalTargetKey[];
    depth: number;
    sceneOrder: number;
    zIndex: number;
    topLevel: boolean;
    locked: boolean;
    ancestorLocked: boolean;
    value: Readonly<Record<string, unknown>>;
  }>,
): PatchMapLogicalTargetSnapshot {
  return Object.freeze({
    key: input.key,
    target: input.target,
    selectionId: input.selectionId,
    kind: input.kind,
    id: input.id,
    ownerId: input.ownerId,
    type: input.type,
    label: input.label,
    parentKey: input.parentKey,
    ancestorKeys: Object.freeze([...input.ancestors]),
    depth: input.depth,
    sceneOrder: input.sceneOrder,
    zIndex: input.zIndex,
    topLevel: input.topLevel,
    locked: input.locked,
    ancestorLocked: input.ancestorLocked,
    rendererObjectCount: 0,
    value: cloneFrozenRecord(input.value),
    identity: Object.freeze({ key: input.key, sceneOrder: input.sceneOrder }),
  });
}

function queryScope(
  targets: readonly PatchMapLogicalTargetSnapshot[],
  root: PatchMapMutationTarget | null,
  recursive: boolean,
): PatchMapLogicalTargetSnapshot[] {
  if (root === null) {
    return targets.filter((target) => recursive || target.topLevel);
  }
  const rootKey = patchMapLogicalTargetKey(root);
  return targets.filter((target) =>
    target.key === rootKey || (recursive && target.ancestorKeys.includes(rootKey)));
}

function queryWhereMatches(
  target: PatchMapLogicalTargetSnapshot,
  where: PatchMapSceneQueryWhere,
): boolean {
  if (where.id !== undefined && target.id !== where.id) return false;
  if (where.ownerId !== undefined && target.ownerId !== where.ownerId) return false;
  if (where.type !== undefined && target.type !== where.type) return false;
  if (where.label !== undefined && target.label !== where.label) return false;
  return true;
}

function queryOrder(
  left: PatchMapLogicalTargetSnapshot,
  right: PatchMapLogicalTargetSnapshot,
): number {
  if (left.kind !== right.kind) return left.kind === 'element' ? -1 : 1;
  return left.sceneOrder - right.sceneOrder || left.key.localeCompare(right.key);
}

function selectionPaintOrder(
  left: PatchMapLogicalTargetSnapshot,
  right: PatchMapLogicalTargetSnapshot,
): number {
  return right.zIndex - left.zIndex ||
    right.depth - left.depth ||
    right.sceneOrder - left.sceneOrder ||
    left.key.localeCompare(right.key);
}

function selectionEligible(
  target: PatchMapLogicalTargetSnapshot,
  context: PatchMapSelectionEligibilityContext,
): boolean {
  if (target.locked || target.ancestorLocked) return false;
  const aliases = targetAliases(target);
  const ancestorAliases = target.ancestorKeys.flatMap(logicalKeyAliases);
  if (
    aliases.some((alias) => context.locked.has(alias) || context.rejected.has(alias)) ||
    ancestorAliases.some((alias) => context.locked.has(alias))
  ) return false;
  return context.predicate?.(target) ?? true;
}

function compileSelectionEligibility(
  options: PatchMapSelectionEligibilityOptions,
): PatchMapSelectionEligibilityContext {
  return {
    locked: new Set(options.lockedIds ?? []),
    rejected: new Set(options.rejectIds ?? []),
    predicate: options.predicate,
  };
}

function targetAliases(target: PatchMapLogicalTargetSnapshot | null): readonly string[] {
  if (target === null) return Object.freeze([]);
  return Object.freeze([
    target.key,
    target.selectionId,
    target.id,
    ...(target.ownerId === null ? [] : [`${target.ownerId}/${target.id}`]),
  ]);
}

function logicalKeyAliases(key: PatchMapLogicalTargetKey): readonly string[] {
  if (key.startsWith('element:')) return Object.freeze([key, key.slice('element:'.length)]);
  const body = key.slice('component:'.length);
  return Object.freeze([key, body]);
}

function boundsContain(
  bounds: readonly [number, number, number, number],
  point: Readonly<{ readonly x: number; readonly y: number }>,
): boolean {
  if (bounds.some((value) => !Number.isFinite(value))) return false;
  const [x, y, width, height] = bounds;
  if (width < 0 || height < 0) return false;
  return point.x >= x && point.x <= x + width && point.y >= y && point.y <= y + height;
}

function validateQuery(input: PatchMapSceneQuery): void {
  if (input.where !== undefined) {
    for (const [key, value] of Object.entries(input.where)) {
      if (!['id', 'ownerId', 'type', 'label'].includes(key)) {
        throw new TypeError(`query where contains unknown field ${key}`);
      }
      if (typeof value !== 'string' || value.length === 0) {
        throw new TypeError(`query where ${key} must be a non-empty string`);
      }
    }
  }
  if (input.recursive !== undefined && typeof input.recursive !== 'boolean') {
    throw new TypeError('query recursive must be a boolean');
  }
  if (input.predicate !== undefined && typeof input.predicate !== 'function') {
    throw new TypeError('query predicate must be a function');
  }
}

function validateFinitePoint(point: Readonly<{ readonly x: number; readonly y: number }>): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new RangeError('selection point must contain finite coordinates');
  }
}

function normalizeClickCount(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError('clickCount must be a positive safe integer');
  }
  return value;
}

function validateSelectionIds(values: readonly string[], label: string): void {
  if (!Array.isArray(values)) throw new TypeError(`${label} must be an array`);
  values.forEach((value, index) => {
    if (typeof value !== 'string' || value.length === 0) {
      throw new TypeError(`${label}[${index}] must be a non-empty string`);
    }
  });
}

function uniqueStrings(values: readonly string[], label: string): readonly string[] {
  validateSelectionIds(values, label);
  return Object.freeze([...new Set(values)]);
}

function recordZIndex(value: Readonly<Record<string, unknown>>): number {
  const attrs = isRecord(value.attrs) ? value.attrs : {};
  return typeof attrs.zIndex === 'number' && Number.isFinite(attrs.zIndex) ? attrs.zIndex : 0;
}

function cloneFrozenRecord(
  value: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const cloned = cloneFrozenValue(value);
  if (!isRecord(cloned)) throw new TypeError('logical target value must remain a record');
  return cloned;
}

function cloneFrozenValue(value: unknown): unknown {
  if (Array.isArray(value)) return Object.freeze(value.map(cloneFrozenValue));
  if (!isRecord(value)) return value;
  return Object.freeze(Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, cloneFrozenValue(entry)]),
  ));
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
