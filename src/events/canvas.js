import { v4 as uuidv4 } from 'uuid';
import { findContainers } from '../utils/find';

export const addEvent = (
  viewport,
  type = '',
  action = '',
  fn = () => {},
  opts = {},
) => {
  const { eventId = uuidv4(), options = {} } = opts;
  if (eventId in viewport.componentEvents) {
    notEventConsole(eventId);
    return;
  }

  viewport.componentEvents[eventId] = {
    type,
    action,
    fn,
    options,
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

  const actions = event.action.split(' ');
  for (const action of actions) {
    if (event.type === 'canvas') {
      viewport.addEventListener(action, event.fn, event.options);
    } else {
      const containers = findContainers(viewport, event.type);
      for (const container of containers) {
        container.addEventListener(action, event.fn, event.options);
      }
    }
  }
};

export const offEvent = (viewport, eventId = '') => {
  const event = getEvent(viewport, eventId);
  if (!event) {
    notEventConsole(eventId);
    return;
  }

  const actions = event.action.split(' ');
  for (const action of actions) {
    if (event.type === 'canvas') {
      viewport.removeEventListener(action, event.fn, event.options);
    } else {
      const containers = findContainers(viewport, event.type);
      for (const container of containers) {
        container.removeEventListener(action, event.fn, event.options);
      }
    }
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
