import { selector } from '../../utils/selector/selector';
import { UPDATE_STAGES } from './constants';
import { calcOrientedBounds } from './utils';

const KEYS = ['links', 'style'];

export const Linksable = (superClass) => {
  const MixedClass = class extends superClass {
    async _applyLinks(relevantChanges) {
      // Ensure this runs after all other objects have been rendered
      await new Promise((resolve) => setTimeout(resolve, 0));

      const { links } = relevantChanges;
      const path = selector(this, '$.children[?(@.type==="path")]')[0];
      if (!path) return;
      path.clear();
      let lastPoint = null;

      const viewport = this.context.viewport;
      const linkedObjects = uniqueLinked(viewport, links);
      for (const link of links) {
        const sourceBounds = this.toLocal(
          calcOrientedBounds(linkedObjects[link.source]).center,
        );
        const targetBounds = this.toLocal(
          calcOrientedBounds(linkedObjects[link.target]).center,
        );

        const sourcePoint = [sourceBounds.x, sourceBounds.y];
        const targetPoint = [targetBounds.x, targetBounds.y];
        if (
          !lastPoint ||
          JSON.stringify(lastPoint) === JSON.stringify(sourcePoint)
        ) {
          path.moveTo(...sourcePoint);
        }
        path.lineTo(...targetPoint);
        lastPoint = targetPoint;
      }
      path.stroke();
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
  const objects = selector(viewport, '$..children').filter((obj) =>
    uniqueIds.has(obj.id),
  );
  return Object.fromEntries(objects.map((obj) => [obj.id, obj]));
};
