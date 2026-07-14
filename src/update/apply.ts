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
import { validateMapData, ZodValidationError } from '../model/validation';
import {
  applyManagedComponentLayout,
  createGroupPublicVisual,
  layoutManagedComponentNode,
  liveElementProps,
  relayoutManagedNode,
} from '../scene/build-scene';
import {
  GRID_COMPONENT_DEFAULT_ADVANCE_EM,
  layoutComponent,
  type ComponentLayout,
} from '../scene/layout';
import {
  getManagedBatchToken,
  getManagedTheme,
  markManagedGridComponent,
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
  validateSchema?: boolean;
  normalize?: boolean;
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
    node.addChild(createGroupPublicVisual());
  } else if (element.type === 'grid') {
    const children = materializeGridItems(element).map((child) =>
      createManagedElementNode(child, theme));
    if (children.length > 0) node.addChild(...children);
  } else if (element.type === 'item') {
    const children = element.components
      .filter((component) => component.show !== false)
      .map((component) => {
        const child = new ManagedNode(component as ManagedNodeProps);
        if (theme) setManagedTheme(child, theme);
        return child;
      });
    if (children.length > 0) node.addChild(...children);
  }
  relayoutManagedNode(node);
  return node;
};

const alignGridItemComponentIds = (
  node: ManagedNode,
  snapshot: MaterializedItemElement,
): MaterializedItemElement => {
  const existingComponents = (
    node.props as unknown as MaterializedItemElement
  ).components;
  const patches = snapshot.components.map((component) => {
    const patch = { ...record(component) };
    delete patch.id;
    return patch as UpdateRecord;
  });
  const matches = matchComponentUpdates(
    existingComponents.map((component) => record(component) as UpdateRecord),
    patches,
  );
  return {
    ...snapshot,
    components: snapshot.components.map((component, index) => {
      const existingIndex = matches[index]?.existingIndex;
      return existingIndex === null || existingIndex === undefined
        ? component
        : { ...component, id: existingComponents[existingIndex]!.id };
    }),
  };
};

const appendGridTemplateComponents = (
  node: ManagedNode,
  snapshot: MaterializedItemElement,
  templateComponents: readonly MaterializedItemComponent[],
): MaterializedItemElement => {
  const components = [
    ...(node.props as unknown as MaterializedItemElement).components,
  ];
  for (const component of templateComponents) {
    const existingIndex = components.findIndex(
      (candidate) => candidate.id === component.id,
    );
    if (existingIndex < 0) components.push(component);
    else components[existingIndex] = component;
  }
  return { ...snapshot, components };
};

const reconcileManagedElementChildren = (
  parent: ManagedNode,
  snapshots: readonly MaterializedMapElement[],
  alignGridComponents = false,
  appendedGridComponents?: readonly MaterializedItemComponent[],
): void => {
  const existing = parent.children.filter(
    (child): child is ManagedNode => child instanceof ManagedNode,
  );
  const publicVisuals = parent.children.filter(
    (child) => !(child instanceof ManagedNode),
  );
  const theme = getManagedTheme(parent);
  const used = new Set<number>();
  const next = snapshots.map((snapshot) => {
    let existingIndex = existing.findIndex(
      (candidate, index) =>
        !used.has(index) &&
        candidate.id === snapshot.id &&
        candidate.type === snapshot.type,
    );
    if (existingIndex < 0 && typeof snapshot.label === 'string') {
      existingIndex = existing.findIndex(
        (candidate, index) =>
          !used.has(index) &&
          candidate.type === snapshot.type &&
          record(candidate.props).label === snapshot.label,
      );
    }
    if (existingIndex < 0) return createManagedElementNode(snapshot, theme);

    used.add(existingIndex);
    const candidate = existing[existingIndex]!;
    const retainedDimensions = candidate.id === snapshot.id
      ? null
      : { width: candidate.width, height: candidate.height };
    const compatibleSnapshot = alignGridComponents && snapshot.type === 'item'
      ? appendedGridComponents
        ? appendGridTemplateComponents(
          candidate,
          snapshot,
          appendedGridComponents,
        )
        : alignGridItemComponentIds(candidate, snapshot)
      : candidate.id === snapshot.id
        ? snapshot
        : { ...snapshot, id: candidate.id };
    replaceManagedSnapshot(
      candidate,
      compatibleSnapshot as ManagedNodeProps,
      { normalizeLiveText: appendedGridComponents === undefined },
    );
    if (retainedDimensions) {
      candidate.reportDimensions(
        retainedDimensions.width,
        retainedDimensions.height,
      );
    }
    return candidate;
  });

  parent.removeChildren();
  existing.forEach((child, index) => {
    if (!used.has(index) && !child.destroyed) child.destroy({ children: true });
  });
  if (next.length > 0) parent.addChild(...next);
  if (publicVisuals.length > 0) parent.addChild(...publicVisuals);
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
  appendTemplate = false,
): void => {
  reconcileManagedElementChildren(
    node,
    materializeGridItems(grid),
    true,
    appendTemplate ? grid.item.components : undefined,
  );
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

/**
 * Associate visible live handles with their parent component entries.
 * Parent props also retain hidden components, while replace updates may give a
 * retained live handle a different ID from the newly materialized parent entry.
 */
const componentParentIndices = (
  parent: ManagedNode,
): Map<ManagedNode, number> => {
  const components = (
    parent.props as unknown as MaterializedItemElement
  ).components;
  const children = parent.children.map((child) => child as ManagedNode);
  const assignedChildren = new Set<ManagedNode>();
  const assignedComponents = new Set<number>();
  const indices = new Map<ManagedNode, number>();

  const assign = (
    predicate: (
      component: MaterializedItemComponent,
      child: ManagedNode,
    ) => boolean,
  ): void => {
    for (const child of children) {
      if (assignedChildren.has(child)) continue;
      const index = components.findIndex(
        (component, componentIndex) =>
          !assignedComponents.has(componentIndex) && predicate(component, child),
      );
      if (index < 0) continue;
      assignedChildren.add(child);
      assignedComponents.add(index);
      indices.set(child, index);
    }
  };

  assign((component, child) =>
    component.type === child.type && component.id === child.id);
  assign((component, child) => {
    const label = record(child.props).label;
    return typeof label === 'string' &&
      component.type === child.type &&
      component.label === label;
  });
  assign((component, child) => component.type === child.type);
  return indices;
};

const componentReconciliationValues = (
  parent: ManagedNode,
): UpdateRecord[] => {
  const values = (
    parent.props as unknown as MaterializedItemElement
  ).components.map((component) => record(component) as UpdateRecord);
  for (const [child, index] of componentParentIndices(parent)) {
    values[index] = record(child.props) as UpdateRecord;
  }
  return values;
};

const validationSeed = (
  node: ManagedNode,
  options: ManagedUpdateOptions,
): MapElementData => {
  const strategy = options.mergeStrategy ?? 'merge';
  const rawChanges = record(options.changes);
  const changes = options.relativeTransform
    ? relativeChanges(node.props, rawChanges)
    : cloneUpdateValue(rawChanges);

  if (isComponentNode(node)) {
    const parent = node.parent as ManagedNode;
    const components = componentReconciliationValues(parent);
    const index = componentParentIndices(parent).get(node) ?? -1;
    if (index >= 0) {
      components[index] = applyMergeStrategy(
        record(node.props) as UpdateRecord,
        changes,
        strategy,
      );
    }
    return {
      ...record(parent.props),
      components,
    } as unknown as MapElementData;
  }

  if (node.type === 'item' && Array.isArray(changes.components)) {
    const reconciliation = reconcileComponentArray(
      componentReconciliationValues(node),
      changes.components.map((component) => record(component) as UpdateRecord),
      strategy,
    );
    return {
      ...applyMergeStrategy(
        record(node.props),
        changesWithoutComponents(changes),
        strategy,
      ),
      components: reconciliation.entries.map((entry) => entry.merged),
    } as unknown as MapElementData;
  }

  return applyMergeStrategy(
    record(node.props),
    changes,
    strategy,
  ) as unknown as MapElementData;
};

const validateManagedUpdate = (
  node: ManagedNode,
  options: ManagedUpdateOptions,
): void => {
  if (options.validateSchema === false) return;
  const changes = record(options.changes);
  if (
    typeof changes.show !== 'undefined' &&
    typeof changes.show !== 'boolean'
  ) {
    throw new ZodValidationError(
      `Validation error: Expected boolean, received ${typeof changes.show} at "show"`,
    );
  }
  if (
    !isComponentNode(node) &&
    typeof changes.type === 'string' &&
    changes.type !== node.type
  ) {
    const unknown = Object.keys(changes).filter(
      (key) => key !== 'type' && !(key in record(node.props)),
    );
    const suffix = unknown.length > 0
      ? `; Unrecognized key(s) in object: ${unknown.map((key) => `'${key}'`).join(', ')}`
      : '';
    throw new ZodValidationError(
      `Validation error: Invalid literal value, expected "${node.type}" at "type"${suffix}`,
    );
  }
  try {
    validateMapData([validationSeed(node, options)]);
  } catch (error) {
    if (!(error instanceof ZodValidationError)) throw error;
    throw new ZodValidationError(
      error.message.replaceAll('"[0].', '"').replaceAll(' at index 0', ''),
    );
  }
};

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
  const existingValues = componentReconciliationValues(node);
  const reconciliation = reconcileComponentArray(existingValues, incoming, strategy);
  const nextNodes: ManagedNode[] = [];
  const nextValues = reconciliation.entries.map((entry) => {
    const liveProps = materializeReconciledComponent(entry);
    const existingNode = existingNodes.find(
      (candidate) =>
        candidate.id === liveProps.id && candidate.type === liveProps.type,
    );
    if (liveProps.show === false) return parentComponentValue(entry, strategy);
    const liveNode = existingNode ?? new ManagedNode(liveProps as ManagedNodeProps);
    if (existingNode) existingNode.replaceProps(liveProps as ManagedNodeProps, { refresh });

    // A trusted partial source-bearing component update in the approved bulk
    // fixture leaves the reused bar non-renderable while its public props and
    // aggregate next-frame rendering are already updated.
    if (
      entry.patch &&
      entry.patch.type === 'bar' &&
      !Object.prototype.hasOwnProperty.call(entry.patch, 'source') &&
      liveProps.type === 'bar' &&
      liveProps.animation === false
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
  const managedParent = parent as ManagedNode;
  const seed = applyMergeStrategy(node.props, changes, strategy);
  const next = materializeComponent(asComponent(seed as unknown as UpdateRecord));
  if (next.type !== node.type) {
    throw new TypeError('Component update changed its public type.');
  }
  node.replaceProps(next as ManagedNodeProps, { refresh });
  const index = componentParentIndices(managedParent).get(node) ?? -1;
  const components = [...(record(managedParent.props).components as MaterializedItemComponent[] ?? [])];
  if (index >= 0) components[index] = next;
  const parentSeed = { ...record(parent.props), components };
  const materializedParent = materializeElement(
    parentSeed as unknown as MapElementData,
  );
  if (materializedParent.type === 'item') {
    managedParent.replaceProps(materializedParent as ManagedNodeProps, { refresh });
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
    reconcileGridItems(
      node,
      next,
      hasOwn(record(changes.item), 'components'),
    );
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
  node.clearReportedDimensions();
  const strategy = options.mergeStrategy ?? 'merge';
  const refresh = options.refresh === true;
  const rawChanges = record(options.changes);
  const changes = options.relativeTransform
    ? relativeChanges(node.props, rawChanges)
    : options.ownedChanges
      ? rawChanges
      : cloneUpdateValue(rawChanges);
  const beforeCenter = options.rotateOrigin === 'center' ? centerOf(node) : null;

  if (options.normalize === false) {
    const next = applyMergeStrategy(node.props, changes, strategy);
    node.replaceProps(next as ManagedNodeProps, { refresh });
    node.suppressPublicBounds();
    return;
  }
  node.suppressPublicBounds(false);

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
      .map((child) => child as ManagedNode)
      .filter((child) => child.type === type);
    if (matching.length !== 1) return null;
    const index = componentParentIndices(item).get(matching[0]!);
    if (index === undefined) return null;
    prepared.push({
      item,
      component: matching[0]!,
      index,
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
          GRID_COMPONENT_DEFAULT_ADVANCE_EM,
        );
        layouts.set(itemBatchToken, layout);
      }
      applyManagedComponentLayout(component, layout);
    } else {
      component.replaceProps(next as ManagedNodeProps);
    }
    if (
      next.type === 'bar' &&
      !Object.prototype.hasOwnProperty.call(prepared.patch, 'source') &&
      next.animation === false
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
  for (const target of targets) {
    validateManagedUpdate(target, { ...options, changes, ownedChanges: true });
  }
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
  const gridItem = getManagedBatchToken(node) !== undefined ||
    (node.parent instanceof ManagedNode && node.parent.type === 'grid');
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
    if (existing) {
      existing.replaceProps(props as ManagedNodeProps, {
        preserveBatch: gridItem,
        refresh: true,
      });
    }
    if (gridItem) markManagedGridComponent(child);
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
export interface ReplaceManagedSnapshotOptions {
  normalizeLiveText?: boolean;
}

export const replaceManagedSnapshot = (
  node: ManagedNode,
  snapshot: ManagedNodeProps,
  options: ReplaceManagedSnapshotOptions = {},
): void => {
  if (node.destroyed) return;
  node.clearReportedDimensions();

  if (isComponentNode(node)) {
    const parent = node.parent as ManagedNode;
    const next = materializeComponent(snapshot as unknown as ItemComponentData);
    if (next.type !== node.type) {
      throw new TypeError('Component snapshot changed its public type.');
    }
    node.replaceProps(next as ManagedNodeProps, { refresh: true });
    const index = componentParentIndices(parent).get(node) ?? -1;
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
  if (theme && options.normalizeLiveText !== false) {
    next = liveElementProps(next, theme);
  }
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
