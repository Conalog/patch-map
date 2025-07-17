import { collectCandidates } from '../../utils/get';
import { UPDATE_STAGES } from './constants';

const KEYS = ['links'];

export const Linksable = (superClass) => {
  const MixedClass = class extends superClass {
    _onLinkedObjectUpdate = () => {
      this._renderDirty = true;
    };

    _applyLinks(relevantChanges) {
      const { links } = relevantChanges;

      const oldLinkedObjects = this.linkedObjects || {};
      const oldIds = new Set(Object.keys(oldLinkedObjects));
      const newLinkedObjects = uniqueLinked(this.context.viewport, links);
      const newIds = new Set(Object.keys(newLinkedObjects));

      oldIds.forEach((id) => {
        if (!newIds.has(id)) {
          const obj = oldLinkedObjects[id];
          if (obj) {
            obj.off('transform_updated', this._onLinkedObjectUpdate, this);
          }
        }
      });

      newIds.forEach((id) => {
        if (!oldIds.has(id)) {
          const obj = newLinkedObjects[id];
          if (obj) {
            obj.on('transform_updated', this._onLinkedObjectUpdate, this);
          }
        }
      });

      this.linkedObjects = newLinkedObjects;
      this._onLinkedObjectUpdate();
    }
  };
  MixedClass.registerHandler(
    KEYS,
    MixedClass.prototype._applyLinks,
    UPDATE_STAGES.RENDER,
  );
  return MixedClass;
};

const uniqueLinked = (viewport, links) => {
  const uniqueIds = new Set(links.flatMap((link) => Object.values(link)));
  const objects = collectCandidates(viewport, (child) =>
    uniqueIds.has(child.id),
  );
  return Object.fromEntries(objects.map((obj) => [obj.id, obj]));
};
