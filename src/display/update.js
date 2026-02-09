import { convertArray } from '../utils/convert';
import { selector } from '../utils/selector/selector';
import { uid } from '../utils/uuid';

const DEFAULT_UPDATE_CONFIG = Object.freeze({
  path: null,
  elements: [],
  changes: null,
  history: false,
  relativeTransform: false,
  mergeStrategy: 'merge',
  refresh: false,
});

export const update = (viewport, opts = {}) => {
  const config = {
    ...opts,
    ...DEFAULT_UPDATE_CONFIG,
    path: opts.path ?? DEFAULT_UPDATE_CONFIG.path,
    elements: opts.elements ?? DEFAULT_UPDATE_CONFIG.elements,
    changes: opts.changes ?? DEFAULT_UPDATE_CONFIG.changes,
    history: opts.history ?? DEFAULT_UPDATE_CONFIG.history,
    relativeTransform:
      opts.relativeTransform ?? DEFAULT_UPDATE_CONFIG.relativeTransform,
    mergeStrategy: opts.mergeStrategy ?? DEFAULT_UPDATE_CONFIG.mergeStrategy,
    refresh: opts.refresh ?? DEFAULT_UPDATE_CONFIG.refresh,
  };

  const historyId = createHistoryId(config.history);
  const elements = convertArray(config.elements);
  if (viewport && config.path) {
    elements.push(...selector(viewport, config.path));
  }

  const baseChanges = config.changes ?? null;
  for (const element of elements) {
    if (!element) {
      continue;
    }
    const changes = config.relativeTransform
      ? structuredClone(baseChanges)
      : baseChanges;
    if (config.relativeTransform && changes.attrs) {
      changes.attrs = applyRelativeTransform(element, changes.attrs);
    }
    element.apply(changes, {
      historyId,
      mergeStrategy: config.mergeStrategy,
      refresh: config.refresh,
      validateSchema: config.validateSchema,
      normalize: config.normalize,
    });
  }
  return elements;
};

const applyRelativeTransform = (element, changes) => {
  ['x', 'y', 'rotation', 'angle'].forEach((key) => {
    if (typeof changes[key] === 'number') changes[key] += element[key];
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
