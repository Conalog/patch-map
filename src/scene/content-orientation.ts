import type { ManagedScene } from './build-scene';
import { layoutComponent } from './layout';
import { ManagedNode } from './managed-node';

const UPRIGHT_COMPONENT_TYPES = new Set(['bar', 'icon', 'text']);

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const ownAngle = (node: ManagedNode): number => {
  const attrs = record(node.props.attrs);
  const rotation = attrs.rotation;
  if (typeof rotation === 'number' && Number.isFinite(rotation)) {
    return rotation * 180 / Math.PI;
  }
  const angle = attrs.angle;
  return typeof angle === 'number' && Number.isFinite(angle) ? angle : 0;
};

const ancestorAngle = (node: ManagedNode): number => {
  let angle = 0;
  let parent = node.parent;
  while (parent instanceof ManagedNode) {
    angle += parent.angle;
    parent = parent.parent;
  }
  return angle;
};

export const applyContentOrientation = (
  scene: ManagedScene | null,
  worldAngle: number,
  flip: { x: boolean; y: boolean },
): void => {
  if (!scene) return;
  for (const node of scene.all) {
    const parent = node.parent;
    if (!(parent instanceof ManagedNode) || parent.type !== 'item') continue;
    if (!UPRIGHT_COMPONENT_TYPES.has(node.type)) continue;

    const layout = layoutComponent(
      node.props as unknown as Record<string, unknown>,
      parent.props as unknown as Record<string, unknown>,
    );
    const upright = record(parent.props).contentOrientation !== 'follow-item';
    if (!upright) {
      node.origin.set(0, 0);
      node.angle = ownAngle(node);
      node.scale.set(layout.scaleX, layout.scaleY);
      continue;
    }

    const counterAngle = worldAngle + ancestorAngle(node);
    const transformed = counterAngle !== 0 || flip.x || flip.y;
    node.origin.set(
      transformed ? layout.localWidth / 2 : 0,
      transformed ? layout.localHeight / 2 : 0,
    );
    node.angle = ownAngle(node) - counterAngle;
    node.scale.set(
      layout.scaleX * (flip.x ? -1 : 1),
      layout.scaleY * (flip.y ? -1 : 1),
    );
  }
};
