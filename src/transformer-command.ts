import { Command } from './history';
import { ManagedNode, type ManagedNodeProps } from './scene/managed-node';
import { cloneUpdateValue } from './update/merge';

export interface ManagedTransformSnapshot {
  node: ManagedNode;
  props: ManagedNodeProps;
  position: { x: number; y: number };
  scale: { x: number; y: number };
  rotation: number;
}

export const captureManagedTransforms = (
  values: readonly unknown[],
): ManagedTransformSnapshot[] => values
  .filter(
    (value): value is ManagedNode =>
      value instanceof ManagedNode && !value.destroyed,
  )
  .map((node) => ({
    node,
    props: cloneUpdateValue(node.props),
    position: { x: node.position.x, y: node.position.y },
    scale: { x: node.scale.x, y: node.scale.y },
    rotation: node.rotation,
  }));

const restore = (snapshots: readonly ManagedTransformSnapshot[]): void => {
  for (const snapshot of snapshots) {
    if (snapshot.node.destroyed) continue;
    snapshot.node.replaceProps(cloneUpdateValue(snapshot.props), { refresh: true });
    snapshot.node.position.set(snapshot.position.x, snapshot.position.y);
    snapshot.node.scale.set(snapshot.scale.x, snapshot.scale.y);
    snapshot.node.rotation = snapshot.rotation;
  }
};

export const sameManagedTransforms = (
  left: readonly ManagedTransformSnapshot[],
  right: readonly ManagedTransformSnapshot[],
): boolean =>
  left.length === right.length &&
  left.every((snapshot, index) => {
    const other = right[index];
    return (
      other !== undefined &&
      snapshot.node === other.node &&
      snapshot.position.x === other.position.x &&
      snapshot.position.y === other.position.y &&
      snapshot.scale.x === other.scale.x &&
      snapshot.scale.y === other.scale.y &&
      snapshot.rotation === other.rotation &&
      JSON.stringify(snapshot.props) === JSON.stringify(other.props)
    );
  });

/** Records a transform that was already applied by the live pointer gesture. */
export class AppliedTransformCommand extends Command {
  readonly #before: ManagedTransformSnapshot[];
  readonly #after: ManagedTransformSnapshot[];
  readonly #onApplied: () => void;
  #initialExecution = true;

  public constructor(
    id: string,
    before: readonly ManagedTransformSnapshot[],
    after: readonly ManagedTransformSnapshot[],
    onApplied: () => void,
  ) {
    super(id);
    this.#before = before.map((snapshot) => ({
      ...snapshot,
      props: cloneUpdateValue(snapshot.props),
      position: { ...snapshot.position },
      scale: { ...snapshot.scale },
    }));
    this.#after = after.map((snapshot) => ({
      ...snapshot,
      props: cloneUpdateValue(snapshot.props),
      position: { ...snapshot.position },
      scale: { ...snapshot.scale },
    }));
    this.#onApplied = onApplied;
  }

  public override execute(): void {
    if (this.#initialExecution) {
      this.#initialExecution = false;
      return;
    }
    restore(this.#after);
    this.#onApplied();
  }

  public override undo(): void {
    restore(this.#before);
    this.#onApplied();
  }
}
