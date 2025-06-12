import { isValidationError } from 'zod-validation-error';
import { getPointerPosition } from '../utils/canvas';
import { deepMerge } from '../utils/deepmerge/deepmerge';
import { event } from '../utils/event/canvas';
import { validate } from '../utils/validator';
import { findIntersectObject } from './find';
import { selectEventSchema } from './schema';
import { checkEvents, isMoved } from './utils';

const SELECT_EVENT_ID = 'select-down select-up select-over';

export const select = (viewport, state, opts) => {
  const options = validate(deepMerge(state.config, opts), selectEventSchema);
  if (isValidationError(options)) throw options;

  if (!checkEvents(viewport, SELECT_EVENT_ID)) {
    addEvents(viewport, state);
  }

  changeEnableState(viewport, state.config.enabled, options.enabled);
  state.config = options;
};

const addEvents = (viewport, state) => {
  event.removeEvent(viewport, SELECT_EVENT_ID);
  registerDownEvent();
  registerUpEvent();
  registerOverEvent();

  function registerDownEvent() {
    event.addEvent(viewport, {
      id: 'select-down',
      action: 'mousedown touchstart',
      fn: () => {
        state.position.start = {
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
        state.position.end = {
          x: viewport.position.x,
          y: viewport.position.y,
        };

        if (
          state.position.start &&
          !isMoved(viewport, state.position.start, state.position.end)
        ) {
          executeFn('onSelect', e);
        }

        state.position = { start: null, end: null };
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
    if (fnName in state.config) {
      state.config[fnName](
        findIntersectObject(viewport, { point }, state.config),
        e,
      );
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
