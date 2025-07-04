/**
 * An interface for extended properties that can be commonly applied to all objects.
 */
export interface BaseObject {
  [key: string]: unknown;
}

/**
 * Top-level data structure
 */
export type Data = Array<Group | Grid | Item | Relations>;

/**
 * Group Type
 */
export interface Group extends BaseObject {
  type: 'group';
  id: string;
  show?: boolean; // default: true
  metadata?: Record<string, unknown>; // default: {}

  items: Array<Group | Grid | Item | Relations>;
}

/**
 * Grid Type
 */
export interface Grid extends BaseObject {
  type: 'grid';
  id: string;
  show?: boolean; // default: true
  metadata?: Record<string, unknown>; // default: {}

  cells: Array<Array<0 | 1>>;
  components: components[];

  position?: {
    x?: number; // default: 0
    y?: number; // default: 0
  };
  itemSize: {
    width: number;
    height: number;
  };
}

/**
 * Item Type
 */
export interface Item extends BaseObject {
  type: 'item';
  id: string;
  show?: boolean; // default: true
  metadata?: Record<string, unknown>; // default: {}

  components: components[];

  position?: {
    x?: number; // default: 0
    y?: number; // default: 0
  };
  size: {
    width: number;
    height: number;
  };
}

/**
 * Relations Type
 */
export interface Relations extends BaseObject {
  type: 'relations';
  id: string;
  show?: boolean; // default: true
  metadata?: Record<string, unknown>; // default: {}

  links: Array<{ source: string; target: string }>;
  strokeStyle?: Record<string, unknown>;
}

/**
 * components Type (background, bar, icon, text)
 */
export type components =
  | BackgroundComponent
  | BarComponent
  | IconComponent
  | TextComponent;

/**
 * Background components
 */
export interface BackgroundComponent extends BaseObject {
  type: 'background';
  show?: boolean; // default: true
  texture: TextureStyle;
}

/**
 * Bar components
 */
export interface BarComponent extends BaseObject {
  type: 'bar';
  show?: boolean; // default: true
  texture: TextureStyle;

  placement?: Placement; // default: 'bottom'
  margin?: string; // default: '0', ('4 2', '2 1 3 4')
  percentWidth?: number; // default: 1 (0~1)
  percentHeight?: number; // default: 1 (0~1)
  animation?: boolean; // default: true
  animationDuration?: number; // default: 200
}

/**
 * Icon components
 */
export interface IconComponent extends BaseObject {
  type: 'icon';
  show?: boolean; // default: true
  asset: string; // object, inverter, combiner, edge, device, loading, warning, wifi, etc.

  placement?: Placement; // default: 'center'
  margin?: string; // default: '0', ('4 2', '2 1 3 4')
  size: number; // 0 or higher
}

/**
 * Text components
 */
export interface TextComponent extends BaseObject {
  type: 'text';
  show?: boolean; // default: true

  placement?: Placement; // default: 'center'
  margin?: string; // default: '0', ('4 2', '2 1 3 4')
  text?: string; // default: ''
  style?: Record<string, unknown>;
  split?: number; // default: 0
}

/**
 * String used for placement
 */
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

export type TextureType = 'rect';
export interface TextureStyle {
  type?: TextureType;
  fill?: string | null;
  borderWidth?: number | null;
  borderColor?: string | null;
  radius?: number | null;
}
