import type { CoreView, Rgba } from './contracts';

/** Dense-store kind codes. Kept numeric so the renderer can read typed columns. */
export const RenderKind = Object.freeze({
  Rect: 1,
  Text: 2,
  Image: 3,
  Bar: 4,
  Relation: 5,
} as const);

/** Flags shared by the dense store and aggregate renderer. */
export const RenderFlags = Object.freeze({
  Visible: 1,
  Interactive: 2,
  Selected: 4,
} as const);

export const RenderAlign = Object.freeze({
  Left: 0,
  Center: 1,
  Right: 2,
  Justify: 3,
} as const);

/**
 * Narrow, read-only bridge between the dense store and render backends.
 *
 * Numeric columns are ArrayLike rather than concrete typed-array classes so
 * the store remains free to choose the smallest measured representation.
 */
export interface RenderStoreView {
  readonly capacity: number;
  readonly liveCount: number;
  readonly revision: number;

  readonly alive: ArrayLike<number>;
  readonly kind: ArrayLike<number>;
  readonly flags: ArrayLike<number>;
  readonly zIndex: ArrayLike<number>;

  readonly x: ArrayLike<number>;
  readonly y: ArrayLike<number>;
  readonly width: ArrayLike<number>;
  readonly height: ArrayLike<number>;
  readonly rotation: ArrayLike<number>;
  readonly opacity: ArrayLike<number>;

  readonly fill: ArrayLike<number>;
  readonly stroke: ArrayLike<number>;
  readonly strokeWidth: ArrayLike<number>;
  readonly radius: ArrayLike<number>;

  readonly text: readonly string[];
  readonly color: ArrayLike<number>;
  readonly fontSize: ArrayLike<number>;
  readonly fontFamily: readonly string[];
  readonly fontWeight: ArrayLike<number>;
  readonly align: ArrayLike<number>;
  readonly maxLines: ArrayLike<number>;

  readonly source: readonly string[];
  readonly tint: ArrayLike<number>;
  readonly fit: ArrayLike<number>;

  readonly value: ArrayLike<number>;
  readonly min: ArrayLike<number>;
  readonly max: ArrayLike<number>;
  readonly trackFill: ArrayLike<number>;

  /** Relation endpoints are dense slots; -1 denotes an unresolved endpoint. */
  readonly relationFrom: ArrayLike<number>;
  readonly relationTo: ArrayLike<number>;
  readonly lineWidth: ArrayLike<number>;

  readonly ids: readonly string[];
  readonly view: CoreView;
  readonly background: Rgba;

  /** Stable ascending z-index order, with slot as the deterministic tie-break. */
  renderOrder(): ArrayLike<number>;
}

export interface RendererFlushResult {
  readonly rendered: boolean;
  /** Canvas draw submissions, not logical entity count. */
  readonly commandCount: number;
}

export interface CoreRenderer {
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
  readonly destroyed: boolean;

  resize(width: number, height: number, pixelRatio?: number): boolean;
  setView(view: CoreView): boolean;
  flush(store: RenderStoreView): RendererFlushResult;
  destroy(): boolean;
}

export interface CanvasSurface {
  width: number;
  height: number;
  readonly style?: Pick<CSSStyleDeclaration, 'width' | 'height'>;
  getContext(
    contextId: '2d',
    options?: CanvasRenderingContext2DSettings,
  ): CanvasRenderingContext2D | null;
}

export interface CanvasRendererOptions {
  readonly width?: number;
  readonly height?: number;
  readonly pixelRatio?: number;
  readonly desynchronized?: boolean;
}
