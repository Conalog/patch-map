import { Graphics, Point, Rectangle } from 'pixi.js';
import { getSafeViewportScale } from '../utils/viewport';
import { getHandlePositions } from './resize-utils';

/**
 * @typedef {'top-left' | 'top-right' | 'bottom-right' | 'bottom-left' | 'top' | 'right' | 'bottom' | 'left'} ResizeHandleName
 */

/**
 * @typedef {object} ResizeBounds
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 */

/**
 * @typedef {object} ResizeHandleStyle
 * @property {string | number} fill
 * @property {string | number} stroke
 * @property {number} size
 */

const RESIZE_CURSORS = {
  'top-left': 'nwse-resize',
  top: 'ns-resize',
  'top-right': 'nesw-resize',
  right: 'ew-resize',
  'bottom-right': 'nwse-resize',
  bottom: 'ns-resize',
  'bottom-left': 'nesw-resize',
  left: 'ew-resize',
};

const RESIZE_CURSOR_ANGLES = {
  right: 0,
  'bottom-right': 45,
  bottom: 90,
  'bottom-left': 135,
  left: 180,
  'top-left': 225,
  top: 270,
  'top-right': 315,
};

const createResizeCursor = (degrees) => {
  const path =
    'm233-440 75 75q11 12 11.5 28.5T308-308q-12 12-28 12t-28-12L108-452q-6-6-8.5-13T97-480q0-8 2.5-15t8.5-13l144-144q12-12 28-12t28 12q12 12 12 28.5T308-595l-75 75h494l-75-75q-11-12-11.5-28.5T652-652q12-12 28-12t28 12l144 144q6 6 8.5 13t2.5 15q0 8-2.5 15t-8.5 13L708-308q-12 12-28 12t-28-12q-12-12-12-28.5t12-28.5l75-75H233Z';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 -960 960 960"><g transform="rotate(${degrees} 480 -480)"><path d="${path}" fill="black" stroke="white" stroke-width="70" stroke-linejoin="round" paint-order="stroke fill"/></g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, ${getResizeCursorFallback(degrees)}`;
};

const createRotateCursor = (degrees) => {
  const rotation = degrees + 35;
  const path =
    'M482-160q-134 0-228-93t-94-227v-7l-36 36q-11 11-28 11t-28-11q-11-11-11-28t11-28l104-104q12-12 28-12t28 12l104 104q11 11 11 28t-11 28q-11 11-28 11t-28-11l-36-36v7q0 100 70.5 170T482-240q16 0 31.5-2t30.5-7q17-5 32 1t23 21q8 16 1.5 31.5T577-175q-23 8-47 11.5t-48 3.5Zm-4-560q-16 0-31.5 2t-30.5 7q-17 5-32.5-1T360-733q-8-15-1.5-30.5T381-784q24-8 48-12t49-4q134 0 228 93t94 227v7l36-36q11-11 28-11t28 11q11 11 11 28t-11 28L788-349q-12 12-28 12t-28-12L628-453q-11-11-11-28t11-28q11-11 28-11t28 11l36 36v-7q0-100-70.5-170T478-720Z';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 -960 960 960"><g transform="rotate(${rotation} 480 -480)"><path d="${path}" fill="black" stroke="white" stroke-width="70" paint-order="stroke fill"/></g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, crosshair`;
};

const ROTATE_CURSORS = {
  'top-left': createRotateCursor(-45),
  'top-right': createRotateCursor(45),
  'bottom-right': createRotateCursor(135),
  'bottom-left': createRotateCursor(-135),
};

const CORNER_RESIZE_HANDLES = [
  'top-left',
  'top-right',
  'bottom-right',
  'bottom-left',
];
const EDGE_RESIZE_HANDLES = ['top', 'right', 'bottom', 'left'];
const EDGE_HIT_WIDTH = 12;
const CORNER_HIT_SIZE = 12;
const ROTATE_HIT_SIZE = 18;
const ROTATE_HIT_OFFSET = 18;
const RESIZE_FRAME_Z_INDEX = 0;
const EDGE_TARGET_Z_INDEX = 1;
const ROTATE_TARGET_Z_INDEX = 1;
const CORNER_HANDLE_Z_INDEX = 2;

/**
 * Renders transformer handles and hit targets onto a dedicated layer.
 * This class is UI-only and delegates gesture handling through callback hooks.
 */
export default class TransformHandleLayer {
  /**
   * @private
   * @type {PIXI.Container}
   */
  _transformer;

  /**
   * @private
   * @type {PIXI.Container}
   */
  _layer;

  /**
   * @private
   * @type {() => import('pixi-viewport').Viewport | null}
   */
  _getViewport;

  /**
   * @private
   * @type {() => ResizeHandleStyle}
   */
  _getHandleStyle;

  /**
   * @private
   * @type {() => number}
   */
  _getStrokeWidth;

  /**
   * @private
   * @type {(handle: ResizeHandleName, event: import('pixi.js').FederatedPointerEvent) => void}
   */
  _onResizePointerDown;

  /**
   * @private
   * @type {(handle: ResizeHandleName, event: import('pixi.js').FederatedPointerEvent) => void}
   */
  _onRotatePointerDown;

  /**
   * @private
   * @type {Map<ResizeHandleName, PIXI.Graphics>}
   */
  _handleMap = new Map();

  /**
   * @private
   * @type {Map<ResizeHandleName, PIXI.Graphics>}
   */
  _edgeMap = new Map();

  /**
   * @private
   * @type {Map<ResizeHandleName, PIXI.Graphics>}
   */
  _rotateMap = new Map();

  /**
   * @private
   * @type {PIXI.Graphics | null}
   */
  _resizeFrame = null;

  /**
   * @param {object} options
   * @param {PIXI.Container} options.transformer
   * @param {PIXI.Container} options.layer
   * @param {() => import('pixi-viewport').Viewport | null} options.getViewport
   * @param {() => ResizeHandleStyle} options.getHandleStyle
   * @param {() => number} options.getStrokeWidth
   * @param {(handle: ResizeHandleName, event: import('pixi.js').FederatedPointerEvent) => void} options.onResizePointerDown
   * @param {(handle: ResizeHandleName, event: import('pixi.js').FederatedPointerEvent) => void} options.onRotatePointerDown
   */
  constructor({
    transformer,
    layer,
    getViewport,
    getHandleStyle,
    getStrokeWidth,
    onResizePointerDown,
    onRotatePointerDown = () => {},
  }) {
    this._transformer = transformer;
    this._layer = layer;
    this._getViewport = getViewport;
    this._getHandleStyle = getHandleStyle;
    this._getStrokeWidth = getStrokeWidth;
    this._onResizePointerDown = onResizePointerDown;
    this._onRotatePointerDown = onRotatePointerDown;
  }

  /**
   * Clears and hides all handle/edge graphics while keeping pooled instances.
   *
   * @returns {void}
   */
  clear() {
    if (this._resizeFrame) {
      this._resizeFrame.clear();
      this._resizeFrame.visible = false;
    }

    this._handleMap.forEach((handle) => {
      handle.clear();
      handle.visible = false;
      handle.hitArea = null;
    });

    this._edgeMap.forEach((edge) => {
      edge.clear();
      edge.visible = false;
    });

    this._rotateMap.forEach((rotateTarget) => {
      rotateTarget.clear();
      rotateTarget.visible = false;
      rotateTarget.hitArea = null;
    });
  }

  /**
   * Draws resize handles and rotate hit targets.
   *
   * @param {ResizeBounds | { resizeBounds?: ResizeBounds, resizeFrame?: object, rotateFrame?: object } | null | undefined} options
   * @returns {void}
   */
  draw(options) {
    const { resizeBounds, resizeFrame, rotateFrame } =
      normalizeDrawOptions(options);

    if (!resizeFrame && !resizeBounds && !rotateFrame) {
      this.clear();
      return;
    }

    this.#ensureHandles();
    this.#ensureEdges();
    this.#ensureRotateTargets();
    this.#ensureResizeFrame();

    const viewport = this._getViewport();
    const viewportScale = getSafeViewportScale(viewport);
    const handleStyle = this._getHandleStyle();
    const strokeWidth = this._getStrokeWidth();
    const size = handleStyle.size / viewportScale;
    const halfSize = size / 2;
    const hitSize = Math.max(size, CORNER_HIT_SIZE / viewportScale);
    const halfHitSize = hitSize / 2;
    const positions = getResizeHandlePositions({ resizeBounds, resizeFrame });
    const resizeCursors = getResizeCursors(resizeFrame);

    this.#drawResizeHandles({
      positions,
      cursors: resizeCursors,
      viewport,
      size,
      halfSize,
      hitSize,
      halfHitSize,
      handleStyle,
      strokeWidth,
    });
    this.#drawResizeFrame({
      bounds: resizeBounds,
      frame: resizeFrame,
      viewport,
      viewportScale,
      strokeWidth,
      strokeColor: handleStyle.stroke,
    });
    this.#drawEdgeTargets({
      bounds: resizeBounds,
      frame: resizeFrame,
      positions,
      cursors: resizeCursors,
      viewportScale,
    });
    this.#drawRotateTargets({
      frame: rotateFrame,
      viewport,
      viewportScale,
      handleStyle,
    });
  }

  #drawResizeHandles({
    positions,
    cursors,
    viewport,
    size,
    halfSize,
    hitSize,
    halfHitSize,
    handleStyle,
    strokeWidth,
  }) {
    this._handleMap.forEach((handle, key) => {
      const position = positions[key];
      if (!position) {
        handle.visible = false;
        return;
      }

      const localPosition = this._transformer.toLocal(
        new Point(position.x, position.y),
        viewport ?? undefined,
      );

      handle.hitArea = new Rectangle(
        -halfHitSize,
        -halfHitSize,
        hitSize,
        hitSize,
      );
      handle.clear();
      handle
        .rect(-halfSize, -halfSize, size, size)
        .fill({ color: handleStyle.fill })
        .stroke({
          color: handleStyle.stroke,
          width: strokeWidth,
        });
      handle.position.set(localPosition.x, localPosition.y);
      handle.cursor = cursors[key] ?? RESIZE_CURSORS[key] ?? 'default';
      handle.visible = true;
    });
  }

  #ensureHandles() {
    if (this._handleMap.size > 0) return;

    CORNER_RESIZE_HANDLES.forEach((handle) => {
      const graphic = new Graphics();
      graphic.eventMode = 'static';
      graphic.zIndex = CORNER_HANDLE_Z_INDEX;
      graphic.label = `resize-handle:${handle}`;
      graphic.cursor = RESIZE_CURSORS[handle] ?? 'default';
      graphic.on('pointerdown', (event) =>
        this._onResizePointerDown(handle, event),
      );
      this._handleMap.set(handle, graphic);
      this._layer.addChild(graphic);
    });
  }

  #ensureEdges() {
    if (this._edgeMap.size > 0) return;

    EDGE_RESIZE_HANDLES.forEach((handle) => {
      const graphic = new Graphics();
      graphic.eventMode = 'static';
      graphic.zIndex = EDGE_TARGET_Z_INDEX;
      graphic.label = `resize-edge:${handle}`;
      graphic.cursor = RESIZE_CURSORS[handle] ?? 'default';
      graphic.on('pointerdown', (event) =>
        this._onResizePointerDown(handle, event),
      );
      this._edgeMap.set(handle, graphic);
      this._layer.addChild(graphic);
    });
  }

  #ensureRotateTargets() {
    if (this._rotateMap.size > 0) return;

    CORNER_RESIZE_HANDLES.forEach((handle) => {
      const graphic = new Graphics();
      graphic.eventMode = 'static';
      graphic.zIndex = ROTATE_TARGET_Z_INDEX;
      graphic.label = `rotate-handle:${handle}`;
      graphic.cursor = ROTATE_CURSORS[handle] ?? 'crosshair';
      graphic.on('pointerdown', (event) =>
        this._onRotatePointerDown(handle, event),
      );
      this._rotateMap.set(handle, graphic);
      this._layer.addChild(graphic);
    });
  }

  #ensureResizeFrame() {
    if (this._resizeFrame) return;

    const frame = new Graphics();
    frame.eventMode = 'none';
    frame.zIndex = RESIZE_FRAME_Z_INDEX;
    frame.label = 'resize-frame';
    frame.visible = false;
    this._resizeFrame = frame;
    this._layer.addChild(frame);
  }

  #drawResizeFrame({
    bounds,
    frame,
    viewport,
    viewportScale,
    strokeWidth,
    strokeColor,
  }) {
    if (!this._resizeFrame) return;
    if (!frame && !bounds) {
      this._resizeFrame.clear();
      this._resizeFrame.visible = false;
      return;
    }

    this._resizeFrame.clear();
    if (frame?.corners) {
      this._resizeFrame
        .poly(
          frame.corners.map((corner) =>
            this._transformer.toLocal(
              new Point(corner.x, corner.y),
              viewport ?? undefined,
            ),
          ),
        )
        .stroke({
          color: strokeColor,
          width: strokeWidth,
        });
    } else {
      const localRect = this.#toLocalRect(bounds, viewport, viewportScale);
      this._resizeFrame
        .rect(localRect.x, localRect.y, localRect.width, localRect.height)
        .stroke({
          color: strokeColor,
          width: strokeWidth,
        });
    }
    this._resizeFrame.visible = true;
  }

  #drawEdgeTargets({ bounds, frame, positions, cursors, viewportScale }) {
    if (!frame && !bounds) {
      this._edgeMap.forEach((edge) => {
        edge.clear();
        edge.visible = false;
      });
      return;
    }

    if (frame?.corners) {
      this.#drawFrameEdgeTargets({ frame, positions, cursors, viewportScale });
      return;
    }

    const edgeHitWidth = EDGE_HIT_WIDTH / viewportScale;
    const viewport = this._getViewport();
    const { x, y, width, height } = this.#toLocalRect(
      bounds,
      viewport,
      viewportScale,
    );

    const edgeAreas = {
      top: {
        x,
        y: y - edgeHitWidth / 2,
        width,
        height: edgeHitWidth,
      },
      right: {
        x: x + width - edgeHitWidth / 2,
        y,
        width: edgeHitWidth,
        height,
      },
      bottom: {
        x,
        y: y + height - edgeHitWidth / 2,
        width,
        height: edgeHitWidth,
      },
      left: {
        x: x - edgeHitWidth / 2,
        y,
        width: edgeHitWidth,
        height,
      },
    };

    this._edgeMap.forEach((edge, key) => {
      const area = edgeAreas[key];
      if (!area) {
        edge.visible = false;
        return;
      }
      edge.clear();
      edge.rect(area.x, area.y, area.width, area.height).fill({
        color: this._getHandleStyle().fill,
        alpha: 0.001,
      });
      edge.cursor = cursors[key] ?? RESIZE_CURSORS[key] ?? 'default';
      edge.visible = Boolean(positions[key]);
    });
  }

  #drawFrameEdgeTargets({ frame, positions, cursors, viewportScale }) {
    const edgeHitWidth = EDGE_HIT_WIDTH / viewportScale;
    const viewport = this._getViewport();
    const edgeCorners = {
      top: [frame.corners[0], frame.corners[1]],
      right: [frame.corners[1], frame.corners[2]],
      bottom: [frame.corners[3], frame.corners[2]],
      left: [frame.corners[0], frame.corners[3]],
    };

    this._edgeMap.forEach((edge, key) => {
      const corners = edgeCorners[key];
      if (!corners) {
        edge.visible = false;
        return;
      }
      const start = this._transformer.toLocal(
        new Point(corners[0].x, corners[0].y),
        viewport ?? undefined,
      );
      const end = this._transformer.toLocal(
        new Point(corners[1].x, corners[1].y),
        viewport ?? undefined,
      );

      edge.clear();
      edge.poly([start, end]).stroke({
        color: this._getHandleStyle().fill,
        alpha: 0.001,
        width: edgeHitWidth,
      });
      edge.cursor = cursors[key] ?? RESIZE_CURSORS[key] ?? 'default';
      edge.visible = Boolean(positions[key]);
    });
  }

  #drawRotateTargets({ frame, viewport, viewportScale, handleStyle }) {
    if (!frame?.corners || !frame?.center) {
      this._rotateMap.forEach((target) => {
        target.clear();
        target.visible = false;
        target.hitArea = null;
      });
      return;
    }

    const hitSize = ROTATE_HIT_SIZE / viewportScale;
    const halfHitSize = hitSize / 2;
    const offset = ROTATE_HIT_OFFSET / viewportScale;
    const positions = getCornerMap(frame.corners);

    this._rotateMap.forEach((target, key) => {
      const corner = positions[key];
      if (!corner) {
        target.visible = false;
        return;
      }

      const direction = normalizeVector({
        x: corner.x - frame.center.x,
        y: corner.y - frame.center.y,
      });
      const targetPosition = {
        x: corner.x + direction.x * offset,
        y: corner.y + direction.y * offset,
      };
      const localPosition = this._transformer.toLocal(
        new Point(targetPosition.x, targetPosition.y),
        viewport ?? undefined,
      );

      target.hitArea = new Rectangle(
        -halfHitSize,
        -halfHitSize,
        hitSize,
        hitSize,
      );
      target.clear();
      target.rect(-halfHitSize, -halfHitSize, hitSize, hitSize).fill({
        color: handleStyle.fill,
        alpha: 0.001,
      });
      target.position.set(localPosition.x, localPosition.y);
      target.visible = true;
    });
  }

  #toLocalRect(bounds, viewport, viewportScale) {
    const minEdgeSize = 1 / viewportScale;
    const topLeft = this._transformer.toLocal(
      new Point(bounds.x, bounds.y),
      viewport ?? undefined,
    );
    const topRight = this._transformer.toLocal(
      new Point(bounds.x + bounds.width, bounds.y),
      viewport ?? undefined,
    );
    const bottomRight = this._transformer.toLocal(
      new Point(bounds.x + bounds.width, bounds.y + bounds.height),
      viewport ?? undefined,
    );
    const bottomLeft = this._transformer.toLocal(
      new Point(bounds.x, bounds.y + bounds.height),
      viewport ?? undefined,
    );

    const leftX = Math.min(topLeft.x, topRight.x, bottomRight.x, bottomLeft.x);
    const rightX = Math.max(topLeft.x, topRight.x, bottomRight.x, bottomLeft.x);
    const topY = Math.min(topLeft.y, topRight.y, bottomRight.y, bottomLeft.y);
    const bottomY = Math.max(
      topLeft.y,
      topRight.y,
      bottomRight.y,
      bottomLeft.y,
    );

    return {
      x: leftX,
      y: topY,
      width: Math.max(minEdgeSize, rightX - leftX),
      height: Math.max(minEdgeSize, bottomY - topY),
    };
  }
}

const normalizeDrawOptions = (options) => {
  if (!options) return {};
  if (
    'resizeBounds' in options ||
    'resizeFrame' in options ||
    'rotateFrame' in options
  )
    return options;
  return { resizeBounds: options };
};

const getResizeHandlePositions = ({ resizeBounds, resizeFrame }) => {
  if (resizeFrame?.corners) {
    return getFrameHandlePositions(resizeFrame);
  }
  return resizeBounds ? getHandlePositions(resizeBounds) : {};
};

const getFrameHandlePositions = (frame) => {
  const corners = getCornerMap(frame.corners);
  return {
    ...corners,
    top: midpoint(corners['top-left'], corners['top-right']),
    right: midpoint(corners['top-right'], corners['bottom-right']),
    bottom: midpoint(corners['bottom-left'], corners['bottom-right']),
    left: midpoint(corners['top-left'], corners['bottom-left']),
  };
};

const getResizeCursors = (frame) => {
  const rotationDegrees = frame?.rotation
    ? (frame.rotation * 180) / Math.PI
    : 0;

  return Object.fromEntries(
    Object.entries(RESIZE_CURSOR_ANGLES).map(([handle, angle]) => [
      handle,
      getResizeCursorForAngle(angle + rotationDegrees),
    ]),
  );
};

const getResizeCursorForAngle = (angle) => {
  const normalized = ((angle % 180) + 180) % 180;
  return createResizeCursor(normalized);
};

const getResizeCursorFallback = (angle) => {
  const normalized = ((angle % 180) + 180) % 180;
  const step = Math.round(normalized / 45) % 4;
  return ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'][step];
};

const getCornerMap = (corners) => ({
  'top-left': corners[0],
  'top-right': corners[1],
  'bottom-right': corners[2],
  'bottom-left': corners[3],
});

const midpoint = (a, b) => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

const normalizeVector = ({ x, y }) => {
  const length = Math.hypot(x, y);
  if (!length) return { x: 0, y: 0 };
  return { x: x / length, y: y / length };
};
