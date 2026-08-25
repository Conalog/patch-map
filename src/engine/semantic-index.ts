import {
  normalizePatchMapTextTarget,
  type PatchMapTextTarget,
} from '../core/contracts';
import type { PatchMapTextProjection } from '../parsing/contracts';
import type {
  NormalizedPatchMapElement,
  PatchMapBackgroundSource,
  PatchMapComponent,
  PatchMapComponentSize,
  PatchMapComponentType,
  PatchMapTextStyle,
} from '../semantic/dataset';
import type {
  PatchMapMutationOperation,
  PatchMapPlannedBarHeightUpdate,
} from '../semantic/transaction';

export interface PatchMapEngineComponentSemanticProbe {
  readonly target: Readonly<{
    readonly kind: 'component';
    readonly ownerId: string;
    readonly id: string;
  }>;
  readonly ownerId: string;
  readonly componentId: string;
  readonly componentType: PatchMapComponentType;
  readonly authoredSize: PatchMapComponentSize | null;
  readonly source: PatchMapBackgroundSource | null;
  readonly tint: unknown;
  readonly show: boolean;
}

export interface PatchMapEngineTextSemanticProbe {
  readonly target: PatchMapTextTarget;
  readonly semanticOwnerId: string;
  readonly source: string;
  readonly authoredStyle: PatchMapTextStyle;
  readonly placement: PatchMapTextProjection['placement'];
  readonly margin: PatchMapTextProjection['margin'];
  readonly tint: unknown;
  readonly split: number;
  readonly show: boolean;
  readonly locked: boolean;
  readonly contentOrientation: PatchMapTextProjection['contentOrientation'];
}

export interface IndexedEngineTextSemantic {
  readonly probe: PatchMapEngineTextSemanticProbe;
  readonly gridTemplate: boolean;
}

export interface PatchMapOwnedStructuralRootDelta {
  readonly removed: readonly NormalizedPatchMapElement[];
  readonly added: readonly NormalizedPatchMapElement[];
}

const EMPTY_TEXT_MARGIN = Object.freeze({
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
});

export function indexComponentSemantics(
  dataset: readonly NormalizedPatchMapElement[],
): Map<string, PatchMapEngineComponentSemanticProbe> {
  const index = new Map<string, PatchMapEngineComponentSemanticProbe>();
  const visit = (elements: readonly NormalizedPatchMapElement[]): void => {
    for (const element of elements) {
      if (element.type === 'item') {
        for (const component of element.components) {
          addComponentSemantic(index, element.id, component);
        }
      } else if (element.type === 'grid') {
        for (const component of element.item.components) {
          addComponentSemantic(index, element.id, component);
        }
      } else if (element.type === 'group') {
        visit(element.children);
      }
    }
  };
  visit(dataset);
  return index;
}

export function ownedStructuralRootDelta(
  before: readonly NormalizedPatchMapElement[],
  after: readonly NormalizedPatchMapElement[],
): PatchMapOwnedStructuralRootDelta | null {
  if (before.length === 0) return null;
  const previous = new Map<string, NormalizedPatchMapElement>();
  for (const root of before) {
    if (previous.has(root.id)) return null;
    previous.set(root.id, root);
  }
  const added: NormalizedPatchMapElement[] = [];
  const seen = new Set<string>();
  const removed: NormalizedPatchMapElement[] = [];
  for (const root of after) {
    if (seen.has(root.id)) return null;
    seen.add(root.id);
    const prior = previous.get(root.id);
    if (prior === root) {
      previous.delete(root.id);
      continue;
    }
    if (prior !== undefined) {
      removed.push(prior);
      previous.delete(root.id);
    }
    added.push(root);
  }
  removed.push(...previous.values());
  return Object.freeze({
    removed: Object.freeze(removed),
    added: Object.freeze(added),
  });
}

export function reconcileStructuralComponentSemantics(
  current: ReadonlyMap<string, PatchMapEngineComponentSemanticProbe>,
  delta: PatchMapOwnedStructuralRootDelta,
): Map<string, PatchMapEngineComponentSemanticProbe> {
  const next = new Map(current);
  visitStructuralComponents(delta.removed, (ownerId, component) => {
    next.delete(componentSemanticKey(ownerId, component.id));
  });
  visitStructuralComponents(delta.added, (ownerId, component) => {
    addComponentSemantic(next, ownerId, component);
  });
  return next;
}

function visitStructuralComponents(
  elements: readonly NormalizedPatchMapElement[],
  visit: (ownerId: string, component: PatchMapComponent) => void,
): void {
  for (const element of elements) {
    if (element.type === 'item') {
      for (const component of element.components) visit(element.id, component);
    } else if (element.type === 'grid') {
      for (const component of element.item.components) visit(element.id, component);
    } else if (element.type === 'group') {
      visitStructuralComponents(element.children, visit);
    }
  }
}

export function reconcileFlatComponentSemantics(
  current: ReadonlyMap<string, PatchMapEngineComponentSemanticProbe>,
  beforeDataset: readonly NormalizedPatchMapElement[],
  afterDataset: readonly NormalizedPatchMapElement[],
  dirtyRootIds: readonly string[],
): Map<string, PatchMapEngineComponentSemanticProbe> {
  const next = new Map(current);
  const dirty = new Set(dirtyRootIds);
  for (const element of beforeDataset) {
    if (!dirty.has(element.id) || element.type !== 'item') continue;
    for (const component of element.components) {
      next.delete(componentSemanticKey(element.id, component.id));
    }
  }
  for (const element of afterDataset) {
    if (!dirty.has(element.id) || element.type !== 'item') continue;
    for (const component of element.components) {
      addComponentSemantic(next, element.id, component);
    }
  }
  return next;
}

function addComponentSemantic(
  index: Map<string, PatchMapEngineComponentSemanticProbe>,
  ownerId: string,
  component: PatchMapComponent,
): void {
  const target = Object.freeze({ kind: 'component' as const, ownerId, id: component.id });
  index.set(componentSemanticKey(ownerId, component.id), Object.freeze({
    target,
    ownerId,
    componentId: component.id,
    componentType: component.type,
    authoredSize: 'size' in component
      ? cloneDetachedComponentValue(component.size) as PatchMapComponentSize
      : null,
    source: component.type === 'text'
      ? null
      : cloneDetachedComponentValue(component.source) as PatchMapBackgroundSource,
    tint: cloneDetachedComponentValue(component.tint),
    show: component.show,
  }));
}

function cloneDetachedComponentValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return Object.freeze(value.map((entry) => cloneDetachedComponentValue(entry)));
  }
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    Object.defineProperty(result, key, {
      value: cloneDetachedComponentValue(Reflect.get(value, key)),
      enumerable: true,
      configurable: false,
      writable: false,
    });
  }
  return Object.freeze(result);
}

export function cloneDetachedEngineRecord(
  value: NormalizedPatchMapElement | PatchMapComponent,
): Readonly<Record<string, unknown>> {
  const clone = cloneDetachedComponentValue(value);
  if (clone === null || typeof clone !== 'object' || Array.isArray(clone)) {
    throw new Error('target snapshot clone lost record shape');
  }
  return clone as Readonly<Record<string, unknown>>;
}

export function componentSemanticKey(ownerId: string, componentId: string): string {
  return `${ownerId.length}:${ownerId}:${componentId}`;
}

export function indexTextSemantics(
  dataset: readonly NormalizedPatchMapElement[],
): Map<string, IndexedEngineTextSemantic> {
  const index = new Map<string, IndexedEngineTextSemantic>();
  const visit = (
    elements: readonly NormalizedPatchMapElement[],
    ancestorVisible: boolean,
    ancestorLocked: boolean,
  ): void => {
    for (const element of elements) {
      const visible = ancestorVisible && element.show;
      const locked = ancestorLocked || element.locked;
      if (element.type === 'text') {
        addEngineTextElementSemantic(index, element, visible, locked);
        continue;
      }
      if (element.type === 'item') {
        for (const component of element.components) {
          if (component.type !== 'text') continue;
          addEngineTextComponentSemantic(index, {
            ownerId: element.id,
            component,
            show: visible && component.show,
            locked,
            contentOrientation: element.contentOrientation,
            gridTemplate: false,
          });
        }
        continue;
      }
      if (element.type === 'grid') {
        for (const component of element.item.components) {
          if (component.type !== 'text') continue;
          addEngineTextComponentSemantic(index, {
            ownerId: element.id,
            component,
            show: visible && component.show,
            locked,
            contentOrientation: element.item.contentOrientation,
            gridTemplate: true,
          });
        }
        continue;
      }
      if (element.type === 'group') visit(element.children, visible, locked);
    }
  };
  visit(dataset, true, false);
  return index;
}

export function reconcileStructuralTextSemantics(
  current: ReadonlyMap<string, IndexedEngineTextSemantic>,
  delta: PatchMapOwnedStructuralRootDelta,
): Map<string, IndexedEngineTextSemantic> {
  const next = new Map(current);
  visitStructuralTextTargets(
    delta.removed,
    true,
    false,
    (target) => next.delete(engineTextTargetKey(target)),
  );
  addStructuralTextSemantics(next, delta.added, true, false);
  return next;
}

function visitStructuralTextTargets(
  elements: readonly NormalizedPatchMapElement[],
  ancestorVisible: boolean,
  ancestorLocked: boolean,
  visit: (target: PatchMapTextTarget) => void,
): void {
  for (const element of elements) {
    const visible = ancestorVisible && element.show;
    const locked = ancestorLocked || element.locked;
    if (element.type === 'text') {
      visit(Object.freeze({ kind: 'element', id: element.id }));
    } else if (element.type === 'item') {
      for (const component of element.components) {
        if (component.type === 'text') {
          visit(Object.freeze({
            kind: 'component',
            ownerId: element.id,
            id: component.id,
          }));
        }
      }
    } else if (element.type === 'grid') {
      for (const component of element.item.components) {
        if (component.type === 'text') {
          visit(Object.freeze({
            kind: 'component',
            ownerId: element.id,
            id: component.id,
          }));
        }
      }
    } else if (element.type === 'group') {
      visitStructuralTextTargets(element.children, visible, locked, visit);
    }
  }
}

function addStructuralTextSemantics(
  index: Map<string, IndexedEngineTextSemantic>,
  elements: readonly NormalizedPatchMapElement[],
  ancestorVisible: boolean,
  ancestorLocked: boolean,
): void {
  for (const element of elements) {
    const visible = ancestorVisible && element.show;
    const locked = ancestorLocked || element.locked;
    if (element.type === 'text') {
      addEngineTextElementSemantic(index, element, visible, locked);
    } else if (element.type === 'item') {
      for (const component of element.components) {
        if (component.type !== 'text') continue;
        addEngineTextComponentSemantic(index, {
          ownerId: element.id,
          component,
          show: visible && component.show,
          locked,
          contentOrientation: element.contentOrientation,
          gridTemplate: false,
        });
      }
    } else if (element.type === 'grid') {
      for (const component of element.item.components) {
        if (component.type !== 'text') continue;
        addEngineTextComponentSemantic(index, {
          ownerId: element.id,
          component,
          show: visible && component.show,
          locked,
          contentOrientation: element.item.contentOrientation,
          gridTemplate: true,
        });
      }
    } else if (element.type === 'group') {
      addStructuralTextSemantics(index, element.children, visible, locked);
    }
  }
}

export function reconcileFlatTextSemantics(
  current: ReadonlyMap<string, IndexedEngineTextSemantic>,
  beforeDataset: readonly NormalizedPatchMapElement[],
  afterDataset: readonly NormalizedPatchMapElement[],
  dirtyRootIds: readonly string[],
): Map<string, IndexedEngineTextSemantic> {
  const next = new Map(current);
  const dirty = new Set(dirtyRootIds);
  for (const element of beforeDataset) {
    if (!dirty.has(element.id)) continue;
    if (element.type === 'text') {
      next.delete(engineTextTargetKey({ kind: 'element', id: element.id }));
    } else if (element.type === 'item') {
      for (const component of element.components) {
        if (component.type !== 'text') continue;
        next.delete(engineTextTargetKey({
          kind: 'component',
          ownerId: element.id,
          id: component.id,
        }));
      }
    }
  }
  for (const element of afterDataset) {
    if (!dirty.has(element.id)) continue;
    if (element.type === 'text') {
      addEngineTextElementSemantic(next, element, element.show, element.locked);
    } else if (element.type === 'item') {
      for (const component of element.components) {
        if (component.type !== 'text') continue;
        addEngineTextComponentSemantic(next, {
          ownerId: element.id,
          component,
          show: element.show && component.show,
          locked: element.locked,
          contentOrientation: element.contentOrientation,
          gridTemplate: false,
        });
      }
    }
  }
  return next;
}

function addEngineTextElementSemantic(
  index: Map<string, IndexedEngineTextSemantic>,
  element: Extract<NormalizedPatchMapElement, { readonly type: 'text' }>,
  show: boolean,
  locked: boolean,
): void {
  const target = Object.freeze({ kind: 'element' as const, id: element.id });
  index.set(engineTextTargetKey(target), Object.freeze({
    gridTemplate: false,
    probe: freezeEngineTextSemantic({
      target,
      semanticOwnerId: element.id,
      source: element.text,
      authoredStyle: element.style,
      placement: null,
      margin: EMPTY_TEXT_MARGIN,
      tint: null,
      split: 0,
      show,
      locked,
      contentOrientation: 'follow-item',
    }),
  }));
}

function addEngineTextComponentSemantic(
  index: Map<string, IndexedEngineTextSemantic>,
  input: Readonly<{
    ownerId: string;
    component: Extract<PatchMapComponent, { readonly type: 'text' }>;
    show: boolean;
    locked: boolean;
    contentOrientation: PatchMapTextProjection['contentOrientation'];
    gridTemplate: boolean;
  }>,
): void {
  const target = Object.freeze({
    kind: 'component' as const,
    ownerId: input.ownerId,
    id: input.component.id,
  });
  index.set(engineTextTargetKey(target), Object.freeze({
    gridTemplate: input.gridTemplate,
    probe: freezeEngineTextSemantic({
      target,
      semanticOwnerId: input.ownerId,
      source: input.component.text,
      authoredStyle: input.component.style,
      placement: input.component.placement,
      margin: input.component.margin,
      tint: input.component.tint,
      split: input.component.split,
      show: input.show,
      locked: input.locked,
      contentOrientation: input.contentOrientation,
    }),
  }));
}

function freezeEngineTextSemantic(
  probe: PatchMapEngineTextSemanticProbe,
): PatchMapEngineTextSemanticProbe {
  return Object.freeze({
    ...probe,
    target: normalizePatchMapTextTarget(probe.target),
    authoredStyle: cloneDetachedComponentValue(probe.authoredStyle) as PatchMapTextStyle,
    margin: cloneDetachedComponentValue(probe.margin) as PatchMapTextProjection['margin'],
    tint: cloneDetachedComponentValue(probe.tint),
  });
}

export function engineTextTargetKey(target: PatchMapTextTarget): string {
  return target.kind === 'element'
    ? `element:${target.id.length}:${target.id}`
    : `component:${target.ownerId.length}:${target.ownerId}:${target.id.length}:${target.id}`;
}

export function reconcileDirectBarHeightComponentSemantics(
  current: ReadonlyMap<string, PatchMapEngineComponentSemanticProbe>,
  candidate: readonly NormalizedPatchMapElement[],
  operations: readonly PatchMapMutationOperation[],
): Map<string, PatchMapEngineComponentSemanticProbe> | null {
  if (operations.length === 0) return null;
  if (operations.some((operation) => (
    operation.op !== 'merge' ||
    operation.target.kind !== 'component' ||
    operation.changes.length !== 1
  ))) {
    return null;
  }
  const roots = new Map(candidate.map((root) => [root.id, root] as const));
  if (roots.size !== candidate.length) return null;
  const next = new Map(current);
  for (const operation of operations) {
    if (operation.op !== 'merge' || operation.target.kind !== 'component') return null;
    const [change] = operation.changes;
    if (
      change === undefined ||
      change.path.length !== 2 ||
      change.path[0] !== 'size' ||
      change.path[1] !== 'height'
    ) {
      return null;
    }
    const root = roots.get(operation.target.ownerId);
    if (root?.type !== 'item' && root?.type !== 'grid') return null;
    const rootComponents = root.type === 'item'
      ? root.components
      : root.item.components;
    const matches = rootComponents.filter(({ id }) => id === operation.target.id);
    const component = matches.length === 1 ? matches[0] : undefined;
    const key = componentSemanticKey(operation.target.ownerId, operation.target.id);
    const before = current.get(key);
    if (component?.type !== 'bar' || before?.componentType !== 'bar') return null;
    next.set(key, Object.freeze({
      ...before,
      authoredSize: component.size,
    }));
  }
  return next;
}

export function reconcilePlannedBarHeightComponentSemantics(
  current: ReadonlyMap<string, PatchMapEngineComponentSemanticProbe>,
  candidate: readonly NormalizedPatchMapElement[],
  updates: readonly PatchMapPlannedBarHeightUpdate[],
): Map<string, PatchMapEngineComponentSemanticProbe> | null {
  if (updates.length === 0) return null;
  const roots = new Map(candidate.map((root) => [root.id, root] as const));
  if (roots.size !== candidate.length) return null;
  const next = new Map(current);
  for (const update of updates) {
    const root = roots.get(update.ownerId);
    if (root?.type !== 'item' && root?.type !== 'grid') return null;
    const rootComponents = root.type === 'item'
      ? root.components
      : root.item.components;
    const component = rootComponents.find(({ id }) => id === update.componentId);
    const key = componentSemanticKey(update.ownerId, update.componentId);
    const before = current.get(key);
    if (component?.type !== 'bar' || before?.componentType !== 'bar') return null;
    next.set(key, Object.freeze({
      ...before,
      authoredSize: component.size,
    }));
  }
  return next;
}
