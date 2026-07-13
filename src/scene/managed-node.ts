import { Container, Rectangle } from 'pixi.js';
import type { DestroyOptions } from 'pixi.js';

import type {
  ItemComponentData,
  MapElementData,
  MaterializedComponentProps,
  MaterializedElementProps,
  PublicNodeData,
} from '../contracts';

export type ManagedNodeProps<T extends PublicNodeData = PublicNodeData> =
  T extends MapElementData
    ? MaterializedElementProps<T>
    : T extends ItemComponentData
      ? MaterializedComponentProps<T>
      : never;

export interface ManagedLocalBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
}

export interface ManagedNodeOptions {
  bounds?: ManagedLocalBounds;
}

export interface ReplaceManagedNodePropsOptions {
  /** Reapply observable fields even when their materialized values are equal. */
  refresh?: boolean;
}

type ManagedAttributes = ManagedNodeProps['attrs'];

const finiteNumber = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const readAttribute = (
  attributes: ManagedAttributes | undefined,
  key: 'x' | 'y' | 'angle' | 'rotation',
): number | undefined => {
  const value = attributes?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
};

const sameAttribute = (
  previous: ManagedAttributes | undefined,
  next: ManagedAttributes | undefined,
  key: 'x' | 'y' | 'angle' | 'rotation',
): boolean => readAttribute(previous, key) === readAttribute(next, key);

/**
 * Public scene-tree handle separated from private render primitives.
 *
 * Managed children may be attached through the inherited Container API. This
 * class deliberately adds no visual children of its own, allowing a renderer
 * to maintain an independent aggregate layer without changing public
 * parent/child identity or handle counts.
 */
export class ManagedNode<T extends PublicNodeData = PublicNodeData> extends Container {
  public id: string;
  public type: T['type'];

  #props: ManagedNodeProps<T>;

  public constructor(props: ManagedNodeProps<T>, options: ManagedNodeOptions = {}) {
    super();
    this.id = props.id;
    this.type = props.type;
    this.#props = props;
    this.visible = true;
    this.#applyLabel(props);
    this.#applyVisibility(props);
    this.#applyPosition(props);
    this.#applyRotation(props);
    if (options.bounds) this.setLocalBounds(options.bounds);
  }

  public get props(): ManagedNodeProps<T> {
    return this.#props;
  }

  public set props(next: ManagedNodeProps<T>) {
    this.replaceProps(next);
  }

  /**
   * Replaces the materialized public props while retaining live-handle
   * identity. Observable fields are reapplied only when changed, unless the
   * caller requests refresh semantics.
   */
  public replaceProps(
    next: ManagedNodeProps<T>,
    options: ReplaceManagedNodePropsOptions = {},
  ): this {
    if (this.destroyed) return this;

    const previous = this.#props;
    this.#props = next;
    const refresh = options.refresh === true;

    if (refresh || previous.label !== next.label) this.#applyLabel(next);
    if (refresh || previous.show !== next.show) this.#applyVisibility(next);

    const previousAttrs = previous.attrs;
    const nextAttrs = next.attrs;
    if (
      refresh ||
      !sameAttribute(previousAttrs, nextAttrs, 'x') ||
      !sameAttribute(previousAttrs, nextAttrs, 'y')
    ) {
      this.#applyPosition(next);
    }
    if (
      refresh ||
      !sameAttribute(previousAttrs, nextAttrs, 'angle') ||
      !sameAttribute(previousAttrs, nextAttrs, 'rotation')
    ) {
      this.#applyRotation(next);
    }

    return this;
  }

  /**
   * Installs an owned, explicit local bounds rectangle. The input is copied so
   * external mutations cannot silently alter this handle's geometry.
   */
  public setLocalBounds(bounds: ManagedLocalBounds): this {
    if (this.destroyed) return this;

    const x = finiteNumber(bounds.x);
    const y = finiteNumber(bounds.y);
    const width = finiteNumber(bounds.width);
    const height = finiteNumber(bounds.height);
    const current = this.boundsArea;

    if (current instanceof Rectangle) {
      current.x = x;
      current.y = y;
      current.width = width;
      current.height = height;
    } else {
      this.boundsArea = new Rectangle(x, y, width, height);
    }

    return this;
  }

  public clearLocalBounds(): this {
    if (!this.destroyed) Reflect.set(this, 'boundsArea', null);
    return this;
  }

  public override destroy(options?: DestroyOptions): void {
    if (this.destroyed) return;
    this.onRender = null;
    Reflect.set(this, 'boundsArea', null);
    super.destroy(options);
  }

  #applyLabel(props: ManagedNodeProps<T>): void {
    Reflect.set(this, 'label', typeof props.label === 'string' ? props.label : null);
  }

  #applyVisibility(props: ManagedNodeProps<T>): void {
    this.renderable = props.show !== false;
  }

  #applyPosition(props: ManagedNodeProps<T>): void {
    this.position.set(
      readAttribute(props.attrs, 'x') ?? 0,
      readAttribute(props.attrs, 'y') ?? 0,
    );
  }

  #applyRotation(props: ManagedNodeProps<T>): void {
    const rotation = readAttribute(props.attrs, 'rotation');
    if (rotation !== undefined) {
      this.rotation = rotation;
      return;
    }

    this.angle = readAttribute(props.attrs, 'angle') ?? 0;
  }
}
