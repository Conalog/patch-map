import { collectCandidates } from '../../utils/get';
import { UPDATE_STAGES } from './constants';

const KEYS = ['links'];

export const Linksable = (superClass) => {
  const MixedClass = class extends superClass {
    _applyLinks(relevantChanges) {
      const { links } = relevantChanges;
      this.linkedObjects = uniqueLinked(this.context.viewport, links);
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

const uniqueLinked = (viewport, links) => {
  const uniqueIds = new Set(links.flatMap((link) => Object.values(link)));
  const objects = collectCandidates(viewport, (child) =>
    uniqueIds.has(child.id),
  );
  return Object.fromEntries(objects.map((obj) => [obj.id, obj]));
};
