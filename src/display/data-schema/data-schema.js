import { z } from 'zod';
import { componentArraySchema } from './component-schema';

const position = z
  .object({
    x: z.number().default(0),
    y: z.number().default(0),
  })
  .strict();

const size = z
  .object({
    width: z.number().nonnegative(),
    height: z.number().nonnegative(),
  })
  .strict();

export const relation = z
  .object({
    source: z.string(),
    target: z.string(),
  })
  .strict();

const defaultInfo = z
  .object({
    show: z.boolean().default(true),
    id: z.string(),
    metadata: z.record(z.unknown()).default({}),
  })
  .passthrough();

export const gridObject = defaultInfo.extend({
  type: z.literal('grid'),
  cells: z.array(z.array(z.union([z.literal(0), z.literal(1)]))),
  components: componentArraySchema,
  position: position.default({}),
  itemSize: size,
});

export const singleObject = defaultInfo.extend({
  type: z.literal('item'),
  components: componentArraySchema,
  position: position.default({}),
  size: size,
});

export const relationGroupObject = defaultInfo.extend({
  type: z.literal('relations'),
  links: z.array(relation),
  strokeStyle: z.preprocess(
    (val) => ({ color: 'black', ...val }),
    z.record(z.unknown()),
  ),
});

export const groupObject = defaultInfo.extend({
  type: z.literal('group'),
  items: z.array(z.lazy(() => itemTypes)),
  position: position.default({}),
});

const itemTypes = z.discriminatedUnion('type', [
  groupObject,
  gridObject,
  singleObject,
  relationGroupObject,
]);

export const mapDataSchema = z.array(itemTypes).superRefine((items, ctx) => {
  const errors = collectIds(items);
  errors.forEach((error) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: error }),
  );
});

function collectIds(items, idSet = new Set(), path = []) {
  const errors = [];
  items.forEach((item, index) => {
    const currentPath = [...path, index.toString()];
    if (idSet.has(item.id)) {
      errors.push(`Duplicate id: ${item.id} at ${currentPath.join('.')}`);
    } else {
      idSet.add(item.id);
    }

    if (item.type === 'group' && Array.isArray(item.items)) {
      errors.push(
        ...collectIds(item.items, idSet, currentPath.concat('items')),
      );
    }
  });
  return errors;
}
