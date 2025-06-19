import { Graphics } from 'pixi.js';

export class Wireframe extends Graphics {
  constructor(transformer) {
    super();
    this.transformer = transformer;
  }

  drawBounds(bounds, scale) {
    if (bounds) {
      const hull = bounds.hull.map((worldPoint) => {
        return this.transformer.parent.toWorld(worldPoint);
      });

      this.poly(hull).stroke({ width: 2 / scale, color: 'red' });
    }
  }
}
