import { z } from 'zod';
import { isValidationError } from 'zod-validation-error';
import { convertArray } from '../../utils/convert';
import { selector } from '../../utils/selector/selector';
import { uid } from '../../utils/uuid';
import { validate } from '../../utils/vaildator';
import { updateGrid } from '../elements/grid';
import { updateGroup } from '../elements/group';
import { updateItem } from '../elements/item';
import { updateRelations } from '../elements/relations';

const updateSchema = z.object({
  path: z.nullable(z.string()).default(null),
  changes: z.record(z.unknown()),
  recordHistory: z.union([z.boolean(), z.string()]).default(false),
  relativeTransform: z.boolean().default(false),
});

export const update = (parent, opts) => {
  const config = validate(opts, updateSchema.passthrough());
  if (isValidationError(config)) throw config;

  const historyId = createHistoryId(config.recordHistory);
  const elements = 'elements' in config ? convertArray(config.elements) : [];
  if (parent && config.path) {
    elements.push(...selector(parent, config.path));
  }

  for (const element of elements) {
    const elConfig = { ...config };
    if (elConfig.relativeTransform) {
      elConfig.changes = applyRelativeTransform(element, elConfig.changes);
    }

    switch (element.type) {
      case 'group':
        updateGroup(element, elConfig.changes, { historyId });
        break;
      case 'grid':
        updateGrid(element, elConfig.changes, { historyId });
        break;
      case 'item':
        updateItem(element, elConfig.changes, { historyId });
        break;
      case 'relations':
        updateRelations(element, elConfig.changes, { historyId });
        break;
    }
  }
};

const applyRelativeTransform = (element, changes) => {
  const newChanges = { ...changes };
  const { position, rotation, angle } = newChanges;

  if (position) {
    newChanges.position = {
      x: element.x + position.x,
      y: element.y + position.y,
    };
  }
  if (rotation) {
    newChanges.rotation = element.rotation + rotation;
  }
  if (angle) {
    newChanges.angle = element.angle + angle;
  }
  return newChanges;
};

const createHistoryId = (recordHistory) => {
  let historyId = null;
  if (recordHistory) {
    historyId = typeof recordHistory === 'string' ? recordHistory : uid();
  }
  return historyId;
};
