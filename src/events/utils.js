import { event } from '../utils/event/canvas';

export const checkEvents = (viewport, eventId) => {
  return eventId.split(' ').every((id) => event.getEvent(viewport, id));
};

export const getSelectObject = (
  parent,
  obj,
  selectUnit,
  filterParent = new Set(),
) => {
  if (!obj?.constructor?.isSelectable) {
    return null;
  }

  const strategies = {
    entity: () => obj,
    closestGroup: () =>
      findClosestParent(parent, obj, 'group', filterParent) ||
      findClosestParent(parent, obj, 'grid', filterParent),
    highestGroup: () =>
      findHighestParent(parent, obj, 'group', filterParent) ||
      findClosestParent(parent, obj, 'grid', filterParent),
    grid: () => findClosestParent(parent, obj, 'grid', filterParent),
  };

  const finder = strategies[selectUnit];
  const target = finder ? finder() : obj;
  return target || obj;
};

const MOVE_DELTA = 4;
export const isMoved = (point1, point2, scale = { x: 1, y: 1 }) => {
  if (!point1 || !point2) return false;

  const dx = point2.x - point1.x;
  const dy = point2.y - point1.y;
  return (
    Math.abs(dx) > MOVE_DELTA / scale.x || Math.abs(dy) > MOVE_DELTA / scale.y
  );
};

const findClosestParent = (parent, obj, type, filterParent) => {
  let current = obj;
  while (current && current.type !== 'canvas' && current !== parent) {
    if (
      current.type === type &&
      (!filterParent || !filterParent.has(current))
    ) {
      return current;
    }
    current = current.parent;
  }
  return null;
};

const findHighestParent = (parent, obj, type, filterParent) => {
  let topParent = null;
  let current = obj;
  while (current && current.type !== 'canvas' && current !== parent) {
    if (
      current.type === type &&
      (!filterParent || !filterParent.has(current))
    ) {
      topParent = current;
    }
    current = current.parent;
  }
  return topParent;
};
