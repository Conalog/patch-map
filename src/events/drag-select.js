import { Graphics } from 'pixi.js';
import { z } from 'zod';
import { isValidationError } from 'zod-validation-error';
import { getPointerPosition } from '../utils/canvas';
import { deepMerge } from '../utils/deepmerge/deepmerge';
import { event } from '../utils/event/canvas';
import { intersects } from '../utils/intersects/intersects';
import { validate } from '../utils/vaildator';

const EVENT_ID = 'drag-select-down drag-select-move drag-select-up';
const DEBOUNCE_FN_INTERVAL = 50; // ms

let config = {};
let lastMoveTime = 0;

const state = {
  isDragging: false,
  startPoint: null,
  endPoint: null,
  box: new Graphics(),
};

const dragSelectSchema = z.object({
  enabled: z.boolean().default(false),
  fn: z.function(),
  filter: z.nullable(z.function()).default(null),
  isSelectGroup: z.boolean().default(false),
  isSelectGrid: z.boolean().default(false),
});

export const dragSelect = (viewport, opts) => {
  const options = validate(deepMerge(config, opts), dragSelectSchema);
  if (isValidationError(options)) throw options;

  if (needToAddEvents(viewport)) {
    addDragSelectEvents(viewport);
  }

  handleEnableChange(viewport, config.enabled, opts.enabled);
  config = options;
};

const needToAddEvents = (viewport) => {
  return (
    !event.getEvent(viewport, 'drag-select-down') ||
    !event.getEvent(viewport, 'drag-select-move') ||
    !event.getEvent(viewport, 'drag-select-up')
  );
};

const addDragSelectEvents = (viewport) => {
  event.removeEvent(viewport, EVENT_ID);
  registerDownEvent();
  registerMoveEvent();
  registerUpEvent();

  function registerDownEvent() {
    event.addEvent(viewport, {
      id: 'drag-select-down',
      action: 'mousedown touchstart',
      fn: () => {
        resetState();
        state.isDragging = true;
        state.box.renderable = true;
        state.startPoint = { ...getPointerPosition(viewport) };
      },
    });
  }

  function registerMoveEvent() {
    event.addEvent(viewport, {
      id: 'drag-select-move',
      action: 'mousemove touchmove moved',
      fn: () => {
        if (!state.isDragging) return;

        viewport.plugin.start('mouse-edges');
        state.endPoint = { ...getPointerPosition(viewport) };
        drawSelectionBox();
        triggerSelectionCallback(viewport, true);
      },
    });
  }

  function registerUpEvent() {
    event.addEvent(viewport, {
      id: 'drag-select-up',
      action: 'mouseup touchend mouseleave',
      fn: () => {
        triggerSelectionCallback(viewport);
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

const triggerSelectionCallback = (viewport, isDebounce = false) => {
  if (isDebounce) {
    const now = performance.now();
    if (now - lastMoveTime < DEBOUNCE_FN_INTERVAL) return;
    lastMoveTime = now;
  }
  config.fn(findIntersectingObjects(viewport));
};

const findIntersectingObjects = (viewport) => {
  if (!state.startPoint || !state.endPoint) return [];

  const result = [];
  walkChildren(viewport.children);
  return result;

  function walkChildren(children) {
    for (const obj of children) {
      if (!obj.renderable || obj === state.box || obj.type == null) {
        continue;
      }

      if (obj.type === 'group') {
        walkChildren(obj.children);
      } else if (obj.type === 'grid') {
        if (config.isSelectGrid) {
          addIfIntersect(obj);
        } else {
          walkChildren(obj.children);
        }
      } else {
        addIfIntersect(obj);
      }
    }
  }

  function addIfIntersect(obj) {
    const passesFilter = config.filter ? config.filter(obj) : true;
    if (passesFilter && intersects(state.box, obj)) {
      if (config.isSelectGroup) {
        result.push(findTopGroupParent(obj));
      } else {
        result.push(obj);
      }
    }
  }

  function findTopGroupParent(obj) {
    let highestGroup = null;
    let current = obj.parent;

    while (current && current !== viewport) {
      if (current.type === 'group') {
        highestGroup = current;
      }
      current = current.parent;
    }
    return highestGroup;
  }
};

const handleEnableChange = (viewport, wasEnabled, isEnabled) => {
  if (wasEnabled === isEnabled) return;

  if (isEnabled) {
    viewport.plugin.add({
      mouseEdges: { speed: 16, distance: 20, allowButtons: true },
    });
    viewport.plugin.stop('mouse-edges');
    event.onEvent(viewport, EVENT_ID);
    viewport.addChild(state.box);
  } else {
    viewport.plugin.remove('mouse-edges');
    event.offEvent(viewport, EVENT_ID);
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
