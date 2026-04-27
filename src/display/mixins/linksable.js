import { collectCandidates } from '../../utils/get';
import { UPDATE_STAGES } from './constants';

const KEYS = ['links'];

export const Linksable = (superClass) => {
  const MixedClass = class extends superClass {
    constructor(options = {}) {
      super(options);

      this._boundOnObjectTransformed = this._onObjectTransformed.bind(this);
      this.store?.viewport?.on(
        'object_transformed',
        this._boundOnObjectTransformed,
      );
    }

    destroy(options) {
      if (this.store?.viewport) {
        this.store?.viewport?.off(
          'object_transformed',
          this._boundOnObjectTransformed,
        );
      }
      super.destroy(options);
    }

    _onObjectTransformed(changedObject) {
      if (!this.linkedObjects || !changedObject || changedObject.destroyed)
        return;
      if (changedObject === this.store?.world) return;

      if (
        this.linkedObjectSet?.has(changedObject) ||
        this.linkedAncestorSet?.has(changedObject) ||
        hasAncestorInSet(changedObject, this.linkedObjectSet)
      ) {
        this._renderDirty = true;
      }
    }

    _applyLinks(relevantChanges) {
      const { links } = relevantChanges;
      this.linkedObjects = uniqueLinked(this.store, links);
      const { linkedObjectSet, linkedAncestorSet } = buildLinkedObjectLookup(
        this.linkedObjects,
      );
      this.linkedObjectSet = linkedObjectSet;
      this.linkedAncestorSet = linkedAncestorSet;
      this._renderDirty = true;
    }
  };
  MixedClass.registerHandler(
    KEYS,
    MixedClass.prototype._applyLinks,
    UPDATE_STAGES.RENDER,
  );
  return MixedClass;
};

const hasAncestorInSet = (target, objectSet) => {
  if (!target || !objectSet) return false;

  let current = target.parent;
  while (current) {
    if (objectSet.has(current)) {
      return true;
    }
    if (current.type === 'canvas' || !current.parent) {
      return false;
    }
    current = current.parent;
  }
  return false;
};

const buildLinkedObjectLookup = (linkedObjects) => {
  const linkedObjectSet = new Set();
  const linkedAncestorSet = new Set();

  for (const linkedObj of Object.values(linkedObjects ?? {})) {
    if (!linkedObj || linkedObj.destroyed) continue;

    linkedObjectSet.add(linkedObj);
    let current = linkedObj.parent;
    while (current) {
      linkedAncestorSet.add(current);
      if (current.type === 'canvas' || !current.parent) break;
      current = current.parent;
    }
  }

  return { linkedObjectSet, linkedAncestorSet };
};

const uniqueLinked = (store, links) => {
  const uniqueIds = new Set(links.flatMap((link) => Object.values(link)));
  const { elementById, viewport } = store;
  if (elementById) {
    const objects = [];
    const missingIds = new Set();
    for (const id of uniqueIds) {
      const object = elementById.get(id);
      if (object && !object.destroyed) {
        objects.push(object);
      } else {
        missingIds.add(id);
      }
    }
    if (missingIds.size === 0) {
      return Object.fromEntries(objects.map((obj) => [obj.id, obj]));
    }

    const missingObjects = collectCandidates(viewport, (child) =>
      missingIds.has(child.id),
    );
    return Object.fromEntries(
      [...objects, ...missingObjects].map((obj) => [obj.id, obj]),
    );
  }

  const objects = collectCandidates(viewport, (child) =>
    uniqueIds.has(child.id),
  );
  return Object.fromEntries(objects.map((obj) => [obj.id, obj]));
};
