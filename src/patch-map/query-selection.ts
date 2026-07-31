import type { NormalizedPatchMapElement } from './semantic/dataset';
import type { PatchMapMutationTarget } from './semantic/transaction';
import type {
  PatchMapLogicalTargetKey,
  PatchMapLogicalTargetSnapshot,
  PatchMapSceneQuery,
  PatchMapSceneQueryEvaluation,
  PatchMapSelectionEligibilityOptions,
  PatchMapSelectionGeometry,
  PatchMapSelectionHit,
  PatchMapSelectionHitOptions,
  PatchMapSelectionInteraction,
  PatchMapSelectionInteractionOptions,
  PatchMapSelectionUnit,
} from './query-selection/contracts';
import {
  buildLogicalTargets,
  logicalSnapshot,
  logicalTargetCount,
  patchMapLogicalTargetKey,
  recordZIndex,
} from './query-selection/logical-target-values';
import {
  queryOrder,
  queryScope,
  queryWhereMatches,
  validateQuery,
} from './query-selection/query-values';
import {
  applyPatchMapSelectionOperation,
  boundsContain,
  compileSelectionEligibility,
  normalizeClickCount,
  patchMapSelectionClickType,
  selectionEligible,
  selectionPaintOrder,
  targetAliases,
  validateFinitePoint,
} from './query-selection/selection-values';

export * from './query-selection/contracts';
export {
  applyPatchMapSelectionOperation,
  patchMapLogicalTargetKey,
  patchMapSelectionClickType,
};

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
