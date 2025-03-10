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
      if (
        child.renderPipeId ||
        child.type === 'item' ||
        (options.isSelectGrid && child.type === 'grid')
      ) {
        const isIntersecting = intersectPoint(child, state.point);
        const selectObject = isIntersecting
          ? getSelectObject(child, options)
          : null;

        if (selectObject && (!options.filter || options.filter(selectObject))) {
          return selectObject;
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
      if (child.renderPipeId || ['item', 'relations'].includes(child.type)) {
        const isIntersecting = intersect(state.box, child);
        const selectObject = isIntersecting
          ? getSelectObject(child, options)
          : null;

        if (selectObject && (!options.filter || options.filter(selectObject))) {
          found.push(selectObject);
        }
      } else {
        found = found.concat(searchIntersect(child));
      }
    }
    return found;
  }
};
