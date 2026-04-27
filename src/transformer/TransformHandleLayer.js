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
const ROTATE_CURSOR = 'grab';

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
   * @param {ResizeBounds | { resizeBounds?: ResizeBounds, rotateFrame?: object } | null | undefined} options
   * @returns {void}
   */
  draw(options) {
    const { resizeBounds, rotateFrame } = normalizeDrawOptions(options);

    if (!resizeBounds && !rotateFrame) {
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
    const positions = resizeBounds ? getHandlePositions(resizeBounds) : {};

    this.#drawResizeHandles({
      positions,
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
      viewport,
      viewportScale,
      strokeWidth,
      strokeColor: handleStyle.stroke,
    });
    this.#drawEdgeTargets(resizeBounds, positions, viewportScale);
    this.#drawRotateTargets({
      frame: rotateFrame,
      viewport,
      viewportScale,
      handleStyle,
    });
  }

  #drawResizeHandles({
    positions,
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
      graphic.cursor = ROTATE_CURSOR;
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
    viewport,
    viewportScale,
    strokeWidth,
    strokeColor,
  }) {
    if (!this._resizeFrame) return;
    if (!bounds) {
      this._resizeFrame.clear();
      this._resizeFrame.visible = false;
      return;
    }

    const localRect = this.#toLocalRect(bounds, viewport, viewportScale);
    this._resizeFrame.clear();
    this._resizeFrame
      .rect(localRect.x, localRect.y, localRect.width, localRect.height)
      .stroke({
        color: strokeColor,
        width: strokeWidth,
      });
    this._resizeFrame.visible = true;
  }

  #drawEdgeTargets(bounds, positions, viewportScale) {
    if (!bounds) {
      this._edgeMap.forEach((edge) => {
        edge.clear();
        edge.visible = false;
      });
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
  if ('resizeBounds' in options || 'rotateFrame' in options) return options;
  return { resizeBounds: options };
};

const getCornerMap = (corners) => ({
  'top-left': corners[0],
  'top-right': corners[1],
  'bottom-right': corners[2],
  'bottom-left': corners[3],
});

const normalizeVector = ({ x, y }) => {
  const length = Math.hypot(x, y);
  if (!length) return { x: 0, y: 0 };
  return { x: x / length, y: y / length };
};
