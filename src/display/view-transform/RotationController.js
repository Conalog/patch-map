export class RotationController {
  constructor(owner) {
    this._owner = owner;
  }

  get value() {
    return this._owner.rotationValue;
  }

  set value(value) {
    this._owner.setRotation(value);
  }

  set(value) {
    return this._owner.setRotation(value);
  }

  rotateBy(delta) {
    return this._owner.setRotation(this._owner.rotationValue + Number(delta));
  }

  reset() {
    return this._owner.setRotation(0);
  }
}
