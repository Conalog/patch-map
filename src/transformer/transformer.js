import { OrientedBounds } from '@pixi-essentials/bounds';
import { Matrix, RenderContainer, Transform } from 'pixi.js';
import {
  decomposeTransform,
  getBoundsFromPoints,
  getCentroid,
  getObjectWorldCorners,
} from './utils';
import { Wireframe } from './wireframe';

const tempBounds = new OrientedBounds();
const tempTransform = new Transform();
const tempMatrix = new Matrix();

const DEFAULT_WIREFRAME_STYLE = {
  thickness: 1.5,
  color: '#1099FF',
};

export class Transformer extends RenderContainer {
  constructor(options = {}) {
    super({});
    this.zIndex = 100;
    this.allowChildren = true;
    this.lazyTrigger = true;
    this.wireframe = this.addChild(new Wireframe(this));

    this._elements = options.elements || [];
    this.lazyMode = options.lazyMode || false;
    this._wireframeStyle = Object.assign(
      DEFAULT_WIREFRAME_STYLE,
      options.wireframeStyle || {},
    );
    this.boundsDisplayMode = options.boundsDisplayMode || 'all'; // 'all | 'groupOnly' | 'elementOnly' | 'none'
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

  get wireframeStyle() {
    return this._wireframeStyle;
  }

  set wireframeStyle(value) {
    this._wireframeStyle = Object.assign(this._wireframeStyle, value);
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

    const { color, thickness } = this._wireframeStyle;
    this.wireframe.clear();
    if (this.boundsDisplayMode !== 'none') {
      this.wireframe.setStrokeStyle({
        width: thickness / this.parent.scale.x,
        color,
      });
    }

    if (
      this.boundsDisplayMode === 'all' ||
      this.boundsDisplayMode === 'elementOnly'
    ) {
      elements.forEach((element) => {
        this.wireframe.drawBounds(
          this.calculateOrientedBounds(element, tempBounds),
        );
      });
    }

    if (
      this.boundsDisplayMode === 'all' ||
      this.boundsDisplayMode === 'groupOnly'
    ) {
      const groupBounds =
        elements.length > 1
          ? this.calculateGroupOrientedBounds(elements, tempBounds)
          : null;
      this.wireframe.drawBounds(groupBounds);
    }

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
