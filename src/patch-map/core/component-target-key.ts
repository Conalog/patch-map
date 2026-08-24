interface PatchMapComponentKeyTarget {
  readonly ownerId: string;
  readonly componentId: string;
}

/** Stable collision-free key for a semantic owner and component pair. */
export function patchMapComponentTargetKey(
  id: string,
  componentId: string,
): string {
  return `${id.length}:${id}:${componentId}`;
}

export function patchMapComponentProbeTargetKey(
  target: PatchMapComponentKeyTarget,
): string {
  return patchMapComponentTargetKey(target.ownerId, target.componentId);
}

