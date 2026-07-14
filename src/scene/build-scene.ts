import { Graphics, Rectangle } from 'pixi.js';

import {
  cloneData,
  materializeGridItems,
  normalizeLiveItemTextComponents,
  type MaterializedItemComponent,
  type MaterializedItemElement,
  type MaterializedMapData,
  type MaterializedMapElement,
} from '../model/materialize';
import type { PatchmapTheme } from '../theme';
import {
  GRID_COMPONENT_DEFAULT_ADVANCE_EM,
  layoutComponent,
  leafBounds,
  type ComponentLayout,
} from './layout';
import {
  isManagedGridComponent,
  markManagedGridComponent,
  setManagedBatchToken,
  setManagedTheme,
  ManagedNode,
  type ManagedNodeProps,
} from './managed-node';

export interface ManagedScene {
  roots: ManagedNode[];
  all: ManagedNode[];
  byId: Map<string, ManagedNode>;
  byType: Map<string, ManagedNode[]>;
  byLabel: Map<string, ManagedNode[]>;
}

const relationPathsWithGeometry = new WeakSet<Graphics>();

export const createGroupPublicVisual = (): Graphics => {
  const visual = new Graphics();
  visual.measurable = false;
  return visual;
};

export const reindexManagedScene = (scene: ManagedScene): void => {
  scene.all = [];
  scene.byId.clear();
  scene.byType.clear();
  scene.byLabel.clear();
  const visit = (node: ManagedNode): void => {
    indexNode(scene, node);
    for (const child of node.children) {
      if (child instanceof ManagedNode) visit(child as ManagedNode);
    }
  };
  for (const root of scene.roots) visit(root);
};

const indexNode = (scene: ManagedScene, node: ManagedNode): void => {
  scene.all.push(node);
  scene.byId.set(node.id, node);
  const typed = scene.byType.get(node.type) ?? [];
  typed.push(node);
  scene.byType.set(node.type, typed);
  if (typeof node.props.label === 'string') {
    const labeled = scene.byLabel.get(node.props.label) ?? [];
    labeled.push(node);
    scene.byLabel.set(node.props.label, labeled);
  }
};

const asManagedProps = (value: MaterializedMapElement | MaterializedItemComponent): ManagedNodeProps =>
  value as ManagedNodeProps;

export const liveElementProps = (
  element: MaterializedMapElement,
  theme: PatchmapTheme,
): MaterializedMapElement => {
  if (element.type === 'item') {
    return normalizeLiveItemTextComponents(element);
  }
  if (element.type !== 'relations') return element;
  const color = element.style.color;
  if (color === undefined) return element;
  const resolved = color === 'black'
    ? theme.black
    : color === 'white'
      ? theme.white
      : color;
  return {
    ...element,
    style: { ...element.style, color: resolved },
  };
};

const createComponentNode = (
  component: MaterializedItemComponent,
  item: MaterializedItemElement,
  scene: ManagedScene,
  theme: PatchmapTheme,
  batchToken?: object,
): ManagedNode => {
  const node = new ManagedNode(asManagedProps(component));
  setManagedTheme(node, theme);
  if (batchToken) {
    setManagedBatchToken(node, batchToken);
    markManagedGridComponent(node);
  }
  layoutManagedComponentNode(node, item);
  indexNode(scene, node);
  return node;
};

export const layoutManagedComponentNode = (
  node: ManagedNode,
  item: MaterializedItemElement | ManagedNodeProps,
): void => {
  const layout = layoutComponent(
    node.props as unknown as Record<string, unknown>,
    item as unknown as Record<string, unknown>,
    isManagedGridComponent(node) ? GRID_COMPONENT_DEFAULT_ADVANCE_EM : undefined,
  );
  applyManagedComponentLayout(node, layout);
};

export const applyManagedComponentLayout = (
  node: ManagedNode,
  layout: ComponentLayout,
): void => {
  node.position.set(layout.x, layout.y);
  node.scale.set(layout.scaleX, layout.scaleY);
  if (layout.localWidth > 0 || layout.localHeight > 0) {
    node.setLocalBounds({
      width: layout.localWidth,
      height: layout.localHeight,
    });
  } else {
    node.clearLocalBounds();
  }
};

export const relayoutManagedNode = (node: ManagedNode): void => {
  if (node.type === 'item') {
    for (const child of node.children) {
      layoutManagedComponentNode(child as ManagedNode, node.props);
    }
    return;
  }
  const bounds = leafBounds(node.props as unknown as Record<string, unknown>);
  if (bounds && (bounds.width > 0 || bounds.height > 0)) {
    node.setLocalBounds(bounds);
  } else if (node.children.length === 0) {
    node.clearLocalBounds();
  }
};

const createItemChildren = (
  node: ManagedNode,
  item: MaterializedItemElement,
  scene: ManagedScene,
  theme: PatchmapTheme,
  batchTokens?: readonly object[],
): void => {
  for (const [index, component] of item.components.entries()) {
    if (component.show === false) continue;
    node.addChild(createComponentNode(
      component,
      item,
      scene,
      theme,
      batchTokens?.[index],
    ));
  }
};

const createElementNode = (
  element: MaterializedMapElement,
  theme: PatchmapTheme,
  scene: ManagedScene,
): ManagedNode => {
  const publicProps = liveElementProps(element, theme);
  const node = new ManagedNode(asManagedProps(publicProps));
  setManagedTheme(node, theme);
  const bounds = leafBounds(publicProps as unknown as Record<string, unknown>);
  if (bounds && (bounds.width > 0 || bounds.height > 0)) {
    node.setLocalBounds(bounds);
  }
  indexNode(scene, node);

  if (element.type === 'group') {
    for (const child of element.children) {
      node.addChild(createElementNode(child, theme, scene));
    }
    // The public reference scene exposes one visible, untyped visual child for
    // each group. It is observable through recursive public traversal but is
    // intentionally excluded from managed indexes and snapshots.
    node.addChild(createGroupPublicVisual());
  } else if (publicProps.type === 'item') {
    createItemChildren(node, publicProps, scene, theme);
  } else if (element.type === 'grid') {
    const batchTokens = element.item.components.map(() => ({}));
    const itemBatchToken = {};
    for (const rawItem of materializeGridItems(element)) {
      const item = normalizeLiveItemTextComponents(rawItem);
      const child = new ManagedNode(asManagedProps(item));
      setManagedTheme(child, theme);
      setManagedBatchToken(child, itemBatchToken);
      indexNode(scene, child);
      createItemChildren(child, item, scene, theme, batchTokens);
      node.addChild(child);
    }
  } else if (element.type === 'relations') {
    const path = new Graphics();
    path.label = 'Graphics';
    Reflect.set(path, 'type', 'path');
    const pathGetBounds = path.getBounds.bind(path);
    Reflect.set(path, 'getBounds', (...args: Parameters<typeof pathGetBounds>) =>
      relationPathsWithGeometry.has(path)
        ? pathGetBounds(...args)
        : new Rectangle(0, 0, 0, 0));
    const relationGetBounds = node.getBounds.bind(node);
    Reflect.set(node, 'getBounds', (...args: Parameters<typeof relationGetBounds>) =>
      relationPathsWithGeometry.has(path)
        ? relationGetBounds(...args)
        : new Rectangle(0, 0, 0, 0));
    node.addChild(path);
  }

  return node;
};

export const buildManagedScene = (
  data: MaterializedMapData,
  theme: PatchmapTheme,
): ManagedScene => {
  const scene: ManagedScene = {
    roots: [],
    all: [],
    byId: new Map(),
    byType: new Map(),
    byLabel: new Map(),
  };
  for (const element of data) {
    const root = createElementNode(cloneData(element), theme, scene);
    scene.roots.push(root);
  }
  return scene;
};

const publicCenter = (node: ManagedNode): { x: number; y: number } => {
  const bounds = node.getBounds();
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
};

/** Populate relation path bounds at the native render boundary. */
export const syncRelationPathGeometry = (scene: ManagedScene | null): void => {
  if (!scene) return;
  for (const relation of scene.byType.get('relations') ?? []) {
    const path = relation.children[0];
    if (!(path instanceof Graphics) || Reflect.get(path, 'type') !== 'path') {
      continue;
    }

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    const links = (relation.props as unknown as { links?: unknown[] }).links ?? [];
    for (const value of links) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const link = value as { source?: unknown; target?: unknown };
      if (typeof link.source !== 'string' || typeof link.target !== 'string') continue;
      const source = scene.byId.get(link.source);
      const target = scene.byId.get(link.target);
      if (!source || !target) continue;
      const from = relation.toLocal(publicCenter(source));
      const to = relation.toLocal(publicCenter(target));
      minX = Math.min(minX, from.x, to.x);
      minY = Math.min(minY, from.y, to.y);
      maxX = Math.max(maxX, from.x, to.x);
      maxY = Math.max(maxY, from.y, to.y);
    }

    if (![minX, minY, maxX, maxY].every(Number.isFinite)) {
      relationPathsWithGeometry.delete(path);
      Reflect.set(path, 'boundsArea', null);
      continue;
    }
    relationPathsWithGeometry.add(path);
    path.boundsArea = new Rectangle(
      minX - 0.5,
      minY - 0.5,
      maxX - minX + 1,
      maxY - minY + 1,
    );
  }
};
