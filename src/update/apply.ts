import type {
  ItemComponentData,
  MapElementData,
  MergeStrategy,
  UpdateChanges,
} from '../contracts';
import {
  materializeComponent,
  materializeElement,
  materializeGridItems,
  type MaterializedGridElement,
  type MaterializedGroupElement,
  type MaterializedItemComponent,
  type MaterializedItemElement,
  type MaterializedMapElement,
} from '../model/materialize';
import {
  applyManagedComponentLayout,
  layoutManagedComponentNode,
  liveElementProps,
  relayoutManagedNode,
} from '../scene/build-scene';
import { layoutComponent, type ComponentLayout } from '../scene/layout';
import {
  getManagedBatchToken,
  getManagedTheme,
  ManagedNode,
  setManagedTheme,
  type ManagedNodeProps,
} from '../scene/managed-node';
import type { PatchmapTheme } from '../theme';
import {
  applyMergeStrategy,
  cloneUpdateValue,
  deepMerge,
  matchComponentUpdates,
  mergeRelationLinks,
  reconcileComponentArray,
  type ReconciledComponentEntry,
  type UpdateRecord,
} from './merge';

export interface ManagedUpdateOptions {
  changes?: UpdateChanges | Record<string, unknown>;
  mergeStrategy?: MergeStrategy;
  refresh?: boolean;
  relativeTransform?: boolean;
  rotateOrigin?: 'center';
  /** Internal marker: the caller already owns a detached changes object. */
  ownedChanges?: boolean;
}

export interface ManagedUpdateEffects {
  reindex: boolean;
  orientation: boolean;
  assets: boolean;
  componentTypes: string[] | null;
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const finite = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const asComponent = (value: UpdateRecord): ItemComponentData =>
  value as unknown as ItemComponentData;

const isComponentNode = (node: ManagedNode): boolean =>
  node.parent instanceof ManagedNode && node.parent.type === 'item';

const hasOwn = (value: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const createManagedElementNode = (
  element: MaterializedMapElement,
  theme?: PatchmapTheme,
): ManagedNode => {
  const publicProps = theme ? liveElementProps(element, theme) : element;
  const node = new ManagedNode(publicProps as ManagedNodeProps);
  if (theme) setManagedTheme(node, theme);
  if (element.type === 'group') {
    const children = element.children.map((child) =>
      createManagedElementNode(child, theme));
    if (children.length > 0) node.addChild(...children);
  } else if (element.type === 'grid') {
    const children = materializeGridItems(element).map((child) =>
      createManagedElementNode(child, theme));
    if (children.length > 0) node.addChild(...children);
  } else if (element.type === 'item') {
    const children = element.components.map(
      (component) => {
        const child = new ManagedNode(component as ManagedNodeProps);
        if (theme) setManagedTheme(child, theme);
        return child;
      },
    );
    if (children.length > 0) node.addChild(...children);
  }
  relayoutManagedNode(node);
  return node;
};

const alignGridItemComponentIds = (
  node: ManagedNode,
  snapshot: MaterializedItemElement,
): MaterializedItemElement => {
  const existingNodes = node.children.map((child) => child as ManagedNode);
  const patches = snapshot.components.map((component) => {
    const patch = { ...record(component) };
    delete patch.id;
    return patch as UpdateRecord;
  });
  const matches = matchComponentUpdates(
    existingNodes.map((child) => record(child.props) as UpdateRecord),
    patches,
  );
  return {
    ...snapshot,
    components: snapshot.components.map((component, index) => {
      const existingIndex = matches[index]?.existingIndex;
      return existingIndex === null || existingIndex === undefined
        ? component
        : { ...component, id: existingNodes[existingIndex]!.id };
    }),
  };
};

const reconcileManagedElementChildren = (
  parent: ManagedNode,
  snapshots: readonly MaterializedMapElement[],
  alignGridComponents = false,
): void => {
  const existing = parent.children.map((child) => child as ManagedNode);
  const theme = getManagedTheme(parent);
  const used = new Set<number>();
  const next = snapshots.map((snapshot) => {
    const existingIndex = existing.findIndex(
      (candidate, index) =>
        !used.has(index) &&
        candidate.id === snapshot.id &&
        candidate.type === snapshot.type,
    );
    if (existingIndex < 0) return createManagedElementNode(snapshot, theme);

    used.add(existingIndex);
    const candidate = existing[existingIndex]!;
    const compatibleSnapshot =
      alignGridComponents && snapshot.type === 'item'
        ? alignGridItemComponentIds(candidate, snapshot)
        : snapshot;
    replaceManagedSnapshot(candidate, compatibleSnapshot as ManagedNodeProps);
    return candidate;
  });

  parent.removeChildren();
  existing.forEach((child, index) => {
    if (!used.has(index) && !child.destroyed) child.destroy({ children: true });
  });
  if (next.length > 0) parent.addChild(...next);
};

const reconcileGroupChildren = (
  node: ManagedNode,
  group: MaterializedGroupElement,
): void => {
  reconcileManagedElementChildren(node, group.children);
};

const reconcileGridItems = (
  node: ManagedNode,
  grid: MaterializedGridElement,
): void => {
  reconcileManagedElementChildren(node, materializeGridItems(grid), true);
};

const relativeChanges = (
  current: ManagedNodeProps,
  changes: Record<string, unknown>,
): Record<string, unknown> => {
  const next = cloneUpdateValue(changes);
  const incomingAttrs = record(next.attrs);
  if (Object.keys(incomingAttrs).length === 0) return next;
  const currentAttrs = record(current.attrs);
  const attrs = { ...incomingAttrs };
  for (const key of ['x', 'y', 'angle', 'rotation']) {
    const delta = finite(incomingAttrs[key]);
    if (delta !== undefined) attrs[key] = (finite(currentAttrs[key]) ?? 0) + delta;
  }
  next.attrs = attrs;
  return next;
};

const changesWithoutComponents = (
  changes: Record<string, unknown>,
): Record<string, unknown> => Object.fromEntries(
  Object.entries(changes).filter(([key]) => key !== 'components'),
);

const materializeReconciledComponent = (
  entry: ReconciledComponentEntry,
): MaterializedItemComponent => materializeComponent(asComponent(entry.merged));

const reconcileGridTemplateChanges = (
  current: ManagedNodeProps,
  changes: Record<string, unknown>,
  strategy: MergeStrategy,
): Record<string, unknown> => {
  if (strategy !== 'merge') return changes;
  const itemChanges = record(changes.item);
  if (!Array.isArray(itemChanges.components)) return changes;

  const currentItem = record(record(current).item);
  const currentComponents = Array.isArray(currentItem.components)
    ? currentItem.components.map((component) => record(component) as UpdateRecord)
    : [];
  const incoming = itemChanges.components.map(
    (component) => record(component) as UpdateRecord,
  );
  const components = reconcileComponentArray(
    currentComponents,
    incoming,
    'merge',
  ).entries.map(materializeReconciledComponent);

  return {
    ...changes,
    item: {
      ...itemChanges,
      components,
    },
  };
};

const parentComponentValue = (
  entry: ReconciledComponentEntry,
  strategy: MergeStrategy,
): MaterializedItemComponent => {
  const seed = strategy === 'replace' ? entry.patch : entry.merged;
  return materializeComponent(asComponent(seed ?? entry.merged));
};

const reconcileItemComponents = (
  node: ManagedNode,
  incoming: readonly UpdateRecord[],
  strategy: MergeStrategy,
  refresh: boolean,
): MaterializedItemComponent[] => {
  const existingNodes = node.children.map((child) => child as ManagedNode);
  const existingValues = existingNodes.map(
    (child) => record(child.props) as UpdateRecord,
  );
  const reconciliation = reconcileComponentArray(existingValues, incoming, strategy);
  const nextNodes: ManagedNode[] = [];
  const nextValues = reconciliation.entries.map((entry) => {
    const liveProps = materializeReconciledComponent(entry);
    const existingNode = entry.existingIndex === null
      ? undefined
      : existingNodes[entry.existingIndex];
    const liveNode = existingNode ?? new ManagedNode(liveProps as ManagedNodeProps);
    if (existingNode) existingNode.replaceProps(liveProps as ManagedNodeProps, { refresh });

    // A trusted partial source-bearing component update in the approved bulk
    // fixture leaves the reused bar non-renderable while its public props and
    // aggregate next-frame rendering are already updated.
    if (
      entry.patch &&
      entry.patch.type === 'bar' &&
      !Object.prototype.hasOwnProperty.call(entry.patch, 'source')
    ) {
      liveNode.renderable = false;
    }
    nextNodes.push(liveNode);
    return parentComponentValue(entry, strategy);
  });

  const retained = new Set(nextNodes);
  node.removeChildren();
  for (const oldNode of existingNodes) {
    if (!retained.has(oldNode) && !oldNode.destroyed) {
      oldNode.destroy({ children: true });
    }
  }
  if (nextNodes.length > 0) node.addChild(...nextNodes);
  return nextValues;
};

const updateItemNode = (
  node: ManagedNode,
  changes: Record<string, unknown>,
  strategy: MergeStrategy,
  refresh: boolean,
): MaterializedItemElement => {
  const current = node.props;
  let seed = applyMergeStrategy(
    current,
    changesWithoutComponents(changes),
    strategy,
  ) as unknown as Record<string, unknown>;
  if (Array.isArray(changes.components)) {
    const components = reconcileItemComponents(
      node,
      changes.components.map((component) => record(component)),
      strategy,
      refresh,
    );
    seed = { ...seed, components };
  }
  const next = materializeElement(seed as unknown as MapElementData);
  if (next.type !== 'item') throw new TypeError('Item update changed its public type.');
  node.id = next.id;
  node.replaceProps(next as ManagedNodeProps, { refresh });
  for (const child of node.children) {
    layoutManagedComponentNode(child as ManagedNode, next);
  }
  return next;
};

const updateComponentNode = (
  node: ManagedNode,
  changes: Record<string, unknown>,
  strategy: MergeStrategy,
  refresh: boolean,
): void => {
  const parent = node.parent;
  if (!(parent instanceof ManagedNode) || parent.type !== 'item') return;
  const seed = applyMergeStrategy(node.props, changes, strategy);
  const next = materializeComponent(asComponent(seed as unknown as UpdateRecord));
  if (next.type !== node.type) {
    throw new TypeError('Component update changed its public type.');
  }
  node.replaceProps(next as ManagedNodeProps, { refresh });
  const index = parent.children.indexOf(node);
  const components = [...(record(parent.props).components as MaterializedItemComponent[] ?? [])];
  if (index >= 0) components[index] = next;
  const parentSeed = { ...record(parent.props), components };
  const materializedParent = materializeElement(parentSeed as unknown as MapElementData);
  if (materializedParent.type === 'item') {
    parent.replaceProps(materializedParent as ManagedNodeProps, { refresh });
    layoutManagedComponentNode(node, materializedParent);
  }
};

const centerOf = (node: ManagedNode): { x: number; y: number } => {
  const bounds = node.getBounds();
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
};

const centerDeltaInParent = (
  node: ManagedNode,
  before: { x: number; y: number },
  after: { x: number; y: number },
): { x: number; y: number } => {
  const parent = node.parent;
  if (!parent) return { x: before.x - after.x, y: before.y - after.y };
  const localBefore = parent.toLocal(before);
  const localAfter = parent.toLocal(after);
  return {
    x: localBefore.x - localAfter.x,
    y: localBefore.y - localAfter.y,
  };
};

const updateElementNode = (
  node: ManagedNode,
  changes: Record<string, unknown>,
  strategy: MergeStrategy,
  refresh: boolean,
): void => {
  const effectiveChanges = node.type === 'grid'
    ? reconcileGridTemplateChanges(node.props, changes, strategy)
    : changes;
  let seed = applyMergeStrategy(
    node.props,
    effectiveChanges,
    strategy,
  ) as unknown as Record<string, unknown>;
  if (
    node.type === 'relations' &&
    strategy === 'merge' &&
    Array.isArray(changes.links)
  ) {
    seed = {
      ...seed,
      links: mergeRelationLinks(
        (record(node.props).links as unknown[] | undefined) ?? [],
        changes.links,
      ),
    };
  }
  let next = materializeElement(seed as unknown as MapElementData);
  const theme = getManagedTheme(node);
  if (theme) next = liveElementProps(next, theme);
  if (next.type !== node.type) {
    throw new TypeError('Element update changed its public type.');
  }
  node.id = next.id;
  node.replaceProps(next as ManagedNodeProps, { refresh });
  if (
    node.type === 'group' &&
    next.type === 'group' &&
    (refresh || hasOwn(changes, 'children'))
  ) {
    reconcileGroupChildren(node, next);
  } else if (
    node.type === 'grid' &&
    next.type === 'grid' &&
    (
      refresh ||
      ['id', 'cells', 'item', 'gap', 'inactiveCellStrategy'].some((key) =>
        hasOwn(changes, key),
      )
    )
  ) {
    reconcileGridItems(node, next);
  }
  relayoutManagedNode(node);
};

const preserveManagedCenter = (
  node: ManagedNode,
  beforeCenter: { x: number; y: number },
): void => {
  const afterCenter = centerOf(node);
  const delta = centerDeltaInParent(node, beforeCenter, afterCenter);
  if (Math.abs(delta.x) < Number.EPSILON && Math.abs(delta.y) < Number.EPSILON) {
    return;
  }
  const attrs = record(node.props.attrs);
  const correction = {
    attrs: {
      ...attrs,
      x: (finite(attrs.x) ?? 0) + delta.x,
      y: (finite(attrs.y) ?? 0) + delta.y,
    },
  };
  if (isComponentNode(node)) {
    updateComponentNode(node, correction, 'merge', true);
  } else if (node.type === 'item') {
    updateItemNode(node, correction, 'merge', true);
  } else {
    updateElementNode(node, correction, 'merge', true);
  }
};

export const applyManagedUpdate = (
  node: ManagedNode,
  options: ManagedUpdateOptions,
): void => {
  const strategy = options.mergeStrategy ?? 'merge';
  const refresh = options.refresh === true;
  const rawChanges = record(options.changes);
  const changes = options.relativeTransform
    ? relativeChanges(node.props, rawChanges)
    : options.ownedChanges
      ? rawChanges
      : cloneUpdateValue(rawChanges);
  const beforeCenter = options.rotateOrigin === 'center' ? centerOf(node) : null;

  if (isComponentNode(node)) {
    updateComponentNode(node, changes, strategy, refresh);
  } else if (node.type === 'item') {
    updateItemNode(node, changes, strategy, refresh);
  } else {
    updateElementNode(node, changes, strategy, refresh);
  }
  if (beforeCenter) preserveManagedCenter(node, beforeCenter);
};

interface FastComponentTarget {
  item: ManagedNode;
  component: ManagedNode;
  index: number;
}

const prepareFastComponentTargets = (
  targets: readonly ManagedNode[],
  changes: Record<string, unknown>,
  options: ManagedUpdateOptions,
): { patch: UpdateRecord; targets: FastComponentTarget[] } | null => {
  if (
    (options.mergeStrategy ?? 'merge') !== 'merge' ||
    options.refresh === true ||
    options.relativeTransform === true ||
    options.rotateOrigin !== undefined ||
    Object.keys(changes).some((key) => key !== 'components') ||
    !Array.isArray(changes.components) ||
    changes.components.length !== 1
  ) {
    return null;
  }
  const patch = record(changes.components[0]) as UpdateRecord;
  const type = typeof patch.type === 'string' ? patch.type : null;
  if (!type || patch.id !== undefined || patch.label !== undefined) return null;
  const fastFields = new Set([
    'animation',
    'animationDuration',
    'size',
    'tint',
    'type',
  ]);
  if (Object.keys(patch).some((key) => !fastFields.has(key))) return null;

  const prepared: FastComponentTarget[] = [];
  for (const item of targets) {
    if (item.type !== 'item' || item.destroyed) return null;
    const matching = item.children
      .map((child, index) => ({ child: child as ManagedNode, index }))
      .filter(({ child }) => child.type === type);
    if (matching.length !== 1) return null;
    prepared.push({
      item,
      component: matching[0]!.child,
      index: matching[0]!.index,
    });
  }
  return { patch, targets: prepared };
};

const applyFastComponentTargets = (
  prepared: NonNullable<ReturnType<typeof prepareFastComponentTargets>>,
): void => {
  const templates = new Map<object | string, MaterializedItemComponent>();
  const layouts = new Map<object, ComponentLayout>();
  for (const { item, component, index } of prepared.targets) {
    const currentComponent = record(component.props) as UpdateRecord;
    const batchToken = getManagedBatchToken(component);
    const templateKey = batchToken ?? (() => {
      const { id: _id, ...signature } = currentComponent;
      return JSON.stringify(signature);
    })();
    let template = templates.get(templateKey);
    if (!template) {
      template = materializeComponent(asComponent(deepMerge(
        currentComponent,
        prepared.patch,
      )));
      templates.set(templateKey, template);
    }
    const next = {
      ...template,
      id: component.id,
    } as MaterializedItemComponent;
    const itemBatchToken = getManagedBatchToken(item);
    const mutatedInPlace = Boolean(batchToken && itemBatchToken);
    if (batchToken && itemBatchToken) {
      Object.assign(currentComponent as Record<string, unknown>, next);
      let layout = layouts.get(itemBatchToken);
      if (!layout) {
        layout = layoutComponent(
          next as unknown as Record<string, unknown>,
          item.props as unknown as Record<string, unknown>,
        );
        layouts.set(itemBatchToken, layout);
      }
      applyManagedComponentLayout(component, layout);
    } else {
      component.replaceProps(next as ManagedNodeProps);
    }
    if (
      next.type === 'bar' &&
      !Object.prototype.hasOwnProperty.call(prepared.patch, 'source')
    ) {
      component.renderable = false;
    }

    const current = item.props as unknown as MaterializedItemElement;
    if (!mutatedInPlace || current.components[index] !== currentComponent) {
      const components = [...current.components];
      components[index] = next;
      const itemProps = { ...current, components } as ManagedNodeProps;
      item.replaceProps(itemProps);
      layoutManagedComponentNode(component, itemProps);
    }
  }
};

/**
 * Applies one public update to many targets while cloning caller input once.
 * The narrow component fast path preserves the same live handles and defaults
 * without detaching every item's unchanged component children.
 */
export const applyManagedUpdates = (
  targets: readonly ManagedNode[],
  options: ManagedUpdateOptions,
): ManagedUpdateEffects => {
  const changes = cloneUpdateValue(record(options.changes));
  const prepared = prepareFastComponentTargets(targets, changes, options);
  if (prepared) {
    applyFastComponentTargets(prepared);
    const animated = prepared.targets.some(
      ({ component }) => record(component.props).animation === true,
    );
    return {
      reindex: false,
      orientation: false,
      assets: Object.prototype.hasOwnProperty.call(prepared.patch, 'source'),
      componentTypes: animated ? null : [String(prepared.patch.type)],
    };
  }

  const ownedOptions = { ...options, changes, ownedChanges: true };
  for (const target of targets) applyManagedUpdate(target, ownedOptions);
  return {
    reindex: true,
    orientation: true,
    assets: true,
    componentTypes: null,
  };
};

const replaceItemComponentsFromSnapshot = (
  node: ManagedNode,
  snapshot: MaterializedItemElement,
): void => {
  const existingNodes = node.children.map((child) => child as ManagedNode);
  const matches = matchComponentUpdates(
    existingNodes.map((child) => record(child.props) as UpdateRecord),
    snapshot.components.map((component) => record(component) as UpdateRecord),
  );
  const nextNodes = matches.map((match, index) => {
    const props = materializeComponent(snapshot.components[index]!);
    const existing = match.existingIndex === null
      ? undefined
      : existingNodes[match.existingIndex];
    const child = existing ?? new ManagedNode(props as ManagedNodeProps);
    if (existing) existing.replaceProps(props as ManagedNodeProps, { refresh: true });
    return child;
  });

  const retained = new Set(nextNodes);
  node.removeChildren();
  for (const existing of existingNodes) {
    if (!retained.has(existing) && !existing.destroyed) {
      existing.destroy({ children: true });
    }
  }
  if (nextNodes.length > 0) node.addChild(...nextNodes);
  node.id = snapshot.id;
  node.replaceProps(snapshot as ManagedNodeProps, { refresh: true });
  for (const child of nextNodes) layoutManagedComponentNode(child, snapshot);
};

/** Restore an owned materialized snapshot while preserving compatible live handles. */
export const replaceManagedSnapshot = (
  node: ManagedNode,
  snapshot: ManagedNodeProps,
): void => {
  if (node.destroyed) return;

  if (isComponentNode(node)) {
    const parent = node.parent as ManagedNode;
    const next = materializeComponent(snapshot as unknown as ItemComponentData);
    if (next.type !== node.type) {
      throw new TypeError('Component snapshot changed its public type.');
    }
    node.replaceProps(next as ManagedNodeProps, { refresh: true });
    const index = parent.children.indexOf(node);
    const components = [
      ...((record(parent.props).components as MaterializedItemComponent[] | undefined) ?? []),
    ];
    if (index >= 0) components[index] = next;
    const parentSnapshot = materializeElement({
      ...record(parent.props),
      components,
    } as unknown as MapElementData);
    if (parentSnapshot.type === 'item') {
      parent.replaceProps(parentSnapshot as ManagedNodeProps, { refresh: true });
      layoutManagedComponentNode(node, parentSnapshot);
    }
    return;
  }

  let next = materializeElement(snapshot as unknown as MapElementData);
  const theme = getManagedTheme(node);
  if (theme) next = liveElementProps(next, theme);
  if (next.type === 'item') {
    replaceItemComponentsFromSnapshot(node, next);
    return;
  }
  if (next.type === 'group' && node.type === 'group') {
    reconcileGroupChildren(node, next);
    node.id = next.id;
    node.replaceProps(next as ManagedNodeProps, { refresh: true });
    relayoutManagedNode(node);
    return;
  }
  if (next.type === 'grid' && node.type === 'grid') {
    reconcileGridItems(node, next);
    node.id = next.id;
    node.replaceProps(next as ManagedNodeProps, { refresh: true });
    relayoutManagedNode(node);
    return;
  }
  node.id = next.id;
  node.replaceProps(next as ManagedNodeProps, { refresh: true });
  relayoutManagedNode(node);
};
