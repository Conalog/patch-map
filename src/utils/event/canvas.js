import { z } from 'zod';
import { isValidationError } from 'zod-validation-error';
import { convertArray } from '../convert';
import { selector } from '../selector/selector';
import { uid } from '../uuid';
import { validate } from '../validator';

const addEventSchema = z.object({
  id: z.string().default(''),
  path: z.string().default('$'),
  elements: z.unknown().optional(),
  action: z.string(),
  fn: z.function(),
  options: z.unknown(),
});

export const addEvent = (viewport, opts) => {
  const config = validate(opts, addEventSchema);
  if (isValidationError(config)) throw config;

  const { action, fn, options } = config;
  const id = config.id || uid();
  const hasElements = opts && Object.hasOwn(opts, 'elements');
  const hasPath = opts && Object.hasOwn(opts, 'path');
  const elements = hasElements
    ? convertArray(config.elements).filter(Boolean)
    : null;
  const path = hasPath || !hasElements ? config.path : null;

  if (!(id in viewport.events)) {
    viewport.events[id] = {
      path,
      elements,
      action,
      fn,
      options,
      active: false,
    };
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
      const { [eventId]: _, ...rest } = viewport.events;
      viewport.events = rest;
    }
  }
};

export const removeAllEvent = (viewport) => {
  removeEvent(viewport, Object.keys(getAllEvent(viewport)).join(' '));
};

export const onEvent = (viewport, id) => {
  const eventIds = splitByWhitespace(id);
  if (!eventIds.length) return;

  for (const eventId of eventIds) {
    const event = getEvent(viewport, eventId);
    if (event) {
      if (event.active) continue;

      const actions = splitByWhitespace(event.action);
      const objects = getEventObjects(viewport, event);
      for (const object of objects) {
        addAction(object, actions, event);
      }
      event.active = true;
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
      if (!event.active) continue;

      const actions = splitByWhitespace(event.action);
      const objects = getEventObjects(viewport, event);
      for (const object of objects) {
        removeAction(object, actions, event);
      }
      event.active = false;
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

export const getEvent = (viewport, id) =>
  viewport?.events && Object.hasOwn(viewport.events, id)
    ? viewport.events[id]
    : null;

export const getAllEvent = (viewport) => viewport.events;

export const event = {
  addEvent,
  removeEvent,
  removeAllEvent,
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

const getEventObjects = (viewport, event) => [
  ...(event.elements ?? []),
  ...(event.path ? selector(viewport, event.path) : []),
];

const splitByWhitespace = (str) => str.split(/\s+/).filter(Boolean);
