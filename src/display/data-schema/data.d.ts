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
  size: {
    width: number;
    height: number;
  };
  rotation?: number; // default: 0
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
  rotation?: number; // default: 0
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
  texture: string;
  tint?: string; // default: '#FFFFFF'
}

/**
 * Bar components
 */
export interface BarComponent extends BaseObject {
  type: 'bar';
  show?: boolean; // default: true
  texture: string;
  tint?: string; // default: 'primary.default'

  placement?: Placement; // default: 'bottom'
  percentWidth?: number; // default: 1 (0~1)
  percentHeight?: number; // default: 1 (0~1)
  margin?: string; // default: '0'
  animation?: boolean; // default: true
  animationDuration?: number; // default: 200
}

/**
 * Icon components
 */
export interface IconComponent extends BaseObject {
  type: 'icon';
  show?: boolean; // default: true
  texture: string;
  tint?: string; // default: 'black'

  placement?: Placement; // default: 'center'
  size: number; // 0 or higher
  margin?: string; // default: '0'
}

/**
 * Text components
 */
export interface TextComponent extends BaseObject {
  type: 'text';
  show?: boolean; // default: true

  placement?: Placement; // default: 'center'
  text?: string; // default: ''
  style?: Record<string, unknown>;
  split?: number; // default: 0
  margin?: string; // default: '0'
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
