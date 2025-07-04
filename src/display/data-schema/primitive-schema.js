import { z } from 'zod';
import { uid } from '../../utils/uuid';
import {
  Color,
  HslColor,
  HslaColor,
  HsvColor,
  HsvaColor,
  RgbColor,
  RgbaColor,
} from './color-schema';

export const Base = z
  .object({
    show: z.boolean().default(true),
    id: z.string().default(() => uid()),
    label: z.string().optional(),
    attrs: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const Size = z.union([
  z
    .number()
    .nonnegative()
    .transform((val) => ({ width: val, height: val })),
  z.object({
    width: z.number().nonnegative(),
    height: z.number().nonnegative(),
  }),
]);

export const pxOrPercentSchema = z
  .union([
    z.number().nonnegative(),
    z.string().regex(/^\d+(\.\d+)?%$/),
    z
      .object({ value: z.number().nonnegative(), unit: z.enum(['px', '%']) })
      .strict(),
  ])
  .transform((val) => {
    if (typeof val === 'number') {
      return { value: val, unit: 'px' };
    }
    if (typeof val === 'string') {
      return { value: Number.parseFloat(val.slice(0, -1)), unit: '%' };
    }
    return val;
  });

export const PxOrPercentSize = z.union([
  pxOrPercentSchema.transform((val) => ({ width: val, height: val })),
  z.object({
    width: pxOrPercentSchema,
    height: pxOrPercentSchema,
  }),
]);

export const Placement = z.enum([
  'left',
  'left-top',
  'left-bottom',
  'top',
  'right',
  'right-top',
  'right-bottom',
  'bottom',
  'center',
  'none',
]);

export const Gap = z.preprocess(
  (val) => (typeof val === 'number' ? { x: val, y: val } : val),
  z
    .object({
      x: z.number().nonnegative().default(0),
      y: z.number().nonnegative().default(0),
    })
    .default({}),
);

export const Margin = z.preprocess(
  (val) => {
    if (typeof val === 'number') {
      return { top: val, right: val, bottom: val, left: val };
    }
    if (val && typeof val === 'object' && ('x' in val || 'y' in val)) {
      const { x = 0, y = 0 } = val;
      return { top: y, right: x, bottom: y, left: x };
    }
    return val;
  },
  z
    .object({
      top: z.number().default(0),
      right: z.number().default(0),
      bottom: z.number().default(0),
      left: z.number().default(0),
    })
    .default({}),
);

export const TextureStyle = z
  .object({
    type: z.enum(['rect']),
    fill: z.string(),
    borderWidth: z.number(),
    borderColor: z.string(),
    radius: z.number(),
  })
  .partial();

/**
 * @see {@link https://pixijs.download/release/docs/scene.ConvertedStrokeStyle.html}
 */
export const RelationsStyle = z.record(z.string(), z.unknown());

/**
 * @see {@link https://pixijs.download/release/docs/text.TextStyleOptions.html}
 */
export const TextStyle = z.record(z.string(), z.unknown());

/**
 * @see {@link https://pixijs.download/release/docs/color.ColorSource.html}
 */
export const Tint = z.union([
  z.string(),
  z.number(),
  z.array(z.number()),
  z.instanceof(Float32Array),
  z.instanceof(Uint8Array),
  z.instanceof(Uint8ClampedArray),
  HslColor,
  HslaColor,
  HsvColor,
  HsvaColor,
  RgbColor,
  RgbaColor,
  Color,
]);
