import type { PatchMapRadius } from '../semantic/dataset';

/** Backend-neutral color input accepted by PatchMap data and style APIs. */
export type PatchMapColorSource =
  | string
  | number
  | number[]
  | Float32Array
  | Uint8Array
  | Uint8ClampedArray
  | Readonly<{ r: number; g: number; b: number; a?: number }>
  | Readonly<{ h: number; s: number; l: number; a?: number }>
  | Readonly<{ h: number; s: number; v: number; a?: number }>;

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
  | 'center';

export type ContentOrientation = 'upright' | 'follow-item';
export type InactiveCellStrategy = 'destroy' | 'hide';

/** Canonical transforms plus host-owned metadata attributes. */
export interface ElementAttributes {
  x?: number;
  y?: number;
  angle?: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  scale?: never;
  skew?: never;
  pivot?: never;
  skewX?: never;
  skewY?: never;
  pivotX?: never;
  pivotY?: never;
  [attribute: string]: unknown;
}

export interface TextStyleInput {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string | number;
  fill?: PatchMapColorSource;
  align?: 'left' | 'center' | 'right' | 'justify';
  letterSpacing?: number;
  wordWrap?: boolean;
  wordWrapWidth?: number;
  autoFont?: {
    min?: number;
    max?: number;
  };
  overflow?: string;
  [styleProperty: string]: unknown;
}

export interface StrokeStyleInput {
  color?: PatchMapColorSource;
  width?: number;
  alpha?: number;
  [styleProperty: string]: unknown;
}

/** The complete style surface projected by relation rendering. */
export interface RelationStyleInput {
  color?: PatchMapColorSource;
  width?: number;
  alpha?: number;
}

export interface RectangleTextureStyle {
  type: 'rect';
  fill?: PatchMapColorSource;
  borderWidth?: number;
  borderColor?: PatchMapColorSource;
  radius?: PatchMapRadius;
}

/** A strict inline source descriptor; public aliases belong in init assets. */
export interface AssetSourceDescriptor {
  src: string;
  data?: unknown;
  format?: string;
  parser?: string;
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

export type RelationEndpoint = string;

export interface RelationLink {
  source: RelationEndpoint;
  target: RelationEndpoint;
}

export interface RelationsElementData extends BaseElementData {
  type: 'relations';
  links: RelationLink[];
  style?: RelationStyleInput;
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
  fill?: PatchMapColorSource;
  stroke?: PatchMapColorSource | StrokeStyleInput;
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
  tint?: PatchMapColorSource;
  attrs?: ElementAttributes;
}

export interface BackgroundComponentData extends BaseComponentData {
  type: 'background';
  source: DrawableSource;
  /**
   * Accepted for v0.10/1.0 input compatibility but ignored. Backgrounds always
   * fill their owning item.
   * @deprecated Omit this field.
   */
  size?: ComponentSize;
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
