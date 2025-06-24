/**
 * data.d.ts
 *
 * This file contains TypeScript definitions generated from the Zod schemas.
 * It is designed for developers to understand the data structure they need to provide.
 * All properties are explicitly defined in each interface for readability,
 * avoiding the need to trace `extends` clauses.
 */

//================================================================================
// 1. Top-Level Data Structure
//================================================================================

/**
 * The root of the map data, which is an array of elements.
 *
 * @example
 * const mapData: MapData = [
 *   { type: 'grid', id: 'grid1', ... },
 *   { type: 'item', id: 'item1', ... },
 *   { type: 'relations', id: 'rels1', ... }
 * ];
 */
export type MapData = Element[];

/**
 * A discriminated union of all possible root-level elements.
 * The `type` property is used to determine the specific element type.
 */
export type Element = Group | Grid | Item | Relations;

//================================================================================
// 2. Element Types (from element-schema.js)
//================================================================================

/**
 * Groups a collection of other elements, applying a position to all children.
 *
 * @example
 * {
 *   type: 'group',
 *   id: 'group1',
 *   x: 100,
 *   y: 200,
 *   children: [
 *     { type: 'item', id: 'childItem', width: 50, height: 50, components: [] }
 *   ]
 * }
 */
export interface Group {
  type: 'group';
  id: string;
  show?: boolean; // Default: true
  x?: number; // Default: 0
  y?: number; // Default: 0
  children: Element[];
  [key: string]: unknown; // Allows other properties
}

/**
 * Creates a grid layout of items based on a template.
 *
 * @example
 * {
 *   type: 'grid',
 *   id: 'grid1',
 *   cells: [[1, 1, 0], [1, 0, 1]],
 *   gap: 10,
 *   itemTemplate: {
 *     width: 64,
 *     height: 64,
 *     components: [
 *       { type: 'background', id: 'bg-tpl', source: { fill: '#eee', radius: 4 } },
 *       { type: 'icon', id: 'icon-tpl', source: 'default.svg', size: '50%' }
 *     ]
 *   }
 * }
 */
export interface Grid {
  type: 'grid';
  id: string;
  show?: boolean; // Default: true
  x?: number; // Default: 0
  y?: number; // Default: 0
  cells: (0 | 1)[][];
  gap: Gap;
  itemTemplate: {
    components: Component[];
    width: number;
    height: number;
  };
  [key: string]: unknown; // Allows other properties
}

/**
 * A single, placeable item that contains visual components.
 *
 * @example
 * {
 *   type: 'item',
 *   id: 'server1',
 *   x: 50,
 *   y: 50,
 *   width: 120,
 *   height: 100,
 *   components: [
 *     { type: 'background', id: 'bg1', source: { fill: '#fff', borderColor: '#ddd', borderWidth: 1 } },
 *     { type: 'text', id: 'label1', text: 'Main Server', placemnet: 'top', margin: 8 },
 *     { type: 'bar', id: 'cpu-bar', source: { fill: 'lightblue' }, width: '80%', height: 8, y: 40 },
 *     { type: 'icon', id: 'status-icon', source: 'ok.svg', size: 16, placemnet: 'bottom-right', margin: 4 }
 *   ]
 * }
 */
export interface Item {
  type: 'item';
  id: string;
  show?: boolean; // Default: true
  x?: number; // Default: 0
  y?: number; // Default: 0
  width: number;
  height: number;
  components: Component[];
  [key: string]: unknown; // Allows other properties
}

/**
 * Defines visual links between elements.
 *
 * @example
 * {
 *   type: 'relations',
 *   id: 'relations1',
 *   links: [
 *     { source: 'server1', target: 'server2' },
 *     { source: 'server1', target: 'switch1' }
 *   ],
 *   style: { color: 'rgba(0,0,255,0.5)', width: 2 }
 * }
 */
export interface Relations {
  type: 'relations';
  id: string;
  show?: boolean; // Default: true
  links: { source: string; target: string }[];
  style?: Record<string, unknown>; // Corresponds to PIXI.ConvertedStrokeStyle
  [key: string]: unknown; // Allows other properties
}

//================================================================================
// 3. Component Types (from component-schema.js)
//================================================================================

/**
 * A discriminated union of all possible visual components within an Item.
 */
export type Component = Background | Bar | Icon | Text;

/**
 * A background for an item. The source can be a color/style object or an image URL.
 *
 * @example
 * // Provide a style object
 * {
 *   type: 'background',
 *   id: 'bg1',
 *   source: { fill: 'rgba(0,0,0,0.1)', radius: 8 }
 * }
 *
 * @example
 * // Provide an image URL
 * {
 *   type: 'background',
 *   id: 'bg2',
 *   source: 'bg.png'
 * }
 */
export interface Background {
  type: 'background';
  id: string;
  show?: boolean; // Default: true
  source: TextureStyle | string;
  [key: string]: unknown; // Allows other properties
}

/**
 * A progress bar or indicator.
 *
 * @example
 * {
 *   type: 'bar',
 *   id: 'bar1',
 *   source: { fill: 'green' },
 *   width: '80%', // 80% of the parent item's width
 *   height: 10,   // 10 pixels high
 *   placemnet: 'bottom'
 * }
 */
export interface Bar {
  type: 'bar';
  id: string;
  show?: boolean; // Default: true
  x?: number; // Default: 0
  y?: number; // Default: 0
  width: PxOrPercent;
  height: PxOrPercent;
  source: TextureStyle;
  placemnet?: Placement; // Default: 'bottom'
  margin?: Margin; // Default: 0
  animation?: boolean; // Default: true
  animationDuration?: number; // Default: 200
  [key: string]: unknown; // Allows other properties
}

/**
 * An icon image.
 *
 * @example
 * {
 *   type: 'icon',
 *   id: 'icon1',
 *   source: 'warning.svg',
 *   size: 24, // 24px
 *   placemnet: 'left-top',
 *   margin: { x: 4, y: 4 }
 * }
 */
export interface Icon {
  type: 'icon';
  id: string;
  show?: boolean; // Default: true
  x?: number; // Default: 0
  y?: number; // Default: 0
  source: string;
  placemnet?: Placement; // Default: 'center'
  margin?: Margin; // Default: 0
  size?: PxOrPercent;
  [key: string]: unknown; // Allows other properties
}

/**
 * A text label.
 *
 * @example
 * {
 *   type: 'text',
 *   id: 'text1',
 *   text: 'Hello World',
 *   placemnet: 'center',
 *   style: { fill: '#333', fontSize: 14, fontWeight: 'bold' }
 * }
 */
export interface Text {
  type: 'text';
  id: string;
  show?: boolean; // Default: true
  x?: number; // Default: 0
  y?: number; // Default: 0
  placemnet?: Placement; // Default: 'center'
  margin?: Margin; // Default: 0
  text?: string; // Default: ''
  style?: Record<string, unknown>; // Corresponds to PIXI.TextStyle
  split?: number; // Default: 0
  [key: string]: unknown; // Allows other properties
}

//================================================================================
// 4. Primitive & Utility Types (from primitive-schema.js)
//================================================================================

/**
 * A value that can be specified in pixels (number) or as a percentage (string).
 *
 * @example
 * // For a 100px width:
 * width: 100
 *
 * @example
 * // For a 75% height:
 * height: '75%'
 */
export type PxOrPercent = number | string;

/**
 * Defines the placement of a component within its parent item.
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
  | 'center'
  | 'none';

/**
 * Defines the gap between grid cells.
 *
 * @example
 * // To apply a 10px gap for both x and y:
 * gap: 10
 *
 * @example
 * // To apply a 5px horizontal and 15px vertical gap:
 * gap: { x: 5, y: 15 }
 */
export type Gap =
  | number
  | {
      x?: number; // Default: 0
      y?: number; // Default: 0
    };

/**
 * Defines margin around a component.
 *
 * @example
 * // To apply a 10px margin to all four sides:
 * margin: 10
 *
 * @example
 * // To apply 10px top/bottom and 5px left/right margins:
 * margin: { y: 10, x: 5 }
 *
 * @example
 * // To apply margins for each side individually:
 * margin: { top: 1, right: 2, bottom: 3, left: 4 }
 */
export type Margin =
  | number
  | {
      x?: number;
      y?: number;
    }
  | {
      top?: number;
      right?: number;
      bottom?: number;
      left?: number;
    };

/**
 * Defines the visual style of a rectangular texture. All properties are optional.
 *
 * @example
 * const style: TextureStyle = {
 *   fill: '#ff0000',
 *   borderWidth: 2,
 *   borderColor: '#000000',
 *   radius: 5
 * }
 */
export interface TextureStyle {
  type?: 'rect';
  fill?: string | null;
  borderWidth?: number | null;
  borderColor?: string | null;
  radius?: number | null;
}
