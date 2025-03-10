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
