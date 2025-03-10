import { Graphics } from 'pixi.js';
import { isValidationError } from 'zod-validation-error';
import { getPointerPosition } from '../utils/canvas';
import { deepMerge } from '../utils/deepmerge/deepmerge';
import { event } from '../utils/event/canvas';
import { validate } from '../utils/vaildator';
import { findIntersectObject, findIntersectObjects } from './find';
import { selectEventSchema } from './schema';
import { SELECT_EVENT_ID } from './select';
import { checkEvents } from './utils';

const DRAG_SELECT_EVENT_ID = 'drag-select-down drag-select-move drag-select-up';
const DEBOUNCE_FN_INTERVAL = 50; // ms
const MOVE_DELTA = 4;

let config = {};
let lastMoveTime = 0;
const state = {
  isDragging: false,
  startPoint: null,
  endPoint: null,
  box: new Graphics(),
};

export const dragSelect = (viewport, opts) => {
  const options = validate(deepMerge(config, opts), selectEventSchema);
  if (isValidationError(options)) throw options;

  if (!checkEvents(viewport, DRAG_SELECT_EVENT_ID)) {
    addEvents(viewport);
  }

  changeEnableState(viewport, config.enabled, options.enabled);
  config = options;
};

const addEvents = (viewport) => {
  event.removeEvent(viewport, DRAG_SELECT_EVENT_ID);
  registerDownEvent();
  registerMoveEvent();
  registerUpEvent();

  function registerDownEvent() {
    event.addEvent(viewport, {
      id: 'drag-select-down',
      action: 'mousedown touchstart',
      fn: () => {
        resetState();

        const point = getPointerPosition(viewport);
        if (
          checkEvents(viewport, SELECT_EVENT_ID) &&
          findIntersectObject(viewport, { point }, config)
        ) {
          return;
        }

        state.isDragging = true;
        state.box.renderable = true;
        state.startPoint = { ...point };
      },
    });
  }

  function registerMoveEvent() {
    event.addEvent(viewport, {
      id: 'drag-select-move',
      action: 'mousemove touchmove moved',
      fn: (e) => {
        if (!state.isDragging) return;

        viewport.plugin.start('mouse-edges');
        state.endPoint = { ...getPointerPosition(viewport) };
        drawSelectionBox();

        const deltaX = state.endPoint.x - state.startPoint.x;
        const deltaY = state.endPoint.y - state.startPoint.y;
        if (
          Math.abs(deltaX) > MOVE_DELTA / viewport.scale.x ||
          Math.abs(deltaY) > MOVE_DELTA / viewport.scale.y
        ) {
          triggerFn(viewport, e);
        }
      },
    });
  }

  function registerUpEvent() {
    event.addEvent(viewport, {
      id: 'drag-select-up',
      action: 'mouseup touchend mouseleave',
      fn: () => {
        viewport.plugin.stop('mouse-edges');
        resetState();
      },
    });
  }
};

const drawSelectionBox = () => {
  const { box, startPoint, endPoint } = state;
  if (!startPoint || !endPoint) return;

  box.clear();
  box.position.set(
    Math.min(startPoint.x, endPoint.x),
    Math.min(startPoint.y, endPoint.y),
  );
  box
    .rect(
      0,
      0,
      Math.abs(startPoint.x - endPoint.x),
      Math.abs(startPoint.y - endPoint.y),
    )
    .fill({ color: '#9FD6FF', alpha: 0.2 })
    .stroke({ width: 2, color: '#1099FF', pixelLine: true });
};

const triggerFn = (viewport, e) => {
  const now = performance.now();
  if (now - lastMoveTime < DEBOUNCE_FN_INTERVAL) {
    return;
  }
  lastMoveTime = now;

  const intersectObjs =
    state.startPoint && state.endPoint
      ? findIntersectObjects(viewport, state, config)
      : [];
  config.fn(intersectObjs, e);
};

const changeEnableState = (viewport, wasEnabled, isEnabled) => {
  if (wasEnabled === isEnabled) return;

  if (isEnabled) {
    viewport.plugin.add({
      mouseEdges: { speed: 16, distance: 20, allowButtons: true },
    });
    viewport.plugin.stop('mouse-edges');
    event.onEvent(viewport, DRAG_SELECT_EVENT_ID);
    viewport.addChild(state.box);
  } else {
    viewport.plugin.remove('mouse-edges');
    event.offEvent(viewport, DRAG_SELECT_EVENT_ID);
    viewport.removeChild(state.box);
  }
};

const resetState = () => {
  state.isDragging = false;
  state.startPoint = null;
  state.endPoint = null;
  state.box.clear();
  state.box.renderable = false;
};
