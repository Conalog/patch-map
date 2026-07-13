import type { ApplicationOptions, ColorSource, Container } from 'pixi.js';

/** Recursively optional data used by update and theme overrides. */
export type DeepPartial<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer U)[]
    ? DeepPartial<U>[]
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> }
      : T;

export interface Size {
  width: number;
  height: number;
}

export type FixedSize = number | Size;

export type ComponentLength =
  | number
  | `${number}%`
  | {
      value: number;
      unit: 'px' | '%';
    };

export type ComponentSize =
  | ComponentLength
  | {
      width: ComponentLength;
      height: ComponentLength;
    };

export interface AxisSpacing {
  x?: number;
  y?: number;
}

export interface BoxSpacing extends AxisSpacing {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

export type Spacing = number | BoxSpacing;
export type Gap = number | AxisSpacing;
export type FitPadding = number | AxisSpacing;

export type Placement =
  | 'left'
  | 'left-top'
  | 'left-bottom'
  | 'top'
  | 'right'
  | 'right-top'
  | 'right-bottom'
  | 'bottom'
  | 'center'
  | 'none';

export type ContentOrientation = 'upright' | 'follow-item';
export type InactiveCellStrategy = 'destroy' | 'hide';

/**
 * The approved contract names x/y/angle/rotation explicitly. Other public
 * attrs remain open until their exact accepted values are captured.
 */
export interface ElementAttributes {
  x?: number;
  y?: number;
  angle?: number;
  rotation?: number;
  [attribute: string]: unknown;
}

export interface TextStyleInput {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string | number;
  fill?: ColorSource;
  letterSpacing?: number;
  wordWrap?: boolean;
  overflow?: string;
  [styleProperty: string]: unknown;
}

export interface StrokeStyleInput {
  color?: ColorSource;
  width?: number;
  alpha?: number;
  [styleProperty: string]: unknown;
}

export interface RectangleTextureStyle {
  type: 'rect';
  fill?: ColorSource;
  borderWidth?: number;
  borderColor?: ColorSource;
  radius?: number;
}

/** A strict inline source descriptor; public aliases belong in init assets. */
export interface AssetSourceDescriptor {
  src: string;
  data?: unknown;
  format?: string;
  parser?: string;
  /** @deprecated Accepted for PATCH MAP v0.10 compatibility. */
  loadParser?: string;
}

export type AssetSource = string | AssetSourceDescriptor;
export type DrawableSource = AssetSource | RectangleTextureStyle;

export interface BaseElementData {
  id?: string;
  label?: string;
  show?: boolean;
  locked?: boolean;
  attrs?: ElementAttributes;
}

export interface GroupElementData extends BaseElementData {
  type: 'group';
  children: MapData;
}

export type GridCell = 0 | 1 | string;

export interface GridItemData {
  size: FixedSize;
  components?: ItemComponentData[];
  padding?: Spacing;
  contentOrientation?: ContentOrientation;
}

export interface GridElementData extends BaseElementData {
  type: 'grid';
  cells: GridCell[][];
  item: GridItemData;
  gap?: Gap;
  inactiveCellStrategy?: InactiveCellStrategy;
}

export interface ItemElementData extends BaseElementData {
  type: 'item';
  size: FixedSize;
  components?: ItemComponentData[];
  padding?: Spacing;
  contentOrientation?: ContentOrientation;
}

/** The approved handoff does not yet specify the public relation-link shape. */
export type RelationLink = unknown;

export interface RelationsElementData extends BaseElementData {
  type: 'relations';
  links: RelationLink[];
  style?: StrokeStyleInput;
}

export interface ImageElementData extends BaseElementData {
  type: 'image';
  source: AssetSource;
  size?: FixedSize;
}

export interface TextElementData extends BaseElementData {
  type: 'text';
  text?: string;
  style?: TextStyleInput;
}

export interface RectElementData extends BaseElementData {
  type: 'rect';
  size: FixedSize;
  fill?: ColorSource;
  stroke?: ColorSource | StrokeStyleInput;
  radius?: number;
}

export type ElementKind = MapElementData['type'];

export type MapElementData =
  | GroupElementData
  | GridElementData
  | ItemElementData
  | RelationsElementData
  | ImageElementData
  | TextElementData
  | RectElementData;

export type MapData = MapElementData[];

export interface BaseComponentData {
  id?: string;
  label?: string;
  show?: boolean;
  tint?: ColorSource;
  attrs?: ElementAttributes;
}

export interface BackgroundComponentData extends BaseComponentData {
  type: 'background';
  source: DrawableSource;
}

export interface BarComponentData extends BaseComponentData {
  type: 'bar';
  source: DrawableSource;
  size: ComponentSize;
  placement?: Placement;
  margin?: Spacing;
  animation?: boolean;
  animationDuration?: number;
}

export interface IconComponentData extends BaseComponentData {
  type: 'icon';
  source: AssetSource;
  size: ComponentSize;
  placement?: Placement;
  margin?: Spacing;
}

export interface TextComponentData extends BaseComponentData {
  type: 'text';
  text?: string;
  style?: TextStyleInput;
  placement?: Placement;
  margin?: Spacing;
  split?: number;
}

export type ItemComponentData =
  | BackgroundComponentData
  | BarComponentData
  | IconComponentData
  | TextComponentData;

export type ComponentKind = ItemComponentData['type'];
export type PublicNodeData = MapElementData | ItemComponentData;

/**
 * The current handoff confirms that draw accepts a legacy object, but does not
 * expose that object's field-level schema.
 */
export type LegacyMapData = Readonly<Record<string, unknown>>;
export type DrawInput = MapData | LegacyMapData;
export type DrawResult = MapData | undefined;

export type MaterializedElementProps<T extends MapElementData = MapElementData> =
  T & {
    id: string;
    show: boolean;
    locked: boolean;
  };

export type MaterializedComponentProps<
  T extends ItemComponentData = ItemComponentData,
> = T & {
  id: string;
  show: boolean;
};

export type PublicElementHandle<
  T extends MapElementData = MapElementData,
> = Container & {
  id: string;
  type: T['type'];
  label?: string;
  props: MaterializedElementProps<T>;
};

export type PublicComponentHandle<
  T extends ItemComponentData = ItemComponentData,
> = Container & {
  id: string;
  type: T['type'];
  label?: string;
  props: MaterializedComponentProps<T>;
};

export type PublicDisplayHandle = PublicElementHandle | PublicComponentHandle;

export type SelectorPath = string;

/** Selector option fields are not enumerated by the approved v0.10 contract. */
export interface SelectorOptions {
  [option: string]: unknown;
}

export interface SelectorInput {
  path: SelectorPath;
  options?: SelectorOptions;
}

export type SelectorResult<T = PublicDisplayHandle> = T[];

export type MergeStrategy = 'merge' | 'replace';
export type UpdateHistory = boolean | string;
export type UpdateChanges = DeepPartial<PublicNodeData>;

export interface UpdateOptions<TElement = PublicDisplayHandle> {
  path?: SelectorPath;
  elements?: TElement | TElement[];
  changes?: UpdateChanges;
  mergeStrategy?: MergeStrategy;
  refresh?: boolean;
  relativeTransform?: boolean;
  rotateOrigin?: 'center';
  history?: UpdateHistory;
  validateSchema?: boolean;
  normalize?: boolean;
  emit?: boolean;
}

export type UpdateResult<TElement = PublicDisplayHandle> = TElement[];

export interface PatchmapTheme {
  primary: {
    default: ColorSource;
    dark: ColorSource;
    accent: ColorSource;
  };
  gray: {
    light: ColorSource;
    default: ColorSource;
    dark: ColorSource;
  };
  white: ColorSource;
  black: ColorSource;
}

export interface PatchmapViewportPluginOptions {
  disabled?: boolean;
  [option: string]: unknown;
}

export interface PatchmapViewportOptions {
  passiveWheel?: boolean;
  plugins?: Record<string, PatchmapViewportPluginOptions>;
  [option: string]: unknown;
}

/** Pixi bundle definitions or individual alias/source definitions. */
export type PatchmapAssets =
  | Readonly<Record<string, unknown>>
  | readonly Readonly<Record<string, unknown>>[];

export interface PatchmapInitOptions<TTransformer = unknown> {
  app?: ApplicationOptions;
  viewport?: PatchmapViewportOptions;
  theme?: DeepPartial<PatchmapTheme>;
  assets?: PatchmapAssets;
  transformer?: TTransformer;
}

export type PatchmapOptions<TTransformer = unknown> =
  PatchmapInitOptions<TTransformer>;

export type FocusIds = string | string[] | null | undefined;
export type FocusFilter<TElement = PublicElementHandle> = (
  element: TElement,
) => unknown;

export interface FocusOptions<TElement = PublicElementHandle> {
  filter?: FocusFilter<TElement>;
}

export interface FitOptions<TElement = PublicElementHandle>
  extends FocusOptions<TElement> {
  padding?: FitPadding;
}

export interface CanvasEventAddOptions<TEvent = unknown> {
  id?: string;
  path: SelectorPath;
  action: string;
  fn: (event: TEvent) => unknown;
}

export interface PatchmapTargetEventPayload<TTarget = unknown> {
  target: TTarget;
}

export interface PatchmapDrawEventPayload<TTarget = unknown>
  extends PatchmapTargetEventPayload<TTarget> {
  /** The defaults-materialized data returned by the successful draw. */
  data: MapData;
}

export interface PatchmapUpdatedEventPayload<
  TTarget = unknown,
  TElement = PublicDisplayHandle,
> extends PatchmapTargetEventPayload<TTarget> {
  elements: TElement[];
}

/**
 * Rotated/flipped payload fields are intentionally unknown: only their public
 * names are documented in the approved handoff.
 */
export interface PatchmapEventMap<
  TTarget = unknown,
  TElement = PublicDisplayHandle,
> {
  'patchmap:initialized': PatchmapTargetEventPayload<TTarget>;
  'patchmap:draw': PatchmapDrawEventPayload<TTarget>;
  'patchmap:updated': PatchmapUpdatedEventPayload<TTarget, TElement>;
  'patchmap:destroyed': PatchmapTargetEventPayload<TTarget>;
  'patchmap:rotated': unknown;
  'patchmap:flipped': unknown;
}

export type PatchmapEventName = keyof PatchmapEventMap;
export type PatchmapEventPayload<
  TName extends PatchmapEventName,
  TTarget = unknown,
  TElement = PublicDisplayHandle,
> = PatchmapEventMap<TTarget, TElement>[TName];
