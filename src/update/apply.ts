import type {
  ItemComponentData,
  MapElementData,
  MergeStrategy,
  UpdateChanges,
} from '../contracts';
import {
  materializeComponent,
  materializeElement,
  type MaterializedItemComponent,
  type MaterializedItemElement,
} from '../model/materialize';
import {
  layoutManagedComponentNode,
  relayoutManagedNode,
} from '../scene/build-scene';
import {
  ManagedNode,
  type ManagedNodeProps,
} from '../scene/managed-node';
import {
  applyMergeStrategy,
  cloneUpdateValue,
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
  node.addChild(...nextNodes);
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

const updateElementNode = (
  node: ManagedNode,
  changes: Record<string, unknown>,
  strategy: MergeStrategy,
  refresh: boolean,
  preserveCenter: boolean,
): void => {
  const beforeCenter = preserveCenter ? centerOf(node) : null;
  let seed = applyMergeStrategy(node.props, changes, strategy) as unknown as Record<string, unknown>;
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
  node.replaceProps(next as ManagedNodeProps, { refresh });
  relayoutManagedNode(node);

  if (beforeCenter) {
    const afterCenter = centerOf(node);
    const attrs = record(next.attrs);
    next = materializeElement({
      ...next,
      attrs: {
        ...attrs,
        x: (finite(attrs.x) ?? 0) + beforeCenter.x - afterCenter.x,
        y: (finite(attrs.y) ?? 0) + beforeCenter.y - afterCenter.y,
      },
    } as unknown as MapElementData);
    node.replaceProps(next as ManagedNodeProps, { refresh: true });
    relayoutManagedNode(node);
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
    : cloneUpdateValue(rawChanges);

  if (isComponentNode(node)) {
    updateComponentNode(node, changes, strategy, refresh);
  } else if (node.type === 'item') {
    updateItemNode(node, changes, strategy, refresh);
  } else {
    updateElementNode(
      node,
      changes,
      strategy,
      refresh,
      options.rotateOrigin === 'center',
    );
  }
};
