import { getScaleBounds } from '../../utils/canvas';
import { selector } from '../../utils/selector/selector';
import { updateConfig } from './utils';

export const changeLinks = (object, { links }) => {
  const path = selector(object, '$.children[?(@.type==="path")]')[0];
  if (!path) return;

  path.clear();
  path.links = [];
  const objs = collectLinkedObjects(object.viewport, links);
  for (const link of links) {
    const { sourcePoint, targetPoint } = getLinkPoints(
      link,
      objs,
      object.viewport,
    );
    if (!sourcePoint || !targetPoint) continue;

    if (shouldMovePoint(path, sourcePoint)) {
      path.moveTo(...sourcePoint);
    }
    path.lineTo(...targetPoint);
    path.links.push({ sourcePoint, targetPoint });
  }
  path.stroke();
  updateConfig(object, { links });

  function collectLinkedObjects(viewport, links) {
    const uniqueIds = new Set(
      links.flatMap((link) => [link.source, link.target]),
    );
    const items = selector(viewport, '$..children').filter((item) =>
      uniqueIds.has(item.id),
    );
    return Object.fromEntries(items.map((item) => [item.id, item]));
  }

  function getLinkPoints(link, objs, viewport) {
    const sourceObject = objs[link.source];
    const targetObject = objs[link.target];
    const sourcePoint = sourceObject
      ? getPoint(getScaleBounds(viewport, sourceObject))
      : null;
    const targetPoint = targetObject
      ? getPoint(getScaleBounds(viewport, targetObject))
      : null;
    return { sourcePoint, targetPoint };
  }

  function shouldMovePoint(path, [sx, sy]) {
    const lastLink = path.links[path.links.length - 1];
    if (!lastLink) return true;
    return lastLink.targetPoint[0] !== sx || lastLink.targetPoint[1] !== sy;
  }

  function getPoint(bounds) {
    return [bounds.x + bounds.width / 2, bounds.y + bounds.height / 2];
  }
};
