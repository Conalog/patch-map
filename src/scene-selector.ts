import { JSONPath } from 'jsonpath-plus';
import type { Container } from 'pixi.js';

type PublicSceneNode = Container & {
  id?: string;
  type?: string;
  props?: Record<string, unknown>;
};

interface SelectorProjection {
  readonly __node: PublicSceneNode;
  id?: string;
  type?: string;
  label?: string;
  display?: unknown;
  props?: Record<string, unknown>;
  parent?: SelectorProjection;
  children?: SelectorProjection[];
}

const shallowProjection = (node: PublicSceneNode): SelectorProjection => {
  const props = node.props
    ? Object.fromEntries(
        Object.entries(node.props).filter(
          ([key]) => !['children', 'components', 'item', 'cells', 'links'].includes(key),
        ),
      )
    : undefined;
  const projection = {
    id: node.id,
    type: node.type,
    label: node.label || node.props?.label as string | undefined,
    display: node.props?.display,
    props,
  } as SelectorProjection;
  Object.defineProperty(projection, '__node', { value: node });
  return projection;
};

const projectNode = (
  node: PublicSceneNode,
  parent: PublicSceneNode | null,
): SelectorProjection => {
  const projection = shallowProjection(node) as SelectorProjection & {
    parent?: SelectorProjection;
    children: SelectorProjection[];
  };
  if (parent) projection.parent = shallowProjection(parent);
  projection.children = node.children.map((child) =>
    projectNode(child as PublicSceneNode, node),
  );
  return projection;
};

const restorePublicValues = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(restorePublicValues);
  if (value && typeof value === 'object' && '__node' in value) {
    return (value as SelectorProjection).__node;
  }
  return value;
};

const normalizeScenePath = (path: string): string =>
  path.startsWith('$..[?(')
    ? `$..children[?(${path.slice('$..[?('.length)}`
    : path;

export const selectScene = (
  root: Container,
  path: string,
  options: Record<string, unknown> = {},
): unknown[] => {
  const projection = projectNode(root as PublicSceneNode, null);
  const selected = JSONPath<unknown[]>({
    path: normalizeScenePath(path),
    json: projection,
    wrap: true,
    ...options,
  });
  return selected.map(restorePublicValues);
};
