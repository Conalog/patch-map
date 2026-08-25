import type {
  MaterializedPatchMapDataset,
  NormalizedPatchMapElement,
  PatchMapElement,
  PatchMapGridElement,
  PatchMapRelationsElement,
  PatchMapTextElement,
} from '../semantic/dataset';
import {
  detachPatchMapMutationJsonValue,
  type PatchMapMutationJsonValue,
  type PatchMapMutationOperation,
} from '../semantic/transaction';
import { isPlainRecord } from '../shared/plain-record';

export function mergeElement(
  id: string,
  changes: readonly Readonly<{
    readonly path: readonly (string | number)[];
    readonly value: PatchMapMutationJsonValue;
  }>[],
): PatchMapMutationOperation {
  return Object.freeze({
    op: 'merge',
    target: Object.freeze({ kind: 'element', id }),
    changes: Object.freeze([...changes]),
  });
}

export function change(
  path: readonly (string | number)[],
  value: unknown,
): Readonly<{
  readonly path: readonly (string | number)[];
  readonly value: PatchMapMutationJsonValue;
}> {
  return Object.freeze({
    path: Object.freeze([...path]),
    value: detachPatchMapMutationJsonValue(value),
  });
}

export function removeElement(id: string): PatchMapMutationOperation {
  return Object.freeze({
    op: 'remove',
    target: Object.freeze({ kind: 'element', id }),
    cascade: 'subtree',
  });
}

export function addRoot(
  index: number,
  value: Readonly<Record<string, PatchMapMutationJsonValue>>,
): PatchMapMutationOperation {
  return Object.freeze({
    op: 'add',
    parent: null,
    collection: 'children',
    index,
    value,
  });
}

export function matrixGrid(): Readonly<Record<string, PatchMapMutationJsonValue>> {
  return Object.freeze({
    type: 'grid',
    id: 'matrix-grid',
    cells: Object.freeze([Object.freeze([1])]),
    item: Object.freeze({
      size: Object.freeze({ width: 10, height: 10 }),
      components: Object.freeze([]),
    }),
  });
}

export function resizeGridCells(
  source: PatchMapGridElement['cells'],
  rows: number,
  columns: number,
): readonly (readonly (0 | 1 | string)[])[] {
  return Object.freeze(Array.from({ length: rows }, (_unused, row) =>
    Object.freeze(Array.from({ length: columns }, (_column, column) =>
      source[row]?.[column] ?? 0)),
  ));
}

export function gridCoordinate(
  gridId: string,
  target: string,
): readonly [number, number] | null {
  const prefix = `${gridId}.`;
  if (!target.startsWith(prefix)) return null;
  const values = target.slice(prefix.length).split('.');
  if (values.length !== 2) return null;
  const row = Number(values[0]);
  const column = Number(values[1]);
  return Number.isSafeInteger(row) &&
    row >= 0 &&
    Number.isSafeInteger(column) &&
    column >= 0
    ? Object.freeze([row, column])
    : null;
}

export function gridElement(
  materialized: MaterializedPatchMapDataset,
  id: string,
): PatchMapGridElement | null {
  const element = findElement(materialized.dataset, id);
  return element?.type === 'grid' ? element : null;
}

export function relationsElement(
  materialized: MaterializedPatchMapDataset,
  id: string,
): PatchMapRelationsElement | null {
  const element = findElement(materialized.dataset, id);
  return element?.type === 'relations' ? element : null;
}

export function textElement(
  materialized: MaterializedPatchMapDataset,
  id: string,
): PatchMapTextElement | null {
  const element = findElement(materialized.dataset, id);
  return element?.type === 'text' ? element : null;
}

export function findElement(
  values: readonly NormalizedPatchMapElement[],
  id: string,
): NormalizedPatchMapElement | null {
  for (const element of values) {
    if (element.id === id) return element;
    if (element.type === 'group') {
      const nested = findElement(element.children, id);
      if (nested !== null) return nested;
    }
  }
  return null;
}

export function relationOwnersForTargets(
  values: readonly NormalizedPatchMapElement[],
  targetIds: readonly string[],
): readonly string[] {
  const targets = new Set(targetIds);
  const owners: string[] = [];
  const visit = (elements: readonly NormalizedPatchMapElement[]): void => {
    for (const element of elements) {
      if (
        element.type === 'relations' &&
        element.links.some((link) => targets.has(link.source) || targets.has(link.target))
      ) {
        owners.push(element.id);
      }
      if (element.type === 'group') visit(element.children);
    }
  };
  visit(values);
  return Object.freeze(uniqueStrings(owners));
}

export function requireElement(
  materialized: MaterializedPatchMapDataset,
  id: string,
  type: PatchMapElement['type'],
): NormalizedPatchMapElement {
  const element = findElement(materialized.dataset, id);
  if (element === null || element.type !== type) {
    throw new Error(`editor matrix requires ${type} ${id}`);
  }
  return element;
}

export function requireElementLocation(
  values: readonly NormalizedPatchMapElement[],
  id: string,
): Readonly<{
  readonly element: NormalizedPatchMapElement;
  readonly parentId: string | null;
  readonly siblingCount: number;
}> {
  const visit = (
    elements: readonly NormalizedPatchMapElement[],
    parentId: string | null,
  ): ReturnType<typeof requireElementLocation> | null => {
    for (const element of elements) {
      if (element.id === id) {
        return Object.freeze({
          element,
          parentId,
          siblingCount: elements.length,
        });
      }
      if (element.type === 'group') {
        const nested = visit(element.children, element.id);
        if (nested !== null) return nested;
      }
    }
    return null;
  };
  const location = visit(values, null);
  if (location === null) throw new Error(`editor matrix target ${id} is missing`);
  return location;
}

export function finiteAttribute(
  element: NormalizedPatchMapElement,
  key: string,
  fallback: number,
): number {
  return finiteJson(element.attrs?.[key], fallback);
}

export function finiteSize(
  element: NormalizedPatchMapElement,
  key: 'width' | 'height',
): number {
  const size = 'size' in element ? element.size : undefined;
  if (!isPlainRecord(size)) throw new Error(`editor matrix ${element.id} has no size`);
  return finiteJson(size[key], 0);
}

export function finiteJson(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}
