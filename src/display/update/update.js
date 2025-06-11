import { z } from 'zod';
import { isValidationError } from 'zod-validation-error';
import { convertArray } from '../../utils/convert';
import { selector } from '../../utils/selector/selector';
import { uid } from '../../utils/uuid';
import { validate } from '../../utils/validator';
import { updateGrid } from '../elements/grid';
import { updateGroup } from '../elements/group';
import { updateItem } from '../elements/item';
import { updateRelations } from '../elements/relations';

const updateSchema = z.object({
  path: z.nullable(z.string()).default(null),
  changes: z.record(z.unknown()),
  saveToHistory: z.union([z.boolean(), z.string()]).default(false),
  relativeTransform: z.boolean().default(false),
});

const elementUpdaters = {
  group: updateGroup,
  grid: updateGrid,
  item: updateItem,
  relations: updateRelations,
};

export const update = (context, opts) => {
  const config = validate(opts, updateSchema.passthrough());
  if (isValidationError(config)) throw config;

  const { viewport = null, undoRedoManager, theme } = context;
  const historyId = createHistoryId(config.saveToHistory);
  const elements = 'elements' in config ? convertArray(config.elements) : [];
  if (viewport && config.path) {
    elements.push(...selector(viewport, config.path));
  }

  for (const element of elements) {
    if (!element) continue;
    const elConfig = { ...config };
    if (elConfig.relativeTransform) {
      elConfig.changes = applyRelativeTransform(element, elConfig.changes);
    }

    const updater = elementUpdaters[element.type];
    if (updater) {
      updater(element, elConfig.changes, {
        historyId,
        theme,
        undoRedoManager,
      });
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

const createHistoryId = (saveToHistory) => {
  let historyId = null;
  if (saveToHistory) {
    historyId = typeof saveToHistory === 'string' ? saveToHistory : uid();
  }
  return historyId;
};
