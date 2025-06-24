import { z } from 'zod';
import { uid } from '../../utils/uuid';
import { componentArraySchema } from './component-schema';

const transformParts = {
  position: z
    .object({
      x: z.number().default(0),
      y: z.number().default(0),
    })
    .default({}),
  size: z.object({
    width: z.number().nonnegative(),
    height: z.number().nonnegative(),
  }),
};

const defaultSchema = z
  .object({
    show: z.boolean().default(true),
    id: z.string().default(() => uid()),
  })
  .passthrough();

export const gridSchema = defaultSchema.extend({
  type: z.literal('grid'),
  position: transformParts.position,
  cells: z.array(z.array(z.union([z.literal(0), z.literal(1)]))),
  gap: z.preprocess(
    (val) => {
      return typeof val === 'number' ? { x: val, y: val } : val;
    },
    z
      .object({
        x: z.number().nonnegative().default(0),
        y: z.number().nonnegative().default(0),
      })
      .default({}),
  ),
  itemTemplate: z.object({
    size: transformParts.size,
    components: componentArraySchema,
  }),
});

export const itemSchema = defaultSchema.extend({
  type: z.literal('item'),
  position: transformParts.position,
  size: transformParts.size,
  components: componentArraySchema,
});

export const relationsSchema = defaultSchema.extend({
  type: z.literal('relations'),
  links: z.array(z.object({ source: z.string(), target: z.string() })),
  style: z.preprocess(
    (val) => ({ color: 'black', ...val }),
    z.record(z.unknown()),
  ), // https://pixijs.download/release/docs/scene.ConvertedStrokeStyle.html
});

export const groupSchema = defaultSchema.extend({
  type: z.literal('group'),
  children: z.array(z.lazy(() => elementTypes)),
  position: transformParts.position,
});

const elementTypes = z.discriminatedUnion('type', [
  groupSchema,
  gridSchema,
  itemSchema,
  relationsSchema,
]);

export const mapDataSchema = z
  .array(elementTypes)
  .superRefine((elements, ctx) => {
    const errors = collectIds(elements);
    errors.forEach((error) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: error }),
    );
  });

function collectIds(elements, idSet = new Set(), path = []) {
  const errors = [];
  elements.forEach((element, index) => {
    const currentPath = [...path, index.toString()];
    if (idSet.has(element.id)) {
      errors.push(`Duplicate id: ${element.id} at ${currentPath.join('.')}`);
    } else {
      idSet.add(element.id);
    }

    if (element.type === 'group' && Array.isArray(element.children)) {
      errors.push(
        ...collectIds(element.children, idSet, currentPath.concat('children')),
      );
    }
  });
  return errors;
}
