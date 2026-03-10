const DEFAULT_VIEW_STATE = { flipX: false, flipY: false, angle: 0 };

const toFiniteAngle = (value) => {
  const angle = Number(value);
  return Number.isFinite(angle) ? angle : null;
};

const getViewportWorldCenter = (viewport) => {
  if (!viewport) return { x: 0, y: 0 };
  return viewport.toWorld(viewport.screenWidth / 2, viewport.screenHeight / 2);
};

const getWorldLocalCenter = (viewport, world) => {
  if (!viewport || !world) return { x: 0, y: 0 };
  const worldPoint = getViewportWorldCenter(viewport);
  return world.toLocal(worldPoint, world.parent);
};

const createRotationController = (owner) => ({
  get value() {
    return owner.rotationValue;
  },
  set value(value) {
    owner.setRotation(value);
  },
  set(value) {
    return owner.setRotation(value);
  },
  rotateBy(delta) {
    return owner.setRotation(owner.rotationValue + Number(delta));
  },
  reset() {
    return owner.setRotation(0);
  },
});

const createFlipController = (owner) => ({
  get x() {
    return owner.viewState.flipX;
  },
  set x(value) {
    if (typeof value === 'boolean') {
      owner.setFlip({ x: value });
    }
  },
  get y() {
    return owner.viewState.flipY;
  },
  set y(value) {
    if (typeof value === 'boolean') {
      owner.setFlip({ y: value });
    }
  },
  set({ x, y } = {}) {
    return owner.setFlip({ x, y });
  },
  toggleX() {
    return owner.setFlip({ x: !owner.viewState.flipX });
  },
  toggleY() {
    return owner.setFlip({ y: !owner.viewState.flipY });
  },
  reset() {
    return owner.setFlip({ x: false, y: false });
  },
});

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
    this._flipController = createFlipController(this);
    this._rotationController = createRotationController(this);
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
