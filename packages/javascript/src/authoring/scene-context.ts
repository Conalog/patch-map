import type { NormalizedPatchMapElement } from '../semantic/dataset';
import {
  PATCH_MAP_IDENTITY_AFFINE,
  createPatchMapAffine,
  multiplyPatchMapAffine,
  type PatchMapAffineMatrix,
} from '../semantic/geometry';
import { fail } from './normalization';

export interface AuthoringElementLocation {
  readonly element: NormalizedPatchMapElement;
  readonly parentId: string | null;
  readonly siblings: readonly NormalizedPatchMapElement[];
  readonly index: number;
  readonly parentAffine: PatchMapAffineMatrix;
  readonly worldAffine: PatchMapAffineMatrix;
  readonly ancestorLocked: boolean;
}

export function indexAuthoringElements(
  dataset: readonly NormalizedPatchMapElement[],
): ReadonlyMap<string, AuthoringElementLocation> {
  const index = new Map<string, AuthoringElementLocation>();
  const visit = (
    elements: readonly NormalizedPatchMapElement[],
    parentId: string | null,
    parentAffine: PatchMapAffineMatrix,
    ancestorLocked: boolean,
  ): void => {
    elements.forEach((element, elementIndex) => {
      const worldAffine = multiplyPatchMapAffine(parentAffine, elementLocalAffine(element));
      index.set(element.id, Object.freeze({
        element,
        parentId,
        siblings: elements,
        index: elementIndex,
        parentAffine,
        worldAffine,
        ancestorLocked,
      }));
      if (element.type === 'group') {
        visit(
          element.children,
          element.id,
          worldAffine,
          ancestorLocked || element.locked,
        );
      }
    });
  };
  visit(dataset, null, PATCH_MAP_IDENTITY_AFFINE, false);
  return index;
}

export function elementLocalAffine(element: NormalizedPatchMapElement): PatchMapAffineMatrix {
  const attrs = element.attrs ?? {};
  return createPatchMapAffine(
    optionalFinite(attrs.x, 0),
    optionalFinite(attrs.y, 0),
    rotationDegrees(attrs),
    optionalFinite(attrs.scaleX, 1),
    optionalFinite(attrs.scaleY, 1),
  );
}

export function rotationDegrees(attrs: Readonly<Record<string, unknown>>): number {
  if (attrs.angle !== undefined) return optionalFinite(attrs.angle, 0);
  if (attrs.rotation !== undefined) {
    return roundSix(optionalFinite(attrs.rotation, 0) * 180 / Math.PI);
  }
  return 0;
}

export function requireLocation(
  index: ReadonlyMap<string, AuthoringElementLocation>,
  id: string,
  path: readonly (string | number)[],
): AuthoringElementLocation {
  const location = index.get(id);
  if (location === undefined) {
    fail('MISSING_TARGET', path, `No element matches ${id}`);
  }
  return location;
}

export function assertUnlocked(
  location: AuthoringElementLocation,
  path: readonly (string | number)[],
): void {
  if (location.element.locked || location.ancestorLocked) {
    fail('INVALID_MUTATION', path, `Element ${location.element.id} is locked`);
  }
}

export function isDescendant(
  index: ReadonlyMap<string, AuthoringElementLocation>,
  candidateId: string,
  ancestorId: string,
): boolean {
  let current = index.get(candidateId);
  while (current?.parentId !== null && current?.parentId !== undefined) {
    if (current.parentId === ancestorId) return true;
    current = index.get(current.parentId);
  }
  return false;
}

export function optionalFinite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function roundSix(value: number): number {
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}
