import { z } from 'zod';

const selectDefaultSchema = z.object({
  enabled: z.boolean().default(false),
  filter: z.nullable(z.function()).default(null),
  isSelectGroup: z.boolean().default(false),
  isSelectGrid: z.boolean().default(false),
});

export const selectEventSchema = selectDefaultSchema.extend({
  onclick: z.function().optional(),
  onover: z.function().optional(),
});

export const dragSelectEventSchema = selectDefaultSchema.extend({
  draggable: z.boolean().default(false),
  ondrag: z.function().optional(),
});
