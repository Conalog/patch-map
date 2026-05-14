import { Matrix, Point, Rectangle } from 'pixi.js';
import { getBoundsFromPoints } from '../../utils/transform';

export class CompatibilityRef {
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
  _layout = null;
  _record = null;
  _renderObject = null;
  _linkPoints = [];

  get text() {
    return this._renderObject?.text ?? this.props?.text ?? '';
  }

  get style() {
    return this._renderObject?._patchmapTextStyle ?? this.props?.style;
  }

  get tint() {
    return this._renderObject?.tint ?? this.props?.tint;
  }

  get texture() {
    return this._renderObject?.texture;
  }

  get linkPoints() {
    return this._renderObject?.linkPoints ?? this._linkPoints;
  }

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
      this._layout?.getFrame(this.id) ?? {
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
    if (
      this.type === 'item' &&
      (!Array.isArray(this.props?.components) ||
        this.props.components.length === 0)
    ) {
      return new Rectangle(0, 0, 0, 0);
    }
    return new Rectangle(0, 0, frame.width, frame.height);
  }

  getBounds() {
    return getBoundsFromPoints(this.#worldCorners());
  }

  getGlobalPosition(point = new Point()) {
    return this.getGlobalTransform(new Matrix()).apply(new Point(0, 0), point);
  }

  getGlobalTransform(matrix = new Matrix()) {
    const frame = this.#frame;
    const rotation = frame.rotation ?? 0;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const local = {
      a: cos,
      b: sin,
      c: -sin,
      d: cos,
      tx: frame.x,
      ty: frame.y,
    };
    const world = this.store?.world?.getGlobalTransform?.(new Matrix(), false);
    if (!world) {
      matrix.a = local.a;
      matrix.b = local.b;
      matrix.c = local.c;
      matrix.d = local.d;
      matrix.tx = local.tx;
      matrix.ty = local.ty;
      return matrix;
    }
    matrix.a = world.a * local.a + world.c * local.b;
    matrix.b = world.b * local.a + world.d * local.b;
    matrix.c = world.a * local.c + world.c * local.d;
    matrix.d = world.b * local.c + world.d * local.d;
    matrix.tx = world.a * local.tx + world.c * local.ty + world.tx;
    matrix.ty = world.b * local.tx + world.d * local.ty + world.ty;
    return matrix;
  }

  toGlobal(point, out = new Point()) {
    return this.getGlobalTransform(new Matrix(), false).apply(point, out);
  }

  toLocal(point, _from = null, out = new Point()) {
    const matrix = this.getGlobalTransform(new Matrix(), false).invert();
    return matrix.apply(point, out);
  }

  getChildIndex(child) {
    return this.children.indexOf(child);
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
