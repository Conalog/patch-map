import { v4 as uuidv4 } from 'uuid';
import { findContainers } from '../utils/find';

export const addEvent = (
  viewport,
  containerType = '',
  action = '',
  fn = () => {},
  eventId = uuidv4(),
) => {
  if (eventId in viewport.componentEvents) {
    notEventConsole(eventId);
    return;
  }

  viewport.componentEvents[eventId] = {
    containerType,
    action,
    fn,
  };
  return eventId;
};

export const removeEvent = (viewport, eventId = '') => {
  const event = getEvent(viewport, eventId);
  if (!event) {
    notEventConsole(eventId);
    return;
  }
  offEvent(viewport, eventId);
  delete viewport.componentEvents[eventId];
};

export const onEvent = (viewport, eventId = '') => {
  const event = getEvent(viewport, eventId);
  if (!event) {
    notEventConsole(eventId);
    return;
  }

  const containers = findContainers(viewport, event.containerType);
  for (const container of containers) {
    event.action.split(' ').forEach((action) => {
      container.on(action, event.fn);
    });
  }
};

export const offEvent = (viewport, eventId = '') => {
  const event = getEvent(viewport, eventId);
  if (!event) {
    notEventConsole(eventId);
    return;
  }

  const containers = findContainers(viewport, event.containerType);
  for (const container of containers) {
    event.action.split(' ').forEach((action) => {
      container.off(action, event.fn);
    });
  }
};

export const getEvent = (viewport, eventId) => {
  return viewport.componentEvents[eventId] ?? null;
};

export const getAllEvent = (viewport) => {
  return viewport.componentEvents;
};

export const event = {
  addEvent,
  removeEvent,
  onEvent,
  offEvent,
  getEvent,
  getAllEvent,
};

const notEventConsole = (eventId) => {
  console.warn(`${eventId}에 해당하는 이벤트가 존재하지 않습니다.`);
};
