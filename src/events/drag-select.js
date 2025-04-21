import { Graphics } from 'pixi.js';
import { isValidationError } from 'zod-validation-error';
import { getPointerPosition } from '../utils/canvas';
import { deepMerge } from '../utils/deepmerge/deepmerge';
import { event } from '../utils/event/canvas';
import { validate } from '../utils/vaildator';
import { findIntersectObjects } from './find';
import { dragSelectEventSchema } from './schema';
import { checkEvents, isMoved } from './utils';

const DRAG_SELECT_EVENT_ID = 'drag-select-down drag-select-move drag-select-up';
const DEBOUNCE_FN_INTERVAL = 25; // ms

let config = {};
let lastMoveTime = 0;
const state = {
  isDragging: false,
  startPoint: null,
  endPoint: null,
  movePoint: null,
  box: new Graphics(),
};

export const dragSelect = (viewport, opts) => {
  const options = validate(deepMerge(config, opts), dragSelectEventSchema);
  if (isValidationError(options)) throw options;

  if (!checkEvents(viewport, DRAG_SELECT_EVENT_ID)) {
    addEvents(viewport);
  }

  changeDraggableState(
    viewport,
    config.enabled && config.draggable,
    options.enabled && options.draggable,
  );
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
        state.isDragging = true;
        state.box.renderable = true;
        state.startPoint = { ...point };
        state.movePoint = { ...point };
      },
    });
  }

  function registerMoveEvent() {
    event.addEvent(viewport, {
      id: 'drag-select-move',
      action: 'mousemove touchmove moved',
      fn: (e) => {
        if (!state.isDragging) return;

        state.endPoint = { ...getPointerPosition(viewport) };
        drawSelectionBox();

        if (isMoved(viewport, state.movePoint, state.endPoint)) {
          viewport.plugin.start('mouse-edges');
          triggerFn(viewport, e);
          state.movePoint = JSON.parse(JSON.stringify(state.endPoint));
        }
      },
    });
  }

  function registerUpEvent() {
    event.addEvent(viewport, {
      id: 'drag-select-up',
      action: 'mouseup touchend mouseleave',
      fn: (e) => {
        if (isMoved(viewport, state.startPoint, state.endPoint)) {
          triggerFn(viewport, e);
          viewport.plugin.stop('mouse-edges');
        }
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
  if (e.type === 'pointermove' && now - lastMoveTime < DEBOUNCE_FN_INTERVAL) {
    return;
  }
  lastMoveTime = now;

  const intersectObjs =
    state.startPoint && state.endPoint
      ? findIntersectObjects(viewport, state, config)
      : [];
  if ('onDragSelect' in config) {
    config.onDragSelect(intersectObjs, e);
  }
};

const changeDraggableState = (viewport, wasDraggable, isDraggable) => {
  if (wasDraggable === isDraggable) return;

  if (isDraggable) {
    viewport.plugin.add({
      mouseEdges: { speed: 16, distance: 20, allowButtons: true },
    });
    viewport.plugin.stop('mouse-edges');
    event.onEvent(viewport, DRAG_SELECT_EVENT_ID);
    addChildBox(viewport);
  } else {
    viewport.plugin.remove('mouse-edges');
    event.offEvent(viewport, DRAG_SELECT_EVENT_ID);
    resetState();
    removeChildBox(viewport);
  }
};

const resetState = () => {
  state.isDragging = false;
  state.startPoint = null;
  state.endPoint = null;
  state.movePoint = null;
  state.box.clear();
  state.box.renderable = false;
};

const addChildBox = (viewport) => {
  if (!state.box.parent) {
    viewport.addChild(state.box);
  }
};

const removeChildBox = (viewport) => {
  if (state.box.parent) {
    viewport.removeChild(state.box);
  }
};
