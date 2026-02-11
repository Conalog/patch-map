import { applyWorldFlip } from '../utils/world-flip';
import { applyWorldRotation } from '../utils/world-rotation';

const VIEWPORT_WORLD_LISTENER = new WeakMap();

const getWorldListenerEntry = (viewport) => {
  let entry = VIEWPORT_WORLD_LISTENER.get(viewport);
  if (entry) return entry;

  const instances = new Set();
  const handler = (world) => {
    for (const instance of instances) {
      if (!instance || instance.destroyed) {
        instances.delete(instance);
        continue;
      }
      if (instance.store?.world !== world) continue;
      instance._onWorldTransformChanged();
    }
  };

  viewport.on?.('world_transformed', handler);
  entry = { instances, handler };
  VIEWPORT_WORLD_LISTENER.set(viewport, entry);
  return entry;
};

export const WorldTransformable = (superClass) => {
  const MixedClass = class extends superClass {
    constructor(...args) {
      super(...args);
      this._worldTransformViewport = null;
      this._worldTransformEntry = null;
      this._registerWorldTransformSubscriber();
      this._applyWorldTransform();
    }

    _applyWorldTransform() {
      if (!this.store?.view) return;

      applyWorldRotation(this, this.store.view);
      applyWorldFlip(this, this.store.view);
    }

    _onWorldTransformChanged() {
      this._applyWorldTransform();
      if (typeof this._applyPlacement === 'function') {
        this._applyPlacement({
          placement: this.props?.placement,
          margin: this.props?.margin,
        });
      }
    }

    _registerWorldTransformSubscriber() {
      const viewport = this.store?.viewport;
      if (!viewport) return;
      const entry = getWorldListenerEntry(viewport);
      entry.instances.add(this);
      this._worldTransformViewport = viewport;
      this._worldTransformEntry = entry;
    }

    _unregisterWorldTransformSubscriber() {
      const viewport = this._worldTransformViewport;
      const entry = this._worldTransformEntry;
      if (!viewport || !entry) return;

      entry.instances.delete(this);
      if (entry.instances.size === 0) {
        viewport.off?.('world_transformed', entry.handler);
        VIEWPORT_WORLD_LISTENER.delete(viewport);
      }

      this._worldTransformViewport = null;
      this._worldTransformEntry = null;
    }

    destroy(options) {
      this._unregisterWorldTransformSubscriber();
      super.destroy(options);
    }
  };

  return MixedClass;
};
