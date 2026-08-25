import type { NormalizedPatchMapElement } from '../semantic/dataset';
import {
  invertPatchMapAffine,
  patchMapAffineCorners,
  type PatchMapBoundsTuple,
  type PatchMapPointTuple,
} from '../semantic/geometry';
import type { PatchMapMutationOperation } from '../semantic/transaction';
import type {
  PatchMapAuthoringAction,
  PatchMapAuthoringAlignmentAxis,
  PatchMapAuthoringPlan,
} from './contracts';
import { fail } from './normalization';
import {
  authoringFingerprint,
  elementTarget,
  facts,
  isPathChange,
  pathChangeIfDifferent,
  plannedPlan,
  unchangedPlan,
  uniqueTargetIds,
} from './plan-results';
import {
  assertUnlocked,
  optionalFinite,
  requireLocation,
  rotationDegrees,
  roundSix,
  type AuthoringElementLocation,
} from './scene-context';

interface AuthoringGeometry {
  readonly location: AuthoringElementLocation;
  readonly bounds: PatchMapBoundsTuple;
}

export function planPositionEdit(
  action: Extract<PatchMapAuthoringAction, { readonly type: 'edit-position-angle' }>,
  index: ReadonlyMap<string, AuthoringElementLocation>,
): PatchMapAuthoringPlan {
  const location = requireLocation(index, action.target, ['target']);
  assertUnlocked(location, ['target']);
  const attrs = location.element.attrs ?? {};
  const changes = [
    pathChangeIfDifferent(attrs.x, action.x, ['attrs', 'x']),
    pathChangeIfDifferent(attrs.y, action.y, ['attrs', 'y']),
    pathChangeIfDifferent(rotationDegrees(attrs), action.angleDegrees, ['attrs', 'angle']),
  ].filter(isPathChange);
  const target = elementTarget(action.target);
  const resultFacts = facts({
    target: action.target,
    x: action.x,
    y: action.y,
    angleDegrees: action.angleDegrees,
  });
  if (changes.length === 0) return unchangedPlan(action, resultFacts);
  return plannedPlan(
    action,
    [Object.freeze({ op: 'merge', target, changes: Object.freeze(changes) })],
    [action.target],
    resultFacts,
  );
}

export function planAlignment(
  action: Extract<PatchMapAuthoringAction, { readonly type: 'align-targets' }>,
  index: ReadonlyMap<string, AuthoringElementLocation>,
): PatchMapAuthoringPlan {
  const geometries = requireGeometries(action.targets, index, 2);
  const anchor = alignmentAnchor(action.axis, geometries);
  const operations = geometries.flatMap((geometry) => {
    const delta = alignmentDelta(action.axis, geometry.bounds, anchor);
    return geometryTranslationOperation(geometry, delta);
  });
  const resultFacts = facts({
    targets: action.targets,
    axis: action.axis,
    anchor,
  });
  if (operations.length === 0) return unchangedPlan(action, resultFacts);
  return plannedPlan(action, operations, action.targets, resultFacts);
}

export function planDistribution(
  action: Extract<PatchMapAuthoringAction, { readonly type: 'distribute-targets' }>,
  index: ReadonlyMap<string, AuthoringElementLocation>,
): PatchMapAuthoringPlan {
  const geometries = requireGeometries(action.targets, index, 3);
  const horizontal = action.axis === 'horizontal';
  const startIndex = horizontal ? 0 : 1;
  const sizeIndex = horizontal ? 2 : 3;
  const start = Math.min(...geometries.map(({ bounds }) => bounds[startIndex]));
  const end = Math.max(
    ...geometries.map(({ bounds }) => bounds[startIndex] + bounds[sizeIndex]),
  );
  const occupied = geometries.reduce(
    (sum, { bounds }) => sum + bounds[sizeIndex],
    0,
  );
  const gap = roundSix((end - start - occupied) / (geometries.length - 1));
  let cursor = start;
  const desiredStarts: number[] = [];
  const operations: PatchMapMutationOperation[] = [];
  for (const geometry of geometries) {
    desiredStarts.push(roundSix(cursor));
    const currentStart = geometry.bounds[startIndex];
    const delta = horizontal
      ? Object.freeze([roundSix(cursor - currentStart), 0] as const)
      : Object.freeze([0, roundSix(cursor - currentStart)] as const);
    operations.push(...geometryTranslationOperation(geometry, delta));
    cursor += geometry.bounds[sizeIndex] + gap;
  }
  const digest = authoringFingerprint({
    axis: action.axis,
    targets: action.targets,
    starts: desiredStarts,
    gap,
  });
  const resultFacts = facts({
    targets: action.targets,
    axis: action.axis,
    gap,
    desiredStarts,
    distributionDigest: digest,
  });
  if (operations.length === 0) return unchangedPlan(action, resultFacts);
  return plannedPlan(action, operations, action.targets, resultFacts);
}

function requireGeometries(
  targetIds: readonly string[],
  index: ReadonlyMap<string, AuthoringElementLocation>,
  minimum: number,
): readonly AuthoringGeometry[] {
  const targets = uniqueTargetIds(targetIds, minimum);
  return Object.freeze(targets.map((target, targetIndex) => {
    const location = requireLocation(index, target, ['targets', targetIndex]);
    assertUnlocked(location, ['targets', targetIndex]);
    const size = elementSize(location.element);
    if (size === null) {
      fail(
        'INVALID_MUTATION',
        ['targets', targetIndex],
        `Element ${target} has no distributable rectangular bounds`,
      );
    }
    const corners = patchMapAffineCorners(
      location.worldAffine,
      Object.freeze([0, 0, size[0], size[1]]),
    );
    const xs = corners.map(([x]) => x);
    const ys = corners.map(([, y]) => y);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    return Object.freeze({
      location,
      bounds: Object.freeze([
        roundSix(left),
        roundSix(top),
        roundSix(Math.max(...xs) - left),
        roundSix(Math.max(...ys) - top),
      ] as const),
    });
  }));
}

function elementSize(element: NormalizedPatchMapElement): PatchMapPointTuple | null {
  switch (element.type) {
    case 'item':
    case 'rect':
      return Object.freeze([element.size.width, element.size.height]);
    case 'image':
    case 'text':
      return element.size === undefined
        ? null
        : Object.freeze([element.size.width, element.size.height]);
    case 'grid': {
      const rows = element.cells.length;
      const columns = Math.max(0, ...element.cells.map((row) => row.length));
      return Object.freeze([
        columns === 0
          ? 0
          : columns * element.item.size.width + (columns - 1) * element.gap.x,
        rows === 0
          ? 0
          : rows * element.item.size.height + (rows - 1) * element.gap.y,
      ]);
    }
    case 'group':
    case 'relations':
      return null;
  }
}

function alignmentAnchor(
  axis: PatchMapAuthoringAlignmentAxis,
  geometries: readonly AuthoringGeometry[],
): number {
  switch (axis) {
    case 'left':
      return Math.min(...geometries.map(({ bounds }) => bounds[0]));
    case 'right':
      return Math.max(...geometries.map(({ bounds }) => bounds[0] + bounds[2]));
    case 'top':
      return Math.min(...geometries.map(({ bounds }) => bounds[1]));
    case 'bottom':
      return Math.max(...geometries.map(({ bounds }) => bounds[1] + bounds[3]));
    case 'center-x':
      return roundSix(
        geometries.reduce((sum, { bounds }) => sum + bounds[0] + bounds[2] / 2, 0) /
        geometries.length,
      );
    case 'center-y':
      return roundSix(
        geometries.reduce((sum, { bounds }) => sum + bounds[1] + bounds[3] / 2, 0) /
        geometries.length,
      );
  }
}

function alignmentDelta(
  axis: PatchMapAuthoringAlignmentAxis,
  bounds: PatchMapBoundsTuple,
  anchor: number,
): PatchMapPointTuple {
  switch (axis) {
    case 'left':
      return Object.freeze([roundSix(anchor - bounds[0]), 0]);
    case 'right':
      return Object.freeze([roundSix(anchor - bounds[0] - bounds[2]), 0]);
    case 'top':
      return Object.freeze([0, roundSix(anchor - bounds[1])]);
    case 'bottom':
      return Object.freeze([0, roundSix(anchor - bounds[1] - bounds[3])]);
    case 'center-x':
      return Object.freeze([roundSix(anchor - bounds[0] - bounds[2] / 2), 0]);
    case 'center-y':
      return Object.freeze([0, roundSix(anchor - bounds[1] - bounds[3] / 2)]);
  }
}

function geometryTranslationOperation(
  geometry: AuthoringGeometry,
  deltaWorld: PatchMapPointTuple,
): readonly PatchMapMutationOperation[] {
  if (nearZero(deltaWorld[0]) && nearZero(deltaWorld[1])) return Object.freeze([]);
  const inverse = invertPatchMapAffine(geometry.location.parentAffine);
  const deltaLocal = Object.freeze([
    roundSix(inverse[0] * deltaWorld[0] + inverse[2] * deltaWorld[1]),
    roundSix(inverse[1] * deltaWorld[0] + inverse[3] * deltaWorld[1]),
  ] as const);
  const attrs = geometry.location.element.attrs ?? {};
  const currentX = optionalFinite(attrs.x, 0);
  const currentY = optionalFinite(attrs.y, 0);
  const changes = [
    pathChangeIfDifferent(currentX, roundSix(currentX + deltaLocal[0]), ['attrs', 'x']),
    pathChangeIfDifferent(currentY, roundSix(currentY + deltaLocal[1]), ['attrs', 'y']),
  ].filter(isPathChange);
  if (changes.length === 0) return Object.freeze([]);
  return Object.freeze([
    Object.freeze({
      op: 'merge',
      target: elementTarget(geometry.location.element.id),
      changes: Object.freeze(changes),
    }),
  ]);
}

function nearZero(value: number): boolean {
  return Math.abs(value) <= 1e-9;
}
