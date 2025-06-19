import { OrientedBounds } from '@pixi-essentials/bounds';
import { Matrix, Point, RenderContainer, Transform } from 'pixi.js';
import { decomposeTransform } from './decomposeTransform';
import { Wireframe } from './wireframe';

const tempBounds = new OrientedBounds();
const tempTransform = new Transform();
const tempMatrix = new Matrix();
const tempCorners = [new Point(), new Point(), new Point(), new Point()];

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

    const localBounds = displayObject.getLocalBounds();
    const corners = tempCorners;
    corners[0].set(localBounds.x, localBounds.y);
    corners[1].set(localBounds.x + localBounds.width, localBounds.y);
    corners[2].set(
      localBounds.x + localBounds.width,
      localBounds.y + localBounds.height,
    );
    corners[3].set(localBounds.x, localBounds.y + localBounds.height);

    const matrix = displayObject.worldTransform;
    matrix.apply(corners[0], corners[0]);
    matrix.apply(corners[1], corners[1]);
    matrix.apply(corners[2], corners[2]);
    matrix.apply(corners[3], corners[3]);

    const cx = (corners[0].x + corners[1].x + corners[2].x + corners[3].x) / 4;
    const cy = (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4;
    const unrotateMatrix = tempMatrix;
    unrotateMatrix
      .identity()
      .translate(-cx, -cy)
      .rotate(-worldRotation)
      .translate(cx, cy);

    unrotateMatrix.apply(corners[0], corners[0]);
    unrotateMatrix.apply(corners[1], corners[1]);
    unrotateMatrix.apply(corners[2], corners[2]);
    unrotateMatrix.apply(corners[3], corners[3]);

    const minX = Math.min(
      corners[0].x,
      corners[1].x,
      corners[2].x,
      corners[3].x,
    );
    const minY = Math.min(
      corners[0].y,
      corners[1].y,
      corners[2].y,
      corners[3].y,
    );
    const maxX = Math.max(
      corners[0].x,
      corners[1].x,
      corners[2].x,
      corners[3].x,
    );
    const maxY = Math.max(
      corners[0].y,
      corners[1].y,
      corners[2].y,
      corners[3].y,
    );

    const resultBounds = bounds || new OrientedBounds();
    resultBounds.rotation = worldRotation;
    resultBounds.innerBounds.x = minX;
    resultBounds.innerBounds.y = minY;
    resultBounds.innerBounds.width = maxX - minX;
    resultBounds.innerBounds.height = maxY - minY;
    resultBounds.update();
    return resultBounds;
  }

  calculateGroupOrientedBounds(group, bounds) {
    if (!group || group.length === 0) {
      return;
    }

    const allCorners = [];
    for (let i = 0; i < group.length; i++) {
      const element = group[i];
      const localBounds = element.getLocalBounds();
      const elementCorners = [
        new Point(),
        new Point(),
        new Point(),
        new Point(),
      ];

      elementCorners[0].set(localBounds.x, localBounds.y);
      elementCorners[1].set(localBounds.x + localBounds.width, localBounds.y);
      elementCorners[2].set(
        localBounds.x + localBounds.width,
        localBounds.y + localBounds.height,
      );
      elementCorners[3].set(localBounds.x, localBounds.y + localBounds.height);

      const matrix = element.worldTransform;
      matrix.apply(elementCorners[0], elementCorners[0]);
      matrix.apply(elementCorners[1], elementCorners[1]);
      matrix.apply(elementCorners[2], elementCorners[2]);
      matrix.apply(elementCorners[3], elementCorners[3]);
      allCorners.push(...elementCorners);
    }

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < allCorners.length; i++) {
      const point = allCorners[i];
      minX = point.x < minX ? point.x : minX;
      minY = point.y < minY ? point.y : minY;
      maxX = point.x > maxX ? point.x : maxX;
      maxY = point.y > maxY ? point.y : maxY;
    }

    const resultBounds = bounds || new OrientedBounds();
    resultBounds.rotation = 0;
    resultBounds.innerBounds.x = minX;
    resultBounds.innerBounds.y = minY;
    resultBounds.innerBounds.width = maxX - minX;
    resultBounds.innerBounds.height = maxY - minY;
    resultBounds.update();
    return resultBounds;
  }
}
