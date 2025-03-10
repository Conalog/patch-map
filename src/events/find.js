import { intersect } from '../utils/intersects/intersect';
import { intersectPoint } from '../utils/intersects/intersect-point';
import { getSelectObject } from './utils';

export const findIntersectObject = (viewport, state, options) => {
  return searchIntersect(viewport);

  function searchIntersect(parent) {
    const children = [...parent.children].sort((a, b) => {
      const zDiff = (b.zIndex || 0) - (a.zIndex || 0);
      if (zDiff !== 0) return zDiff;
      return parent.getChildIndex(b) - parent.getChildIndex(a);
    });

    for (const child of children) {
      if (options.filter && !options.filter(child)) {
        continue;
      }

      if (
        child.renderPipeId ||
        child.type === 'item' ||
        (options.isSelectGrid && child.type === 'grid')
      ) {
        if (intersectPoint(child, state.point)) {
          return getSelectObject(child, options);
        }
      }

      const found = searchIntersect(child);
      if (found) return found;
    }
    return null;
  }
};

export const findIntersectObjects = (viewport, state, options) => {
  return searchIntersect(viewport);

  function searchIntersect(parent) {
    let found = [];

    const children = [...parent.children];
    for (const child of children) {
      if (options.filter && !options.filter(child)) {
        continue;
      }

      if (child.renderPipeId || ['item', 'relations'].includes(child.type)) {
        if (intersect(state.box, child)) {
          found.push(getSelectObject(child, options));
        }
      } else {
        found = found.concat(searchIntersect(child));
      }
    }
    return found;
  }
};
