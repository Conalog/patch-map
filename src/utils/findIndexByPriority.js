import { z } from 'zod';

const schema = z.object({
  arr: z.array(z.object({}).passthrough()),
  criteria: z.object({}).passthrough(),
});

export const findIndexByPriority = (arr, criteria, usedIndexes = new Set()) => {
  const validation = schema.safeParse({ arr, criteria });
  if (!validation.success) {
    throw new TypeError(validation.error.message);
  }

  if ('id' in criteria) {
    return arr.findIndex(
      (item, idx) => !usedIndexes.has(idx) && item?.id === criteria.id,
    );
  }
  if ('label' in criteria) {
    return arr.findIndex(
      (item, idx) => !usedIndexes.has(idx) && item?.label === criteria.label,
    );
  }
  if ('type' in criteria) {
    return arr.findIndex(
      (item, idx) => !usedIndexes.has(idx) && item?.type === criteria.type,
    );
  }
  return -1;
};
