import {
  cloneData,
  materializeGridItems,
  type MaterializedItemComponent,
  type MaterializedItemElement,
  type MaterializedMapData,
  type MaterializedMapElement,
} from '../model/materialize';
import type { PatchmapTheme } from '../theme';
import {
  layoutComponent,
  leafBounds,
  type ComponentLayout,
} from './layout';
import {
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

export const reindexManagedScene = (scene: ManagedScene): void => {
  scene.all = [];
  scene.byId.clear();
  scene.byType.clear();
  scene.byLabel.clear();
  const visit = (node: ManagedNode): void => {
    indexNode(scene, node);
    for (const child of node.children) visit(child as ManagedNode);
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
  if (batchToken) setManagedBatchToken(node, batchToken);
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
  } else if (element.type === 'item') {
    createItemChildren(node, element, scene, theme);
  } else if (element.type === 'grid') {
    const batchTokens = element.item.components.map(() => ({}));
    const itemBatchToken = {};
    for (const item of materializeGridItems(element)) {
      const child = new ManagedNode(asManagedProps(item));
      setManagedTheme(child, theme);
      setManagedBatchToken(child, itemBatchToken);
      indexNode(scene, child);
      createItemChildren(child, item, scene, theme, batchTokens);
      node.addChild(child);
    }
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
