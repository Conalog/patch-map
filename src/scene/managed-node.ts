import { Bounds, Container, Rectangle } from 'pixi.js';
import type { DestroyOptions } from 'pixi.js';

import type {
  ItemComponentData,
  MapElementData,
  MaterializedComponentProps,
  MaterializedElementProps,
  PublicNodeData,
} from '../contracts';
import type { PatchmapTheme } from '../theme';

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
  /** Retain an implementation-owned homogeneous grid template marker. */
  preserveBatch?: boolean;
}

const managedBatchTokens = new WeakMap<ManagedNode, object>();
const managedGridComponents = new WeakSet<ManagedNode>();
const managedThemes = new WeakMap<ManagedNode, PatchmapTheme>();

export const setManagedBatchToken = (node: ManagedNode, token: object): void => {
  managedBatchTokens.set(node, token);
};

export const getManagedBatchToken = (node: ManagedNode): object | undefined =>
  managedBatchTokens.get(node);

export const markManagedGridComponent = (
  node: ManagedNode,
  marked = true,
): void => {
  if (marked) managedGridComponents.add(node);
  else managedGridComponents.delete(node);
};

export const isManagedGridComponent = (node: ManagedNode): boolean =>
  managedGridComponents.has(node);

export const setManagedTheme = (node: ManagedNode, theme: PatchmapTheme): void => {
  managedThemes.set(node, theme);
};

export const getManagedTheme = (node: ManagedNode): PatchmapTheme | undefined =>
  managedThemes.get(node);

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

const defaultLiveLabel = (type: string): string | null => {
  if (type === 'icon') return 'Sprite';
  if (type === 'rect' || type === 'background' || type === 'bar') {
    return 'Graphics';
  }
  return null;
};

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
  #managedLocalBounds: Bounds | null = null;
  #publicBoundsSuppressed = false;
  #reportedWidth: number | null = null;
  #reportedHeight: number | null = null;

  public constructor(props: ManagedNodeProps<T>, options: ManagedNodeOptions = {}) {
    super();
    this.id = props.id;
    this.type = props.type;
    this.#props = props;
    this.visible = true;
    this.eventMode = 'static';
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

  public override get width(): number {
    return this.#reportedWidth ?? super.width;
  }

  public override set width(value: number) {
    this.#reportedWidth = null;
    super.width = value;
  }

  public override get height(): number {
    return this.#reportedHeight ?? super.height;
  }

  public override set height(value: number) {
    this.#reportedHeight = null;
    super.height = value;
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
    if (options.preserveBatch !== true) managedBatchTokens.delete(this);
    this.id = next.id;
    this.type = next.type;
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
    const rectangle = new Rectangle(x, y, width, height);
    this.boundsArea = rectangle;
    this.hitArea = rectangle;
    this.#managedLocalBounds ??= new Bounds();
    this.#managedLocalBounds.set(x, y, x + width, y + height);

    return this;
  }

  public clearLocalBounds(): this {
    if (!this.destroyed) {
      this.#managedLocalBounds = null;
      Reflect.set(this, 'boundsArea', null);
      this.hitArea = null;
    }
    return this;
  }

  public override getLocalBounds(): Bounds {
    return this.#managedLocalBounds ?? super.getLocalBounds();
  }

  public override getBounds(skipUpdate?: boolean, bounds?: Bounds): Bounds {
    if (!this.#publicBoundsSuppressed) {
      return super.getBounds(skipUpdate, bounds);
    }
    const target = bounds ?? new Bounds();
    target.set(0, 0, 0, 0);
    return target;
  }

  /** Preserve local dimensions while exposing the raw-update zero bounds ABI. */
  public suppressPublicBounds(suppressed = true): this {
    this.#publicBoundsSuppressed = suppressed;
    return this;
  }

  public reportDimensions(width: number, height: number): this {
    this.#reportedWidth = width;
    this.#reportedHeight = height;
    return this;
  }

  public clearReportedDimensions(): this {
    this.#reportedWidth = null;
    this.#reportedHeight = null;
    return this;
  }

  public override destroy(options?: DestroyOptions): void {
    if (this.destroyed) return;
    this.onRender = null;
    managedBatchTokens.delete(this);
    managedGridComponents.delete(this);
    managedThemes.delete(this);
    this.#managedLocalBounds = null;
    this.#publicBoundsSuppressed = false;
    this.#reportedWidth = null;
    this.#reportedHeight = null;
    Reflect.set(this, 'boundsArea', null);
    this.hitArea = null;
    super.destroy(options);
  }

  #applyLabel(props: ManagedNodeProps<T>): void {
    Reflect.set(
      this,
      'label',
      typeof props.label === 'string'
        ? props.label
        : defaultLiveLabel(props.type),
    );
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
