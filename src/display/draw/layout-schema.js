import { z } from 'zod';

const placement = z.enum([
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

const defaultConfig = z.object({
  show: z.boolean().default(true),
  zIndex: z.number().nonnegative().default(0),
});

const background = defaultConfig.extend({
  type: z.literal('background'),
  texture: z.string(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
});

const bar = defaultConfig.extend({
  type: z.literal('bar'),
  texture: z.string(),
  placement: placement.default('center'),
  percentWidth: z.number().min(0).max(1).default(1),
  percentHeight: z.number().min(0).max(1).default(1),
});

const icon = defaultConfig.extend({
  type: z.literal('icon'),
  texture: z.string(),
  placement: placement.default('center'),
  size: z.number().int().nonnegative(),
  color: z.string().default('#FFFFFF'),
});

const text = defaultConfig.extend({
  type: z.literal('text'),
  placement: placement.default('center'),
  content: z.string().default(''),
  style: z.record(z.unknown()).optional(),
});

export const layoutSchema = z
  .discriminatedUnion('type', [background, bar, icon, text])
  .array();
