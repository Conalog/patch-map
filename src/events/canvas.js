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
  const event = getEvent(viewport, id);
  if (event) {
    offEvent(viewport, id);
    const { [id]: _, ...rest } = viewport.events;
    viewport.events = rest;
  } else {
    notEventConsole(id);
  }
};

export const onEvent = (viewport, id) => {
  const event = getEvent(viewport, id);
  if (!event) {
    notEventConsole(id);
    return;
  }

  const actions = event.action.split(' ');
  for (const action of actions) {
    const objects = selector(viewport, event.path);
    for (const object of objects) {
      object.eventMode = 'static';
      object.addEventListener(action, event.fn, event.options);
    }
  }
};

export const offEvent = (viewport, id) => {
  const event = getEvent(viewport, id);
  if (!event) {
    notEventConsole(id);
    return;
  }

  const actions = event.action.split(' ');
  for (const action of actions) {
    const objects = selector(viewport, event.path);
    for (const object of objects) {
      object.removeEventListener(action, event.fn, event.options);
      object.eventMode = 'passive';
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
