import type {
  PatchMapComponent,
  NormalizedPatchMapElement,
} from '../semantic/dataset';
import type { PatchMapMutationTarget } from '../semantic/transaction';
import type {
  PatchMapLogicalTargetKey,
  PatchMapLogicalTargetSnapshot,
} from './contracts';

export function patchMapLogicalTargetKey(
  target: PatchMapMutationTarget,
): PatchMapLogicalTargetKey {
  return target.kind === 'element'
    ? `element:${target.id}`
    : `component:${target.ownerId}/${target.id}`;
}

export function buildLogicalTargets(
  dataset: readonly NormalizedPatchMapElement[],
): readonly PatchMapLogicalTargetSnapshot[] {
  const elements: PatchMapLogicalTargetSnapshot[] = [];
  const components: PatchMapLogicalTargetSnapshot[] = [];
  let sceneOrder = 0;

  const appendElement = (
    element: NormalizedPatchMapElement,
    parentKey: PatchMapLogicalTargetKey | null,
    ancestors: readonly PatchMapLogicalTargetKey[],
    ancestorLocked: boolean,
    topLevel: boolean,
  ): void => {
    const target = Object.freeze({ kind: 'element', id: element.id } as const);
    const key = patchMapLogicalTargetKey(target);
    const locked = element.locked === true;
    const entry = logicalSnapshot({
      key,
      target,
      selectionId: element.id,
      kind: 'element',
      id: element.id,
      ownerId: null,
      type: element.type,
      label: element.label ?? null,
      parentKey,
      ancestors,
      depth: ancestors.length,
      sceneOrder: sceneOrder++,
      zIndex: recordZIndex(element),
      topLevel,
      locked,
      ancestorLocked,
      value: element as unknown as Readonly<Record<string, unknown>>,
    });
    elements.push(entry);
    const childAncestors = Object.freeze([...ancestors, key]);
    const childAncestorLocked = ancestorLocked || locked;

    if (element.type === 'group') {
      for (const child of element.children) {
        appendElement(child, key, childAncestors, childAncestorLocked, false);
      }
      return;
    }
    if (element.type === 'item') {
      appendComponents(
        element.components,
        element.id,
        key,
        childAncestors,
        childAncestorLocked,
        entry.zIndex,
      );
      return;
    }
    if (element.type !== 'grid') return;
    for (let row = 0; row < element.cells.length; row += 1) {
      const cells = element.cells[row] ?? [];
      for (let column = 0; column < cells.length; column += 1) {
        const cell = cells[column];
        if (cell === 0 && element.inactiveCellStrategy !== 'hide') continue;
        const instanceId = `${element.id}.${row}.${column}`;
        const cellTarget = Object.freeze({ kind: 'element', id: instanceId } as const);
        const cellKey = patchMapLogicalTargetKey(cellTarget);
        const cellAncestors = childAncestors;
        const cellValue = Object.freeze({
          type: 'grid-cell',
          id: instanceId,
          gridId: element.id,
          row,
          column,
          value: cell,
          show: cell !== 0,
          locked,
        });
        const cellEntry = logicalSnapshot({
          key: cellKey,
          target: cellTarget,
          selectionId: instanceId,
          kind: 'element',
          id: instanceId,
          ownerId: null,
          type: 'grid-cell',
          label: typeof cell === 'string' ? cell : null,
          parentKey: key,
          ancestors: cellAncestors,
          depth: cellAncestors.length,
          sceneOrder: sceneOrder++,
          zIndex: entry.zIndex,
          topLevel: false,
          locked,
          ancestorLocked,
          value: cellValue,
        });
        elements.push(cellEntry);
        appendComponents(
          element.item.components,
          instanceId,
          cellKey,
          Object.freeze([...cellAncestors, cellKey]),
          childAncestorLocked,
          cellEntry.zIndex,
        );
      }
    }
  };

  const appendComponents = (
    values: readonly PatchMapComponent[],
    ownerId: string,
    parentKey: PatchMapLogicalTargetKey,
    ancestors: readonly PatchMapLogicalTargetKey[],
    ancestorLocked: boolean,
    zIndex: number,
  ): void => {
    for (const component of values) {
      const target = Object.freeze({ kind: 'component', ownerId, id: component.id } as const);
      const key = patchMapLogicalTargetKey(target);
      components.push(logicalSnapshot({
        key,
        target,
        selectionId: `${ownerId}::${component.type}:${component.id}`,
        kind: 'component',
        id: component.id,
        ownerId,
        type: component.type,
        label: component.label ?? null,
        parentKey,
        ancestors,
        depth: ancestors.length,
        sceneOrder: sceneOrder++,
        zIndex,
        topLevel: false,
        locked: false,
        ancestorLocked,
        value: component as unknown as Readonly<Record<string, unknown>>,
      }));
    }
  };

  for (const element of dataset) appendElement(element, null, Object.freeze([]), false, true);
  return Object.freeze([...elements, ...components]);
}

export function logicalTargetCount(element: NormalizedPatchMapElement): number {
  if (element.type === 'group') {
    return 1 + element.children.reduce(
      (count, child) => count + logicalTargetCount(child),
      0,
    );
  }
  if (element.type === 'item') return 1 + element.components.length;
  if (element.type !== 'grid') return 1;
  let count = 1;
  for (const row of element.cells) {
    for (const cell of row) {
      if (cell === 0 && element.inactiveCellStrategy !== 'hide') continue;
      count += 1 + element.item.components.length;
    }
  }
  return count;
}

export function logicalSnapshot(
  input: Readonly<{
    key: PatchMapLogicalTargetKey;
    target: PatchMapMutationTarget;
    selectionId: string;
    kind: 'element' | 'component';
    id: string;
    ownerId: string | null;
    type: string;
    label: string | null;
    parentKey: PatchMapLogicalTargetKey | null;
    ancestors: readonly PatchMapLogicalTargetKey[];
    depth: number;
    sceneOrder: number;
    zIndex: number;
    topLevel: boolean;
    locked: boolean;
    ancestorLocked: boolean;
    value: Readonly<Record<string, unknown>>;
  }>,
): PatchMapLogicalTargetSnapshot {
  return Object.freeze({
    key: input.key,
    target: input.target,
    selectionId: input.selectionId,
    kind: input.kind,
    id: input.id,
    ownerId: input.ownerId,
    type: input.type,
    label: input.label,
    parentKey: input.parentKey,
    ancestorKeys: Object.freeze([...input.ancestors]),
    depth: input.depth,
    sceneOrder: input.sceneOrder,
    zIndex: input.zIndex,
    topLevel: input.topLevel,
    locked: input.locked,
    ancestorLocked: input.ancestorLocked,
    rendererObjectCount: 0,
    value: cloneFrozenRecord(input.value),
    identity: Object.freeze({ key: input.key, sceneOrder: input.sceneOrder }),
  });
}

export function recordZIndex(value: Readonly<Record<string, unknown>>): number {
  const attrs = isRecord(value.attrs) ? value.attrs : {};
  return typeof attrs.zIndex === 'number' && Number.isFinite(attrs.zIndex) ? attrs.zIndex : 0;
}

function cloneFrozenRecord(
  value: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const cloned = cloneFrozenValue(value);
  if (!isRecord(cloned)) throw new TypeError('logical target value must remain a record');
  return cloned;
}

function cloneFrozenValue(value: unknown): unknown {
  if (Array.isArray(value)) return Object.freeze(value.map(cloneFrozenValue));
  if (!isRecord(value)) return value;
  return Object.freeze(Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, cloneFrozenValue(entry)]),
  ));
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
