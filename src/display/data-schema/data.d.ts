/**
 * 최상위 데이터 구조
 */
export type Data = Array<Group | Grid | Item | Relations>;

/**
 * Group 타입
 */
export interface Group {
  type: 'group';
  id: string;
  label?: string | null;
  show?: boolean; // 기본값: true
  zIndex?: number; // 기본값: 0
  metadata?: Record<string, unknown>; // 기본값: {}

  items: Array<Group | Grid | Item | Relations>;
}

/**
 * Grid 타입
 */
export interface Grid {
  type: 'grid';
  id: string;
  label?: string | null;
  show?: boolean; // 기본값: true
  zIndex?: number; // 기본값: 0
  metadata?: Record<string, unknown>; // 기본값: {}

  cells: Array<Array<0 | 1>>;
  components: components[];

  position?: {
    x?: number; // 기본값: 0
    y?: number; // 기본값: 0
  };
  size: {
    width: number;
    height: number;
  };
  rotation?: number; // 기본값: 0
}

/**
 * Item 타입
 */
export interface Item {
  type: 'item';
  id: string;
  label?: string | null;
  show?: boolean; // 기본값: true
  zIndex?: number; // 기본값: 0
  metadata?: Record<string, unknown>; // 기본값: {}

  components: components[];

  position?: {
    x?: number; // 기본값: 0
    y?: number; // 기본값: 0
  };
  size: {
    width: number;
    height: number;
  };
  rotation?: number; // 기본값: 0
}

/**
 * Relations 타입 (선/연결)
 */
export interface Relations {
  type: 'relations';
  id: string;
  label?: string | null;
  show?: boolean; // 기본값: true
  zIndex?: number; // 기본값: 0
  metadata?: Record<string, unknown>; // 기본값: {}

  links: Array<{ source: string; target: string }>;
  lineStyle?: Record<string, unknown>;
  alpha?: number; // 기본값: 1 (0~1)
}

/**
 * components 타입 (배경, 바, 아이콘, 텍스트)
 */
export type components =
  | BackgroundComponent
  | BarComponent
  | IconComponent
  | TextComponent;

/**
 * Background components
 */
export interface BackgroundComponent {
  type: 'background';
  show?: boolean; // 기본값: true
  label?: string | null; // 기본값: null
  zIndex?: number; // 기본값: 0

  texture: string;
  color?: string; // 기본값: '#FFFFFF'
}

/**
 * Bar components
 */
export interface BarComponent {
  type: 'bar';
  show?: boolean; // 기본값: true
  label?: string | null; // 기본값: null
  zIndex?: number; // 기본값: 0

  texture: string;
  color?: string; // 기본값: 'primary.default'
  placement?: Placement; // 기본값: 'bottom'
  percentWidth?: number; // 기본값: 1 (0~1)
  percentHeight?: number; // 기본값: 1 (0~1)
  margin?: string; // 기본값: '0',
  animation?: boolean; // 기본값: true
  animationDuration?: number; // 기본값: 200
}

/**
 * Icon components
 */
export interface IconComponent {
  type: 'icon';
  show?: boolean; // 기본값: true
  label?: string | null; // 기본값: null
  zIndex?: number; // 기본값: 0

  texture: string;
  color?: string; // 기본값: 'black'
  size: number; // 0 이상
  placement?: Placement; // 기본값: 'center'
  margin?: string; // 기본값: '0'
}

/**
 * Text components
 */
export interface TextComponent {
  type: 'text';
  show?: boolean; // 기본값: true
  label?: string | null; // 기본값: null
  zIndex?: number; // 기본값: 0

  placement?: Placement; // 기본값: 'center'
  content?: string; // 기본값: ''
  style?: Record<string, unknown>;
  split?: number; // 기본값: 0
  margin?: string; // 기본값: '0'
}

/**
 * 배치(placement)에 사용되는 문자열
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
