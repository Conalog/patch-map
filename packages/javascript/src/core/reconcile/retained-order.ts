import { CoreValidationError } from '../../dense/errors';
import type { CanonicalEntity } from '../../dense/validation';
import { fieldEqual } from './result-values';

export function authoredOrderChanged(
  current: readonly CanonicalEntity[],
  candidate: readonly CanonicalEntity[],
  candidateById: ReadonlyMap<string, CanonicalEntity>,
  allowedRetainedOrderIds: ReadonlySet<string>,
): boolean {
  const retainedSameZ = new Set<string>();
  for (const entity of current) {
    const next = candidateById.get(entity.id);
    if (next?.kind === entity.kind && next.zIndex === entity.zIndex) retainedSameZ.add(entity.id);
  }
  if (retainedOrderUnchanged(current, candidate, retainedSameZ)) return false;
  const currentOrder = orderByZIndex(current, retainedSameZ);
  const candidateOrder = orderByZIndex(candidate, retainedSameZ);
  for (const [zIndex, currentIds] of currentOrder) {
    const candidateIds = candidateOrder.get(zIndex) ?? [];
    if (
      !fieldEqual(currentIds, candidateIds) &&
      !orderChangeIsScoped(currentIds, candidateIds, allowedRetainedOrderIds)
    ) {
      return true;
    }
  }
  return false;
}

function retainedOrderUnchanged(
  current: readonly CanonicalEntity[],
  candidate: readonly CanonicalEntity[],
  retainedIds: ReadonlySet<string>,
): boolean {
  let candidateIndex = 0;
  for (const entity of current) {
    if (!retainedIds.has(entity.id)) continue;
    let next: CanonicalEntity | undefined;
    while (candidateIndex < candidate.length) {
      const value = candidate[candidateIndex];
      candidateIndex += 1;
      if (value !== undefined && retainedIds.has(value.id)) {
        next = value;
        break;
      }
    }
    if (next?.id !== entity.id) return false;
  }
  while (candidateIndex < candidate.length) {
    const value = candidate[candidateIndex];
    candidateIndex += 1;
    if (value !== undefined && retainedIds.has(value.id)) return false;
  }
  return true;
}

function orderChangeIsScoped(
  currentIds: readonly string[],
  candidateIds: readonly string[],
  allowedRetainedOrderIds: ReadonlySet<string>,
): boolean {
  if (currentIds.length !== candidateIds.length) return false;
  const candidatePosition = new Map(candidateIds.map((id, index) => [id, index]));
  if (candidatePosition.size !== candidateIds.length) return false;
  if (currentIds.some((id) => !candidatePosition.has(id))) return false;

  const positions = currentIds.map((id) => candidatePosition.get(id));
  let prefixMaximum = -1;
  for (let index = 0; index < currentIds.length; index += 1) {
    const id = currentIds[index];
    const position = positions[index];
    if (id === undefined || position === undefined) return false;
    if (!allowedRetainedOrderIds.has(id) && prefixMaximum > position) return false;
    prefixMaximum = Math.max(prefixMaximum, position);
  }

  let suffixMinimum = Number.POSITIVE_INFINITY;
  for (let index = currentIds.length - 1; index >= 0; index -= 1) {
    const id = currentIds[index];
    const position = positions[index];
    if (id === undefined || position === undefined) return false;
    if (!allowedRetainedOrderIds.has(id) && suffixMinimum < position) return false;
    suffixMinimum = Math.min(suffixMinimum, position);
  }
  return true;
}

export function normalizedAllowedRetainedOrderIds(
  values: readonly string[] | undefined,
): ReadonlySet<string> {
  if (values === undefined) return new Set();
  const detached = [...values];
  detached.forEach((value, index) => {
    if (typeof value !== 'string' || value.length === 0) {
      throw new CoreValidationError(
        `$.options.allowedRetainedOrderIds[${index}]`,
        'expected a non-empty stable dense entity ID',
      );
    }
  });
  return new Set(detached);
}

function orderByZIndex(
  entities: readonly CanonicalEntity[],
  retainedIds: ReadonlySet<string>,
): ReadonlyMap<number, readonly string[]> {
  const result = new Map<number, string[]>();
  for (const entity of entities) {
    if (!retainedIds.has(entity.id)) continue;
    const ids = result.get(entity.zIndex) ?? [];
    ids.push(entity.id);
    result.set(entity.zIndex, ids);
  }
  return result;
}
