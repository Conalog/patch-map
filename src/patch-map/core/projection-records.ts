import type {
  PatchMapEntityProjection,
  PatchMapProjectionIndex,
} from '../contracts';
import { isPlainRecord } from '../shared/plain-record';
import {
  compactPatchMapStableRecord,
  rollbackPatchMapStableRecord,
} from '../semantic/stable-record-overlay';

export function compactPatchMapProjectionStableRecords(
  projection: PatchMapProjectionIndex,
): void {
  for (const record of patchMapProjectionStableRecords(projection)) {
    compactPatchMapStableRecord(record);
  }
}

export function rollbackPatchMapProjectionStableRecords(
  candidate: PatchMapProjectionIndex,
  previous: PatchMapProjectionIndex,
): void {
  const candidateRecords = patchMapProjectionStableRecords(candidate);
  const previousRecords = patchMapProjectionStableRecords(previous);
  for (let index = 0; index < candidateRecords.length; index += 1) {
    rollbackPatchMapStableRecord(
      candidateRecords[index],
      previousRecords[index],
    );
  }
}

function patchMapProjectionStableRecords(
  projection: PatchMapProjectionIndex,
): readonly (Readonly<Record<string, unknown>> | undefined)[] {
  return [
    projection.byEntityId,
    projection.componentsByEntityId,
    projection.backgroundsByEntityId,
    projection.imagesByEntityId,
    projection.textsByEntityId,
    projection.barsByEntityId,
    projection.relationsByEntityId,
  ];
}

export function jsonEquivalent(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => jsonEquivalent(value, right[index]));
  }
  if (!isPlainRecord(left) || !isPlainRecord(right)) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every(
    (key) => Object.hasOwn(right, key) && jsonEquivalent(left[key], right[key]),
  );
}

export function freezeProjectionReplacements(
  source: PatchMapProjectionIndex,
  replacements: Readonly<Record<string, PatchMapEntityProjection>>,
): PatchMapProjectionIndex {
  const byEntityId = Object.freeze({
    ...source.byEntityId,
    ...replacements,
  });
  return Object.freeze({
    ...source,
    byEntityId,
  });
}
