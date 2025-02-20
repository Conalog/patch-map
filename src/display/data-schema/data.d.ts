/**
 * 모든 객체에 공통으로 들어갈 수 있는 확장 속성용 인터페이스
 */
export interface BaseObject {
  [key: string]: unknown;
}

/**
 * 최상위 데이터 구조
 */
export type Data = Array<Group | Grid | Item | Relations>;

/**
 * Group 타입
 */
export interface Group extends BaseObject {
  type: 'group';
  id: string;
  show?: boolean; // 기본값: true
  metadata?: Record<string, unknown>; // 기본값: {}

  items: Array<Group | Grid | Item | Relations>;
}

/**
 * Grid 타입
 */
export interface Grid extends BaseObject {
  type: 'grid';
  id: string;
  show?: boolean; // 기본값: true
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
export interface Item extends BaseObject {
  type: 'item';
  id: string;
  show?: boolean; // 기본값: true
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
export interface Relations extends BaseObject {
  type: 'relations';
  id: string;
  show?: boolean; // 기본값: true
  metadata?: Record<string, unknown>; // 기본값: {}

  links: Array<{ source: string; target: string }>;
  lineStyle?: Record<string, unknown>;
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
export interface BackgroundComponent extends BaseObject {
  type: 'background';
  show?: boolean; // 기본값: true
  texture: string;
  color?: string; // 기본값: '#FFFFFF'
}

/**
 * Bar components
 */
export interface BarComponent extends BaseObject {
  type: 'bar';
  show?: boolean; // 기본값: true
  texture: string;
  color?: string; // 기본값: 'primary.default'
  placement?: Placement; // 기본값: 'bottom'
  percentWidth?: number; // 기본값: 1 (0~1)
  percentHeight?: number; // 기본값: 1 (0~1)
  margin?: string; // 기본값: '0'
  animation?: boolean; // 기본값: true
  animationDuration?: number; // 기본값: 200
}

/**
 * Icon components
 */
export interface IconComponent extends BaseObject {
  type: 'icon';
  show?: boolean; // 기본값: true
  texture: string;
  color?: string; // 기본값: 'black'
  size: number; // 0 이상
  placement?: Placement; // 기본값: 'center'
  margin?: string; // 기본값: '0'
}

/**
 * Text components
 */
export interface TextComponent extends BaseObject {
  type: 'text';
  show?: boolean; // 기본값: true
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
