import {
  cloneData,
  materializeGridItems,
  type MaterializedItemComponent,
  type MaterializedItemElement,
  type MaterializedMapData,
  type MaterializedMapElement,
} from '../model/materialize';
import type { PatchmapTheme } from '../theme';
import { layoutComponent, leafBounds } from './layout';
import {
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

const liveElementProps = (
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
): ManagedNode => {
  const node = new ManagedNode(asManagedProps(component));
  const layout = layoutComponent(
    component as unknown as Record<string, unknown>,
    item as unknown as Record<string, unknown>,
  );
  node.position.set(layout.x, layout.y);
  node.scale.set(layout.scaleX, layout.scaleY);
  if (layout.localWidth > 0 || layout.localHeight > 0) {
    node.setLocalBounds({
      width: layout.localWidth,
      height: layout.localHeight,
    });
  }
  indexNode(scene, node);
  return node;
};

const createItemChildren = (
  node: ManagedNode,
  item: MaterializedItemElement,
  scene: ManagedScene,
): void => {
  for (const component of item.components) {
    node.addChild(createComponentNode(component, item, scene));
  }
};

const createElementNode = (
  element: MaterializedMapElement,
  theme: PatchmapTheme,
  scene: ManagedScene,
): ManagedNode => {
  const publicProps = liveElementProps(element, theme);
  const node = new ManagedNode(asManagedProps(publicProps));
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
    createItemChildren(node, element, scene);
  } else if (element.type === 'grid') {
    for (const item of materializeGridItems(element)) {
      const child = new ManagedNode(asManagedProps(item));
      indexNode(scene, child);
      createItemChildren(child, item, scene);
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
