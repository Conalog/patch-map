import { isValidationError } from 'zod-validation-error';
import { getPointerPosition } from '../utils/canvas';
import { deepMerge } from '../utils/deepmerge/deepmerge';
import { event } from '../utils/event/canvas';
import { validate } from '../utils/vaildator';
import { findIntersectObject } from './find';
import { selectEventSchema } from './schema';
import { checkEvents } from './utils';

export const SELECT_EVENT_ID = 'select-down select-over select-out';

let config = {};
const state = { point: null };

export const select = (viewport, opts) => {
  const options = validate(deepMerge(config, opts), selectEventSchema);
  if (isValidationError(options)) throw options;

  if (!checkEvents(viewport, SELECT_EVENT_ID)) {
    addEvents(viewport);
  }

  changeEnableState(viewport, config.enabled, opts.enabled);
  config = options;
};

const addEvents = (viewport) => {
  event.removeEvent(viewport, SELECT_EVENT_ID);
  registerClickEvent();
  registerOverEvent();
  registerOutEvent();

  function registerClickEvent() {
    event.addEvent(viewport, {
      id: 'select-down',
      action: 'mousedown touchstart',
      fn: (e) => {
        state.point = { ...getPointerPosition(viewport) };
        config.fn(findIntersectObject(viewport, state, config), e.type);
      },
    });
  }

  function registerOverEvent() {
    event.addEvent(viewport, {
      id: 'select-over',
      action: 'mouseover',
      fn: (e) => {
        if (e.target.type === 'canvas') return;

        state.point = { ...getPointerPosition(viewport) };
        config.fn(findIntersectObject(viewport, state, config), e.type);
      },
    });
  }

  function registerOutEvent() {
    event.addEvent(viewport, {
      id: 'select-out',
      action: 'mouseout',
      fn: (e) => {
        state.point = null;
        config.fn(null, e.type);
      },
    });
  }
};

const changeEnableState = (viewport, wasEnabled, isEnabled) => {
  if (wasEnabled === isEnabled) return;

  if (isEnabled) {
    event.onEvent(viewport, SELECT_EVENT_ID);
  } else {
    event.offEvent(viewport, SELECT_EVENT_ID);
  }
};
