import { event } from '../utils/event/canvas';

export const checkEvents = (viewport, eventId) => {
  return eventId.split(' ').every((id) => event.getEvent(viewport, id));
};

export const getSelectObject = (obj, { selectUnit }) => {
  if (!obj || !obj.constructor.isSelectable) {
    return null;
  }

  switch (selectUnit) {
    case 'entity':
      return obj;

    case 'closestGroup': {
      const closestGroup = findClosestParent(obj, 'group');
      return closestGroup || obj;
    }

    case 'highestGroup': {
      const highestGroup = findHighestParent(obj, 'group');
      return highestGroup || obj;
    }

    case 'grid': {
      const parentGrid = findClosestParent(obj, 'grid');
      return parentGrid || obj;
    }

    default:
      return obj;
  }
};

const MOVE_DELTA = 4;
export const isMoved = (viewport, point1, point2) => {
  const { x, y } = {
    x: point2.x - point1.x,
    y: point2.y - point1.y,
  };
  return (
    Math.abs(x) > MOVE_DELTA / viewport.scale.x ||
    Math.abs(y) > MOVE_DELTA / viewport.scale.y
  );
};

const findClosestParent = (obj, type) => {
  let current = obj;
  while (current && current.type !== 'canvas') {
    if (current.type === type) {
      return current;
    }
    current = current.parent;
  }
  return null; // 해당하는 부모가 없음
};

const findHighestParent = (obj, type) => {
  let topParent = null;
  let current = obj;
  while (current && current.type !== 'canvas') {
    if (current.type === type) {
      topParent = current;
    }
    current = current.parent;
  }
  return topParent;
};
