import { Rectangle } from 'pixi.js';
import CanvasBoundsLayer from './CanvasBoundsLayer';
import { clampViewportToCanvasBounds } from './clamp';

export default class CanvasBoundsController {
  constructor({ viewport, world, bounds, style } = {}) {
    this.viewport = viewport;
    this.world = world;
    this.bounds = bounds;
    this.layer = new CanvasBoundsLayer({ bounds, style });
    this._onWorldTransformed = (targetWorld) => {
      this.syncLayer(targetWorld ?? this.world);
      this.applyViewportClamp();
    };
    this._onViewportChanged = () => {
      this.applyViewportClamp();
    };
    this._isApplyingClamp = false;

    this.attach();
  }

  attach() {
    if (!this.viewport || !this.world || !this.bounds) return;

    this.insertLayerBehindWorld();
    this.syncLayer();
    this.configureViewport();
    this.viewport.on?.('world_transformed', this._onWorldTransformed);
    this.viewport.on?.('moved', this._onViewportChanged);
    this.viewport.on?.('zoomed', this._onViewportChanged);
  }

  insertLayerBehindWorld() {
    if (this.layer.parent === this.viewport) return;

    const worldIndex = this.viewport.getChildIndex?.(this.world) ?? -1;
    if (worldIndex >= 0) {
      this.viewport.addChildAt(this.layer, worldIndex);
    } else {
      this.viewport.addChild(this.layer);
    }
  }

  configureViewport() {
    if (!this.viewport || !this.bounds) return;

    this.viewport.resize?.(
      this.viewport.screenWidth,
      this.viewport.screenHeight,
      this.bounds.width,
      this.bounds.height,
    );
    this.viewport.forceHitArea = new Rectangle(
      this.bounds.x,
      this.bounds.y,
      this.bounds.width,
      this.bounds.height,
    );
    this.viewport.plugins?.remove?.('clamp');
    this.applyViewportClamp();
  }

  resize() {
    this.configureViewport();
  }

  syncLayer(world = this.world) {
    this.layer.syncWorldTransform(world);
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
    this.viewport?.off?.('world_transformed', this._onWorldTransformed);
    this.viewport?.off?.('moved', this._onViewportChanged);
    this.viewport?.off?.('zoomed', this._onViewportChanged);
    if (this.layer?.parent) {
      this.layer.parent.removeChild(this.layer);
    }
    this.layer?.destroy?.();
    this.layer = null;
    this.viewport = null;
    this.world = null;
    this.bounds = null;
  }
}
