import { z } from 'zod';
import { isValidationError } from 'zod-validation-error';
import { convertArray } from '../utils/convert';
import { selector } from '../utils/selector/selector';
import { validate } from '../utils/vaildator';
import { updateGrid } from './elements/grid';
import { updateGroup } from './elements/group';
import { updateItem } from './elements/item';

const updateSchema = z.object({
  path: z.nullable(z.string()).default(null),
  changes: z.record(z.unknown()),
});

export const update = (parent, opts) => {
  const config = validate(opts, updateSchema.passthrough());
  if (isValidationError(config)) throw config;

  const elements = 'elements' in config ? convertArray(config.elements) : [];
  if (parent && config.path) {
    elements.push(...selector(parent, config.path));
  }

  for (const element of elements) {
    if (element.type === 'group') {
      updateGroup(element, config.changes);
    } else if (element.type === 'grid') {
      updateGrid(element, config.changes);
    } else if (element.type === 'item') {
      updateItem(element, config.changes);
    }
  }
};
