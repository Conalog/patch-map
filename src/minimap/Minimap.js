import { Point } from 'pixi.js';
import {
  createMinimapObjectSnapshot,
  createMinimapViewport,
  minimapPointToCanvasPoint,
} from './model';

const DEFAULT_OPTIONS = Object.freeze({
  style: {
    objectFill: '#94a3b8',
    viewportFill: 'rgba(12, 115, 191, 0.08)',
    viewportStroke: '#0c73bf',
    viewportStrokeWidth: 2,
  },
});
const DEFAULT_RECT_FILL = '#cbd5e1';
const PATCHMAP_EVENTS = Object.freeze([
  ['patchmap:initialized', '_onPatchmapInitialized'],
  ['patchmap:draw', '_requestObjectRender'],
  ['patchmap:updated', '_requestObjectRender'],
  ['patchmap:canvas-bounds-changed', '_requestObjectRender'],
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
 * @property {string | number} [objectFill]
 * @property {string} [viewportFill]
 * @property {string | number} [viewportStroke]
 * @property {number} [viewportStrokeWidth]
 */

/**
 * @typedef {object} MinimapOptions
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
    this._attachedViewport = null;
    this._attachedTicker = null;
    this._resizeObserver = null;
    this._size = resolveContainerSize(container);
    this._frame = null;
    this._viewportTransformKey = null;
    this._destroyed = false;
    this._isPointerActive = false;

    this._requestRender = () => this.requestRender();
    this._requestObjectRender = () => this.invalidateObjects();
    this._onPatchmapInitialized = () => this.handlePatchmapInitialized();
    this._watchViewportTransform = () => this.watchViewportTransform();
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
    this.canvas.width = this._size.width;
    this.canvas.height = this._size.height;
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.display = 'block';
    this.canvas.style.cursor = 'pointer';
    this.canvas.style.touchAction = 'none';
    this.container.appendChild(this.canvas);
    this.observeContainerResize();
  }

  attach() {
    for (const [event, handlerKey] of PATCHMAP_EVENTS) {
      this.patchmap.on(event, this[handlerKey]);
    }
    this.attachViewport();
    for (const [event, handlerKey] of POINTER_EVENTS) {
      this.canvas.addEventListener(event, this[handlerKey]);
    }
  }

  detach() {
    for (const [event, handlerKey] of PATCHMAP_EVENTS) {
      this.patchmap?.off?.(event, this[handlerKey]);
    }
    this.detachViewport();
    for (const [event, handlerKey] of POINTER_EVENTS) {
      this.canvas?.removeEventListener(event, this[handlerKey]);
    }
    this._resizeObserver?.disconnect?.();
    this._resizeObserver = null;
  }

  observeContainerResize() {
    if (typeof ResizeObserver === 'undefined') return;

    this._resizeObserver = new ResizeObserver(() => {
      if (this._destroyed) return;
      const nextSize = resolveContainerSize(this.container);
      if (
        nextSize.width === this._size.width &&
        nextSize.height === this._size.height
      ) {
        return;
      }

      this._size = nextSize;
      this._objectsDirty = true;
      this.requestRender();
    });
    this._resizeObserver.observe(this.container);
  }

  attachViewport() {
    const viewport = this.patchmap?.viewport ?? null;
    const ticker = this.patchmap?.app?.ticker ?? null;
    if (
      viewport === this._attachedViewport &&
      ticker === this._attachedTicker
    ) {
      return;
    }

    this.detachViewport();
    this._attachedViewport = viewport;
    this._attachedTicker = ticker;

    for (const [event, handlerKey] of VIEWPORT_EVENTS) {
      viewport?.on?.(event, this[handlerKey]);
    }
    ticker?.add?.(this._watchViewportTransform);
  }

  detachViewport() {
    for (const [event, handlerKey] of VIEWPORT_EVENTS) {
      this._attachedViewport?.off?.(event, this[handlerKey]);
    }
    this._attachedTicker?.remove?.(this._watchViewportTransform);
    this._attachedViewport = null;
    this._attachedTicker = null;
  }

  handlePatchmapInitialized() {
    if (this._destroyed) return;
    this.attachViewport();
    this.invalidateObjects();
  }

  watchViewportTransform() {
    if (this._destroyed) return;

    const transformKey = createViewportTransformKey(this.patchmap);
    if (transformKey === this._viewportTransformKey) return;

    this._viewportTransformKey = transformKey;
    this.requestRender();
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
    this._size = resolveContainerSize(this.container);
    const { width, height } = this._size;
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
    if (!objectSnapshot) {
      this.clearLayers({ pixelWidth, pixelHeight });
      this._snapshot = null;
      this._viewportTransformKey = null;
      return;
    }

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
    this._viewportTransformKey = createViewportTransformKey(this.patchmap);
  }

  clearLayers({ pixelWidth, pixelHeight }) {
    const clear = (ctx) => {
      ctx?.save();
      ctx?.setTransform(1, 0, 0, 1, 0, 0);
      ctx?.clearRect(0, 0, pixelWidth, pixelHeight);
      ctx?.restore();
    };
    clear(this.context);
    clear(this._objectLayerContext);
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
    const bounds = this.patchmap?.canvas?.bounds;
    return JSON.stringify({
      ratio,
      pixelWidth,
      pixelHeight,
      canvasBounds: bounds
        ? {
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
          }
        : null,
      objectFill: style.objectFill,
    });
  }

  drawObjectLayer({ snapshot, ratio, pixelWidth, pixelHeight }) {
    const ctx = this._objectLayerContext;
    if (!ctx) return;
    const { width, height } = this._size;

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
    const canvas = snapshot.canvas;

    ctx.save();
    this.drawCanvasClip(ctx, canvas);
    ctx.clip();
    for (const object of snapshot.objects) {
      this.drawSilhouette(ctx, object);
    }
    ctx.restore();
  }

  drawViewportLayer(ctx, snapshot) {
    const canvas = snapshot.canvas;
    ctx.save();
    this.drawCanvasClip(ctx, canvas);
    ctx.clip();
    this.drawViewport(ctx, snapshot.viewport, this.options.style);
    ctx.restore();
  }

  drawCanvasClip(ctx, canvas) {
    ctx.beginPath();
    ctx.rect(canvas.x, canvas.y, canvas.width, canvas.height);
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
    this.onDestroy?.(this);
    this.patchmap = null;
    this.container = null;
    this.canvas = null;
    this.context = null;
    this._objectLayer = null;
    this._objectLayerContext = null;
    this._snapshot = null;
    this._objectSnapshot = null;
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
    objectFill: merged.style.objectFill,
    viewportFill: merged.style.viewportFill,
    viewportStroke: merged.style.viewportStroke,
    viewportStrokeWidth: normalizeNonNegativeNumber(
      merged.style.viewportStrokeWidth,
      'minimap.style.viewportStrokeWidth',
    ),
  };
  return {
    style,
  };
};

const normalizeNonNegativeNumber = (value, name) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative finite number.`);
  }
  return value;
};

const FALLBACK_SIZE = Object.freeze({ width: 180, height: 120 });

const resolveContainerSize = (container) => {
  const rect = container?.getBoundingClientRect?.();
  const width =
    normalizeSizeValue(container?.clientWidth) ??
    normalizeSizeValue(rect?.width);
  const height =
    normalizeSizeValue(container?.clientHeight) ??
    normalizeSizeValue(rect?.height);

  return {
    width: width ?? FALLBACK_SIZE.width,
    height: height ?? FALLBACK_SIZE.height,
  };
};

const normalizeSizeValue = (value) =>
  Number.isFinite(value) && value > 0 ? value : undefined;

const clampCanvasPoint = (point, canvasBounds) => ({
  x: Math.min(Math.max(point.x, canvasBounds.x), canvasBounds.right),
  y: Math.min(Math.max(point.y, canvasBounds.y), canvasBounds.bottom),
});

const getMinimapContentInset = (style) =>
  Math.max(0, style.viewportStrokeWidth / 2);

const createViewportTransformKey = (patchmap) => {
  const viewport = patchmap?.viewport;
  const world = patchmap?.world;
  const screen = patchmap?.app?.renderer?.screen;
  const viewportMatrix = viewport?.worldTransform;
  const worldMatrix = world?.worldTransform;

  return [
    viewportMatrix?.a ?? 1,
    viewportMatrix?.b ?? 0,
    viewportMatrix?.c ?? 0,
    viewportMatrix?.d ?? 1,
    viewportMatrix?.tx ?? 0,
    viewportMatrix?.ty ?? 0,
    viewport?.x ?? 0,
    viewport?.y ?? 0,
    viewport?.scale?.x ?? 1,
    viewport?.scale?.y ?? 1,
    viewport?.pivot?.x ?? 0,
    viewport?.pivot?.y ?? 0,
    viewport?.skew?.x ?? 0,
    viewport?.skew?.y ?? 0,
    viewport?.rotation ?? 0,
    viewport?.screenWidth ?? screen?.width ?? 0,
    viewport?.screenHeight ?? screen?.height ?? 0,
    worldMatrix?.a ?? 1,
    worldMatrix?.b ?? 0,
    worldMatrix?.c ?? 0,
    worldMatrix?.d ?? 1,
    worldMatrix?.tx ?? 0,
    worldMatrix?.ty ?? 0,
    world?.x ?? 0,
    world?.y ?? 0,
    world?.scale?.x ?? 1,
    world?.scale?.y ?? 1,
    world?.pivot?.x ?? 0,
    world?.pivot?.y ?? 0,
    world?.skew?.x ?? 0,
    world?.skew?.y ?? 0,
    world?.rotation ?? 0,
    screen?.width ?? 0,
    screen?.height ?? 0,
  ].join('|');
};
