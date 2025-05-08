import { z } from 'zod';

const selectDefaultSchema = z.object({
  enabled: z.boolean().default(false),
  filter: z.nullable(z.function()).default(null),
  isSelectGroup: z.boolean().default(false),
  isSelectGrid: z.boolean().default(false),
});

export const selectEventSchema = selectDefaultSchema.extend({
  onSelect: z.function().optional(),
  onOver: z.function().optional(),
});

export const dragSelectEventSchema = selectDefaultSchema.extend({
  draggable: z.boolean().default(false),
  onDragSelect: z.function().optional(),
});

export const focusFitIdsSchema = z.union([z.string(), z.array(z.string())]).nullish();