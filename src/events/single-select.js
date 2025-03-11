import { isValidationError } from 'zod-validation-error';
import { getPointerPosition } from '../utils/canvas';
import { deepMerge } from '../utils/deepmerge/deepmerge';
import { event } from '../utils/event/canvas';
import { validate } from '../utils/vaildator';
import { findIntersectObject } from './find';
import { selectEventSchema } from './schema';
import { checkEvents } from './utils';

const SELECT_EVENT_ID = 'select-down select-up select-over';

let config = {};
const state = { point: null, isDown: false };

export const select = (viewport, opts) => {
  const options = validate(deepMerge(config, opts), selectEventSchema);
  if (isValidationError(options)) throw options;

  if (!checkEvents(viewport, SELECT_EVENT_ID)) {
    addEvents(viewport);
  }

  changeEnableState(viewport, config.enabled, options.enabled);
  config = options;
};

const addEvents = (viewport) => {
  event.removeEvent(viewport, SELECT_EVENT_ID);
  registerDownEvent();
  registerUpEvent();
  registerOverEvent();

  function registerDownEvent() {
    event.addEvent(viewport, {
      id: 'select-down',
      action: 'mousedown touchstart',
      fn: () => {
        state.isDown = true;
        executeFn('onSelect');
      },
    });
  }

  function registerUpEvent() {
    event.addEvent(viewport, {
      id: 'select-up',
      action: 'mouseup touchend',
      fn: () => {
        state.isDown = false;
        executeFn('onOver');
      },
    });
  }

  function registerOverEvent() {
    event.addEvent(viewport, {
      id: 'select-over',
      action: 'mouseover',
      fn: () => {
        if (state.isDown) return;
        executeFn('onOver');
      },
    });
  }

  function executeFn(fnName) {
    state.point = { ...getPointerPosition(viewport) };
    if (fnName in config) {
      config[fnName](findIntersectObject(viewport, state, config));
    }
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
