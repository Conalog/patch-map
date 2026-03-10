import { collectCandidates } from '../../utils/get';
import { UPDATE_STAGES } from './constants';

const KEYS = ['links'];

export const Linksable = (superClass) => {
  const MixedClass = class extends superClass {
    constructor(options = {}) {
      super(options);

      this._boundOnObjectTransformed = this._onObjectTransformed.bind(this);
      this._boundOnViewportChanged = this._onViewportChanged.bind(this);
      this.store?.viewport?.on(
        'object_transformed',
        this._boundOnObjectTransformed,
      );
      this.store?.viewport?.on(
        'world_transformed',
        this._boundOnViewportChanged,
      );
      this.store?.viewport?.on('moved', this._boundOnViewportChanged);
      this.store?.viewport?.on('zoomed', this._boundOnViewportChanged);
    }

    destroy(options) {
      if (this.store?.viewport) {
        this.store?.viewport?.off(
          'object_transformed',
          this._boundOnObjectTransformed,
        );
        this.store?.viewport?.off(
          'world_transformed',
          this._boundOnViewportChanged,
        );
        this.store?.viewport?.off('moved', this._boundOnViewportChanged);
        this.store?.viewport?.off('zoomed', this._boundOnViewportChanged);
      }
      super.destroy(options);
    }

    _refreshLinkedPath() {
      this._renderDirty = true;
      this._refreshLink?.();
    }

    _onObjectTransformed(changedObject) {
      if (!this.linkedObjects) return;
      if (changedObject === this.store?.world) return;

      const values = Object.values(this.linkedObjects);
      for (const linkedObj of values) {
        if (!linkedObj || linkedObj.destroyed) continue;

        if (
          linkedObj === changedObject ||
          isAncestor(changedObject, linkedObj) ||
          isAncestor(linkedObj, changedObject)
        ) {
          this._refreshLinkedPath();
          return;
        }
      }
    }

    _onViewportChanged() {
      if (!this.linkedObjects) return;
      this._refreshLinkedPath();
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
