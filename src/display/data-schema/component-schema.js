import { isPlainObject } from 'is-plain-object';
import { z } from 'zod';
import {
  AssetSource,
  Base,
  Color,
  LabelTextStyle,
  Margin,
  Placement,
  PxOrPercentSize,
  TextureStyle,
} from './primitive-schema';

const TextureStyleSource = z
  .unknown()
  .refine((source) => !(isPlainObject(source) && 'src' in source), {
    message: 'Asset source objects must match the AssetSource schema.',
  })
  .pipe(TextureStyle);

/**
 * An Item's background, sourced from a style object, asset key, URL, or
 * AssetSource descriptor.
 * Visually represented by a `NineSliceSprite`.
 * @see {@link https://pixijs.download/release/docs/scene.NineSliceSprite.html}
 */
export const backgroundSchema = Base.extend({
  type: z.literal('background'),
  source: z.union([z.string(), AssetSource, TextureStyleSource]),
  size: z
    .any()
    .optional()
    .transform(() => ({
      width: { value: 100, unit: '%' },
      height: { value: 100, unit: '%' },
    })),
  tint: Color,
}).strict();

/**
 * A component for progress bars or bar graphs.
 * Visually represented by a `NineSliceSprite`.
 * @see {@link https://pixijs.download/release/docs/scene.NineSliceSprite.html}
 */
export const barSchema = Base.extend({
  type: z.literal('bar'),
  source: TextureStyle,
  size: PxOrPercentSize,
  placement: Placement.default('bottom'),
  margin: Margin.default(0),
  tint: Color,
  animation: z.boolean().default(true),
  animationDuration: z.number().default(200),
}).strict();

/**
 * A component for displaying an icon image from an asset key, URL, or
 * AssetSource descriptor.
 * Visually represented by a `Sprite`.
 * @see {@link https://pixijs.download/release/docs/scene.Sprite.html}
 */
export const iconSchema = Base.extend({
  type: z.literal('icon'),
  source: z.union([z.string(), AssetSource]),
  size: PxOrPercentSize,
  placement: Placement.default('center'),
  margin: Margin.default(0),
  tint: Color,
}).strict();

/**
 * A text label component.
 * Visually represented by a `BitmapText`.
 * @see {@link https://pixijs.download/release/docs/scene.BitmapText.html}
 */
export const textSchema = Base.extend({
  type: z.literal('text'),
  placement: Placement.default('center'),
  margin: Margin.default(0),
  tint: Color,
  text: z.string().default(''),
  style: LabelTextStyle,
  split: z.number().int().default(0),
}).strict();

export const componentSchema = z.discriminatedUnion('type', [
  backgroundSchema,
  barSchema,
  iconSchema,
  textSchema,
]);

export const componentArraySchema = componentSchema.array();
