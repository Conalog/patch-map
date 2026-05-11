import { Graphics } from 'pixi.js';

const DEFAULT_STYLE = Object.freeze({
  background: 0xffffff,
  backgroundAlpha: 0.72,
  border: 0xd4d4d8,
  borderAlpha: 1,
  borderWidth: 1,
});

export default class CanvasBoundsLayer extends Graphics {
  constructor({ bounds, style = {} } = {}) {
    super();
    this.label = 'patch-map:canvas-bounds-layer';
    this.eventMode = 'none';
    this.interactiveChildren = false;
    this._canvasBounds = bounds;
    this._style = { ...DEFAULT_STYLE, ...style };
    this.draw();
  }

  get canvasBounds() {
    return this._canvasBounds;
  }

  set canvasBounds(value) {
    this._canvasBounds = value;
    this.draw();
  }

  draw() {
    this.clear();
    if (!this._canvasBounds) return;

    const { x, y, width, height } = this._canvasBounds;
    this.rect(x, y, width, height)
      .fill({
        color: this._style.background,
        alpha: this._style.backgroundAlpha,
      })
      .stroke({
        color: this._style.border,
        alpha: this._style.borderAlpha,
        width: this._style.borderWidth,
      });
  }

  syncWorldTransform(world) {
    if (!world) return;
    this.position.copyFrom(world.position);
    this.pivot.copyFrom(world.pivot);
    this.scale.copyFrom(world.scale);
    this.angle = world.angle;
  }
}
