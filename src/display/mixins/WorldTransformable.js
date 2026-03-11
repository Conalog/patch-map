import { collectNodesWithinWorld } from '../utils/world-angle';
import { applyWorldFlip, resetWorldFlipState } from '../utils/world-flip';
import {
  applyWorldRotation,
  resetWorldRotationState,
} from '../utils/world-rotation';

const VIEWPORT_WORLD_LISTENER = new WeakMap();
const SNAPSHOT_PRECISION = 10000;

const normalizeSnapshotValue = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * SNAPSHOT_PRECISION) / SNAPSHOT_PRECISION;
};

const getBoundsSnapshot = (instance) => {
  const bounds = instance?.getLocalBounds?.();
  if (!bounds) return 'none';
  const x = normalizeSnapshotValue(bounds.x ?? bounds.minX ?? 0);
  const y = normalizeSnapshotValue(bounds.y ?? bounds.minY ?? 0);
  const width = normalizeSnapshotValue(
    bounds.width ?? (bounds.maxX ?? 0) - (bounds.minX ?? 0),
  );
  const height = normalizeSnapshotValue(
    bounds.height ?? (bounds.maxY ?? 0) - (bounds.minY ?? 0),
  );
  const ownWidth = normalizeSnapshotValue(instance?.width ?? 0);
  const ownHeight = normalizeSnapshotValue(instance?.height ?? 0);
  return `${x}|${y}|${width}|${height}|${ownWidth}|${ownHeight}`;
};

const areSameNodeChain = (prev = [], next = []) => {
  if (prev.length !== next.length) return false;
  for (let index = 0; index < prev.length; index += 1) {
    if (prev[index] !== next[index]) return false;
  }
  return true;
};

const detachNodeSubscriptions = (entry, instance) => {
  const nodes = entry.instanceNodes.get(instance) ?? [];
  for (const node of nodes) {
    const instances = entry.transformNodeListeners.get(node);
    instances?.delete(instance);
  }
  entry.instanceNodes.delete(instance);
};

const attachNodeSubscriptions = (entry, instance, nodes) => {
  for (const node of nodes) {
    let instances = entry.transformNodeListeners.get(node);
    if (!instances) {
      instances = new Set();
      entry.transformNodeListeners.set(node, instances);
    }
    instances.add(instance);
  }
  entry.instanceNodes.set(instance, nodes);
};

const syncNodeSubscriptions = (entry, instance) => {
  const prevNodes = entry.instanceNodes.get(instance) ?? [];
  const nextNodes = collectNodesWithinWorld(instance);
  if (areSameNodeChain(prevNodes, nextNodes)) {
    return false;
  }

  detachNodeSubscriptions(entry, instance);
  if (nextNodes.length > 0) {
    attachNodeSubscriptions(entry, instance, nextNodes);
  }
  return true;
};

const getWorldListenerEntry = (viewport) => {
  let entry = VIEWPORT_WORLD_LISTENER.get(viewport);
  if (entry) return entry;

  const instances = new Set();
  const transformNodeListeners = new WeakMap();
  const instanceNodes = new WeakMap();
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
  const objectTransformedHandler = (changedObject) => {
    const subscribers = transformNodeListeners.get(changedObject);
    if (!subscribers) return;

    for (const instance of subscribers) {
      if (!instance || instance.destroyed) {
        subscribers.delete(instance);
        continue;
      }
      instance._onWorldTransformChanged();
    }
  };

  viewport.on?.('world_transformed', handler);
  viewport.on?.('object_transformed', objectTransformedHandler);
  entry = {
    instances,
    handler,
    objectTransformedHandler,
    transformNodeListeners,
    instanceNodes,
  };
  VIEWPORT_WORLD_LISTENER.set(viewport, entry);
  return entry;
};

const hasOwn = (object, key) => Boolean(object) && Object.hasOwn(object, key);

const hasRawTransformOverride = (changes) => {
  const attrs = changes?.attrs;
  if (!attrs || typeof attrs !== 'object') return false;
  return (
    hasOwn(attrs, 'angle') ||
    hasOwn(attrs, 'rotation') ||
    hasOwn(attrs, 'scale') ||
    hasOwn(attrs, 'pivot')
  );
};

export const WorldTransformable = (superClass) => {
  const MixedClass = class extends superClass {
    constructor(...args) {
      super(...args);
      this._worldTransformViewport = null;
      this._worldTransformEntry = null;
      this._worldTransformBoundsSnapshot = null;
      this._registerWorldTransformSubscriber();
      this._applyWorldTransform();
    }

    _applyWorldTransform(_relevantChanges, options) {
      if (!this.store?.view) return;
      if (hasRawTransformOverride(options?.changes)) {
        resetWorldRotationState(this);
        resetWorldFlipState(this);
      }

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

      detachNodeSubscriptions(entry, this);
      entry.instances.delete(this);
      if (entry.instances.size === 0) {
        viewport.off?.('world_transformed', entry.handler);
        viewport.off?.('object_transformed', entry.objectTransformedHandler);
        VIEWPORT_WORLD_LISTENER.delete(viewport);
      }

      this._worldTransformViewport = null;
      this._worldTransformEntry = null;
    }

    _afterRender() {
      if (super._afterRender) {
        super._afterRender();
      }

      if (!this._worldTransformEntry) return;
      const changed = syncNodeSubscriptions(this._worldTransformEntry, this);
      const nextBoundsSnapshot = getBoundsSnapshot(this);
      const boundsChanged =
        nextBoundsSnapshot !== this._worldTransformBoundsSnapshot;
      this._worldTransformBoundsSnapshot = nextBoundsSnapshot;
      if (changed || boundsChanged) {
        this._onWorldTransformChanged();
      }
    }

    destroy(options) {
      this._unregisterWorldTransformSubscriber();
      super.destroy(options);
    }
  };

  return MixedClass;
};
