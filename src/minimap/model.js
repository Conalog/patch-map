import { Point } from 'pixi.js';
import { getObjectFrameWorldCorners } from '../utils/transform';

const DEFAULT_ELIGIBLE_TYPES = new Set(['item', 'grid', 'rect']);

export const createMinimapObjectSnapshot = ({
  patchmap,
  width,
  height,
  inset = 0,
}) => {
  const canvasBounds = patchmap?.canvas?.bounds;
  if (!canvasBounds) {
    return null;
  }

  const scale = getMinimapScale({ canvasBounds, width, height, inset });
  const origin = {
    x: inset,
    y: inset,
  };

  return {
    canvas: projectRect(canvasBounds, canvasBounds, scale, origin),
    objects: collectObjectSilhouettes({
      patchmap,
      canvasBounds,
      scale,
      origin,
    }),
    scale,
    origin,
    canvasBounds,
  };
};

export const createMinimapViewport = ({
  patchmap,
  canvasBounds,
  scale,
  origin,
}) => getViewportPolygon({ patchmap, canvasBounds, scale, origin });

export const minimapPointToCanvasPoint = ({
  point,
  canvasBounds,
  scale,
  origin,
}) => ({
  x: canvasBounds.x + (point.x - origin.x) / scale.x,
  y: canvasBounds.y + (point.y - origin.y) / scale.y,
});

const getMinimapScale = ({ canvasBounds, width, height, inset }) => {
  const availableWidth = Math.max(width - inset * 2, 1);
  const availableHeight = Math.max(height - inset * 2, 1);
  return {
    x: availableWidth / canvasBounds.width,
    y: availableHeight / canvasBounds.height,
  };
};

const collectObjectSilhouettes = ({
  patchmap,
  canvasBounds,
  scale,
  origin,
}) => {
  const world = patchmap?.world;
  if (!world) return [];

  const objects = [];
  for (const element of collectManagedElements(world)) {
    if (!isMinimapEligibleElement(element)) continue;

    const silhouette = getElementCanvasSilhouette(element, world);
    if (
      !silhouette ||
      !silhouetteIntersectsCanvasBounds(silhouette, canvasBounds)
    ) {
      continue;
    }
    objects.push(projectSilhouette(silhouette, canvasBounds, scale, origin));
  }
  return objects;
};

const createSilhouette = (element, paths) => ({
  type: element?.type,
  points: paths[0] ?? [],
  paths,
});

const projectSilhouette = (silhouette, canvasBounds, scale, origin) => {
  const paths = silhouette.paths.map((path) =>
    path.map((point) => projectPoint(point, canvasBounds, scale, origin)),
  );
  return createSilhouette(silhouette, paths);
};

const getElementCanvasSilhouette = (element, world) => {
  if (element?.type === 'grid') {
    const paths = getGridCellCanvasPaths(element, world);
    return paths.length ? createSilhouette(element, paths) : null;
  }
  return createSilhouette(element, [
    getObjectFrameWorldCorners(element).map((point) => world.toLocal(point)),
  ]);
};

const getGridCellCanvasPaths = (grid, world) => {
  const cells = grid?.props?.cells;
  if (!Array.isArray(cells) || cells.length === 0) return [];

  const size = normalizeSize(grid.props?.item?.size);
  if (!size) return [];

  const gap = normalizeGap(grid.props?.gap);
  const { rows, cols, activeCells, activeSet } = analyzeGridCells(cells);
  if (!rows || !cols || activeCells.length === 0) return [];

  const active = (row, col) => activeSet.has(cellKey(row, col));
  const toCanvasPoint = createGridLocalToCanvasPoint(grid, world);

  if (activeCells.length === rows * cols) {
    return [
      [
        toGridCanvasPoint({ x: 0, y: 0 }),
        toGridCanvasPoint({ x: cols, y: 0 }),
        toGridCanvasPoint({ x: cols, y: rows }),
        toGridCanvasPoint({ x: 0, y: rows }),
      ],
    ];
  }

  const loops = traceActiveCellBoundaryLoops({ activeCells, active });
  return loops.map((loop) =>
    simplifyCollinearPoints(loop.map((point) => toGridCanvasPoint(point))),
  );

  function toGridCanvasPoint(point) {
    return toCanvasPoint(
      getGridAxisEdge(point.x, cols, size.width, gap.x),
      getGridAxisEdge(point.y, rows, size.height, gap.y),
    );
  }
};

const analyzeGridCells = (cells) => {
  const rows = cells.length;
  let cols = 0;
  const activeCells = [];
  const activeSet = new Set();

  for (let row = 0; row < rows; row += 1) {
    const cellRow = Array.isArray(cells[row]) ? cells[row] : [];
    cols = Math.max(cols, cellRow.length);
    for (let col = 0; col < cellRow.length; col += 1) {
      if (!cellRow[col]) continue;
      activeCells.push({ row, col });
      activeSet.add(cellKey(row, col));
    }
  }

  return { rows, cols, activeCells, activeSet };
};

const cellKey = (row, col) => `${row},${col}`;

const getGridAxisEdge = (index, count, size, gap) => {
  const step = size + gap;
  if (index === count) return Math.max(count * size + (count - 1) * gap, 0);
  return index * step;
};

const traceActiveCellBoundaryLoops = ({ activeCells, active }) => {
  const edges = [];
  const edgesByStart = new Map();
  const pushEdge = (startX, startY, endX, endY) => {
    const edge = createBoundaryEdge(startX, startY, endX, endY);
    edges.push(edge);
    const key = pointKey(edge.start);
    const list = edgesByStart.get(key) ?? [];
    list.push(edge);
    edgesByStart.set(key, list);
  };

  for (const { row, col } of activeCells) {
    if (!active(row - 1, col)) {
      pushEdge(col, row, col + 1, row);
    }
    if (!active(row, col + 1)) {
      pushEdge(col + 1, row, col + 1, row + 1);
    }
    if (!active(row + 1, col)) {
      pushEdge(col + 1, row + 1, col, row + 1);
    }
    if (!active(row, col - 1)) {
      pushEdge(col, row + 1, col, row);
    }
  }

  const loops = [];
  for (const edge of edges) {
    if (edge.used) continue;

    const loop = [edge.start];
    let current = edge;
    current.used = true;
    while (!samePoint(current.end, loop[0])) {
      loop.push(current.end);
      current = takeNextBoundaryEdge(edgesByStart, current);
      if (!current) break;
      current.used = true;
    }

    if (current && loop.length >= 3) {
      loops.push(loop);
    }
  }
  return loops;
};

const createBoundaryEdge = (startX, startY, endX, endY) => ({
  start: { x: startX, y: startY },
  end: { x: endX, y: endY },
  direction: getEdgeDirection(startX, startY, endX, endY),
  used: false,
});

const getEdgeDirection = (startX, startY, endX, endY) => {
  if (endX > startX) return 0;
  if (endY > startY) return 1;
  if (endX < startX) return 2;
  return 3;
};

const takeNextBoundaryEdge = (edgesByStart, previousEdge) => {
  const candidates = edgesByStart.get(pointKey(previousEdge.end));
  if (!candidates?.length) return null;

  const directionPriority = [];
  directionPriority[(previousEdge.direction + 1) % 4] = 0;
  directionPriority[previousEdge.direction] = 1;
  directionPriority[(previousEdge.direction + 3) % 4] = 2;
  directionPriority[(previousEdge.direction + 2) % 4] = 3;

  let nextEdge = null;
  let nextPriority = Infinity;
  for (const edge of candidates) {
    if (edge.used) continue;
    const priority = directionPriority[edge.direction] ?? Infinity;
    if (priority < nextPriority) {
      nextEdge = edge;
      nextPriority = priority;
    }
  }
  return nextEdge;
};

const pointKey = (point) => `${point.x},${point.y}`;

const samePoint = (a, b) => a.x === b.x && a.y === b.y;

const simplifyCollinearPoints = (points) => {
  if (points.length <= 3) return points;

  return points.filter((point, index) => {
    const previous = points[(index - 1 + points.length) % points.length];
    const next = points[(index + 1) % points.length];
    return (
      (previous.x - point.x) * (next.y - point.y) !==
      (previous.y - point.y) * (next.x - point.x)
    );
  });
};

const collectManagedElements = (root) => {
  const result = [];
  const visit = (node) => {
    if (!node) return;
    if (node !== root && node?.type && node?.constructor?.isElement) {
      result.push(node);
      if (node.type === 'grid') return;
    }
    for (const child of getRenderOrderedChildren(node)) {
      visit(child);
    }
  };
  visit(root);
  return result;
};

const getRenderOrderedChildren = (node) => {
  const children = node.children ?? [];
  if (children.length <= 1) return children;
  return [...children]
    .map((child, index) => ({ child, index }))
    .sort((a, b) => {
      const zDiff = (a.child.zIndex ?? 0) - (b.child.zIndex ?? 0);
      return zDiff || a.index - b.index;
    })
    .map(({ child }) => child);
};

const isMinimapEligibleElement = (element) =>
  DEFAULT_ELIGIBLE_TYPES.has(element?.type) &&
  element.visible !== false &&
  element.renderable !== false &&
  element.props?.show !== false;

const createGridLocalToCanvasPoint = (grid, world) => {
  const origin = world.toLocal(grid.toGlobal(new Point(0, 0)));
  const xAxis = world.toLocal(grid.toGlobal(new Point(1, 0)));
  const yAxis = world.toLocal(grid.toGlobal(new Point(0, 1)));
  const basisX = {
    x: xAxis.x - origin.x,
    y: xAxis.y - origin.y,
  };
  const basisY = {
    x: yAxis.x - origin.x,
    y: yAxis.y - origin.y,
  };

  return (x, y) => ({
    x: origin.x + basisX.x * x + basisY.x * y,
    y: origin.y + basisX.y * x + basisY.y * y,
  });
};

const normalizeSize = (size) => {
  if (typeof size === 'number') return { width: size, height: size };
  if (Number.isFinite(size?.width) && Number.isFinite(size?.height)) {
    return size;
  }
  return null;
};

const normalizeGap = (gap) => {
  if (typeof gap === 'number') return { x: gap, y: gap };
  return {
    x: Number.isFinite(gap?.x) ? gap.x : 0,
    y: Number.isFinite(gap?.y) ? gap.y : 0,
  };
};

const getViewportPolygon = ({ patchmap, canvasBounds, scale, origin }) => {
  const viewport = patchmap?.viewport;
  const world = patchmap?.world;
  const screen = patchmap?.app?.renderer?.screen;
  const screenWidth = viewport?.screenWidth ?? screen?.width;
  const screenHeight = viewport?.screenHeight ?? screen?.height;
  if (!viewport || !world || !screenWidth || !screenHeight) return [];

  return [
    new Point(0, 0),
    new Point(screenWidth, 0),
    new Point(screenWidth, screenHeight),
    new Point(0, screenHeight),
  ].map((point) =>
    projectPoint(
      screenPointToCanvasPoint({ world, point }),
      canvasBounds,
      scale,
      origin,
    ),
  );
};

const screenPointToCanvasPoint = ({ world, point }) => {
  return world.toLocal(point);
};

const projectRect = (rect, canvasBounds, scale, origin) => ({
  x: origin.x + (rect.x - canvasBounds.x) * scale.x,
  y: origin.y + (rect.y - canvasBounds.y) * scale.y,
  width: rect.width * scale.x,
  height: rect.height * scale.y,
});

const projectPoint = (point, canvasBounds, scale, origin) => ({
  x: origin.x + (point.x - canvasBounds.x) * scale.x,
  y: origin.y + (point.y - canvasBounds.y) * scale.y,
});

const silhouetteIntersectsCanvasBounds = (silhouette, canvasBounds) =>
  silhouette.paths.some((path) =>
    pathIntersectsCanvasBounds(path, canvasBounds),
  );

const pathIntersectsCanvasBounds = (path, canvasBounds) => {
  if (!Array.isArray(path) || path.length === 0) return false;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const point of path) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  return (
    maxX >= canvasBounds.x &&
    minX <= canvasBounds.right &&
    maxY >= canvasBounds.y &&
    minY <= canvasBounds.bottom
  );
};
