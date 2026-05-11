import { Point } from 'pixi.js';
import { createMinimapSnapshot, minimapPointToCanvasPoint } from './model';

const DEFAULT_OPTIONS = Object.freeze({
  width: 180,
  height: 120,
  padding: 8,
  opacity: 0.92,
  style: {
    background: '#ffffff',
    border: '#d4d4d8',
    object: '#94a3b8',
    viewport: '#0c73bf',
    viewportFill: 'rgba(12, 115, 191, 0.08)',
    viewportStrokeWidth: 2,
  },
});

/**
 * @typedef {object} MinimapStyle
 * @property {string | number} [background]
 * @property {string | number} [border]
 * @property {string | number} [object]
 * @property {string | number} [viewport]
 * @property {string} [viewportFill]
 * @property {number} [viewportStrokeWidth]
 */

/**
 * @typedef {object} MinimapOptions
 * @property {number} [width]
 * @property {number} [height]
 * @property {number} [padding]
 * @property {number} [opacity]
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
    this._snapshot = null;
    this._frame = null;
    this._destroyed = false;
    this._isPointerActive = false;

    this._requestRender = () => this.requestRender();
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

  attach() {
    this.patchmap.on('patchmap:draw', this._requestRender);
    this.patchmap.on('patchmap:updated', this._requestRender);
    this.patchmap.on('patchmap:rotated', this._requestRender);
    this.patchmap.on('patchmap:flipped', this._requestRender);
    this.patchmap.viewport?.on?.('moved', this._requestRender);
    this.patchmap.viewport?.on?.('zoomed', this._requestRender);
    this.patchmap.viewport?.on?.('world_transformed', this._requestRender);
    this.patchmap.viewport?.on?.('object_transformed', this._requestRender);
    this.canvas.addEventListener('pointerdown', this._onPointerDown);
    this.canvas.addEventListener('pointermove', this._onPointerMove);
    this.canvas.addEventListener('pointerup', this._onPointerUp);
    this.canvas.addEventListener('pointercancel', this._onPointerUp);
    this.canvas.addEventListener('pointerleave', this._onPointerUp);
  }

  detach() {
    this.patchmap?.off?.('patchmap:draw', this._requestRender);
    this.patchmap?.off?.('patchmap:updated', this._requestRender);
    this.patchmap?.off?.('patchmap:rotated', this._requestRender);
    this.patchmap?.off?.('patchmap:flipped', this._requestRender);
    this.patchmap?.viewport?.off?.('moved', this._requestRender);
    this.patchmap?.viewport?.off?.('zoomed', this._requestRender);
    this.patchmap?.viewport?.off?.('world_transformed', this._requestRender);
    this.patchmap?.viewport?.off?.('object_transformed', this._requestRender);
    this.canvas?.removeEventListener('pointerdown', this._onPointerDown);
    this.canvas?.removeEventListener('pointermove', this._onPointerMove);
    this.canvas?.removeEventListener('pointerup', this._onPointerUp);
    this.canvas?.removeEventListener('pointercancel', this._onPointerUp);
    this.canvas?.removeEventListener('pointerleave', this._onPointerUp);
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
    if (!this.context) return;

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
    }

    this._snapshot = createMinimapSnapshot({
      patchmap: this.patchmap,
      width,
      height,
      padding: this.options.padding,
    });

    const ctx = this.context;
    ctx.save();
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (this._snapshot) {
      this.drawSnapshot(ctx, this._snapshot);
    }
    ctx.restore();
  }

  drawSnapshot(ctx, snapshot) {
    const style = this.options.style;
    const canvas = snapshot.canvas;

    ctx.fillStyle = style.background;
    ctx.strokeStyle = style.border;
    ctx.lineWidth = 1;
    ctx.fillRect(canvas.x, canvas.y, canvas.width, canvas.height);
    ctx.strokeRect(canvas.x, canvas.y, canvas.width, canvas.height);

    ctx.save();
    ctx.beginPath();
    ctx.rect(canvas.x, canvas.y, canvas.width, canvas.height);
    ctx.clip();
    ctx.fillStyle = style.object;
    for (const object of snapshot.objects) {
      ctx.fillRect(object.x, object.y, object.width, object.height);
    }
    this.drawViewport(ctx, snapshot.viewport, style);
    ctx.restore();
  }

  drawViewport(ctx, points, style) {
    if (!points.length) return;

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) {
      ctx.lineTo(point.x, point.y);
    }
    ctx.closePath();
    ctx.fillStyle = style.viewportFill;
    ctx.strokeStyle = style.viewport;
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
      const cancelFrame =
        globalThis.cancelAnimationFrame ?? globalThis.clearTimeout;
      cancelFrame?.(this._frame);
      this._frame = null;
    }
    this.detach();
    this.canvas?.remove();
    this.onDestroy?.(this);
    this.patchmap = null;
    this.container = null;
    this.canvas = null;
    this.context = null;
    this._snapshot = null;
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
  return {
    ...merged,
    width: normalizePositiveNumber(merged.width, 'minimap.width'),
    height: normalizePositiveNumber(merged.height, 'minimap.height'),
    padding: normalizeNonNegativeNumber(merged.padding, 'minimap.padding'),
    opacity: normalizeOpacity(merged.opacity),
  };
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
