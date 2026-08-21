import { describe, expect, it } from 'vitest';
import { deepPartial } from '../../utils/zod-deep-strict-partial';
import {
  HslaColor,
  HslColor,
  HsvaColor,
  HsvColor,
  RgbaColor,
  RgbColor,
} from './color-schema';
import {
  backgroundSchema,
  barSchema,
  componentArraySchema,
  componentSchema,
  textSchema as componentTextSchema,
  iconSchema,
} from './component-schema';
import {
  canvasSchema,
  textSchema as elementTextSchema,
  elementTypes,
  gridSchema,
  groupSchema,
  imageSchema,
  itemSchema,
  mapDataSchema,
  rectSchema,
  relationsSchema,
} from './element-schema';
import {
  AssetSource,
  Base,
  Color,
  EachRadius,
  ElementBase,
  ElementTextStyle,
  Gap,
  LabelTextStyle,
  Margin,
  PartialMargin,
  PxOrPercentSize,
  pxOrPercentSchema,
  RelationsStyle,
  Size,
  StrokeStyle,
  TextStyle,
  TextureStyle,
} from './primitive-schema';

const partialSchemaCases = [
  ['HSL color', HslColor, { h: 120 }],
  ['HSLA color', HslaColor, { a: 0.5 }],
  ['HSV color', HsvColor, { v: 50 }],
  ['HSVA color', HsvaColor, { a: 0.5 }],
  ['RGB color', RgbColor, { r: 255 }],
  ['RGBA color', RgbaColor, { a: 0.5 }],
  ['color union', Color, { g: 128 }],
  ['base props', Base, { label: 'partial' }],
  ['element base props', ElementBase, { locked: true }],
  ['size', Size, { width: 40 }],
  ['px or percent value', pxOrPercentSchema, { unit: '%' }],
  ['px or percent size', PxOrPercentSize, { height: '50%' }],
  ['gap', Gap, { x: 4 }],
  ['margin', Margin, { top: 4 }],
  ['partial margin', PartialMargin, { left: 4 }],
  ['per-corner radius', EachRadius, { topLeft: 4 }],
  ['texture style', TextureStyle, { radius: { bottomRight: 4 } }],
  ['asset source', AssetSource, { data: { resolution: 2 } }],
  ['stroke style', StrokeStyle, { width: 2 }],
  ['relations style', RelationsStyle, { alpha: 0.5 }],
  ['text style', TextStyle, { fontSize: 18 }],
  ['label text style', LabelTextStyle, { autoFont: { min: 8 } }],
  ['element text style', ElementTextStyle, { lineHeight: 20 }],
  [
    'background component',
    backgroundSchema,
    { source: { data: { resolution: 2 } } },
  ],
  [
    'bar component',
    barSchema,
    {
      size: { height: '50%' },
      source: { radius: { topLeft: 4 } },
    },
  ],
  ['icon component', iconSchema, { size: { width: 24 } }],
  ['text component', componentTextSchema, { style: { autoFont: { max: 40 } } }],
  ['component union', componentSchema, { size: { width: 24 } }],
  [
    'component array',
    componentArraySchema,
    [{ type: 'bar', size: { height: '50%' } }],
  ],
  [
    'canvas',
    canvasSchema,
    { children: [{ type: 'image', size: { width: 40 } }] },
  ],
  [
    'group element',
    groupSchema,
    { children: [{ type: 'text', size: { width: 120 } }] },
  ],
  [
    'grid element',
    gridSchema,
    {
      gap: { x: 4 },
      item: {
        size: { width: 80 },
        components: [{ type: 'icon', size: { height: 24 } }],
      },
    },
  ],
  [
    'item element',
    itemSchema,
    {
      size: { height: 80 },
      padding: { left: 4 },
      components: [{ type: 'text', style: { autoFont: { min: 8 } } }],
    },
  ],
  [
    'relations element',
    relationsSchema,
    { links: [{ source: 'source-id' }], style: { width: 2 } },
  ],
  [
    'image element',
    imageSchema,
    { source: { data: { resolution: 2 } }, size: { width: 40 } },
  ],
  [
    'standalone text element',
    elementTextSchema,
    { size: { width: 120 }, style: { letterSpacing: 2 } },
  ],
  [
    'rectangle element',
    rectSchema,
    {
      size: { height: 80 },
      radius: { topRight: 4 },
      stroke: { width: 2 },
    },
  ],
  ['element union', elementTypes, { size: { width: 40 } }],
  [
    'map data',
    mapDataSchema,
    [
      {
        id: 'group',
        type: 'group',
        children: [{ id: 'image', type: 'image', size: { width: 40 } }],
      },
    ],
  ],
];

describe('deep partial public schema contract', () => {
  it.each(partialSchemaCases)(
    'accepts a nested partial for %s',
    (_, schema, patch) => {
      expect(deepPartial(schema).safeParse(patch).success).toBe(true);
    },
  );

  it('does not inject nested defaults into a partial patch', () => {
    expect(
      deepPartial(itemSchema).parse({
        size: { width: 80 },
        padding: { left: 4 },
        components: [{ type: 'text', style: { autoFont: { min: 8 } } }],
      }),
    ).toEqual({
      size: { width: 80 },
      padding: { left: 4 },
      components: [{ type: 'text', style: { autoFont: { min: 8 } } }],
    });
  });

  it('preserves unknown-key rejection at explicitly strict boundaries', () => {
    expect(
      deepPartial(imageSchema).safeParse({
        unknown: true,
      }).success,
    ).toBe(false);
    expect(
      deepPartial(componentSchema).safeParse({
        type: 'icon',
        unknown: true,
      }).success,
    ).toBe(false);
    expect(
      deepPartial(imageSchema).safeParse({
        source: { src: 'asset.png', unknown: true },
      }).success,
    ).toBe(false);
  });
});
