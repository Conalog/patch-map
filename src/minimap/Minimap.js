import { Point } from 'pixi.js';
import {
  createMinimapObjectSnapshot,
  createMinimapViewport,
  minimapPointToCanvasPoint,
} from './model';

const DEFAULT_OPTIONS = Object.freeze({
  width: 180,
  height: 120,
  opacity: 0.92,
  position: 'bottom-right',
  positionOffset: 16,
  style: {
    canvasFill: '#ffffff',
    canvasStroke: '#d4d4d8',
    objectFill: '#94a3b8',
    viewportFill: 'rgba(12, 115, 191, 0.08)',
    viewportStroke: '#0c73bf',
    viewportStrokeWidth: 2,
  },
});
const DEFAULT_RECT_FILL = '#cbd5e1';
const MINIMAP_CANVAS_STROKE_WIDTH = 1;
const MINIMAP_POSITIONS = new Set([
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
]);
const POSITION_STYLE_KEYS = Object.freeze([
  'position',
  'top',
  'right',
  'bottom',
  'left',
  'zIndex',
]);
const PATCHMAP_EVENTS = Object.freeze([
  ['patchmap:draw', '_requestObjectRender'],
  ['patchmap:updated', '_requestObjectRender'],
  ['patchmap:rotated', '_requestObjectRender'],
  ['patchmap:flipped', '_requestObjectRender'],
]);
const VIEWPORT_EVENTS = Object.freeze([
  ['moved', '_requestRender'],
  ['zoomed', '_requestRender'],
  ['world_transformed', '_requestRender'],
  ['object_transformed', '_requestObjectRender'],
]);
const POINTER_EVENTS = Object.freeze([
  ['pointerdown', '_onPointerDown'],
  ['pointermove', '_onPointerMove'],
  ['pointerup', '_onPointerUp'],
  ['pointercancel', '_onPointerUp'],
  ['pointerleave', '_onPointerUp'],
]);

/**
 * @typedef {object} MinimapStyle
 * @property {string | number} [canvasFill]
 * @property {string | number} [canvasStroke]
 * @property {string | number} [objectFill]
 * @property {string} [viewportFill]
 * @property {string | number} [viewportStroke]
 * @property {number} [viewportStrokeWidth]
 */

/**
 * @typedef {object} MinimapOptions
 * @property {number} [width]
 * @property {number} [height]
 * @property {number} [opacity]
 * @property {'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'} [position]
 * @property {number} [positionOffset]
 * @property {MinimapStyle} [style]
 */

export default class Minimap {
  /**
   * @param {object} params
   * @param {import('../patchmap').Patchmap} params.patchmap
   * @param {HTMLElement} params.container
   * @param {MinimapOptions} [params.options]
   * @param {(target: Minimap) => void} [params.onDestroy]
   */
  constructor({ patchmap, container, options = {}, onDestroy } = {}) {
    if (!patchmap?.canvas?.bounds) {
      throw new TypeError('patchmap.createMinimap() requires canvas.bounds.');
    }
    if (!container?.appendChild) {
      throw new TypeError('patchmap.createMinimap() requires a DOM container.');
    }

    this.patchmap = patchmap;
    this.container = container;
    this.options = mergeOptions(options);
    this.onDestroy = typeof onDestroy === 'function' ? onDestroy : null;
    this.canvas = document.createElement('canvas');
    this.context = this.canvas.getContext('2d');
    this._objectLayer = document.createElement('canvas');
    this._objectLayerContext = this._objectLayer.getContext('2d');
    this._snapshot = null;
    this._objectSnapshot = null;
    this._objectLayerKey = null;
    this._objectsDirty = true;
    this._containerStyleSnapshot = null;
    this._frame = null;
    this._destroyed = false;
    this._isPointerActive = false;

    this._requestRender = () => this.requestRender();
    this._requestObjectRender = () => this.invalidateObjects();
    this._onPointerDown = (event) => this.handlePointerDown(event);
    this._onPointerMove = (event) => this.handlePointerMove(event);
    this._onPointerUp = () => this.handlePointerUp();

    this.mount();
    this.attach();
    this.render();
  }

  get destroyed() {
    return this._destroyed;
  }

  mount() {
    this.applyContainerPosition();
    this.canvas.width = this.options.width;
    this.canvas.height = this.options.height;
    this.canvas.style.width = `${this.options.width}px`;
    this.canvas.style.height = `${this.options.height}px`;
    this.canvas.style.opacity = String(this.options.opacity);
    this.canvas.style.display = 'block';
    this.canvas.style.cursor = 'pointer';
    this.canvas.style.touchAction = 'none';
    this.container.appendChild(this.canvas);
  }

  applyContainerPosition() {
    if (!this.container?.style) return;
    this._containerStyleSnapshot ??= snapshotContainerStyle(this.container);

    const [vertical, horizontal] = this.options.position.split('-');
    const offset = `${this.options.positionOffset}px`;
    const containerPosition =
      this.container.dataset.patchmapMinimapAuto === 'true'
        ? 'absolute'
        : 'fixed';
    Object.assign(this.container.style, {
      position: containerPosition,
      top: vertical === 'top' ? offset : '',
      right: horizontal === 'right' ? offset : '',
      bottom: vertical === 'bottom' ? offset : '',
      left: horizontal === 'left' ? offset : '',
      zIndex: '1',
    });
  }

  attach() {
    for (const [event, handlerKey] of PATCHMAP_EVENTS) {
      this.patchmap.on(event, this[handlerKey]);
    }
    for (const [event, handlerKey] of VIEWPORT_EVENTS) {
      this.patchmap.viewport?.on?.(event, this[handlerKey]);
    }
    for (const [event, handlerKey] of POINTER_EVENTS) {
      this.canvas.addEventListener(event, this[handlerKey]);
    }
  }

  detach() {
    for (const [event, handlerKey] of PATCHMAP_EVENTS) {
      this.patchmap?.off?.(event, this[handlerKey]);
    }
    for (const [event, handlerKey] of VIEWPORT_EVENTS) {
      this.patchmap?.viewport?.off?.(event, this[handlerKey]);
    }
    for (const [event, handlerKey] of POINTER_EVENTS) {
      this.canvas?.removeEventListener(event, this[handlerKey]);
    }
  }

  invalidateObjects() {
    if (this._destroyed) return;
    this._objectsDirty = true;
    this.requestRender();
  }

  requestRender() {
    if (this._destroyed || this._frame !== null) return;
    const requestFrame =
      globalThis.requestAnimationFrame ??
      ((callback) => globalThis.setTimeout(callback, 16));
    this._frame = requestFrame(() => {
      this._frame = null;
      this.render();
    });
  }

  render() {
    if (!this.context || !this._objectLayerContext) return;
    this.cancelPendingRender();

    const ratio = globalThis.devicePixelRatio || 1;
    const width = this.options.width;
    const height = this.options.height;
    const pixelWidth = Math.max(Math.ceil(width * ratio), 1);
    const pixelHeight = Math.max(Math.ceil(height * ratio), 1);
    if (
      this.canvas.width !== pixelWidth ||
      this.canvas.height !== pixelHeight
    ) {
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;
      this._objectsDirty = true;
    }

    const objectSnapshot = this.getObjectSnapshot({
      ratio,
      width,
      height,
      pixelWidth,
      pixelHeight,
    });
    if (!objectSnapshot) return;

    this._snapshot = {
      ...objectSnapshot,
      viewport: createMinimapViewport({
        patchmap: this.patchmap,
        canvasBounds: objectSnapshot.canvasBounds,
        scale: objectSnapshot.scale,
        origin: objectSnapshot.origin,
      }),
    };

    const ctx = this.context;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, pixelWidth, pixelHeight);
    ctx.drawImage(this._objectLayer, 0, 0);
    ctx.restore();

    ctx.save();
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.drawViewportLayer(ctx, this._snapshot);
    ctx.restore();
  }

  cancelPendingRender() {
    if (this._frame === null) return;
    const cancelFrame =
      globalThis.cancelAnimationFrame ?? globalThis.clearTimeout;
    cancelFrame?.(this._frame);
    this._frame = null;
  }

  getObjectSnapshot({ ratio, width, height, pixelWidth, pixelHeight }) {
    const layerKey = this.getObjectLayerKey({ ratio, pixelWidth, pixelHeight });
    if (
      !this._objectsDirty &&
      this._objectSnapshot &&
      this._objectLayerKey === layerKey
    ) {
      return this._objectSnapshot;
    }

    const snapshot = createMinimapObjectSnapshot({
      patchmap: this.patchmap,
      width,
      height,
      inset: getMinimapContentInset(this.options.style),
    });
    if (!snapshot) {
      this._objectSnapshot = null;
      return null;
    }

    this._objectSnapshot = snapshot;
    this._objectLayerKey = layerKey;
    this._objectsDirty = false;
    this.drawObjectLayer({
      snapshot,
      ratio,
      pixelWidth,
      pixelHeight,
    });
    return snapshot;
  }

  getObjectLayerKey({ ratio, pixelWidth, pixelHeight }) {
    const style = this.options.style;
    return JSON.stringify({
      ratio,
      pixelWidth,
      pixelHeight,
      canvasFill: style.canvasFill,
      canvasStroke: style.canvasStroke,
      objectFill: style.objectFill,
    });
  }

  drawObjectLayer({ snapshot, ratio, pixelWidth, pixelHeight }) {
    const ctx = this._objectLayerContext;
    if (!ctx) return;
    const { width, height } = this.options;

    if (
      this._objectLayer.width !== pixelWidth ||
      this._objectLayer.height !== pixelHeight
    ) {
      this._objectLayer.width = pixelWidth;
      this._objectLayer.height = pixelHeight;
    }

    ctx.save();
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    this.drawStaticSnapshot(ctx, snapshot);
    ctx.restore();
  }

  drawStaticSnapshot(ctx, snapshot) {
    const style = this.options.style;
    const canvas = snapshot.canvas;

    ctx.fillStyle = style.canvasFill;
    ctx.strokeStyle = style.canvasStroke;
    ctx.lineWidth = 1;
    ctx.fillRect(canvas.x, canvas.y, canvas.width, canvas.height);
    ctx.strokeRect(canvas.x, canvas.y, canvas.width, canvas.height);

    ctx.save();
    ctx.beginPath();
    ctx.rect(canvas.x, canvas.y, canvas.width, canvas.height);
    ctx.clip();
    for (const object of snapshot.objects) {
      this.drawSilhouette(ctx, object);
    }
    ctx.restore();
  }

  drawViewportLayer(ctx, snapshot) {
    const canvas = snapshot.canvas;
    ctx.save();
    ctx.beginPath();
    ctx.rect(canvas.x, canvas.y, canvas.width, canvas.height);
    ctx.clip();
    this.drawViewport(ctx, snapshot.viewport, this.options.style);
    ctx.restore();
  }

  drawSilhouette(ctx, object) {
    const paths = object.paths?.length ? object.paths : [object.points];
    if (!paths.length) return;

    ctx.fillStyle =
      object.type === 'rect' &&
      this.options.style.objectFill === DEFAULT_OPTIONS.style.objectFill
        ? DEFAULT_RECT_FILL
        : this.options.style.objectFill;
    ctx.beginPath();
    for (const path of paths) {
      this.drawPath(ctx, path);
    }
    ctx.fill('evenodd');
  }

  drawPath(ctx, points) {
    if (!points?.length) return;

    ctx.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) {
      ctx.lineTo(points[index].x, points[index].y);
    }
    ctx.closePath();
  }

  drawViewport(ctx, points, style) {
    if (!points.length) return;

    ctx.beginPath();
    this.drawPath(ctx, points);
    ctx.fillStyle = style.viewportFill;
    ctx.strokeStyle = style.viewportStroke;
    ctx.lineWidth = style.viewportStrokeWidth;
    ctx.fill();
    ctx.stroke();
  }

  handlePointerDown(event) {
    if (this._destroyed) return;
    this._isPointerActive = true;
    this.canvas.setPointerCapture?.(event.pointerId);
    this.moveViewportFromEvent(event);
  }

  handlePointerMove(event) {
    if (!this._isPointerActive || this._destroyed) return;
    this.moveViewportFromEvent(event);
  }

  handlePointerUp() {
    this._isPointerActive = false;
  }

  moveViewportFromEvent(event) {
    const snapshot = this._snapshot;
    if (!snapshot) return;

    const rect = this.canvas.getBoundingClientRect();
    const point = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    const canvasPoint = clampCanvasPoint(
      minimapPointToCanvasPoint({
        point,
        canvasBounds: snapshot.canvasBounds,
        scale: snapshot.scale,
        origin: snapshot.origin,
      }),
      snapshot.canvasBounds,
    );
    const globalPoint = this.patchmap.world.toGlobal(
      new Point(canvasPoint.x, canvasPoint.y),
    );
    const viewportPoint = this.patchmap.viewport.toLocal(globalPoint);

    this.patchmap.viewport.moveCenter(viewportPoint.x, viewportPoint.y);
    this.patchmap.viewport.emit?.('moved', {
      viewport: this.patchmap.viewport,
      type: 'minimap',
    });
    this.requestRender();
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    if (this._frame !== null) {
      this.cancelPendingRender();
    }
    this.detach();
    this.canvas?.remove();
    restoreContainerStyle(this.container, this._containerStyleSnapshot);
    this.onDestroy?.(this);
    this.patchmap = null;
    this.container = null;
    this.canvas = null;
    this.context = null;
    this._objectLayer = null;
    this._objectLayerContext = null;
    this._snapshot = null;
    this._objectSnapshot = null;
    this._containerStyleSnapshot = null;
  }
}

const mergeOptions = (options) => {
  const merged = {
    ...DEFAULT_OPTIONS,
    ...options,
    style: {
      ...DEFAULT_OPTIONS.style,
      ...(options.style ?? {}),
    },
  };
  const style = {
    canvasFill: merged.style.canvasFill,
    canvasStroke: merged.style.canvasStroke,
    objectFill: merged.style.objectFill,
    viewportFill: merged.style.viewportFill,
    viewportStroke: merged.style.viewportStroke,
    viewportStrokeWidth: normalizeNonNegativeNumber(
      merged.style.viewportStrokeWidth,
      'minimap.style.viewportStrokeWidth',
    ),
  };
  return {
    width: normalizePositiveNumber(merged.width, 'minimap.width'),
    height: normalizePositiveNumber(merged.height, 'minimap.height'),
    opacity: normalizeOpacity(merged.opacity),
    position: normalizePosition(merged.position),
    positionOffset: normalizeNonNegativeNumber(
      merged.positionOffset,
      'minimap.positionOffset',
    ),
    style,
  };
};

const normalizePosition = (value) => {
  if (!MINIMAP_POSITIONS.has(value)) {
    throw new TypeError(
      'minimap.position must be one of top-left, top-right, bottom-left, bottom-right.',
    );
  }
  return value;
};

const normalizePositiveNumber = (value, name) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive finite number.`);
  }
  return value;
};

const normalizeNonNegativeNumber = (value, name) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative finite number.`);
  }
  return value;
};

const normalizeOpacity = (value) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError('minimap.opacity must be a finite number.');
  }
  return Math.min(Math.max(value, 0), 1);
};

const clampCanvasPoint = (point, canvasBounds) => ({
  x: Math.min(Math.max(point.x, canvasBounds.x), canvasBounds.right),
  y: Math.min(Math.max(point.y, canvasBounds.y), canvasBounds.bottom),
});

const getMinimapContentInset = (style) =>
  Math.max(MINIMAP_CANVAS_STROKE_WIDTH, style.viewportStrokeWidth / 2);

const snapshotContainerStyle = (container) =>
  Object.fromEntries(
    POSITION_STYLE_KEYS.map((key) => [key, container.style[key]]),
  );

const restoreContainerStyle = (container, snapshot) => {
  if (!container?.style || !snapshot) return;
  for (const key of POSITION_STYLE_KEYS) {
    container.style[key] = snapshot[key] ?? '';
  }
};
