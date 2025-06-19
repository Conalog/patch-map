import { OrientedBounds } from '@pixi-essentials/bounds';
import { Matrix, RenderContainer, Transform } from 'pixi.js';
import { decomposeTransform } from './decomposeTransform';
import {
  getBoundsFromPoints,
  getCentroid,
  getObjectWorldCorners,
} from './helper';
import { Wireframe } from './wireframe';

const tempBounds = new OrientedBounds();
const tempTransform = new Transform();
const tempMatrix = new Matrix();

export class Transformer extends RenderContainer {
  constructor(options = {}) {
    super({});
    this.zIndex = 100;
    this.allowChildren = true;
    this._elements = options.elements || [];
    this.lazyMode = options.lazyMode || false;
    this.lazyTrigger = true;

    this.wireframe = this.addChild(new Wireframe(this));
  }

  get elements() {
    return this._elements;
  }

  set elements(value) {
    this._elements = Array.isArray(value) ? value : [value];
    if (this.lazyMode) {
      this.update();
    }
  }

  render(renderer) {
    if (
      this.renderable &&
      this.visible &&
      (!this.lazyMode || this.lazyTrigger)
    ) {
      this.draw();
    }
    super.render(renderer);
  }

  draw() {
    const elements = this.elements;
    if (!elements) {
      return;
    }

    this.wireframe.clear();
    elements.forEach((element) => {
      this.wireframe.drawBounds(
        this.calculateOrientedBounds(element, tempBounds),
        this.parent.scale.x,
      );
    });

    const groupBounds =
      elements.length > 1
        ? this.calculateGroupOrientedBounds(elements, tempBounds)
        : null;
    this.wireframe.drawBounds(groupBounds, this.parent.scale.x);

    this.lazyTrigger = false;
  }

  update() {
    this.lazyTrigger = true;
  }

  calculateOrientedBounds(displayObject, bounds) {
    if (!displayObject) {
      return null;
    }

    decomposeTransform(tempTransform, displayObject.worldTransform);
    const worldRotation = tempTransform.rotation;
    const worldCorners = getObjectWorldCorners(displayObject);
    const centroid = getCentroid(worldCorners);

    const unrotateMatrix = tempMatrix;
    unrotateMatrix
      .identity()
      .translate(-centroid.x, -centroid.y)
      .rotate(-worldRotation)
      .translate(centroid.x, centroid.y);
    unrotateMatrix.apply(worldCorners[0], worldCorners[0]);
    unrotateMatrix.apply(worldCorners[1], worldCorners[1]);
    unrotateMatrix.apply(worldCorners[2], worldCorners[2]);
    unrotateMatrix.apply(worldCorners[3], worldCorners[3]);

    const innerBounds = getBoundsFromPoints(worldCorners);
    const resultBounds = bounds || new OrientedBounds();
    resultBounds.rotation = worldRotation;
    resultBounds.innerBounds.copyFrom(innerBounds);
    resultBounds.update();
    return resultBounds;
  }

  calculateGroupOrientedBounds(group, bounds) {
    if (!group || group.length === 0) {
      return;
    }

    const allWorldCorners = group.flatMap((element) => {
      return getObjectWorldCorners(element);
    });
    const groupInnerBounds = getBoundsFromPoints(allWorldCorners);
    const resultBounds = bounds || new OrientedBounds();
    resultBounds.rotation = 0;
    resultBounds.innerBounds.copyFrom(groupInnerBounds);
    resultBounds.update();
    return resultBounds;
  }
}
