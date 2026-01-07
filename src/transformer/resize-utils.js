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

export const computeResize = ({ bounds, handle, delta, minSize = 1 }) => {
  const axes = HANDLE_AXES[handle];
  if (!axes) {
    throw new Error(`Unknown resize handle: ${handle}`);
  }

  const minX = bounds.x;
  const minY = bounds.y;
  const maxX = bounds.x + bounds.width;
  const maxY = bounds.y + bounds.height;

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

  const nextWidth = Math.max(minSize, nextMaxX - nextMinX);
  const nextHeight = Math.max(minSize, nextMaxY - nextMinY);
  const safeWidth = bounds.width || minSize;
  const safeHeight = bounds.height || minSize;

  const scaleX = nextWidth / safeWidth;
  const scaleY = nextHeight / safeHeight;
  const originX = axes.x === 'min' ? maxX : minX;
  const originY = axes.y === 'min' ? maxY : minY;

  return {
    bounds: {
      x: nextMinX,
      y: nextMinY,
      width: nextWidth,
      height: nextHeight,
    },
    scaleX,
    scaleY,
    origin: { x: originX, y: originY },
  };
};

export const resizeElementState = (state, { origin, scaleX, scaleY }) => {
  return {
    x: origin.x + (state.x - origin.x) * scaleX,
    y: origin.y + (state.y - origin.y) * scaleY,
    width: state.width * scaleX,
    height: state.height * scaleY,
  };
};
