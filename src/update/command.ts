import { Command } from '../history';
import type { ManagedNode, ManagedNodeProps } from '../scene/managed-node';
import { applyManagedUpdate, replaceManagedSnapshot } from './apply';
import { cloneUpdateValue } from './merge';
import type { ManagedUpdateOptions } from './apply';

interface ManagedSnapshot {
  node: ManagedNode;
  props: ManagedNodeProps;
}

const capture = (nodes: readonly ManagedNode[]): ManagedSnapshot[] =>
  nodes.map((node) => ({
    node,
    props: cloneUpdateValue(node.props),
  }));

const restore = (snapshots: readonly ManagedSnapshot[]): void => {
  for (const snapshot of snapshots) {
    replaceManagedSnapshot(snapshot.node, cloneUpdateValue(snapshot.props));
  }
};

export class ManagedUpdateCommand extends Command {
  readonly #targets: ManagedNode[];
  readonly #options: ManagedUpdateOptions;
  readonly #onApplied: () => void;
  readonly #before: ManagedSnapshot[];
  #after: ManagedSnapshot[] | null = null;

  public constructor(
    targets: readonly ManagedNode[],
    options: ManagedUpdateOptions,
    onApplied: () => void,
  ) {
    super();
    this.#targets = [...targets];
    this.#options = cloneUpdateValue(options);
    this.#onApplied = onApplied;
    this.#before = capture(targets);
  }

  public override execute(): void {
    if (this.#after) {
      restore(this.#after);
    } else {
      for (const target of this.#targets) applyManagedUpdate(target, this.#options);
      this.#after = capture(this.#targets);
    }
    this.#onApplied();
  }

  public override undo(): void {
    restore(this.#before);
    this.#onApplied();
  }
}
