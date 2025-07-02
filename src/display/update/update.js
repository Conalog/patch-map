import { z } from 'zod';
import { isValidationError } from 'zod-validation-error';
import { convertArray } from '../../utils/convert';
import { selector } from '../../utils/selector/selector';
import { uid } from '../../utils/uuid';
import { validate } from '../../utils/validator';

const updateSchema = z.object({
  path: z.nullable(z.string()).default(null),
  changes: z.record(z.unknown()),
  history: z.union([z.boolean(), z.string()]).default(false),
  relativeTransform: z.boolean().default(false),
});

export const update = (context, opts) => {
  const config = validate(opts, updateSchema.passthrough());
  if (isValidationError(config)) throw config;

  const { viewport, ...otherContext } = context;
  const historyId = createHistoryId(config.history);
  const elements = 'elements' in config ? convertArray(config.elements) : [];
  if (viewport && config.path) {
    elements.push(...selector(viewport, config.path));
  }

  for (const element of elements) {
    if (!element) {
      continue;
    }
    const { relativeTransform } = config;
    const changes = JSON.parse(JSON.stringify(config.changes));
    if (relativeTransform && changes.attrs) {
      changes.attrs = applyRelativeTransform(element, changes.attrs);
    }
    element.update(changes, { historyId, ...otherContext });
  }
};

const applyRelativeTransform = (element, changes) => {
  const newChanges = JSON.parse(JSON.stringify(changes));
  const { x, y, rotation, angle } = newChanges;

  if (x) {
    newChanges.x = element.x + x;
  }
  if (y) {
    newChanges.y = element.y + y;
  }
  if (rotation) {
    newChanges.rotation = element.rotation + rotation;
  }
  if (angle) {
    newChanges.angle = element.angle + angle;
  }
  return newChanges;
};

const createHistoryId = (history) => {
  let historyId = null;
  if (history) {
    historyId = typeof history === 'string' ? history : uid();
  }
  return historyId;
};
