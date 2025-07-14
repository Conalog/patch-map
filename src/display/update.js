import { z } from 'zod';
import { isValidationError } from 'zod-validation-error';
import { convertArray } from '../utils/convert';
import { selector } from '../utils/selector/selector';
import { uid } from '../utils/uuid';
import { validate } from '../utils/validator';

const updateSchema = z.object({
  path: z.nullable(z.string()).default(null),
  changes: z.record(z.unknown()).nullable().default(null),
  history: z.union([z.boolean(), z.string()]).default(false),
  relativeTransform: z.boolean().default(false),
  arrayMerge: z.enum(['merge', 'replace']).default('merge'),
  refresh: z.boolean().default(false),
});

export const update = (viewport, opts) => {
  const config = validate(opts, updateSchema.passthrough());
  if (isValidationError(config)) throw config;

  const historyId = createHistoryId(config.history);
  const elements = 'elements' in config ? convertArray(config.elements) : [];
  if (viewport && config.path) {
    elements.push(...selector(viewport, config.path));
  }

  for (const element of elements) {
    if (!element) {
      continue;
    }
    const changes = JSON.parse(JSON.stringify(config.changes));
    if (config.relativeTransform && changes.attrs) {
      changes.attrs = applyRelativeTransform(element, changes.attrs);
    }
    element.update(changes, {
      historyId,
      arrayMerge: config.arrayMerge,
      refresh: config.refresh,
    });
  }
};

const applyRelativeTransform = (element, changes) => {
  const { x, y, rotation, angle } = changes;

  if (x) {
    changes.x = element.x + x;
  }
  if (y) {
    changes.y = element.y + y;
  }
  if (rotation) {
    changes.rotation = element.rotation + rotation;
  }
  if (angle) {
    changes.angle = element.angle + angle;
  }
  return changes;
};

const createHistoryId = (history) => {
  let historyId = null;
  if (history) {
    historyId = typeof history === 'string' ? history : uid();
  }
  return historyId;
};
