import {
  ownedPatchMapElementIds,
  type MaterializedPatchMapDataset,
  type NormalizedPatchMapElement,
  type PatchMapComponent,
} from '../semantic/dataset';
import type { PatchMapMutationTarget } from '../semantic/transaction';
import {
  PatchMapLogicalSceneIndex,
  type PatchMapLogicalTargetSnapshot,
} from '../query-selection';
import {
  componentSemanticKey,
  type IndexedEngineTextSemantic,
  type PatchMapEngineComponentSemanticProbe,
} from './semantic-index';
import type {
  PatchMapEngineQueryResult,
  PatchMapResolvedTargetSnapshot,
} from './public-contracts';

export interface PatchMapSceneStatePlan {
  readonly materialized: MaterializedPatchMapDataset;
  readonly componentSemantics: ReadonlyMap<string, PatchMapEngineComponentSemanticProbe>;
  readonly textSemantics: ReadonlyMap<string, IndexedEngineTextSemantic>;
  readonly selectionIds: readonly string[];
  readonly datasetRef: string | null;
  readonly targetLifecycleGeneration: number;
}

export interface PatchMapSceneStateSnapshot {
  readonly materialized: MaterializedPatchMapDataset | null;
  readonly componentSemantics: ReadonlyMap<string, PatchMapEngineComponentSemanticProbe>;
  readonly textSemantics: ReadonlyMap<string, IndexedEngineTextSemantic>;
  readonly selectionIds: readonly string[];
  readonly datasetRef: string | null;
  readonly targetLifecycleGeneration: number;
}

export interface PatchMapResolvedTargetAuthority {
  readonly target: PatchMapMutationTarget;
  readonly lifecycleGeneration: number;
  readonly sceneRevision: number;
}

export interface PatchMapQueryResultAuthority {
  readonly lifecycleGeneration: number;
  readonly sceneRevision: number;
  readonly targets: readonly PatchMapLogicalTargetSnapshot[];
}

/**
 * Owns the live materialized scene and its semantic/query indexes. Candidate
 * plans are immutable and assignment-only commits are invoked by PatchMap
 * only after the aggregate surface accepts the corresponding side effect.
 */
export class PatchMapSceneStateAuthority {
  private materializedValue: MaterializedPatchMapDataset | null = null;
  private componentSemanticsValue: ReadonlyMap<
    string,
    PatchMapEngineComponentSemanticProbe
  > = new Map();
  private textSemanticsValue: ReadonlyMap<string, IndexedEngineTextSemantic> = new Map();
  private selectionIdsValue: readonly string[] = Object.freeze([]);
  private datasetRefValue: string | null = null;
  private targetLifecycleGenerationValue = 0;
  private resolvedTargetAuthorities = new WeakMap<
    PatchMapResolvedTargetSnapshot,
    PatchMapResolvedTargetAuthority
  >();
  private queryResultAuthorities = new WeakMap<
    PatchMapEngineQueryResult,
    PatchMapQueryResultAuthority
  >();
  private logicalSceneIndexCache: Readonly<{
    readonly materialized: MaterializedPatchMapDataset;
    readonly index: PatchMapLogicalSceneIndex;
  }> | null = null;
  private logicalSceneIndexesByMaterialized =
    new WeakMap<MaterializedPatchMapDataset, PatchMapLogicalSceneIndex>();
  private logicalSelectionIndexesByMaterialized =
    new WeakMap<MaterializedPatchMapDataset, PatchMapLogicalSceneIndex>();

  public constructor(
    private readonly emptyMaterialized: MaterializedPatchMapDataset,
  ) {}

  public get materialized(): MaterializedPatchMapDataset | null {
    return this.materializedValue;
  }

  public get componentSemantics(): ReadonlyMap<
    string,
    PatchMapEngineComponentSemanticProbe
  > {
    return this.componentSemanticsValue;
  }

  public get textSemantics(): ReadonlyMap<string, IndexedEngineTextSemantic> {
    return this.textSemanticsValue;
  }

  public get selectionIds(): readonly string[] {
    return this.selectionIdsValue;
  }

  public get datasetRef(): string | null {
    return this.datasetRefValue;
  }

  public get targetLifecycleGeneration(): number {
    return this.targetLifecycleGenerationValue;
  }

  public snapshot(): PatchMapSceneStateSnapshot {
    return Object.freeze({
      materialized: this.materializedValue,
      componentSemantics: this.componentSemanticsValue,
      textSemantics: this.textSemanticsValue,
      selectionIds: this.selectionIdsValue,
      datasetRef: this.datasetRefValue,
      targetLifecycleGeneration: this.targetLifecycleGenerationValue,
    });
  }

  public prepareReplacement(input: Readonly<{
    readonly materialized: MaterializedPatchMapDataset;
    readonly componentSemantics: ReadonlyMap<string, PatchMapEngineComponentSemanticProbe>;
    readonly textSemantics: ReadonlyMap<string, IndexedEngineTextSemantic>;
    readonly datasetRef: string | null;
  }>): PatchMapSceneStatePlan {
    return Object.freeze({
      ...input,
      selectionIds: Object.freeze([]),
      targetLifecycleGeneration: this.targetLifecycleGenerationValue + 1,
    });
  }

  public prepareMutation(input: Readonly<{
    readonly materialized: MaterializedPatchMapDataset;
    readonly componentSemantics: ReadonlyMap<string, PatchMapEngineComponentSemanticProbe>;
    readonly textSemantics: ReadonlyMap<string, IndexedEngineTextSemantic>;
    readonly selectionIds?: readonly string[];
  }>): PatchMapSceneStatePlan {
    return Object.freeze({
      ...input,
      selectionIds: immutableSelection(input.selectionIds ?? this.selectionIdsValue),
      datasetRef: this.datasetRefValue,
      targetLifecycleGeneration: this.targetLifecycleGenerationValue,
    });
  }

  public commit(plan: PatchMapSceneStatePlan): PatchMapSceneStateSnapshot {
    this.materializedValue = plan.materialized;
    this.componentSemanticsValue = plan.componentSemantics;
    this.textSemanticsValue = plan.textSemantics;
    this.selectionIdsValue = plan.selectionIds;
    this.datasetRefValue = plan.datasetRef;
    this.targetLifecycleGenerationValue = plan.targetLifecycleGeneration;
    this.logicalSceneIndexCache = null;
    return this.snapshot();
  }

  public replaceSelection(selectionIds: readonly string[]): readonly string[] {
    this.selectionIdsValue = immutableSelection(selectionIds);
    return this.selectionIdsValue;
  }

  public rebindHostSelection(selectionIds: readonly string[]): readonly string[] {
    this.targetLifecycleGenerationValue += 1;
    return this.replaceSelection(selectionIds);
  }

  public logicalSceneIndex(): PatchMapLogicalSceneIndex {
    const materialized = this.materializedValue ?? this.emptyMaterialized;
    if (this.logicalSceneIndexCache?.materialized !== materialized) {
      let index = this.logicalSceneIndexesByMaterialized.get(materialized);
      if (index === undefined) {
        index = new PatchMapLogicalSceneIndex(materialized.dataset);
        this.logicalSceneIndexesByMaterialized.set(materialized, index);
      }
      this.logicalSceneIndexCache = Object.freeze({ materialized, index });
      this.logicalSelectionIndexesByMaterialized.set(materialized, index);
    }
    return this.logicalSceneIndexCache.index;
  }

  public logicalSceneIdentityIndex(): PatchMapLogicalSceneIndex {
    return this.logicalSceneIndexCache?.index ?? this.logicalSceneIndex();
  }

  public logicalSceneSelectionIndex(): PatchMapLogicalSceneIndex {
    const materialized = this.materializedValue ?? this.emptyMaterialized;
    let index = this.logicalSelectionIndexesByMaterialized.get(materialized);
    if (index === undefined) {
      index = new PatchMapLogicalSceneIndex(materialized.dataset);
      this.logicalSelectionIndexesByMaterialized.set(materialized, index);
    }
    return index;
  }

  public validLogicalSelection(
    ids: readonly string[],
    materialized: MaterializedPatchMapDataset | null,
  ): readonly string[] {
    if (materialized === null || ids.length === 0) return Object.freeze([]);
    const index = materialized === this.materializedValue
      ? this.logicalSceneIndex()
      : new PatchMapLogicalSceneIndex(materialized.dataset);
    return Object.freeze([...new Set(ids)].filter((id) => index.target(id) !== null));
  }

  public validOwnedStructuralSelection(
    ids: readonly string[],
    materialized: MaterializedPatchMapDataset,
  ): readonly string[] {
    if (ids.length === 0) return Object.freeze([]);
    const elementIds = ownedPatchMapElementIds(materialized.dataset);
    if (elementIds === null) return this.validLogicalSelection(ids, materialized);
    const previousElementIds = this.materializedValue === null
      ? null
      : ownedPatchMapElementIds(this.materializedValue.dataset);
    const currentIndex = this.logicalSceneIndexCache?.index ?? null;
    const selected: string[] = [];
    for (const id of new Set(ids)) {
      if (elementIds.has(id)) {
        selected.push(id);
        continue;
      }
      const previousElementId = id.startsWith('element:')
        ? id.slice('element:'.length)
        : id;
      if (previousElementIds?.has(previousElementId)) continue;
      if (currentIndex === null) return this.validLogicalSelection(ids, materialized);
      const target = currentIndex.target(id);
      if (
        target !== null &&
        (
          elementIds.has(target.id) ||
          (target.ownerId !== null && elementIds.has(target.ownerId))
        )
      ) {
        selected.push(id);
      }
    }
    return Object.freeze(selected);
  }

  public validOwnedStableSelection(
    ids: readonly string[],
    materialized: MaterializedPatchMapDataset,
  ): readonly string[] {
    return Object.freeze(
      [...new Set(ids)].filter((id) => {
        const owned = this.ownedSelectionTargetExists(id, materialized);
        return owned ?? this.logicalSceneIdentityIndex().target(id) !== null;
      }),
    );
  }

  public ownedSelectionTargetExists(
    id: string,
    materialized: MaterializedPatchMapDataset,
  ): boolean | null {
    const elementIds = ownedPatchMapElementIds(materialized.dataset);
    if (elementIds === null) return null;
    if (elementIds.has(id)) return true;
    if (id.startsWith('element:')) {
      return elementIds.has(id.slice('element:'.length));
    }
    const componentKey = (ownerId: string, componentId: string): boolean =>
      this.componentSemanticsValue.has(componentSemanticKey(ownerId, componentId));
    if (id.startsWith('component:')) {
      const body = id.slice('component:'.length);
      const separator = body.indexOf('/');
      return separator > 0 && separator < body.length - 1
        ? componentKey(body.slice(0, separator), body.slice(separator + 1))
        : false;
    }
    const ownerSeparator = id.indexOf('/');
    if (ownerSeparator > 0 && ownerSeparator < id.length - 1) {
      return componentKey(id.slice(0, ownerSeparator), id.slice(ownerSeparator + 1));
    }
    const selectionSeparator = id.indexOf('::');
    const typeSeparator = selectionSeparator < 0
      ? -1
      : id.indexOf(':', selectionSeparator + 2);
    if (
      selectionSeparator > 0 &&
      typeSeparator > selectionSeparator + 2 &&
      typeSeparator < id.length - 1
    ) {
      const ownerId = id.slice(0, selectionSeparator);
      const componentType = id.slice(selectionSeparator + 2, typeSeparator);
      const componentId = id.slice(typeSeparator + 1);
      const semantic = this.componentSemanticsValue.get(componentSemanticKey(
        ownerId,
        componentId,
      ));
      return semantic !== undefined && semantic.componentType === componentType;
    }
    return null;
  }

  public findTarget(
    target: PatchMapMutationTarget,
  ): NormalizedPatchMapElement | PatchMapComponent | null {
    return this.materializedValue === null
      ? null
      : findSemanticTarget(this.materializedValue.dataset, target);
  }

  public findElement(id: string): Readonly<Record<string, unknown>> | null {
    return this.materializedValue === null
      ? null
      : findElement(this.materializedValue.dataset, id);
  }

  public rememberResolvedTarget(
    snapshot: PatchMapResolvedTargetSnapshot,
    authority: PatchMapResolvedTargetAuthority,
  ): void {
    this.resolvedTargetAuthorities.set(snapshot, authority);
  }

  public resolvedTargetAuthority(
    snapshot: PatchMapResolvedTargetSnapshot,
  ): PatchMapResolvedTargetAuthority | undefined {
    return this.resolvedTargetAuthorities.get(snapshot);
  }

  public rememberQueryResult(
    result: PatchMapEngineQueryResult,
    authority: PatchMapQueryResultAuthority,
  ): void {
    this.queryResultAuthorities.set(result, authority);
  }

  public queryResultAuthority(
    result: PatchMapEngineQueryResult,
  ): PatchMapQueryResultAuthority | undefined {
    return this.queryResultAuthorities.get(result);
  }

  public destroy(): void {
    this.materializedValue = null;
    this.componentSemanticsValue = new Map();
    this.textSemanticsValue = new Map();
    this.selectionIdsValue = Object.freeze([]);
    this.datasetRefValue = null;
    this.logicalSceneIndexCache = null;
    this.resolvedTargetAuthorities = new WeakMap();
    this.queryResultAuthorities = new WeakMap();
    this.logicalSceneIndexesByMaterialized = new WeakMap();
    this.logicalSelectionIndexesByMaterialized = new WeakMap();
  }
}

function immutableSelection(values: readonly string[]): readonly string[] {
  return Object.isFrozen(values) ? values : Object.freeze([...values]);
}

function findSemanticTarget(
  dataset: readonly NormalizedPatchMapElement[],
  target: PatchMapMutationTarget,
): NormalizedPatchMapElement | PatchMapComponent | null {
  let result: NormalizedPatchMapElement | PatchMapComponent | null = null;
  const visit = (elements: readonly NormalizedPatchMapElement[]): void => {
    for (const element of elements) {
      if (target.kind === 'element' && element.id === target.id) result = element;
      if (target.kind === 'component' && element.id === target.ownerId) {
        const components = element.type === 'item'
          ? element.components
          : element.type === 'grid'
            ? element.item.components
            : EMPTY_COMPONENTS;
        const component = components.find((entry) => entry.id === target.id);
        if (component !== undefined) result = component;
      }
      if (element.type === 'group') visit(element.children);
    }
  };
  visit(dataset);
  return result;
}

const EMPTY_COMPONENTS = Object.freeze([] as PatchMapComponent[]);

function findElement(
  values: readonly NormalizedPatchMapElement[],
  id: string,
): Readonly<Record<string, unknown>> | null {
  for (const value of values) {
    if (value.id === id) return value;
    if (value.type === 'group') {
      const nested = findElement(value.children, id);
      if (nested !== null) return nested;
    }
  }
  return null;
}
