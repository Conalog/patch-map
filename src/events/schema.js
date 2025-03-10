import { z } from 'zod';

export const selectEventSchema = z.object({
  enabled: z.boolean().default(false),
  fn: z.function(),
  filter: z.nullable(z.function()).default(null),
  isSelectGroup: z.boolean().default(false),
  isSelectGrid: z.boolean().default(false),
});
