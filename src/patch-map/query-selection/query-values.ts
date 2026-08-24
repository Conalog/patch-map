import type { PatchMapMutationTarget } from '../semantic/transaction';
import type {
  PatchMapLogicalTargetSnapshot,
  PatchMapSceneQuery,
  PatchMapSceneQueryWhere,
} from './contracts';
import { patchMapLogicalTargetKey } from './logical-target-values';

export function queryScope(
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

export function queryWhereMatches(
  target: PatchMapLogicalTargetSnapshot,
  where: PatchMapSceneQueryWhere,
): boolean {
  if (where.id !== undefined && target.id !== where.id) return false;
  if (where.ownerId !== undefined && target.ownerId !== where.ownerId) return false;
  if (where.type !== undefined && target.type !== where.type) return false;
  if (where.label !== undefined && target.label !== where.label) return false;
  return true;
}

export function queryOrder(
  left: PatchMapLogicalTargetSnapshot,
  right: PatchMapLogicalTargetSnapshot,
): number {
  if (left.kind !== right.kind) return left.kind === 'element' ? -1 : 1;
  return left.sceneOrder - right.sceneOrder || left.key.localeCompare(right.key);
}

export function validateQuery(input: PatchMapSceneQuery): void {
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
