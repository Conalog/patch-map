import { Graphics } from 'pixi.js';

/**
 * A specialized Graphics class for drawing the wireframe outlines of transformed objects.
 * It extends PIXI.Graphics to provide a dedicated method for rendering bounds.
 * @extends PIXI.Graphics
 */
export class Wireframe extends Graphics {
  /**
   * A static flag to indicate that this object can be targeted by selection logic.
   * @type {boolean}
   * @static
   */
  static isSelectable = true;

  /**
   * Draws the polygonal hull of a given bounds object.
   * The hull points are expected to be in world coordinates and will be
   * transformed into the local coordinate system of this Wireframe instance before drawing.
   *
   * @param {import('@pixi-essentials/bounds').OrientedBounds | object} bounds - The bounds object containing the hull to draw.
   * It should have a `hull` property which is an array of points.
   * @returns {void}
   */
  drawBounds(bounds) {
    if (bounds) {
      const hull = bounds.hull.map((worldPoint) => {
        return this.toLocal(worldPoint);
      });
      this.poly(hull).stroke();
    }
  }
}
