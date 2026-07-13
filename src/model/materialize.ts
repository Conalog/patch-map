import type {
  BackgroundComponentData,
  BarComponentData,
  ComponentLength,
  ComponentSize,
  ContentOrientation,
  FixedSize,
  Gap,
  GridElementData,
  GridItemData,
  GroupElementData,
  IconComponentData,
  ImageElementData,
  InactiveCellStrategy,
  ItemComponentData,
  ItemElementData,
  MapElementData,
  MaterializedComponentProps,
  MaterializedElementProps,
  RectElementData,
  RelationsElementData,
  Spacing,
  TextComponentData,
  TextElementData,
  TextStyleInput,
} from '../contracts';
import { uid } from '../utils';
import { validateMapData } from './validation';

export interface NormalizedSize {
  width: number;
  height: number;
}

export interface NormalizedComponentLength {
  value: number;
  unit: 'px' | '%';
}

export interface NormalizedComponentSize {
  width: NormalizedComponentLength;
  height: NormalizedComponentLength;
}

export interface NormalizedGap {
  x: number;
  y: number;
}

export interface NormalizedBoxSpacing {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type MaterializedBackgroundComponent = MaterializedComponentProps<
  BackgroundComponentData
> & {
  size: NormalizedComponentSize;
  tint: NonNullable<BackgroundComponentData['tint']>;
};

export type MaterializedBarComponent = Omit<
  MaterializedComponentProps<BarComponentData>,
  'size' | 'margin' | 'placement' | 'animation' | 'animationDuration'
> & {
  size: NormalizedComponentSize;
  placement: NonNullable<BarComponentData['placement']>;
  margin: NormalizedBoxSpacing;
  tint: NonNullable<BarComponentData['tint']>;
  animation: boolean;
  animationDuration: number;
};

export type MaterializedIconComponent = Omit<
  MaterializedComponentProps<IconComponentData>,
  'size' | 'margin' | 'placement'
> & {
  size: NormalizedComponentSize;
  placement: NonNullable<IconComponentData['placement']>;
  margin: NormalizedBoxSpacing;
  tint: NonNullable<IconComponentData['tint']>;
};

export interface MaterializedTextStyle extends TextStyleInput {
  fontFamily: string;
  fontWeight: string | number;
  fill: NonNullable<TextStyleInput['fill']>;
  autoFont: { min: number; max: number };
  overflow: string;
}

export type MaterializedTextComponent = Omit<
  MaterializedComponentProps<TextComponentData>,
  'margin' | 'placement' | 'style' | 'text' | 'split'
> & {
  placement: NonNullable<TextComponentData['placement']>;
  margin: NormalizedBoxSpacing;
  tint: NonNullable<TextComponentData['tint']>;
  text: string;
  style: MaterializedTextStyle;
  split: number;
};

export type MaterializedItemComponent =
  | MaterializedBackgroundComponent
  | MaterializedBarComponent
  | MaterializedIconComponent
  | MaterializedTextComponent;

export type MaterializedGroupElement = Omit<
  MaterializedElementProps<GroupElementData>,
  'children'
> & {
  children: MaterializedMapData;
};

export type MaterializedGridItem = Omit<
  GridItemData,
  'components' | 'size' | 'padding' | 'contentOrientation'
> & {
  components: MaterializedItemComponent[];
  size: NormalizedSize;
  padding: NormalizedBoxSpacing;
  contentOrientation: ContentOrientation;
};

export type MaterializedGridElement = Omit<
  MaterializedElementProps<GridElementData>,
  'gap' | 'inactiveCellStrategy' | 'item'
> & {
  gap: NormalizedGap;
  inactiveCellStrategy: InactiveCellStrategy;
  item: MaterializedGridItem;
};

export type MaterializedItemElement = Omit<
  MaterializedElementProps<ItemElementData>,
  'components' | 'size' | 'padding' | 'contentOrientation'
> & {
  components: MaterializedItemComponent[];
  size: NormalizedSize;
  padding: NormalizedBoxSpacing;
  contentOrientation: ContentOrientation;
};

export type MaterializedRelationsElement = MaterializedElementProps<
  RelationsElementData
> & {
  style: NonNullable<RelationsElementData['style']>;
};

export type MaterializedImageElement = Omit<
  MaterializedElementProps<ImageElementData>,
  'size'
> & {
  size?: NormalizedSize;
};

export interface MaterializedStandaloneTextStyle extends TextStyleInput {
  fontFamily: string;
  fontWeight: string | number;
  fill: NonNullable<TextStyleInput['fill']>;
  fontSize: number;
  wordWrap: boolean;
  letterSpacing: number;
}

export type MaterializedTextElement = Omit<
  MaterializedElementProps<TextElementData>,
  'style' | 'text'
> & {
  text: string;
  style: MaterializedStandaloneTextStyle;
};

export type MaterializedRectElement = Omit<
  MaterializedElementProps<RectElementData>,
  'size' | 'radius'
> & {
  size: NormalizedSize;
  radius: number;
};

export type MaterializedMapElement =
  | MaterializedGroupElement
  | MaterializedGridElement
  | MaterializedItemElement
  | MaterializedRelationsElement
  | MaterializedImageElement
  | MaterializedTextElement
  | MaterializedRectElement;

export type MaterializedMapData = MaterializedMapElement[];

const WHITE_TINT = 0xffffff;

const COMPONENT_TEXT_STYLE_DEFAULTS = {
  fontFamily: 'FiraCode',
  fontWeight: 400,
  fill: 'black',
  autoFont: { min: 1, max: 100 },
  overflow: 'visible',
} as const;

const TEXT_STYLE_DEFAULTS = {
  fontFamily: 'FiraCode',
  fontWeight: 400,
  fill: 'black',
  fontSize: 16,
  wordWrap: true,
  letterSpacing: 0,
} as const;

/** Validate and materialize current MapData without retaining caller objects. */
export const materializeMapData = (input: unknown): MaterializedMapData => {
  validateMapData(input);
  return input.map(materializeElement);
};

export const materializeElement = (
  input: MapElementData,
): MaterializedMapElement => {
  const base = materializeElementBase(input);
  switch (input.type) {
    case 'group':
      return {
        ...base,
        type: 'group',
        children: input.children.map(materializeElement),
      } as MaterializedGroupElement;
    case 'grid':
      return {
        ...base,
        type: 'grid',
        cells: cloneData(input.cells),
        inactiveCellStrategy: input.inactiveCellStrategy ?? 'destroy',
        gap: normalizeGap(input.gap),
        item: materializeGridItem(input.item),
      } as MaterializedGridElement;
    case 'item':
      return {
        ...base,
        type: 'item',
        components: (input.components ?? []).map(materializeComponent),
        size: normalizeFixedSize(input.size),
        padding: normalizeSpacing(input.padding),
        contentOrientation: input.contentOrientation ?? 'upright',
      } as MaterializedItemElement;
    case 'relations':
      return {
        ...base,
        type: 'relations',
        links: cloneData(input.links),
        style: {
          color: 'black',
          ...cloneData(input.style ?? {}),
        },
      } as MaterializedRelationsElement;
    case 'image': {
      const image = {
        ...base,
        type: 'image',
        source: cloneData(input.source),
      } as MaterializedImageElement;
      if (input.size !== undefined) image.size = normalizeFixedSize(input.size);
      return image;
    }
    case 'text':
      return {
        ...base,
        type: 'text',
        text: input.text ?? '',
        style: materializeStandaloneTextStyle(input.style),
      } as MaterializedTextElement;
    case 'rect':
      return {
        ...base,
        type: 'rect',
        size: normalizeFixedSize(input.size),
        radius: input.radius ?? 0,
      } as MaterializedRectElement;
  }
};

export const materializeComponent = (
  input: ItemComponentData,
): MaterializedItemComponent => {
  const base = materializeComponentBase(input);
  switch (input.type) {
    case 'background':
      return {
        ...base,
        type: 'background',
        source: cloneData(input.source),
        size: normalizeComponentSize('100%'),
        tint: input.tint ?? WHITE_TINT,
      } as MaterializedBackgroundComponent;
    case 'bar':
      return {
        ...base,
        type: 'bar',
        source: cloneData(input.source),
        size: normalizeComponentSize(input.size),
        placement: input.placement ?? 'bottom',
        margin: normalizeSpacing(input.margin),
        tint: input.tint ?? WHITE_TINT,
        animation: input.animation ?? true,
        animationDuration: input.animationDuration ?? 200,
      } as MaterializedBarComponent;
    case 'icon':
      return {
        ...base,
        type: 'icon',
        source: cloneData(input.source),
        size: normalizeComponentSize(input.size),
        placement: input.placement ?? 'center',
        margin: normalizeSpacing(input.margin),
        tint: input.tint ?? WHITE_TINT,
      } as MaterializedIconComponent;
    case 'text':
      return {
        ...base,
        type: 'text',
        placement: input.placement ?? 'center',
        margin: normalizeSpacing(input.margin),
        tint: input.tint ?? WHITE_TINT,
        text: input.text ?? '',
        style: materializeComponentTextStyle(input.style),
        split: input.split ?? 0,
      } as MaterializedTextComponent;
  }
};

/**
 * Expand a materialized grid template into its deterministic public item data.
 * Template component IDs are intentionally replaced for every cell clone.
 */
export const materializeGridItems = (
  grid: MaterializedGridElement,
): MaterializedItemElement[] => {
  const output: MaterializedItemElement[] = [];
  grid.cells.forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      const active = cell !== 0;
      if (!active && grid.inactiveCellStrategy === 'destroy') return;

      const components = grid.item.components.map((component) => ({
        ...cloneData(component),
        id: uid(),
      })) as MaterializedItemComponent[];
      output.push({
        ...cloneData(grid.item),
        type: 'item',
        id: `${grid.id}.${rowIndex}.${colIndex}`,
        components,
        label: String(cell),
        attrs: {
          gridIndex: { row: rowIndex, col: colIndex },
          x: colIndex * (grid.item.size.width + grid.gap.x),
          y: rowIndex * (grid.item.size.height + grid.gap.y),
        },
        show: active,
        locked: false,
      });
    });
  });
  return output;
};

export const normalizeFixedSize = (size: FixedSize): NormalizedSize =>
  typeof size === 'number'
    ? { width: size, height: size }
    : { width: size.width, height: size.height };

export const normalizeComponentSize = (
  size: ComponentSize,
): NormalizedComponentSize => {
  if (isComponentLength(size)) {
    const value = normalizeComponentLength(size);
    return { width: { ...value }, height: { ...value } };
  }
  return {
    width: normalizeComponentLength(size.width),
    height: normalizeComponentLength(size.height),
  };
};

export const normalizeComponentLength = (
  value: ComponentLength,
): NormalizedComponentLength => {
  if (typeof value === 'number') return { value, unit: 'px' };
  if (typeof value === 'string') {
    return { value: Number(value.slice(0, -1)), unit: '%' };
  }
  return { value: value.value, unit: value.unit };
};

export const normalizeGap = (gap: Gap | undefined): NormalizedGap => {
  if (typeof gap === 'number') return { x: gap, y: gap };
  return { x: gap?.x ?? 0, y: gap?.y ?? 0 };
};

export const normalizeSpacing = (
  spacing: Spacing | undefined,
): NormalizedBoxSpacing => {
  if (typeof spacing === 'number') {
    return {
      top: spacing,
      right: spacing,
      bottom: spacing,
      left: spacing,
    };
  }
  return {
    top: spacing?.top ?? spacing?.y ?? 0,
    right: spacing?.right ?? spacing?.x ?? 0,
    bottom: spacing?.bottom ?? spacing?.y ?? 0,
    left: spacing?.left ?? spacing?.x ?? 0,
  };
};

/** Clone JSON-shaped public data while leaving unsupported opaque values intact. */
export const cloneData = <T>(value: T): T => {
  if (Array.isArray(value)) return value.map(cloneData) as T;
  if (!isPlainRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, cloneData(entry)]),
  ) as T;
};

const materializeElementBase = (
  input: MapElementData,
): Record<string, unknown> => ({
  ...cloneData(input),
  show: input.show ?? true,
  id: input.id ?? uid(),
  locked: input.locked ?? false,
});

const materializeComponentBase = (
  input: ItemComponentData,
): Record<string, unknown> => ({
  ...cloneData(input),
  show: input.show ?? true,
  id: input.id ?? uid(),
});

const materializeGridItem = (item: GridItemData): MaterializedGridItem => ({
  ...cloneData(item),
  components: (item.components ?? []).map(materializeComponent),
  size: normalizeFixedSize(item.size),
  padding: normalizeSpacing(item.padding),
  contentOrientation: item.contentOrientation ?? 'upright',
});

const materializeComponentTextStyle = (
  style: TextStyleInput | undefined,
): MaterializedTextStyle => {
  const input = cloneData(style ?? {});
  const providedAutoFont = isPlainRecord(input.autoFont) ? input.autoFont : {};
  return {
    ...COMPONENT_TEXT_STYLE_DEFAULTS,
    ...input,
    autoFont: {
      ...COMPONENT_TEXT_STYLE_DEFAULTS.autoFont,
      ...providedAutoFont,
    },
  };
};

const materializeStandaloneTextStyle = (
  style: TextStyleInput | undefined,
): MaterializedStandaloneTextStyle => ({
  ...TEXT_STYLE_DEFAULTS,
  ...cloneData(style ?? {}),
});

const isComponentLength = (value: ComponentSize): value is ComponentLength =>
  typeof value === 'number' ||
  typeof value === 'string' ||
  ('value' in value && 'unit' in value);

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype ||
    Object.getPrototypeOf(value) === null);
