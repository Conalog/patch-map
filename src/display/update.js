import { Point } from 'pixi.js';
import { convertArray } from '../utils/convert';
import { selector } from '../utils/selector/selector';
import { getCentroid, getObjectFrameWorldCorners } from '../utils/transform';
import { uid } from '../utils/uuid';

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

export const update = (root, opts = {}) => {
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
