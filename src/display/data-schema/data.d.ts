/**
 * data.d.ts
 *
 * This file contains TypeScript type definitions generated from the Zod schemas
 * to help library users easily understand the required data structure.
 * For readability, each interface explicitly includes all its properties
 * rather than using 'extends'.
 */

//================================================================================
// 1. Top-Level Data Structure
//================================================================================

/**
 * The root structure of the entire map data, which is an array of Element objects.
 *
 * @example
 * const mapData: MapData = [
 *   { type: 'grid', id: 'g1', ... },
 *   { type: 'item', id: 'i1', ... },
 *   { type: 'relations', id: 'r1', ... },
 * ];
 */
export type MapData = Element[];

/**
 * A union type of all possible top-level elements that constitute the map data.
 * The specific type of element is determined by the 'type' property.
 */
export type Element = Group | Grid | Item | Relations;

//================================================================================
// 2. Element Types (from element-schema.js)
//================================================================================

/**
 * Groups multiple elements to apply common properties.
 * You can specify coordinates (x, y) for the entire group via 'attrs'.
 * @see {@link https://pixijs.download/release/docs/scene.Container.html}
 *
 * @example
 * {
 *   type: 'group',
 *   id: 'group-api-servers',
 *   children: [
 *     { type: 'item', id: 'server-1', width: 80, height: 80 },
 *     { type: 'item', id: 'server-2', width: 80, height: 80 }
 *   ]
 *   attrs: { x: 100, y: 50 },
 * }
 */
export interface Group {
  type: 'group';
  id: string;
  show?: boolean; // Default: true
  children: Element[];
  attrs?: Record<string, unknown>;
}

/**
 * Lays out items in a grid format.
 * The visibility of an item is determined by 1 or 0 in the 'cells' array.
 * @see {@link https://pixijs.download/release/docs/scene.Container.html}
 *
 * @example
 * {
 *   type: 'grid',
 *   id: 'server-rack',
 *   gap: 10,
 *   cells: [
 *     [1, 1, 0],
 *     [1, 0, 1]
 *   ],
 *   item: {
 *     width: 60,
 *     height: 60,
 *     components: [
 *       { type: 'background', source: { fill: '#eee', radius: 4 } }
 *     ]
 *   }
 * }
 */
export interface Grid {
  type: 'grid';
  id: string;
  show?: boolean; // Default: true
  cells: (0 | 1)[][];
  gap?: Gap;
  item: {
    width: number;
    height: number;
    components?: Component[];
  };
  attrs?: Record<string, unknown>;
}

/**
 * The most basic single element that constitutes the map.
 * It contains various components (Background, Text, Icon, etc.) to form its visual representation.
 * @see {@link https://pixijs.download/release/docs/scene.Container.html}
 *
 * @example
 * {
 *   type: 'item',
 *   id: 'main-server',
 *   width: 120,
 *   height: 100,
 *   components: [
 *     { type: 'background', source: { fill: '#fff', borderColor: '#ddd', borderWidth: 1 } },
 *     { type: 'text', text: 'Main Server', placement: 'top', margin: 8 },
 *     { type: 'bar', source: { fill: 'lightblue' }, width: '80%', height: 8 },
 *     { type: 'icon', source: 'ok.svg', size: 16, placement: 'bottom-right', margin: 4 }
 *   ]
 *   attrs: { x: 300, y: 150 },
 * }
 */
export interface Item {
  type: 'item';
  id: string;
  show?: boolean; // Default: true
  width: number;
  height: number;
  components?: Component[];
  attrs?: Record<string, unknown>;
}

/**
 * Represents relationships between elements by connecting them with lines.
 * Specify the IDs of the elements to connect in the 'links' array.
 * @see {@link https://pixijs.download/release/docs/scene.Container.html}
 *
 * @example
 * {
 *   type: 'relations',
 *   id: 'server-connections',
 *   links: [
 *     { source: 'main-server', target: 'sub-server-1' },
 *     { source: 'main-server', target: 'sub-server-2' }
 *   ],
 *   style: { color: '#083967', width: 2 }
 * }
 */
export interface Relations {
  type: 'relations';
  id: string;
  show?: boolean; // Default: true
  links: { source: string; target: string }[];
  style?: RelationsStyle;
  attrs?: Record<string, unknown>;
}

//================================================================================
// 3. Component Types (from component-schema.js)
//================================================================================

/**
 * A union type for all visual components that can be included inside an Item.
 */
export type Component = Background | Bar | Icon | Text;

/**
 * An Item's background, sourced from a style object or an asset URL.
 * @see {@link https://pixijs.download/release/docs/scene.NineSliceSprite.html}
 *
 * @example
 * // As a style object
 * {
 *   type: 'background',
 *   source: { fill: '#1A1A1A', radius: 8 }
 * }
 *
 * @example
 * // As an image URL
 * {
 *   type: 'background',
 *   source: 'path/to/background-image.png'
 * }
 */
export interface Background {
  type: 'background';
  id: string;
  show?: boolean; // Default: true
  source: TextureStyle | string;
  attrs?: Record<string, unknown>;
}

/**
 * A component for progress bars or bar graphs.
 * @see {@link https://pixijs.download/release/docs/scene.NineSliceSprite.html}
 *
 * @example
 * {
 *   type: 'bar',
 *   source: { fill: 'green' },
 *   width: '80%', // 80% of the parent Item's width
 *   height: 10,   // 10px height
 *   placement: 'bottom'
 * }
 */
export interface Bar {
  type: 'bar';
  id: string;
  show?: boolean; // Default: true
  source: TextureStyle;
  width?: PxOrPercent;
  height?: PxOrPercent;
  size?: PxOrPercent;
  placement?: Placement; // Default: 'bottom'
  margin?: Margin; // Default: 0
  animation?: boolean; // Default: true
  animationDuration?: number; // Default: 200
  attrs?: Record<string, unknown>;
}

/**
 * A component for displaying an icon image.
 * @see {@link https://pixijs.download/release/docs/scene.Sprite.html}
 *
 * @example
 * {
 *   type: 'icon',
 *   source: 'path/to/warning-icon.svg',
 *   size: 24, // 24px x 24px
 *   placement: 'left-top',
 *   margin: { x: 4, y: 4 }
 * }
 */
export interface Icon {
  type: 'icon';
  id: string;
  show?: boolean; // Default: true
  source: string;
  width?: PxOrPercent;
  height?: PxOrPercent;
  size?: PxOrPercent;
  placement?: Placement; // Default: 'center'
  margin?: Margin; // Default: 0
  attrs?: Record<string, unknown>;
}

/**
 * A text label component.
 * @see {@link https://pixijs.download/release/docs/scene.BitmapText.html}
 *
 * @example
 * {
 *   type: 'text',
 *   text: 'CPU Usage',
 *   placement: 'center',
 *   style: { fill: '#333', fontSize: 14, fontWeight: 'bold' }
 * }
 */
export interface Text {
  type: 'text';
  id: string;
  show?: boolean; // Default: true
  text?: string; // Default: ''
  placement?: Placement; // Default: 'center'
  margin?: Margin; // Default: 0
  style?: TextStyle;
  split?: number; // Default: 0
  attrs?: Record<string, unknown>;
}

//================================================================================
// 4. Primitive & Utility Types (from primitive-schema.js)
//================================================================================

/**
 * A value that can be specified in pixels (number), as a percentage (string),
 * or as an object with value and unit.
 *
 * @example
 * // For a 100px width:
 * width: 100
 *
 * @example
 * // For a 75% height:
 * height: '75%'
 *
 * @example
 * // As an object:
 * size: { value: 50, unit: '%' }
 */
export type PxOrPercent = number | string | { value: number; unit: 'px' | '%' };

/**
 * Specifies the position of a component within its parent Item.
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
 * Defines the gap between cells in a Grid.
 *
 * @example
 * // To set a 10px gap for both x and y:
 * gap: 10
 *
 * @example
 * // To set a 5px horizontal and 15px vertical gap:
 * gap: { x: 5, y: 15 }
 */
export type Gap =
  | number
  | {
      x?: number; // Default: 0
      y?: number; // Default: 0
    };

/**
 * Defines the margin around a component.
 *
 * @example
 * // To apply a 10px margin on all four sides:
 * margin: 10
 *
 * @example
 * // To apply 10px top/bottom and 5px left/right margins:
 * margin: { y: 10, x: 5 }
 *
 * @example
 * // To apply individual margins for each side:
 * margin: { top: 1, right: 2, bottom: 3, left: 4 }
 */
export type Margin =
  | number
  | { x?: number; y?: number }
  | { top?: number; right?: number; bottom?: number; left?: number };

/**
 * Defines the style for a rectangular texture, used for backgrounds, bars, etc.
 * All properties are optional.
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

/**
 * Defines the line style for a Relations element.
 * You can pass an object similar to PIXI.Graphics' lineStyle options.
 * @see {@link https://pixijs.download/release/docs/scene.ConvertedStrokeStyle.html}
 *
 * @example
 * {
 *   color: 'red',
 *   width: 2,
 *   cap: 'square'
 * }
 */
export type RelationsStyle = Record<string, unknown>;

/**
 * Defines the text style for a Text component.
 * You can pass an object similar to PIXI.TextStyle options.
 *
 * Defaults: `{ fontFamily: 'FiraCode', fontWeight: 400, fill: 'black' }`
 *
 * @see {@link https://pixijs.download/release/docs/text.TextStyleOptions.html}
 *
 * @example
 * {
 *   fontFamily: 'Arial',
 *   fontSize: 24,
 *   fill: 'white',
 *   stroke: { color: 'black', width: 2 }
 * }
 */
export type TextStyle = Record<string, unknown>;
