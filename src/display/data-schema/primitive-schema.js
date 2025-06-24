import { z } from 'zod';

export const Base = z
  .object({
    show: z.boolean().default(true),
    id: z.string().default(() => uid()),
  })
  .passthrough();

export const Position = z.object({
  x: z.number().default(0),
  y: z.number().default(0),
});

export const Size = z.object({
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
});

export const pxOrPercentSchema = z
  .union([z.number().nonnegative(), z.string().regex(/^\d+(\.\d+)?%$/)])
  .transform((val) => {
    return typeof val === 'number'
      ? { value: val, unit: 'px' }
      : { value: Number.parseFloat(val.slice(0, -1)), unit: '%' };
  });

export const PxOrPercentSize = z.object({
  width: pxOrPercentSchema,
  height: pxOrPercentSchema,
});

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
  (val) => {
    return typeof val === 'number' ? { x: val, y: val } : val;
  },
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
    .default({ top: 0, right: 0, bottom: 0, left: 0 }),
);

export const TextureStyle = z
  .object({
    type: z.enum(['rect']),
    fill: z.nullable(z.string()),
    borderWidth: z.nullable(z.number()),
    borderColor: z.nullable(z.string()),
    radius: z.nullable(z.number()),
  })
  .partial();

export const RelationsStyle = z.preprocess(
  (val) => ({ color: 'black', ...val }),
  z.record(z.unknown()),
); // https://pixijs.download/release/docs/scene.ConvertedStrokeStyle.html

export const TextStyle = z.preprocess(
  (val) => ({
    fontFamily: 'FiraCode',
    fontWeight: 400,
    fill: 'black',
    ...val,
  }),
  z.record(z.unknown()),
);
