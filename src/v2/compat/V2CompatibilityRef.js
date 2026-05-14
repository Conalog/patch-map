import { Matrix, Point, Rectangle } from 'pixi.js';
import { getBoundsFromPoints } from '../../utils/transform';

export class V2CompatibilityRef {
  static isElement = true;
  static isSelectable = true;
  static isResizable = true;
  static isRotatable = true;

  id = null;
  type = null;
  parent = null;
  children = [];
  destroyed = false;
  store = null;
  _v2Layout = null;
  _v2Record = null;

  get x() {
    return this.#frame.x;
  }

  get y() {
    return this.#frame.y;
  }

  get width() {
    return this.#frame.width;
  }

  get height() {
    return this.#frame.height;
  }

  get rotation() {
    return this.#frame.rotation ?? 0;
  }

  get angle() {
    return (this.rotation * 180) / Math.PI;
  }

  get alpha() {
    return this.#frame.alpha ?? 1;
  }

  get visible() {
    return this.#frame.visible !== false;
  }

  get renderable() {
    return this.visible;
  }

  get worldTransform() {
    return this.getGlobalTransform(new Matrix(), false);
  }

  get #frame() {
    return (
      this._v2Layout?.getFrame(this.id) ?? {
        x: this.attrs?.x ?? 0,
        y: this.attrs?.y ?? 0,
        width: this.props?.size?.width ?? 0,
        height: this.props?.size?.height ?? 0,
        rotation: this.attrs?.rotation ?? 0,
        alpha: this.attrs?.alpha ?? 1,
        visible: this.show !== false,
      }
    );
  }

  getLocalBounds() {
    const frame = this.#frame;
    return new Rectangle(0, 0, frame.width, frame.height);
  }

  getBounds() {
    return getBoundsFromPoints(this.#worldCorners());
  }

  getGlobalPosition(point = new Point()) {
    const frame = this.#frame;
    point.set(frame.x, frame.y);
    return point;
  }

  getGlobalTransform(matrix = new Matrix()) {
    const frame = this.#frame;
    const rotation = frame.rotation ?? 0;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    matrix.a = cos;
    matrix.b = sin;
    matrix.c = -sin;
    matrix.d = cos;
    matrix.tx = frame.x;
    matrix.ty = frame.y;
    return matrix;
  }

  toGlobal(point, out = new Point()) {
    return this.getGlobalTransform(new Matrix(), false).apply(point, out);
  }

  toLocal(point, _from = null, out = new Point()) {
    const matrix = this.getGlobalTransform(new Matrix(), false).invert();
    return matrix.apply(point, out);
  }

  #worldCorners() {
    const frame = this.#frame;
    const transform = this.getGlobalTransform(new Matrix(), false);
    return [
      new Point(0, 0),
      new Point(frame.width, 0),
      new Point(frame.width, frame.height),
      new Point(0, frame.height),
    ].map((point) => transform.apply(point));
  }
}
