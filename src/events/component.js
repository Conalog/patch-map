import { findAssetComponents } from '../utils/find';
import { v4 as uuidv4 } from 'uuid';
import { deepMerge } from '../utils/merge';

export const addEvent = (
  viewport,
  containers = [],
  type = '',
  fn = () => {},
  options = {},
) => {
  const { eventId } = deepMerge({ eventId: uuidv4() }, options);
  if (eventId in viewport.events) {
    notEventConsole(eventId);
  } else {
    viewport.events[eventId] = { containers, type, fn };
  }
  onEvent(viewport, eventId);
  return eventId;
};

export const removeEvent = (viewport, eventId = '') => {
  const event = findEvent(viewport, eventId);
  if (!event) {
    notEventConsole(eventId);
    return;
  }
  offEvent(viewport, eventId);
  delete viewport.events[eventId];
};

export const onEvent = (viewport, eventId = '') => {
  const event = findEvent(viewport, eventId);
  if (!event) {
    notEventConsole(eventId);
    return;
  }

  for (const container of event.containers) {
    const frames = findAssetComponents('frame', [container]);
    for (const frame of frames) {
      frame.on(event.type, event.fn);
    }
  }
};

export const offEvent = (viewport, eventId = '') => {
  const event = findEvent(viewport, eventId);
  if (!event) {
    notEventConsole(eventId);
    return;
  }

  for (const container of event.containers) {
    const frames = findAssetComponents('frame', [container]);
    for (const frame of frames) {
      frame.off(event.type, event.fn);
    }
  }
};

export const findEvent = (viewport, eventId) => {
  return viewport.events[eventId];
};

const notEventConsole = (eventId) => {
  console.warn(`${eventId}에 해당하는 이벤트가 존재하지 않습니다.`);
};
