import { Graphics } from 'pixi.js';

export class Wireframe extends Graphics {
  static isSelectable = true;

  drawBounds(bounds) {
    if (bounds) {
      const hull = bounds.hull.map((worldPoint) => {
        return this.toLocal(worldPoint);
      });
      this.poly(hull).stroke();
    }
  }
}
