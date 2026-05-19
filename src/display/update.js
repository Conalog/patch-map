import { Point } from 'pixi.js';
import { convertArray } from '../utils/convert';
import { deepMerge } from '../utils/deepmerge/deepmerge';
import { findIndexByPriority } from '../utils/findIndexByPriority';
import { selector } from '../utils/selector/selector';
import { getCentroid, getObjectFrameWorldCorners } from '../utils/transform';
import { uid } from '../utils/uuid';
import { tryApplyPanelComponentChanges } from './renderers/panelComponentRenderer';

const DEFAULT_UPDATE_CONFIG = Object.freeze({
  path: null,
  elements: [],
  changes: null,
  history: false,
  relativeTransform: false,
  rotateOrigin: null,
  mergeStrategy: 'merge',
  refresh: false,
});

const RADIANS_PER_DEGREE = Math.PI / 180;
const PANEL_COMPONENT_TYPES = new Set(['background', 'bar', 'icon', 'text']);
const QUEUE_FRAME_BUDGET_MS = 4;
const QUEUE_MAX_UPDATES_PER_FRAME = 750;
const queuedPanelUpdates = new Map();
let queuedPanelUpdateFrame = null;

export const update = (root, opts = {}) => {
  if (canUseBulkPanelComponentUpdate(opts)) {
    flushQueuedPanelComponentUpdates();
    return applyBulkPanelComponentUpdate(opts.elements, opts);
  }

  const queuedElements = getQueueablePanelComponentUpdateElements(opts);
  if (queuedElements) {
    enqueuePanelComponentUpdates(queuedElements, opts);
    return queuedElements;
  }

  flushQueuedPanelComponentUpdates();

  if (canUseDirectPanelComponentUpdate(opts)) {
    const element = opts.elements;
    if (!element) return [];

    const applied = tryApplyPanelComponentChanges(
      element,
      opts.changes.components,
      {
        mergeStrategy:
          opts.mergeStrategy ?? DEFAULT_UPDATE_CONFIG.mergeStrategy,
        refresh: false,
        validateSchema: false,
        normalize: opts.normalize,
      },
    );
    if (applied) return [element];
  }

  const config = {
    ...opts,
    ...DEFAULT_UPDATE_CONFIG,
    path: opts.path ?? DEFAULT_UPDATE_CONFIG.path,
    elements: opts.elements ?? DEFAULT_UPDATE_CONFIG.elements,
    changes: opts.changes ?? DEFAULT_UPDATE_CONFIG.changes,
    history: opts.history ?? DEFAULT_UPDATE_CONFIG.history,
    relativeTransform:
      opts.relativeTransform ?? DEFAULT_UPDATE_CONFIG.relativeTransform,
    rotateOrigin: opts.rotateOrigin ?? DEFAULT_UPDATE_CONFIG.rotateOrigin,
    mergeStrategy: opts.mergeStrategy ?? DEFAULT_UPDATE_CONFIG.mergeStrategy,
    refresh: opts.refresh ?? DEFAULT_UPDATE_CONFIG.refresh,
  };

  const historyId = createHistoryId(config.history);
  const elements = convertArray(config.elements);
  if (root && config.path) {
    elements.push(...selector(root, config.path));
  }

  const baseChanges = config.changes ?? null;
  for (const element of elements) {
    if (!element) {
      continue;
    }
    const changes =
      config.relativeTransform || shouldApplyCenterRotation(config, baseChanges)
        ? structuredClone(baseChanges)
        : baseChanges;
    if (config.relativeTransform && changes.attrs) {
      changes.attrs = applyRelativeTransform(element, changes.attrs);
    }
    if (shouldApplyCenterRotation(config, changes)) {
      changes.attrs = applyCenterRotation(element, changes.attrs);
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

export const flushQueuedPanelComponentUpdates = () => {
  if (queuedPanelUpdateFrame !== null) {
    cancelFrame(queuedPanelUpdateFrame);
    queuedPanelUpdateFrame = null;
  }
  drainQueuedPanelUpdates({
    frameBudgetMs: Number.POSITIVE_INFINITY,
    maxUpdates: Number.POSITIVE_INFINITY,
  });
};

const getQueueablePanelComponentUpdateElements = (opts) => {
  if (!canQueuePanelComponentUpdate(opts)) return null;

  const element = opts.elements;
  if (
    element?.type === 'item' &&
    hasQueueableTargetComponents(element, opts.changes.components)
  ) {
    return [element];
  }
  return null;
};

const canQueuePanelComponentUpdate = (opts) =>
  opts?.emit === false &&
  canUseTrustedPanelComponentUpdate(opts) &&
  (opts.mergeStrategy ?? DEFAULT_UPDATE_CONFIG.mergeStrategy) !== 'replace' &&
  hasOnlyPanelComponentChanges(opts.changes.components) &&
  !hasDuplicateUnkeyedTypes(opts.changes.components);

const canUseTrustedPanelComponentUpdate = (opts) =>
  opts?.validateSchema === false &&
  !opts.path &&
  opts.elements &&
  !opts.history &&
  !opts.relativeTransform &&
  !opts.rotateOrigin &&
  !opts.refresh &&
  isComponentsOnlyChange(opts.changes);

const canUseBulkPanelComponentUpdate = (opts) =>
  opts?.emit === false &&
  canUseTrustedPanelComponentUpdate(opts) &&
  Array.isArray(opts.elements) &&
  opts.elements.length > 0 &&
  (opts.mergeStrategy ?? DEFAULT_UPDATE_CONFIG.mergeStrategy) !== 'replace' &&
  hasOnlyPanelComponentChanges(opts.changes.components) &&
  !hasDuplicateUnkeyedTypes(opts.changes.components) &&
  opts.elements.every((element) => element?.type === 'item');

const canUseDirectPanelComponentUpdate = (opts) =>
  opts?.validateSchema === false &&
  !opts.path &&
  opts.elements &&
  !Array.isArray(opts.elements) &&
  !opts.history &&
  !opts.relativeTransform &&
  !opts.rotateOrigin &&
  !opts.refresh &&
  isComponentsOnlyChange(opts.changes);

const isComponentsOnlyChange = (changes) =>
  changes &&
  Object.keys(changes).length === 1 &&
  Array.isArray(changes.components);

const hasOnlyPanelComponentChanges = (componentChanges) =>
  componentChanges.every((change) => PANEL_COMPONENT_TYPES.has(change?.type));

const hasQueueableTargetComponents = (item, componentChanges) =>
  componentChanges.every((change) => {
    if (change?.show === false) return true;
    return Boolean(findPanelComponent(item, change));
  });

const findPanelComponent = (item, change) => {
  if (change.id || change.label) {
    const index = findIndexByPriority(item.children ?? [], change);
    return index === -1 ? null : item.children[index];
  }
  return (item.children ?? []).find(
    (child) => child?.type === change.type && !child.destroyed,
  );
};

const hasDuplicateUnkeyedTypes = (componentChanges) => {
  const seenTypes = new Set();
  for (const change of componentChanges) {
    if (!change || change.id || change.label) continue;
    if (seenTypes.has(change.type)) return true;
    seenTypes.add(change.type);
  }
  return false;
};

const enqueuePanelComponentUpdates = (elements, opts) => {
  for (const element of elements) {
    enqueuePanelComponentUpdate(element, opts);
  }
  scheduleQueuedPanelUpdates();
};

const enqueuePanelComponentUpdate = (element, opts) => {
  const pending = queuedPanelUpdates.get(element);
  const components = pending
    ? mergeQueuedComponentChanges(
        pending.changes.components,
        opts.changes.components,
      )
    : opts.changes.components;

  queuedPanelUpdates.set(element, {
    element,
    changes: { components },
    options: {
      mergeStrategy: opts.mergeStrategy ?? DEFAULT_UPDATE_CONFIG.mergeStrategy,
      refresh: false,
      validateSchema: false,
      normalize: opts.normalize,
    },
  });
};

const applyBulkPanelComponentUpdate = (elements, opts) => {
  const aggregateBarLayers = new Set();
  const options = {
    mergeStrategy: opts.mergeStrategy ?? DEFAULT_UPDATE_CONFIG.mergeStrategy,
    refresh: false,
    validateSchema: false,
    normalize: opts.normalize,
    deferAggregateBarFlush: true,
    aggregateBarLayers,
  };

  for (const element of elements) {
    const applied = tryApplyPanelComponentChanges(
      element,
      opts.changes.components,
      options,
    );
    if (!applied) {
      element.apply(opts.changes, {
        historyId: null,
        mergeStrategy: options.mergeStrategy,
        refresh: options.refresh,
        validateSchema: options.validateSchema,
        normalize: options.normalize,
      });
    }
  }

  flushAggregateBarLayers(aggregateBarLayers);
  return elements;
};

const mergeQueuedComponentChanges = (current, next) =>
  deepMerge(
    { components: current },
    { components: next },
    { mergeBy: ['id', 'label', 'type'] },
  ).components;

const scheduleQueuedPanelUpdates = () => {
  if (queuedPanelUpdateFrame !== null) return;
  queuedPanelUpdateFrame = requestFrame(() => {
    queuedPanelUpdateFrame = null;
    drainQueuedPanelUpdates();
  });
};

const drainQueuedPanelUpdates = ({
  frameBudgetMs = QUEUE_FRAME_BUDGET_MS,
  maxUpdates = QUEUE_MAX_UPDATES_PER_FRAME,
} = {}) => {
  const startedAt = now();
  let processed = 0;
  const aggregateBarLayers = new Set();

  for (const [element, pending] of queuedPanelUpdates) {
    queuedPanelUpdates.delete(element);
    applyQueuedPanelComponentUpdate(pending, aggregateBarLayers);
    processed += 1;

    if (
      queuedPanelUpdates.size > 0 &&
      (processed >= maxUpdates || now() - startedAt >= frameBudgetMs)
    ) {
      break;
    }
  }

  flushAggregateBarLayers(aggregateBarLayers);

  if (queuedPanelUpdates.size > 0) {
    scheduleQueuedPanelUpdates();
  }
};

const applyQueuedPanelComponentUpdate = (
  { element, changes, options },
  aggregateBarLayers,
) => {
  const applied = tryApplyPanelComponentChanges(element, changes.components, {
    ...options,
    deferAggregateBarFlush: true,
    aggregateBarLayers,
  });
  if (applied) return;

  element.apply(changes, {
    historyId: null,
    mergeStrategy: options.mergeStrategy,
    refresh: options.refresh,
    validateSchema: options.validateSchema,
    normalize: options.normalize,
  });
};

const flushAggregateBarLayers = (layers) => {
  for (const layer of layers) {
    layer?.flushParticleChildrenUpdate?.();
  }
};

const requestFrame = (callback) => {
  if (typeof requestAnimationFrame === 'function') {
    return requestAnimationFrame(callback);
  }
  return setTimeout(() => callback(now()), 0);
};

const cancelFrame = (handle) => {
  if (typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(handle);
    return;
  }
  clearTimeout(handle);
};

const now = () =>
  typeof performance !== 'undefined' && performance.now
    ? performance.now()
    : Date.now();

const applyRelativeTransform = (element, changes) => {
  ['x', 'y', 'rotation', 'angle'].forEach((key) => {
    if (typeof changes[key] === 'number') changes[key] += element[key];
  });
  return changes;
};

const shouldApplyCenterRotation = (config, changes) =>
  config.rotateOrigin === 'center' && hasRotationChange(changes?.attrs);

const hasRotationChange = (attrs) =>
  typeof attrs?.angle === 'number' || typeof attrs?.rotation === 'number';

const applyCenterRotation = (element, attrs) => {
  if (!element || !attrs) return attrs;

  const rotationKey =
    typeof attrs.angle === 'number'
      ? 'angle'
      : typeof attrs.rotation === 'number'
        ? 'rotation'
        : null;
  if (!rotationKey) return attrs;

  const corners = getObjectFrameWorldCorners(element);
  if (corners.length === 0) return attrs;

  const originBefore = element.getGlobalPosition();
  const baselineOrigin = getBaselineOrigin(element, attrs);
  const centerBefore = getCentroid(corners);
  const targetCenter = {
    x: centerBefore.x + baselineOrigin.x - originBefore.x,
    y: centerBefore.y + baselineOrigin.y - originBefore.y,
  };
  const centerOffset = {
    x: centerBefore.x - originBefore.x,
    y: centerBefore.y - originBefore.y,
  };
  const deltaAngle =
    getNextRotation(attrs, rotationKey) -
    getCurrentRotation(element, rotationKey);
  const rotatedOffset = rotateVector(centerOffset, deltaAngle);
  const nextOrigin = {
    x: targetCenter.x - rotatedOffset.x,
    y: targetCenter.y - rotatedOffset.y,
  };
  const localOrigin = element.parent
    ? element.parent.toLocal(new Point(nextOrigin.x, nextOrigin.y))
    : nextOrigin;

  return {
    ...attrs,
    x: localOrigin.x,
    y: localOrigin.y,
  };
};

const getBaselineOrigin = (element, attrs) => {
  const localOrigin = {
    x: typeof attrs.x === 'number' ? attrs.x : element.x,
    y: typeof attrs.y === 'number' ? attrs.y : element.y,
  };

  if (!element.parent) return localOrigin;
  return element.parent.toGlobal(new Point(localOrigin.x, localOrigin.y));
};

const getCurrentRotation = (element, rotationKey) => {
  if (rotationKey === 'angle') {
    return (
      Number(element.angle ?? element.props?.attrs?.angle ?? 0) *
      RADIANS_PER_DEGREE
    );
  }
  return Number(element.rotation ?? element.props?.attrs?.rotation ?? 0);
};

const getNextRotation = (attrs, rotationKey) =>
  rotationKey === 'angle' ? attrs.angle * RADIANS_PER_DEGREE : attrs.rotation;

const rotateVector = (vector, angle) => {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: vector.x * cos - vector.y * sin,
    y: vector.x * sin + vector.y * cos,
  };
};

const createHistoryId = (history) => {
  let historyId = null;
  if (history) {
    historyId = typeof history === 'string' ? history : uid();
  }
  return historyId;
};
