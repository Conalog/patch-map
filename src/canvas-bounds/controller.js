import { Rectangle } from 'pixi.js';
import { clampViewportToCanvasBounds } from './clamp';

export default class CanvasBoundsController {
  constructor({ viewport, world, bounds } = {}) {
    this.viewport = viewport;
    this.world = world;
    this.bounds = bounds;
    this._applyViewportClamp = () => {
      this.applyViewportClamp();
    };
    this._isApplyingClamp = false;
    this._baseClampZoomMinScale = null;

    this.attach();
  }

  attach() {
    if (!this.viewport || !this.world || !this.bounds) return;

    this.configureViewport();
    this.viewport.on?.('world_transformed', this._applyViewportClamp);
    this.viewport.on?.('moved', this._applyViewportClamp);
    this.viewport.on?.('zoomed', this._applyViewportClamp);
  }

  configureViewport() {
    if (!this.viewport || !this.bounds) return;

    this.viewport.resize?.(
      this.viewport.screenWidth,
      this.viewport.screenHeight,
      this.bounds.width,
      this.bounds.height,
    );
    this.configureMinimumScale();
    this.viewport.forceHitArea = new Rectangle(
      this.bounds.x,
      this.bounds.y,
      this.bounds.width,
      this.bounds.height,
    );
    this.viewport.plugins?.remove?.('clamp');
    this.applyViewportClamp();
  }

  configureMinimumScale() {
    const minScale = getCanvasFitMinScale(this.viewport, this.bounds);
    if (!Number.isFinite(minScale) || minScale <= 0) return;

    const clampZoom = this.viewport.plugins?.get?.('clamp-zoom');
    const options = clampZoom?.options ?? {};
    if (this._baseClampZoomMinScale === null) {
      this._baseClampZoomMinScale = options.minScale ?? 0;
    }
    const nextMinScale = Math.max(this._baseClampZoomMinScale, minScale);

    if (options.minScale !== nextMinScale) {
      this.viewport.plugin?.add?.({
        clampZoom: {
          ...options,
          minScale: nextMinScale,
        },
      });
    }
    if (Math.abs(this.viewport.scale?.x ?? 1) < nextMinScale) {
      this.viewport.setZoom?.(nextMinScale, true);
    }
  }

  resize() {
    this.configureViewport();
  }

  applyViewportClamp() {
    if (this._isApplyingClamp) return;
    this._isApplyingClamp = true;
    try {
      clampViewportToCanvasBounds(this.viewport, this.bounds, this.world);
    } finally {
      this._isApplyingClamp = false;
    }
  }

  destroy() {
    this.viewport?.off?.('world_transformed', this._applyViewportClamp);
    this.viewport?.off?.('moved', this._applyViewportClamp);
    this.viewport?.off?.('zoomed', this._applyViewportClamp);
    this.viewport = null;
    this.world = null;
    this.bounds = null;
  }
}

const getCanvasFitMinScale = (viewport, bounds) =>
  Math.min(
    viewport.screenWidth / bounds.width,
    viewport.screenHeight / bounds.height,
  );
