import type {
  EntityRef,
  SlotRange,
} from '../dense/contracts';
import type {
  ParsePatchMapOptions,
  ParsePatchMapResult,
} from '../contracts';
import { parsePatchMapSelectedRoots } from '../parser';
import { ownedPatchMapPreviewPatchIndices } from '../semantic/dataset';
import { isPlainRecord } from '../shared/plain-record';
import { sameStringArray } from '../shared/string-array-values';
import type { PatchMapSemanticTarget } from '../semantic/probe';
import type {
  PatchMapSemanticRefreshOptions,
  PatchMapSemanticRefreshResult,
} from './contracts';
import {
  incrementalParseOptionsKey,
  matchesOwnedIncrementalInput,
} from './reconcile-planning';
import { semanticSelectionDenseIds } from './semantic-dense-planning';
import { contiguousSlotRanges } from './slot-ranges';
import {
  type PatchMapIndexedComponentTarget,
  type PatchMapPublishedSceneState,
  type PatchMapTransientIncrementalParse,
} from './published-scene-state';
import { patchMapComponentProbeTargetKey } from './component-target-key';

export interface PatchMapPreparedIncrementalPreview
  extends PatchMapTransientIncrementalParse {
  readonly entityIds: readonly string[];
}

interface PatchMapTransientProjectionScene {
  ref(id: string): EntityRef | null;
}

/** Prepare a private incremental preview without publishing runtime state. */
export function preparePatchMapIncrementalPreview(
  input: unknown,
  dirtyRootIds: readonly string[],
  parseOptions: ParsePatchMapOptions,
  published: PatchMapPublishedSceneState,
): PatchMapPreparedIncrementalPreview | null {
  const current = published.parse;
  const sparseDirtyIndices = published.ownedInputDataset === null
    ? null
    : ownedPatchMapPreviewPatchIndices(input, published.ownedInputDataset);
  const optionsKey = incrementalParseOptionsKey(parseOptions);
  const sparseInputMatches =
    sparseDirtyIndices !== null &&
    optionsKey !== null &&
    optionsKey === published.ownedParseOptionsKey;
  if (
    current === null ||
    (
      !sparseInputMatches &&
      !matchesOwnedIncrementalInput(
        input,
        dirtyRootIds,
        parseOptions,
        published,
      )
    )
  ) {
    return null;
  }

  const roots = input as readonly Readonly<{ readonly id: string }>[];
  const dirty = new Set(dirtyRootIds);
  if (dirty.size !== dirtyRootIds.length) return null;
  const dirtyIndices: number[] = [];
  if (sparseInputMatches) {
    for (const index of sparseDirtyIndices) {
      const root = roots[index];
      if (root === undefined || !dirty.delete(root.id)) return null;
      dirtyIndices.push(index);
    }
  } else {
    for (let index = 0; index < roots.length; index += 1) {
      if (dirty.delete(roots[index]!.id)) dirtyIndices.push(index);
    }
  }
  if (dirty.size !== 0) return null;

  const selected = parsePatchMapSelectedRoots(
    roots,
    dirtyIndices,
    parseOptions,
  );
  if (selected.diagnostics.some(({ level }) => level === 'error')) return null;

  const entityIds: string[] = [];
  for (const rootId of dirtyRootIds) {
    const expected = current.identity.entityIdsBySourceId[rootId] ?? [];
    const actual = selected.identity.entityIdsBySourceId[rootId] ?? [];
    if (!sameStringArray(expected, actual)) return null;
    for (const entityId of actual) {
      if (selected.projection.byEntityId[entityId] === undefined) return null;
      entityIds.push(entityId);
    }
  }
  const uniqueEntityIds = Object.freeze([...new Set(entityIds)]);
  if (optionsKey === null) return null;
  return Object.freeze({
    base: current,
    optionsKey,
    dirtyRootIds: Object.freeze([...dirtyRootIds]),
    dirtyIndices: Object.freeze(dirtyIndices),
    dirtyRoots: Object.freeze(dirtyIndices.map((index) => roots[index] as object)),
    selected,
    entityIds: uniqueEntityIds,
  });
}

/** Resolve prepared dense IDs to the exact aggregate upload ranges. */
export function preparePatchMapTransientDirtyRanges(
  entityIds: readonly string[],
  scene: PatchMapTransientProjectionScene,
): readonly SlotRange[] {
  return contiguousSlotRanges(entityIds.flatMap((entityId) => {
    const ref = scene.ref(entityId);
    return ref === null ? [] : [ref.slot];
  }));
}

/** Prepare semantic refresh observations without touching renderer state. */
export function preparePatchMapSemanticRefresh(
  targets: readonly PatchMapSemanticTarget[],
  options: PatchMapSemanticRefreshOptions,
  parse: ParsePatchMapResult,
  componentTargets: ReadonlyMap<string, PatchMapIndexedComponentTarget | null>,
  scene: PatchMapTransientProjectionScene,
): PatchMapSemanticRefreshResult {
  const recomputedTargets: string[] = [];
  const missingTargets: string[] = [];
  const denseEntityIds = new Set<string>();
  for (const [index, target] of targets.entries()) {
    const normalized = normalizeRefreshTarget(target, index);
    const label = normalized.kind === 'component'
      ? `${normalized.ownerId}/${normalized.id}`
      : normalized.id;
    const resolved = normalized.kind === 'component'
      ? componentRefreshEntityIds(componentTargets, normalized)
      : semanticSelectionDenseIds(parse, [normalized.id]);
    if (resolved.length === 0) {
      missingTargets.push(label);
      continue;
    }
    recomputedTargets.push(label);
    for (const entityId of resolved) denseEntityIds.add(entityId);
  }
  if (options.strict === true && missingTargets.length > 0) {
    return Object.freeze({
      changed: false,
      recomputedTargets: Object.freeze([]),
      missingTargets: Object.freeze(missingTargets),
      dirtyRanges: Object.freeze([]),
      dataDiffCount: 0,
    });
  }
  const slots = [...denseEntityIds].flatMap((entityId) => {
    const ref = scene.ref(entityId);
    return ref === null ? [] : [ref.slot];
  }).sort((left, right) => left - right);
  const dirtyRanges = contiguousSlotRanges(slots);
  return Object.freeze({
    changed: dirtyRanges.length > 0,
    recomputedTargets: Object.freeze(recomputedTargets),
    missingTargets: Object.freeze(missingTargets),
    dirtyRanges,
    dataDiffCount: 0,
  });
}

function normalizeRefreshTarget(
  target: unknown,
  index: number,
): PatchMapSemanticTarget {
  if (!isPlainRecord(target)) {
    throw new TypeError(`refresh targets[${index}] must be an object`);
  }
  if (target.kind !== 'element' && target.kind !== 'component') {
    throw new TypeError(`refresh targets[${index}].kind is unsupported`);
  }
  if (typeof target.id !== 'string' || target.id.length === 0) {
    throw new TypeError(`refresh targets[${index}].id must be a non-empty string`);
  }
  if (target.kind === 'component') {
    if (typeof target.ownerId !== 'string' || target.ownerId.length === 0) {
      throw new TypeError(`refresh targets[${index}].ownerId must be a non-empty string`);
    }
    return Object.freeze({ kind: 'component', ownerId: target.ownerId, id: target.id });
  }
  return Object.freeze({ kind: 'element', id: target.id });
}

function componentRefreshEntityIds(
  targets: ReadonlyMap<string, PatchMapIndexedComponentTarget | null>,
  target: Extract<PatchMapSemanticTarget, { readonly kind: 'component' }>,
): readonly string[] {
  const indexed = targets.get(patchMapComponentProbeTargetKey({
    ownerId: target.ownerId,
    componentId: target.id,
  }));
  return indexed === undefined || indexed === null
    ? Object.freeze([])
    : Object.freeze([indexed.entityId]);
}
