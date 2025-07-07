import { event } from '../utils/event/canvas';

export const checkEvents = (viewport, eventId) => {
  return eventId.split(' ').every((id) => event.getEvent(viewport, id));
};

export const getSelectObject = (obj, { isSelectGroup, isSelectGrid }) => {
  if (isSelectGroup) {
    const groupParent = getHighestParentByType(obj, 'group');
    if (groupParent) return groupParent;
  }

  if (isSelectGrid) {
    const gridParent = getHighestParentByType(obj, 'grid');
    if (gridParent) return gridParent;
  }

  return obj.renderPipeId ? obj.parent : obj;
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

const getHighestParentByType = (obj, typeName) => {
  let highest = null;
  let current = obj.parent;
  while (current && current.type !== 'canvas') {
    if (current.type === typeName) {
      highest = current;
    }
    current = current.parent;
  }
  return highest;
};

export const getPointerPosition = (viewport) => {
  const renderer = viewport?.app?.renderer;
  const global = renderer?.events.pointer.global;
  return viewport ? viewport.toWorld(global.x, global.y) : global;
};
