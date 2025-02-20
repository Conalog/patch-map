import { z } from 'zod';

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
]);

export const Margin = z.string().regex(/^(\d+(\.\d+)?(\s+\d+(\.\d+)?){0,3})$/);

const defaultConfig = z
  .object({
    show: z.boolean().default(true),
  })
  .passthrough();

const background = defaultConfig.extend({
  type: z.literal('background'),
  texture: z.string(),
  color: z.string().default('#FFFFFF'),
});

const bar = defaultConfig.extend({
  type: z.literal('bar'),
  texture: z.string(),
  placement: Placement.default('bottom'),
  color: z.string().default('primary.default'),
  percentWidth: z.number().min(0).max(1).default(1),
  percentHeight: z.number().min(0).max(1).default(1),
  margin: Margin.default('0'),
  animation: z.boolean().default(true),
  animationDuration: z.number().default(200),
});

const icon = defaultConfig.extend({
  type: z.literal('icon'),
  texture: z.string(),
  placement: Placement.default('center'),
  size: z.number().nonnegative(),
  color: z.string().default('black'),
  margin: Margin.default('0'),
});

const text = defaultConfig.extend({
  type: z.literal('text'),
  placement: Placement.default('center'),
  content: z.string().default(''),
  style: z
    .preprocess(
      (val) => ({
        fontFamily: 'FiraCode',
        fontWeight: 400,
        fill: 'black',
        ...val,
      }),
      z.record(z.unknown()),
    )
    .default({}),
  split: z.number().int().default(0),
  margin: Margin.default('0'),
});

export const componentSchema = z.discriminatedUnion('type', [
  background,
  bar,
  icon,
  text,
]);

export const componentArraySchema = z
  .discriminatedUnion('type', [background, bar, icon, text])
  .array();
