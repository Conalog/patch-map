import { isValidationError } from 'zod-validation-error';
import { getPointerPosition } from '../utils/canvas';
import { deepMerge } from '../utils/deepmerge/deepmerge';
import { event } from '../utils/event/canvas';
import { validate } from '../utils/validator';
import { findIntersectObject } from './find';
import { selectEventSchema } from './schema';
import { checkEvents, isMoved } from './utils';

const SELECT_EVENT_ID = 'select-down select-up select-over';

let config = {};
let state = { startPosition: null, endPosition: null };

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
        state.startPosition = {
          x: viewport.position.x,
          y: viewport.position.y,
        };
      },
    });
  }

  function registerUpEvent() {
    event.addEvent(viewport, {
      id: 'select-up',
      action: 'mouseup touchend',
      fn: (e) => {
        state.endPosition = {
          x: viewport.position.x,
          y: viewport.position.y,
        };

        if (!isMoved(viewport, state.endPosition, state.startPosition)) {
          executeFn('onSelect', e);
        }

        state = { startPosition: null, endPosition: null };
        executeFn('onOver', e);
      },
    });
  }

  function registerOverEvent() {
    event.addEvent(viewport, {
      id: 'select-over',
      action: 'mouseover',
      fn: (e) => {
        executeFn('onOver', e);
      },
    });
  }

  function executeFn(fnName, e) {
    const point = getPointerPosition(viewport);
    if (fnName in config) {
      config[fnName](findIntersectObject(viewport, { point }, config), e);
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
