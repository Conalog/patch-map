import { z } from 'zod';
import { isValidationError } from 'zod-validation-error';
import { selector } from '../utils/selector/selector';
import { createUUID } from '../utils/uuid';
import { validate } from '../utils/vaildator';

const addEventSchema = z.object({
  id: z.string().default(createUUID()),
  path: z.string(),
  action: z.string(),
  fn: z.function(),
  options: z.record(z.unknown()).default({}),
});

export const addEvent = (viewport, opts) => {
  const config = validate(opts, addEventSchema);
  if (isValidationError(config)) return;

  const { id, path, action, fn, options } = config;
  if (id in viewport.events) {
    notEventConsole(id);
    return;
  }
  viewport.events[id] = { path, action, fn, options };
  return id;
};

export const removeEvent = (viewport, id) => {
  const splitedIds = splitByWhitespace(id);
  if (!splitedIds.length) return;

  const currId = splitedIds[0];
  const event = getEvent(viewport, currId);
  if (event) {
    offEvent(viewport, currId);
    const { [currId]: _, ...rest } = viewport.events;
    viewport.events = rest;
  } else {
    notEventConsole(currId);
  }

  if (splitedIds.length > 1) {
    removeEvent(viewport, splitedIds.slice(1).join(' '));
  }
};

export const onEvent = (viewport, id) => {
  const splitedIds = splitByWhitespace(id);
  if (!splitedIds.length) return;

  const currId = splitedIds[0];
  const event = getEvent(viewport, currId);
  if (event) {
    const actions = splitByWhitespace(event.action);
    const objects = selector(viewport, event.path);
    for (const object of objects) {
      object.eventMode = 'static';
      addAction(object, actions, event);
    }
  } else {
    notEventConsole(currId);
  }

  if (splitedIds.length > 1) {
    onEvent(viewport, splitedIds.slice(1).join(' '));
  }

  function addAction(object, actions, event) {
    for (const action of actions) {
      object.addEventListener(action, event.fn, event.options);
    }
  }
};

export const offEvent = (viewport, id) => {
  const splitedIds = splitByWhitespace(id);
  if (!splitedIds.length) return;

  const currId = splitedIds[0];
  const event = getEvent(viewport, currId);
  if (event) {
    const actions = splitByWhitespace(event.action);
    const objects = selector(viewport, event.path);
    for (const object of objects) {
      object.eventMode = 'passive';
      removeAction(object, actions, event);
    }
  } else {
    notEventConsole(currId);
  }

  if (splitedIds.length > 1) {
    offEvent(viewport, splitedIds.slice(1).join(' '));
  }

  function removeAction(object, actions, event) {
    for (const action of actions) {
      object.removeEventListener(action, event.fn, event.options);
    }
  }
};

export const getEvent = (viewport, id) => {
  return viewport.events[id] ?? null;
};

export const getAllEvent = (viewport) => {
  return viewport.events;
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
  console.warn(`No event exists for the eventId: ${eventId}.`);
};

const splitByWhitespace = (str) => str.split(/\s+/).filter(Boolean);
