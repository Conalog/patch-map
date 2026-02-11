import {
  getViewportWorldCenter,
  getWorldLocalCenter,
} from '../../utils/viewport-rotation';
import { FlipController } from './FlipController';
import { RotationController } from './RotationController';

const DEFAULT_VIEW_STATE = { flipX: false, flipY: false, angle: 0 };
const toFiniteAngle = (value) => {
  const angle = Number(value);
  return Number.isFinite(angle) ? angle : null;
};

export default class ViewTransform {
  constructor({
    viewport = null,
    world = null,
    viewState,
    onRotate,
    onFlip,
  } = {}) {
    this._viewport = viewport;
    this._world = world;
    this._viewState = viewState ?? { ...DEFAULT_VIEW_STATE };
    this._flipController = new FlipController(this);
    this._rotationController = new RotationController(this);
    this._onRotate = typeof onRotate === 'function' ? onRotate : null;
    this._onFlip = typeof onFlip === 'function' ? onFlip : null;
  }

  get viewState() {
    return this._viewState;
  }

  attach({ viewport, world } = {}) {
    if (viewport) this._viewport = viewport;
    if (world) this._world = world;
    this.applyWorldTransform();
  }

  detach() {
    this._viewport = null;
    this._world = null;
  }

  get rotation() {
    return this._rotationController;
  }

  get flip() {
    return this._flipController;
  }

  get rotationValue() {
    return this._world?.angle ?? this._viewState.angle ?? 0;
  }

  setRotation(angle) {
    const nextAngle = toFiniteAngle(angle);
    if (nextAngle == null) return null;
    this._viewState.angle = nextAngle;
    if (!this._viewport || !this._world) return nextAngle;
    this.applyWorldTransform({ angle: nextAngle });
    this._onRotate?.(nextAngle);
    return nextAngle;
  }

  setFlip({ x, y } = {}) {
    if (typeof x === 'boolean') {
      this._viewState.flipX = x;
    }
    if (typeof y === 'boolean') {
      this._viewState.flipY = y;
    }
    if (!this._viewport || !this._world) {
      return { x: this._viewState.flipX, y: this._viewState.flipY };
    }
    this.applyWorldTransform();
    this._onFlip?.({ x: this._viewState.flipX, y: this._viewState.flipY });
    return { x: this._viewState.flipX, y: this._viewState.flipY };
  }

  applyWorldTransform({ angle = this._viewState.angle ?? 0 } = {}) {
    if (!this._viewport || !this._world) return;
    const nextAngle = toFiniteAngle(angle);
    if (nextAngle == null) return;
    this._viewState.angle = nextAngle;
    const center = getViewportWorldCenter(this._viewport);
    const localCenter = getWorldLocalCenter(this._viewport, this._world);
    this._world.pivot.set(localCenter.x, localCenter.y);
    this._world.position.set(center.x, center.y);
    this._world.angle = nextAngle;
    this._world.scale.set(
      this._viewState.flipX ? -1 : 1,
      this._viewState.flipY ? -1 : 1,
    );
    this._viewport.emit?.('world_transformed', this._world);
  }
}
