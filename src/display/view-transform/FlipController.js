export class FlipController {
  constructor(owner) {
    this._owner = owner;
  }

  get x() {
    return this._owner.viewState.flipX;
  }

  set x(value) {
    if (typeof value === 'boolean') {
      this._owner.setFlip({ x: value });
    }
  }

  get y() {
    return this._owner.viewState.flipY;
  }

  set y(value) {
    if (typeof value === 'boolean') {
      this._owner.setFlip({ y: value });
    }
  }

  set({ x, y } = {}) {
    return this._owner.setFlip({ x, y });
  }

  toggleX() {
    return this._owner.setFlip({ x: !this._owner.viewState.flipX });
  }

  toggleY() {
    return this._owner.setFlip({ y: !this._owner.viewState.flipY });
  }

  reset() {
    return this._owner.setFlip({ x: false, y: false });
  }
}
