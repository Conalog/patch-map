import { z } from 'zod';
import { uid } from '../../utils/uuid';
import { componentArraySchema } from './component-schema';

export const Position = z.object({
  x: z.number().default(0),
  y: z.number().default(0),
});

const Size = z.object({
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
});

export const Base = z
  .object({
    show: z.boolean().default(true),
    id: z.string().default(() => uid()),
  })
  .passthrough();

export const Grid = Base.merge(Position).extend({
  type: z.literal('grid'),
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
  itemTemplate: z
    .object({
      components: componentArraySchema,
    })
    .merge(Size),
});

export const Item = Base.merge(Position)
  .merge(Size)
  .extend({
    type: z.literal('item'),
    components: componentArraySchema,
  });

export const Relations = Base.extend({
  type: z.literal('relations'),
  links: z.array(z.object({ source: z.string(), target: z.string() })),
  style: z.preprocess(
    (val) => ({ color: 'black', ...val }),
    z.record(z.unknown()),
  ), // https://pixijs.download/release/docs/scene.ConvertedStrokeStyle.html
});

export const Group = Base.merge(Position).extend({
  type: z.literal('group'),
  children: z.array(z.lazy(() => elementTypes)),
});

const elementTypes = z.discriminatedUnion('type', [
  Group,
  Grid,
  Item,
  Relations,
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
