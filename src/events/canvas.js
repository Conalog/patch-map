import { z } from 'zod';
import { isValidationError } from 'zod-validation-error';
import { selector } from '../utils/selector/selector';
import { createUUID } from '../utils/uuid';
import { validate } from '../utils/vaildator';

const addEventSchema = z.object({
  id: z.string().default(''),
  path: z.string(),
  action: z.string(),
  fn: z.function(),
  options: z.unknown(),
});

export const addEvent = (viewport, opts) => {
  const config = validate(opts, addEventSchema);
  if (isValidationError(config)) throw config;

  const { path, action, fn, options } = config;
  const id = config.id || createUUID();

  if (!(id in viewport.events)) {
    viewport.events[id] = { path, action, fn, options };
  } else {
    logEventExists(id);
  }
  return id;
};

export const removeEvent = (viewport, id) => {
  const eventIds = splitByWhitespace(id);
  if (!eventIds.length) return;

  for (const eventId of eventIds) {
    const event = getEvent(viewport, eventId);
    if (event) {
      offEvent(viewport, eventId);
      const { [currId]: _, ...rest } = viewport.events;
      viewport.events = rest;
    } else {
      logNoEventExists(eventId);
    }
  }
};

export const onEvent = (viewport, id) => {
  const eventIds = splitByWhitespace(id);
  if (!eventIds.length) return;

  for (const eventId of eventIds) {
    const event = getEvent(viewport, eventId);
    if (event) {
      const actions = splitByWhitespace(event.action);
      const objects = selector(viewport, event.path);
      for (const object of objects) {
        object.eventMode = 'static';
        addAction(object, actions, event);
      }
    } else {
      logNoEventExists(eventId);
    }
  }

  function addAction(object, actions, event) {
    for (const action of actions) {
      object.addEventListener(action, event.fn, event.options);
    }
  }
};

export const offEvent = (viewport, id) => {
  const eventIds = splitByWhitespace(id);
  if (!eventIds.length) return;

  for (const eventId of eventIds) {
    const event = getEvent(viewport, eventId);
    if (event) {
      const actions = splitByWhitespace(event.action);
      const objects = selector(viewport, event.path);
      for (const object of objects) {
        object.eventMode = 'passive';
        removeAction(object, actions, event);
      }
    } else {
      logNoEventExists(eventId);
    }
  }
  function removeAction(object, actions, event) {
    for (const action of actions) {
      object.removeEventListener(action, event.fn, event.options);
    }
  }
};

export const getEvent = (viewport, id) => viewport.events[id] ?? null;

export const getAllEvent = (viewport) => viewport.events;

export const event = {
  addEvent,
  removeEvent,
  onEvent,
  offEvent,
  getEvent,
  getAllEvent,
};

const logEventExists = (eventId) => {
  console.warn(`The eventId: ${eventId} already exists.`);
};

const logNoEventExists = (eventId) => {
  console.warn(`No event exists for the eventId: ${eventId}.`);
};

const splitByWhitespace = (str) => str.split(/\s+/).filter(Boolean);
