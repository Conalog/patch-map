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
  mergeStrategy: z.enum(['merge', 'replace']).default('merge'),
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
    element.apply(changes, {
      historyId,
      mergeStrategy: config.mergeStrategy,
      refresh: config.refresh,
    });
  }
  return elements;
};

const applyRelativeTransform = (element, changes) => {
  const { x, y, rotation, angle } = changes;

  Object.assign(changes, {
    x: element.x + (typeof x === 'number' ? x : 0),
    y: element.y + (typeof y === 'number' ? y : 0),
    rotation: element.rotation + (typeof rotation === 'number' ? rotation : 0),
    angle: element.angle + (typeof angle === 'number' ? angle : 0),
  });
  return changes;
};

const createHistoryId = (history) => {
  let historyId = null;
  if (history) {
    historyId = typeof history === 'string' ? history : uid();
  }
  return historyId;
};
