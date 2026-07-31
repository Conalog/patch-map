import {
  PATCH_MAP_IDENTITY_AFFINE,
  createPatchMapAffine,
  invertPatchMapAffine,
  multiplyPatchMapAffine,
  type PatchMapAffineMatrix,
} from '../geometry';
import type { PatchMapMutationTarget } from './contracts';
import { transactionFail } from './diagnostics';
import {
  defineMutableProperty,
  isMutableJsonRecord,
  type MutableJsonRecord,
  type MutableJsonValue,
} from './json-values';
import { targetKey, targetLabel } from './request-normalization';

export interface StagedLocation {
  readonly kind: PatchMapMutationTarget['kind'];
  readonly ownerId?: string;
  readonly parent: MutableJsonValue[];
  readonly index: number;
  readonly parentElementId?: string | null;
  readonly parentAffine?: PatchMapAffineMatrix;
  readonly worldAffine?: PatchMapAffineMatrix;
  readonly locked?: boolean;
  record: MutableJsonRecord;
}

export function structuralDestination(
  dataset: MutableJsonValue[],
  index: ReadonlyMap<string, readonly StagedLocation[]>,
  parent: Extract<PatchMapMutationTarget, { readonly kind: 'element' }> | null,
  operationPath: string,
  operationIndex: number,
  strict: boolean,
): Readonly<{
  readonly children: MutableJsonValue[];
  readonly parentAffine: PatchMapAffineMatrix;
}> | null {
  if (parent === null) {
    return Object.freeze({ children: dataset, parentAffine: PATCH_MAP_IDENTITY_AFFINE });
  }
  const location = locate(index, parent, operationPath, operationIndex);
  if (location === undefined) {
    if (strict) missingStructuralTarget(parent, `${operationPath}.parent`, operationIndex);
    return null;
  }
  requireElementLocation(location, parent, operationPath, operationIndex);
  assertUnlockedLocation(location, parent, operationPath, operationIndex);
  if (location.record.type !== 'group' || !Array.isArray(location.record.children)) {
    transactionFail(
      'INVALID_MUTATION',
      'INVALID_INPUT',
      `${operationPath}.parent`,
      'move parent must resolve to a group element or null',
      operationIndex,
      parent,
    );
  }
  return Object.freeze({
    children: location.record.children,
    parentAffine: requireLocationAffine(location, operationPath, operationIndex, parent),
  });
}

export function missingStructuralTarget(
  target: Extract<PatchMapMutationTarget, { readonly kind: 'element' }>,
  path: string,
  operationIndex: number,
): never {
  transactionFail(
    'MISSING_TARGET',
    'MISSING_TARGET',
    path,
    `No staged record matches ${targetLabel(target)}`,
    operationIndex,
    target,
  );
}

export function hierarchyConflict(
  path: string,
  message: string,
  operationIndex: number,
  target?: PatchMapMutationTarget,
): never {
  transactionFail('CONFLICT', 'CONFLICT', path, message, operationIndex, target);
}

export function requireElementLocation(
  location: StagedLocation,
  target: Extract<PatchMapMutationTarget, { readonly kind: 'element' }>,
  operationPath: string,
  operationIndex: number,
): void {
  if (location.kind === 'element') return;
  transactionFail(
    'INVALID_MUTATION',
    'INVALID_INPUT',
    `${operationPath}.target`,
    'hierarchy target must resolve to an element',
    operationIndex,
    target,
  );
}

export function assertUnlockedLocation(
  location: StagedLocation,
  target: Extract<PatchMapMutationTarget, { readonly kind: 'element' }>,
  operationPath: string,
  operationIndex: number,
): void {
  if (location.locked !== true) return;
  hierarchyConflict(
    `${operationPath}.target`,
    'hierarchy target or one of its ancestors is locked',
    operationIndex,
    target,
  );
}

export function requireLocationAffine(
  location: StagedLocation,
  operationPath: string,
  operationIndex: number,
  target: PatchMapMutationTarget,
): PatchMapAffineMatrix {
  if (location.worldAffine !== undefined) return location.worldAffine;
  hierarchyConflict(
    `${operationPath}.target`,
    'hierarchy target has no finite world transform',
    operationIndex,
    target,
  );
}

export function requireLocationParentAffine(
  location: StagedLocation,
  operationPath: string,
  operationIndex: number,
  target: PatchMapMutationTarget,
): PatchMapAffineMatrix {
  if (location.parentAffine !== undefined) return location.parentAffine;
  hierarchyConflict(
    `${operationPath}.target`,
    'hierarchy target has no finite parent transform',
    operationIndex,
    target,
  );
}

export function rebaseElementRecord(
  record: MutableJsonRecord,
  worldAffine: PatchMapAffineMatrix,
  parentAffine: PatchMapAffineMatrix,
  operationPath: string,
  operationIndex: number,
  target: PatchMapMutationTarget,
): void {
  let local: PatchMapAffineMatrix;
  try {
    local = multiplyPatchMapAffine(invertPatchMapAffine(parentAffine), worldAffine);
  } catch {
    hierarchyConflict(
      `${operationPath}.target`,
      'hierarchy transform cannot be rebased through a singular parent',
      operationIndex,
      target,
    );
  }
  const [a, b, c, d, x, y] = local;
  const scaleX = Math.hypot(a, b);
  const determinant = a * d - b * c;
  if (!(scaleX > 1e-12) || !Number.isFinite(determinant)) {
    hierarchyConflict(
      `${operationPath}.target`,
      'hierarchy transform cannot be represented by the pinned affine profile',
      operationIndex,
      target,
    );
  }
  const scaleY = determinant / scaleX;
  const skew = a * c + b * d;
  const tolerance = 1e-8 * Math.max(1, scaleX * Math.abs(scaleY));
  if (!Number.isFinite(scaleY) || Math.abs(scaleY) <= 1e-12 || Math.abs(skew) > tolerance) {
    hierarchyConflict(
      `${operationPath}.target`,
      'hierarchy rebase would require unsupported skew or singular scale',
      operationIndex,
      target,
    );
  }
  const angle = normalizeSignedZero(Math.atan2(b, a) * 180 / Math.PI);
  const attrs = isMutableJsonRecord(record.attrs) ? record.attrs : {};
  defineMutableProperty(attrs, 'x', normalizeSignedZero(x));
  defineMutableProperty(attrs, 'y', normalizeSignedZero(y));
  if (Object.prototype.hasOwnProperty.call(attrs, 'rotation') &&
      !Object.prototype.hasOwnProperty.call(attrs, 'angle')) {
    defineMutableProperty(attrs, 'rotation', normalizeSignedZero(angle * Math.PI / 180));
  } else if (angle !== 0 || Object.prototype.hasOwnProperty.call(attrs, 'angle')) {
    defineMutableProperty(attrs, 'angle', angle);
    delete attrs.rotation;
  } else {
    delete attrs.angle;
    delete attrs.rotation;
  }
  writeScaleAttribute(attrs, 'scaleX', scaleX);
  writeScaleAttribute(attrs, 'scaleY', scaleY);
  defineMutableProperty(record, 'attrs', attrs);
}

function writeScaleAttribute(
  attrs: MutableJsonRecord,
  key: 'scaleX' | 'scaleY',
  value: number,
): void {
  const normalized = normalizeSignedZero(Math.abs(value - 1) <= 1e-12 ? 1 : value);
  if (normalized === 1 && !Object.prototype.hasOwnProperty.call(attrs, key)) delete attrs[key];
  else defineMutableProperty(attrs, key, normalized);
}

export function stagedElementLocalAffine(record: MutableJsonRecord): PatchMapAffineMatrix {
  const attrs = isMutableJsonRecord(record.attrs) ? record.attrs : undefined;
  const x = finiteOr(attrs?.x, 0);
  const y = finiteOr(attrs?.y, 0);
  const angle = Number.isFinite(attrs?.angle)
    ? Number(attrs?.angle)
    : Number.isFinite(attrs?.rotation)
      ? Number(attrs?.rotation) * 180 / Math.PI
      : 0;
  const scaleX = finiteOr(attrs?.scaleX, 1);
  const scaleY = finiteOr(attrs?.scaleY, 1);
  return createPatchMapAffine(x, y, angle, scaleX, scaleY);
}

function finiteOr(value: MutableJsonValue | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function elementSubtreeIds(record: MutableJsonRecord): ReadonlySet<string> {
  const ids = new Set<string>();
  const visit = (value: MutableJsonValue): void => {
    if (!isMutableJsonRecord(value)) return;
    if (typeof value.id === 'string') ids.add(value.id);
    if (value.type === 'group' && Array.isArray(value.children)) {
      for (const child of value.children) visit(child);
    }
  };
  visit(record);
  return ids;
}

export function elementIdsInArray(values: readonly MutableJsonValue[]): readonly string[] {
  return Object.freeze(values.flatMap((value) =>
    isMutableJsonRecord(value) && typeof value.id === 'string' ? [value.id] : []));
}

export function freezeUniqueStrings(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)]);
}

export function locationTarget(
  location: StagedLocation,
): Extract<PatchMapMutationTarget, { readonly kind: 'element' }> {
  const id = location.record.id;
  if (typeof id !== 'string') {
    throw new Error('Staged element location lost its string ID');
  }
  return Object.freeze({ kind: 'element', id });
}

export function relationDependencyCount(dataset: readonly MutableJsonValue[], id: string): number {
  let count = 0;
  visitRelationRecords(dataset, (links) => {
    for (const link of links) {
      if (!isMutableJsonRecord(link)) continue;
      if (link.source === id || link.target === id) count += 1;
    }
  });
  return count;
}

export function removeRelationDependencies(dataset: readonly MutableJsonValue[], id: string): void {
  visitRelationRecords(dataset, (links, owner) => {
    defineMutableProperty(owner, 'links', links.filter((link) =>
      !isMutableJsonRecord(link) || (link.source !== id && link.target !== id)));
  });
}

function visitRelationRecords(
  values: readonly MutableJsonValue[],
  visit: (links: MutableJsonValue[], owner: MutableJsonRecord) => void,
): void {
  for (const value of values) {
    if (!isMutableJsonRecord(value)) continue;
    if (value.type === 'relations' && Array.isArray(value.links)) visit(value.links, value);
    if (value.type === 'group' && Array.isArray(value.children)) {
      visitRelationRecords(value.children, visit);
    }
  }
}

function normalizeSignedZero(value: number): number {
  return Object.is(value, -0) || Math.abs(value) <= 1e-12 ? 0 : value;
}

export function indexDataset(dataset: MutableJsonValue[]): ReadonlyMap<string, readonly StagedLocation[]> {
  const mutable = new Map<string, StagedLocation[]>();
  dataset.forEach((value, index) => indexElement(
    value,
    dataset,
    index,
    mutable,
    null,
    PATCH_MAP_IDENTITY_AFFINE,
    false,
  ));
  return mutable;
}

function indexElement(
  value: MutableJsonValue,
  parent: MutableJsonValue[],
  index: number,
  targetIndex: Map<string, StagedLocation[]>,
  parentElementId: string | null,
  parentAffine: PatchMapAffineMatrix,
  ancestorLocked: boolean,
): void {
  if (!isMutableJsonRecord(value)) return;
  const id = value.id;
  if (typeof id !== 'string') return;
  const worldAffine = multiplyPatchMapAffine(parentAffine, stagedElementLocalAffine(value));
  const locked = ancestorLocked || value.locked === true;
  addLocation(targetIndex, targetKey({ kind: 'element', id }), {
    kind: 'element',
    parent,
    index,
    parentElementId,
    parentAffine,
    worldAffine,
    locked,
    record: value,
  });

  if (value.type === 'group' && Array.isArray(value.children)) {
    value.children.forEach((child, childIndex) =>
      indexElement(
        child,
        value.children as MutableJsonValue[],
        childIndex,
        targetIndex,
        id,
        worldAffine,
        locked,
      ),
    );
  }
  if (value.type === 'item' && Array.isArray(value.components)) {
    indexComponents(value.components, id, targetIndex);
  }
  const gridItem = value.item;
  if (value.type === 'grid' && isMutableJsonRecord(gridItem) && Array.isArray(gridItem.components)) {
    indexComponents(gridItem.components, id, targetIndex);
  }
}

function indexComponents(
  components: MutableJsonValue[],
  ownerId: string,
  targetIndex: Map<string, StagedLocation[]>,
): void {
  components.forEach((value, index) => {
    if (!isMutableJsonRecord(value) || typeof value.id !== 'string') return;
    addLocation(targetIndex, targetKey({ kind: 'component', ownerId, id: value.id }), {
      kind: 'component',
      ownerId,
      parent: components,
      index,
      record: value,
    });
  });
}

function addLocation(
  index: Map<string, StagedLocation[]>,
  key: string,
  location: StagedLocation,
): void {
  const existing = index.get(key);
  if (existing === undefined) index.set(key, [location]);
  else existing.push(location);
}

export function locate(
  index: ReadonlyMap<string, readonly StagedLocation[]>,
  target: PatchMapMutationTarget,
  operationPath: string,
  operationIndex: number,
): StagedLocation | undefined {
  const matches = index.get(targetKey(target)) ?? [];
  if (matches.length > 1) {
    transactionFail(
      'DUPLICATE_ID',
      'INVALID_INPUT',
      `${operationPath}.target`,
      `${targetLabel(target)} resolves to multiple staged records`,
      operationIndex,
      target,
    );
  }
  return matches[0];
}
