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
      if (this._renderDirty) return;
      if (!this.linkedObjects) return;

      for (const linkedObj of Object.values(this.linkedObjects)) {
        if (!linkedObj || linkedObj.destroyed) continue;

        if (
          linkedObj === changedObject ||
          isAncestor(changedObject, linkedObj)
        ) {
          this._renderDirty = true;
          return;
        }
      }
    }

    _applyLinks(relevantChanges) {
      const { links } = relevantChanges;
      this.linkedObjects = uniqueLinked(this.store.viewport, links);
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

const isAncestor = (parent, target) => {
  if (!target || !parent) return false;

  let current = target.parent;
  while (current) {
    if (current === parent) {
      return true;
    }
    if (current.type === 'canvas' || !current.parent) {
      return false;
    }
    current = current.parent;
  }
  return false;
};

const uniqueLinked = (viewport, links) => {
  const uniqueIds = new Set(links.flatMap((link) => Object.values(link)));
  const objects = collectCandidates(viewport, (child) =>
    uniqueIds.has(child.id),
  );
  return Object.fromEntries(objects.map((obj) => [obj.id, obj]));
};
