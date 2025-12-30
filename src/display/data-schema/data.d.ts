/**
 * data.d.ts
 *
 * This file contains TypeScript type definitions generated from the Zod schemas
 * to help library users easily understand the required data structure.
 * For readability, each interface explicitly includes all its properties
 * rather than using 'extends'.
 */

import type {
  HslColor,
  HslaColor,
  HsvColor,
  HsvaColor,
  Color as PixiColor,
  RgbColor,
  RgbaColor,
} from './color';

//================================================================================
// 1. Top-Level Data Structure
//================================================================================

/**
 * The root structure of the entire map data, which is an array of Element objects.
 *
 * @example
 * const mapData: MapData = [
 *   { type: 'grid', id: 'g1', cells: [[1, 1]], item: { components: [], size: 100 } },
 *   { type: 'item', id: 'i1', components: [], size: 100 },
 *   { type: 'relations', id: 'r1', links: [{ source: 'g1', target: 'i1' }] },
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
 * const groupExample: Group = {
 *   type: 'group',
 *   id: 'group-api-servers',
 *   children: [
 *     { type: 'item', id: 'server-1', components: [] },
 *     { type: 'item', id: 'server-2', components: [], attrs: { x: 100, y: 200 } }
 *   ],
 *   attrs: { x: 100, y: 50 },
 * };
 */
export interface Group {
  type: 'group';
  id?: string; // Default: uid
  label?: string;
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
 * const gridExample: Grid = {
 *   type: 'grid',
 *   id: 'server-rack',
 *   gap: { x: 10, y: 10 },
 *   cells: [
 *     [1, 1, 0],
 *     [1, 0, 1]
 *   ],
 *   item: {
 *     components: [
 *       {
 *         type: 'background',
 *         source: { type: 'rect', fill: '#eee', radius: 4 },
 *       }
 *     ],
 *     size: 60,
 *   },
 * };
 */
export interface Grid {
  type: 'grid';
  id?: string; // Default: uid
  label?: string;
  show?: boolean; // Default: true
  cells: (0 | 1 | string)[][];
  inactiveCellStrategy?: 'destroy' | 'hide'; // Default: 'destroy'
  gap?: Gap;
  item: {
    components?: Component[];
    size: Size;
    padding?: Margin; // Default: 0
  };
  attrs?: Record<string, unknown>;
}

/**
 * The most basic single element that constitutes the map.
 * It contains various components (Background, Text, Icon, etc.) to form its visual representation.
 * @see {@link https://pixijs.download/release/docs/scene.Container.html}
 *
 * @example
 * const itemExample: Item = {
 *   type: 'item',
 *   id: 'main-server',
 *   size: { width: 120, height: 100 },
 *   components: [
 *     {
 *       type: 'background',
 *       source: { type: 'rect', fill: '#fff', borderColor: '#ddd', borderWidth: 1 }
 *     },
 *     {
 *       type: 'text',
 *       text: 'Main Server',
 *       placement: 'top',
 *       margin: 8
 *     },
 *     {
 *       type: 'bar',
 *       source: { type: 'rect', fill: 'black' },
 *       size: { width: '80%', height: 8 },
 *       tint: 'primary.default',
 *       placement: 'bottom'
 *     },
 *     {
 *       type: 'icon',
 *       source: 'ok.svg',
 *       size: 16,
 *       placement: 'right-bottom'
 *     }
 *   ],
 *   attrs: { x: 300, y: 150 },
 * }
 */
export interface Item {
  type: 'item';
  id?: string; // Default: uid
  label?: string;
  show?: boolean; // Default: true
  components?: Component[];
  size: Size;
  padding?: Margin; // Default: 0
  attrs?: Record<string, unknown>;
}

/**
 * Represents relationships between elements by connecting them with lines.
 * Specify the IDs of the elements to connect in the 'links' array.
 * @see {@link https://pixijs.download/release/docs/scene.Container.html}
 *
 * @example
 * const relationsExample: Relations = {
 *   type: 'relations',
 *   id: 'server-connections',
 *   links: [
 *     { source: 'main-server', target: 'sub-server-1' },
 *     { source: 'main-server', target: 'sub-server-2' }
 *   ],
 *   style: { color: '#083967', width: 2, cap: 'round', join: 'round' }
 * };
 */
export interface Relations {
  type: 'relations';
  id?: string; // Default: uid
  label?: string;
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
 * const backgroundStyleExample: Background = {
 *   type: 'background',
 *   id: 'bg-rect',
 *   source: { type: 'rect', fill: '#1A1A1A', radius: 8 }
 * };
 *
 * @example
 * // As an image URL
 * const backgroundUrlExample: Background = {
 *   type: 'background',
 *   id: 'bg-image',
 *   source: 'background-image.png'
 * };
 */
export interface Background {
  type: 'background';
  id?: string; // Default: uid
  label?: string;
  show?: boolean; // Default: true
  source: TextureStyle | string;
  tint?: Color;
  attrs?: Record<string, unknown>;
}

/**
 * A component for progress bars or bar graphs.
 * @see {@link https://pixijs.download/release/docs/scene.NineSliceSprite.html}
 *
 * @example
 * const barExample: Bar = {
 *   type: 'bar',
 *   id: 'cpu-usage-bar',
 *   source: { type: 'rect', fill: 'green' },
 *   size: { width: '80%', height: 10 }, // 80% of the parent Item's width, 10px height
 *   placement: 'bottom',
 *   animation: true,
 *   animationDuration: 200,
 * };
 */
export interface Bar {
  type: 'bar';
  id?: string; // Default: uid
  label?: string;
  show?: boolean; // Default: true
  source: TextureStyle;
  size: PxOrPercentSize;
  placement?: Placement; // Default: 'bottom'
  margin?: Margin; // Default: 0
  tint?: Color;
  animation?: boolean; // Default: true
  animationDuration?: number; // Default: 200
  attrs?: Record<string, unknown>;
}

/**
 * A component for displaying an icon image.
 * @see {@link https://pixijs.download/release/docs/scene.Sprite.html}
 *
 * @example
 * const iconExample: Icon = {
 *   type: 'icon',
 *   id: 'warning-icon',
 *   source: 'warning-icon.svg',
 *   size: 24, // 24px x 24px
 *   placement: 'left-top',
 * };
 */
export interface Icon {
  type: 'icon';
  id?: string; // Default: uid
  label?: string;
  show?: boolean; // Default: true
  source: string;
  size: PxOrPercentSize;
  placement?: Placement; // Default: 'center'
  margin?: Margin; // Default: 0
  tint?: Color;
  attrs?: Record<string, unknown>;
}

/**
 * A text label component.
 * @see {@link https://pixijs.download/release/docs/scene.BitmapText.html}
 *
 * @example
 * const textExample: Text = {
 *   type: 'text',
 *   id: 'cpu-label',
 *   text: 'CPU Usage',
 *   placement: 'center',
 *   style: { fill: '#333', fontSize: 14, fontWeight: 'bold' },
 *   split: 0,
 * };
 */
export interface Text {
  type: 'text';
  id?: string; // Default: uid
  label?: string;
  show?: boolean; // Default: true
  text?: string; // Default: ''
  placement?: Placement; // Default: 'center'
  margin?: Margin; // Default: 0
  tint?: Color;
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
 * // For a 100px value:
 * const pxValue: PxOrPercent = 100;
 *
 * @example
 * // For a 75% value:
 * const percentValue: PxOrPercent = '75%';
 *
 * @example
 * // As an object:
 * const objectValue: PxOrPercent = { value: 50, unit: '%' };
 */
export type PxOrPercent = number | string | { value: number; unit: 'px' | '%' };

/**
 * Defines a size with width and height, where each can be specified in pixels or percentage.
 *
 * @example
 * // For a 100px by 100px size:
 * const squareSize: PxOrPercentSize = 100;
 *
 * @example
 * // For a 50% width and 75% height:
 * const responsiveSize: PxOrPercentSize = { width: '50%', height: '75%' };
 *
 * @example
 * // For a 25% width and 25% height:
 * const uniformResponsiveSize: PxOrPercentSize = '25%';
 */
export type PxOrPercentSize =
  | PxOrPercent
  | {
      width: PxOrPercent;
      height: PxOrPercent;
    };

/**
 * Defines a size with width and height in numbers (pixels).
 *
 * @example
 * // For a 100px by 100px size:
 * const sizeExample: Size = 100;
 *
 * @example
 * // For a 120px width and 80px height:
 * const rectSizeExample: Size = { width: 120, height: 80 };
 */
export type Size =
  | number
  | {
      width: number;
      height: number;
    };

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
 * const uniformGap: Gap = 10;
 *
 * @example
 * // To set a 5px horizontal and 15px vertical gap:
 * const customGap: Gap = { x: 5, y: 15 };
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
 * const uniformMargin: Margin = 10;
 *
 * @example
 * // To apply 10px top/bottom and 5px left/right margins:
 * const axisMargin: Margin = { y: 10, x: 5 };
 *
 * @example
 * // To apply individual margins for each side:
 * const detailedMargin: Margin = { top: 1, right: 2, bottom: 3, left: 4 };
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
 * const textureStyleExample: TextureStyle = {
 *   type: 'rect',
 *   fill: '#ff0000',
 *   borderWidth: 2,
 *   borderColor: '#000000',
 *   radius: 5
 * };
 */
export interface TextureStyle {
  type: 'rect';
  fill?: string; // Default: 'transparent'
  borderWidth?: number; // Default: 0
  borderColor?: string; // Default: 'black'
  radius?: number; // Default: 0
}

/**
 * Defines the line style for a Relations element.
 * You can pass an object similar to PIXI.Graphics' lineStyle options.
 *
 * @see {@link https://pixijs.download/release/docs/scene.ConvertedStrokeStyle.html}
 *
 * @example
 * const relationsStyleExample: RelationsStyle = {
 *   color: 'red',
 *   width: 2,
 *   cap: 'square'
 * };
 */
export interface RelationsStyle {
  /**
   * The color of the line. Can be any valid PixiJS ColorSource.
   * @default 'black'
   */
  color?: Color;

  /**
   * Allows any other properties compatible with PIXI.Graphics' stroke style,
   * such as `width`, `cap`, `join`, etc.
   */
  [key: string]: unknown;
}

/**
 * Defines the text style for a Text component.
 * You can pass an object with properties similar to PIXI.TextStyleOptions,
 * along with custom properties for this library.
 *
 * @see {@link https://pixijs.download/release/docs/text.TextStyleOptions.html}
 *
 * @example
 * // Fixed font size
 * const fixedSizeStyle: TextStyle = { fontSize: 24, fill: 'red' };
 *
 * @example
 * // Font size as a string (delegated to PixiJS)
 * const stringSizeStyle: TextStyle = { fontSize: '2px', fill: '#00FF00' };
 *
 * @example
 * // Auto font size with custom range
 * const autoSizeStyle: TextStyle = {
 *   fontSize: 'auto',
 *   autoFont: { min: 10, max: 50 },
 *   fill: 'blue'
 * };
 */
export interface TextStyle {
  /**
   * The font size. Can be a number (in pixels), a string parsable by PixiJS (e.g., '16px'),
   * or the keyword 'auto' to enable dynamic sizing based on the `autoFont` options.
   */
  fontSize?: number | 'auto' | string;

  /**
   * The font family.
   * @default 'FiraCode'
   */
  fontFamily?: unknown;

  /**
   * The font weight.
   * @default 400
   */
  fontWeight?: unknown;

  /**
   * The fill color.
   * @default 'black'
   */
  fill?: unknown;

  /**
   * Configuration for the 'auto' font size mode.
   * This is only active when `fontSize` is 'auto'.
   */
  autoFont?: {
    min?: number;
    max?: number;
  };

  /**
   * The maximum width of the text before it wraps to the next line.
   * Can be a number (pixels) or 'auto' to automatically fit the content area.
   */
  wordWrapWidth?: number | 'auto';

  /**
   * Determines how to handle text that overflows its content area.
   * - 'visible': Text flows outside the bounds (default).
   * - 'hidden': Text exceeding the bounds is clipped.
   * - 'ellipsis': Text exceeding the bounds is replaced with '...'.
   * @default 'visible'
   */
  overflow?: 'visible' | 'hidden' | 'ellipsis';

  /**
   * Allows any other properties, similar to PIXI.TextStyleOptions.
   * This provides flexibility for standard text styling.
   * e.g., fill, fontFamily, fontWeight, etc.
   */
  [key: string]: unknown;
}

/**
 * Defines a tint color to be applied to a component.
 * Accepts any valid PixiJS ColorSource format, such as theme keys,
 * hex codes, numbers, or color objects.
 *
 * @example
 * // As a theme key (string)
 * const tintThemeKey: Color = 'primary.default';
 *
 * @example
 * // As a hex string
 * const tintHexString: Color = '#ff0000';
 *
 * @example
 * // As a hex number
 * const tintHexNumber: Color = 0xff0000;
 *
 * @example
 * // As an RGB object
 * const tintRgbObject: Color = { r: 255, g: 0, b: 0 };
 *
 * @see {@link https://pixijs.download/release/docs/color.ColorSource.html}
 */
export type Color =
  | string
  | number
  | number[]
  | Float32Array
  | Uint8Array
  | Uint8ClampedArray
  | HslColor
  | HslaColor
  | HsvColor
  | HsvaColor
  | RgbColor
  | RgbaColor
  | PixiColor;
