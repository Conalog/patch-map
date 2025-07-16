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
      if (this.linkedObjects) {
        Object.values(this.linkedObjects).forEach((obj) => {
          if (obj) {
            obj.off('transform_updated', this._onLinkedObjectUpdate);
          }
        });
      }

      this.linkedObjects = uniqueLinked(this.context.viewport, links);
      Object.values(this.linkedObjects).forEach((obj) => {
        if (obj) {
          obj.on('transform_updated', this._onLinkedObjectUpdate, this);
        }
      });
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
