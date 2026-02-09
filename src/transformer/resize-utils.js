const HANDLE_AXES = {
  'top-left': { x: 'min', y: 'min' },
  top: { x: null, y: 'min' },
  'top-right': { x: 'max', y: 'min' },
  right: { x: 'max', y: null },
  'bottom-right': { x: 'max', y: 'max' },
  bottom: { x: null, y: 'max' },
  'bottom-left': { x: 'min', y: 'max' },
  left: { x: 'min', y: null },
};

export const RESIZE_HANDLES = Object.keys(HANDLE_AXES);

export const getHandlePositions = (bounds) => {
  const { x, y, width, height } = bounds;
  const midX = x + width / 2;
  const midY = y + height / 2;
  return {
    'top-left': { x, y },
    top: { x: midX, y },
    'top-right': { x: x + width, y },
    right: { x: x + width, y: midY },
    'bottom-right': { x: x + width, y: y + height },
    bottom: { x: midX, y: y + height },
    'bottom-left': { x, y: y + height },
    left: { x, y: midY },
  };
};

export const computeResize = ({
  bounds,
  handle,
  delta,
  minSize = 1,
  keepRatio = false,
}) => {
  const axes = getHandleAxes(handle);
  const geometry = createGeometry(bounds, minSize);
  const deltaBox = applyAxisDelta(geometry, axes, delta);
  const box = keepRatio
    ? applyRatioConstraint(geometry, axes, delta)
    : deltaBox;
  return createResizeResult(geometry, axes, box);
};

export const resizeElementState = (state, { origin, scaleX, scaleY }) => {
  const rawWidth = state.width * scaleX;
  const rawHeight = state.height * scaleY;
  return {
    x: origin.x + (state.x - origin.x) * scaleX,
    y: origin.y + (state.y - origin.y) * scaleY,
    width: snapSizeToUnit(rawWidth, state.width),
    height: snapSizeToUnit(rawHeight, state.height),
  };
};

const getHandleAxes = (handle) => {
  const axes = HANDLE_AXES[handle];
  if (!axes) {
    throw new Error(`Unknown resize handle: ${handle}`);
  }
  return axes;
};

const createGeometry = (bounds, minSize) => {
  const minX = bounds.x;
  const minY = bounds.y;
  const maxX = bounds.x + bounds.width;
  const maxY = bounds.y + bounds.height;
  const safeWidth = bounds.width || minSize;
  const safeHeight = bounds.height || minSize;
  return {
    minX,
    minY,
    maxX,
    maxY,
    minSize,
    safeWidth,
    safeHeight,
    aspectRatio: safeWidth / safeHeight || 1,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
};

const applyAxisDelta = (geometry, axes, delta) => {
  const { minX, minY, maxX, maxY, minSize } = geometry;
  let nextMinX = minX;
  let nextMaxX = maxX;
  let nextMinY = minY;
  let nextMaxY = maxY;

  if (axes.x === 'min') {
    nextMinX = Math.min(maxX - minSize, minX + delta.x);
  } else if (axes.x === 'max') {
    nextMaxX = Math.max(minX + minSize, maxX + delta.x);
  }

  if (axes.y === 'min') {
    nextMinY = Math.min(maxY - minSize, minY + delta.y);
  } else if (axes.y === 'max') {
    nextMaxY = Math.max(minY + minSize, maxY + delta.y);
  }

  return {
    minX: nextMinX,
    maxX: nextMaxX,
    minY: nextMinY,
    maxY: nextMaxY,
  };
};

const applyRatioConstraint = (geometry, axes, delta) => {
  if (axes.x && axes.y) {
    return applyCornerRatio(geometry, axes, delta);
  }
  if (axes.x) {
    return applyHorizontalRatio(geometry, axes, delta);
  }
  if (axes.y) {
    return applyVerticalRatio(geometry, axes, delta);
  }
  return {
    minX: geometry.minX,
    maxX: geometry.maxX,
    minY: geometry.minY,
    maxY: geometry.maxY,
  };
};

const applyCornerRatio = (geometry, axes, delta) => {
  const { minX, minY, maxX, maxY, minSize, aspectRatio } = geometry;
  const anchorX = axes.x === 'max' ? minX : maxX;
  const anchorY = axes.y === 'max' ? minY : maxY;
  const movedX = axes.x === 'max' ? maxX + delta.x : minX + delta.x;
  const movedY = axes.y === 'max' ? maxY + delta.y : minY + delta.y;
  const xDirection = axes.x === 'max' ? 1 : -1;
  const yDirection = axes.y === 'max' ? 1 : -1;
  const pointerWidth = Math.max(minSize, xDirection * (movedX - anchorX));
  const pointerHeight = Math.max(minSize, yDirection * (movedY - anchorY));
  const width = Math.max(minSize, pointerWidth, pointerHeight * aspectRatio);
  const height = Math.max(minSize, width / aspectRatio);

  return {
    minX: axes.x === 'max' ? anchorX : anchorX - width,
    maxX: axes.x === 'max' ? anchorX + width : anchorX,
    minY: axes.y === 'max' ? anchorY : anchorY - height,
    maxY: axes.y === 'max' ? anchorY + height : anchorY,
  };
};

const applyHorizontalRatio = (geometry, axes, delta) => {
  const { minX, maxX, centerY, minSize, aspectRatio } = geometry;
  const anchorX = axes.x === 'max' ? minX : maxX;
  const movedX = axes.x === 'max' ? maxX + delta.x : minX + delta.x;
  const xDirection = axes.x === 'max' ? 1 : -1;
  const width = Math.max(minSize, xDirection * (movedX - anchorX));
  const height = Math.max(minSize, width / aspectRatio);
  return {
    minX: axes.x === 'max' ? anchorX : anchorX - width,
    maxX: axes.x === 'max' ? anchorX + width : anchorX,
    minY: centerY - height / 2,
    maxY: centerY + height / 2,
  };
};

const applyVerticalRatio = (geometry, axes, delta) => {
  const { minY, maxY, centerX, minSize, aspectRatio } = geometry;
  const anchorY = axes.y === 'max' ? minY : maxY;
  const movedY = axes.y === 'max' ? maxY + delta.y : minY + delta.y;
  const yDirection = axes.y === 'max' ? 1 : -1;
  const height = Math.max(minSize, yDirection * (movedY - anchorY));
  const width = Math.max(minSize, height * aspectRatio);
  return {
    minX: centerX - width / 2,
    maxX: centerX + width / 2,
    minY: axes.y === 'max' ? anchorY : anchorY - height,
    maxY: axes.y === 'max' ? anchorY + height : anchorY,
  };
};

const createResizeResult = (geometry, axes, box) => {
  const width = Math.max(geometry.minSize, box.maxX - box.minX);
  const height = Math.max(geometry.minSize, box.maxY - box.minY);
  const originX =
    axes.x === 'min'
      ? geometry.maxX
      : axes.x === 'max'
        ? geometry.minX
        : geometry.centerX;
  const originY =
    axes.y === 'min'
      ? geometry.maxY
      : axes.y === 'max'
        ? geometry.minY
        : geometry.centerY;

  return {
    bounds: { x: box.minX, y: box.minY, width, height },
    scaleX: width / geometry.safeWidth,
    scaleY: height / geometry.safeHeight,
    origin: { x: originX, y: originY },
  };
};

const snapSizeToUnit = (rawSize, baseSize, minSize = 1) => {
  const minUnit = Math.max(1, Math.ceil(minSize));
  const safeRaw = Number.isFinite(rawSize) ? rawSize : minUnit;
  const safeBase = Number.isFinite(baseSize) ? baseSize : minUnit;
  const EPSILON = 1e-6;
  const normalizedBase = Number.isInteger(safeBase)
    ? safeBase
    : Math.round(safeBase);

  if (Math.abs(safeRaw - safeBase) <= EPSILON) {
    return Math.max(minUnit, normalizedBase);
  }

  const baseUp = Number.isInteger(safeBase) ? safeBase : Math.ceil(safeBase);
  const baseDown = Number.isInteger(safeBase) ? safeBase : Math.floor(safeBase);

  if (safeRaw > safeBase) {
    const snapped =
      safeRaw < baseUp ? baseUp : baseUp + Math.floor(safeRaw - baseUp);
    return Math.max(minUnit, snapped);
  }

  const snapped =
    safeRaw > baseDown ? baseDown : baseDown - Math.floor(baseDown - safeRaw);
  return Math.max(minUnit, snapped);
};
