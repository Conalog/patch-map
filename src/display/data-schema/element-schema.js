import { z } from 'zod';
import { componentArraySchema } from './component-schema';
import { Base, Gap, RelationsStyle, Size } from './primitive-schema';

/**
 * Groups multiple elements to apply common properties..
 * Visually represented by a `Container`.
 * @see {@link https://pixijs.download/release/docs/scene.Container.html}
 */
export const Group = Base.extend({
  type: z.literal('group'),
  children: z.array(z.lazy(() => elementTypes)),
}).strict();

/**
 * Lays out items in a grid format.
 * The visibility of an item is determined by 1 or 0 in the 'cells' array.
 * Visually represented by a `Container`.
 * @see {@link https://pixijs.download/release/docs/scene.Container.html}
 */
export const Grid = Base.extend({
  type: z.literal('grid'),
  cells: z.array(z.array(z.union([z.literal(0), z.literal(1)]))),
  gap: Gap,
  item: z.object({ components: componentArraySchema }).merge(Size),
}).strict();

/**
 * The most basic single element that constitutes the map.
 * It contains various components (Background, Text, Icon, etc.) to form its visual representation.
 * Visually represented by a `Container`.
 * @see {@link https://pixijs.download/release/docs/scene.Container.html}
 */
export const Item = Base.merge(Size)
  .extend({
    type: z.literal('item'),
    components: componentArraySchema,
  })
  .strict();

/**
 * Represents relationships between elements by connecting them with lines.
 * Specify the IDs of the elements to connect in the 'links' array.
 * Visually represented by a `Container`.
 * @see {@link https://pixijs.download/release/docs/scene.Container.html}
 */
export const Relations = Base.extend({
  type: z.literal('relations'),
  links: z.array(z.object({ source: z.string(), target: z.string() })),
  style: RelationsStyle,
}).strict();

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
