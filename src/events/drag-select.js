import { isValidationError } from 'zod-validation-error';
import { deepMerge } from '../utils/deepmerge/deepmerge';
import { event } from '../utils/event/canvas';
import { validate } from '../utils/validator';
import { findIntersectObjects } from './find';
import { dragSelectEventSchema } from './schema';
import { checkEvents, isMoved } from './utils';

const DRAG_SELECT_EVENT_ID = 'drag-select-down drag-select-move drag-select-up';
const DEBOUNCE_FN_INTERVAL = 25; // ms

export const dragSelect = (viewport, state, opts) => {
  const options = validate(
    deepMerge(state.config, opts),
    dragSelectEventSchema,
  );
  if (isValidationError(options)) throw options;

  if (!checkEvents(viewport, DRAG_SELECT_EVENT_ID)) {
    addEvents(viewport, state);
  }

  changeDraggableState(
    viewport,
    state,
    state.config.enabled && state.config.draggable,
    options.enabled && options.draggable,
  );
  state.config = options;
};

const addEvents = (viewport, state) => {
  event.removeEvent(viewport, DRAG_SELECT_EVENT_ID);
  registerDownEvent();
  registerMoveEvent();
  registerUpEvent();

  function registerDownEvent() {
    event.addEvent(viewport, {
      id: 'drag-select-down',
      action: 'mousedown touchstart',
      fn: (e) => {
        resetState(state);

        const point = viewport.toWorld(e.global);
        state.isDragging = true;
        state.box.renderable = true;
        state.point.start = { ...point };
        state.point.move = { ...point };
      },
    });
  }

  function registerMoveEvent() {
    event.addEvent(viewport, {
      id: 'drag-select-move',
      action: 'mousemove touchmove moved',
      fn: (e) => {
        if (!state.isDragging || !e.global) return;

        state.point.end = { ...viewport.toWorld(e.global) };
        drawSelectionBox(state);

        if (isMoved(viewport, state.point.move, state.point.end)) {
          viewport.plugin.start('mouse-edges');
          triggerFn(viewport, e, state);
          state.point.move = JSON.parse(JSON.stringify(state.point.end));
        }
      },
    });
  }

  function registerUpEvent() {
    event.addEvent(viewport, {
      id: 'drag-select-up',
      action: 'mouseup touchend mouseleave',
      fn: (e) => {
        if (
          state.point.start &&
          state.point.end &&
          isMoved(viewport, state.point.start, state.point.end)
        ) {
          triggerFn(viewport, e, state);
          viewport.plugin.stop('mouse-edges');
        }
        resetState(state);
      },
    });
  }
};

const drawSelectionBox = (state) => {
  const { box, point } = state;
  if (!point.start || !point.end) return;

  box.clear();
  box.position.set(
    Math.min(point.start.x, point.end.x),
    Math.min(point.start.y, point.end.y),
  );
  box
    .rect(
      0,
      0,
      Math.abs(point.start.x - point.end.x),
      Math.abs(point.start.y - point.end.y),
    )
    .fill({ color: '#9FD6FF', alpha: 0.2 })
    .stroke({ width: 2, color: '#1099FF', pixelLine: true });
};

const triggerFn = (viewport, e, state) => {
  const now = performance.now();
  if (
    e.type === 'pointermove' &&
    now - state.lastMoveTime < DEBOUNCE_FN_INTERVAL
  ) {
    return;
  }
  state.lastMoveTime = now;

  const intersectObjs =
    state.point.start && state.point.end
      ? findIntersectObjects(viewport, state, state.config)
      : [];
  if ('onDragSelect' in state.config) {
    state.config.onDragSelect(intersectObjs, e);
  }
};

const changeDraggableState = (viewport, state, wasDraggable, isDraggable) => {
  if (wasDraggable === isDraggable) return;

  if (isDraggable) {
    viewport.plugin.add({
      mouseEdges: { speed: 16, distance: 20, allowButtons: true },
    });
    viewport.plugin.stop('mouse-edges');
    event.onEvent(viewport, DRAG_SELECT_EVENT_ID);
    addChildBox(viewport, state);
  } else {
    viewport.plugin.remove('mouse-edges');
    event.offEvent(viewport, DRAG_SELECT_EVENT_ID);
    resetState(state);
    removeChildBox(viewport, state);
  }
};

const resetState = (state) => {
  state.isDragging = false;
  state.point = { start: null, end: null, move: null };
  state.box.clear();
  state.box.renderable = false;
};

const addChildBox = (viewport, state) => {
  if (!state.box.parent) {
    viewport.addChild(state.box);
  }
};

const removeChildBox = (viewport, state) => {
  if (state.box.parent) {
    viewport.removeChild(state.box);
  }
};
