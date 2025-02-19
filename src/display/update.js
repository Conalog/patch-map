import { z } from 'zod';
import { isValidationError } from 'zod-validation-error';
import { convertArray } from '../utils/convert';
import { selectorWithWorker } from '../utils/selector/selector';
import { validate } from '../utils/vaildator';
import { updateGrid } from './elements/grid';
import { updateGroup } from './elements/group';
import { updateItem } from './elements/item';
import { updateRelations } from './elements/relations';

const updateSchema = z.object({
  path: z.nullable(z.string()).default(null),
  changes: z.record(z.unknown()),
});

export const update = async (viewport, opts) => {
  const config = validate(opts, updateSchema.passthrough());
  if (isValidationError(config)) throw config;

  const elements = 'elements' in config ? convertArray(config.elements) : [];
  if (viewport && config.path) {
    const selectElements = await selectorWithWorker(viewport, config.path);
    elements.push(...selectElements);
  }

  for (const element of elements) {
    if (element.type === 'group') {
      updateGroup(element, config.changes);
    } else if (element.type === 'grid') {
      updateGrid(element, config.changes);
    } else if (element.type === 'item') {
      updateItem(element, config.changes);
    } else if (element.type === 'relations') {
      updateRelations(element, config.changes);
    }
  }
};
