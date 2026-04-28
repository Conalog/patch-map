import { Graphics } from 'pixi.js';
import { deepMerge } from '../../utils/deepmerge/deepmerge';
import {
  findIntersectObject,
  findIntersectObjects,
  findIntersectObjectsBySegment,
} from '../find';
import { isMoved } from '../utils';
import State from './State';

const stateSymbol = {
  IDLE: Symbol('IDLE'),
  PRESSING: Symbol('PRESSING'),
  DRAGGING: Symbol('DRAGGING'),
  PAINTING: Symbol('PAINTING'),
};

const VIEWPORT_CHANGE_EPSILON = 0.0001;
const noop = () => {};

/**
 * @typedef {object} SelectionStateConfig
 * @property {boolean} [draggable=false] - Enables drag-to-select functionality.
 * @property {boolean} [paintSelection=false] - Enables paint-to-select functionality.
 * @property {(obj: PIXI.DisplayObject) => boolean} [filter=() => true] - A function to filter which objects can be selected.
 * @property {'entity' | 'closestGroup' | 'highestGroup' | 'grid'} [selectUnit='entity'] - The logical unit of selection.
 * @property {boolean} [drillDown=false] - Enables drill-down selection on double click.
 * @property {boolean} [deepSelect=false] - Enables deep selection (force 'entity') when holding Ctrl/Meta key.
 * @property {object} [selectionBoxStyle] - Style options for the drag selection box.
 * @property {object} [selectionBoxStyle.fill] - Fill style.
 * @property {string | number} [selectionBoxStyle.fill.color='#9FD6FF'] - Fill color.
 * @property {number} [selectionBoxStyle.fill.alpha=0.2] - Fill alpha.
 * @property {object} [selectionBoxStyle.stroke] - Stroke style.
 * @property {number} [selectionBoxStyle.stroke.width=2] - Stroke width.
 * @property {string | number} [selectionBoxStyle.stroke.color='#1099FF'] - Stroke color.
 *
 * @property {(target: PIXI.DisplayObject | null, event: PIXI.FederatedPointerEvent) => void} [onDown]
 * Callback fired immediately on `pointerdown`. Useful for "Figma-style" instant selection feedback.
 *
 * @property {(target: PIXI.DisplayObject | null, event: PIXI.FederatedPointerEvent) => void} [onUp]
 * Callback fired on `pointerup` *only if* it was not a drag operation.
 * This is a low-level event; for click logic, prefer `onClick`.
 *
 * @property {(target: PIXI.DisplayObject | null, event: PIXI.FederatedPointerEvent) => void} [onClick]
 * Callback fired when a complete, non-drag click is detected.
 * Tap events (`ontap`) are routed to this callback as well.
 * This will *not* fire if `onDoubleClick` fires.
 *
 * @property {(target: PIXI.DisplayObject | null, event: PIXI.FederatedPointerEvent) => void} [onDoubleClick]
 * Callback fired when a complete, non-drag double-click is detected.
 *
 * @property {(event: PIXI.FederatedPointerEvent) => void} [onDragStart]
 * Callback fired *once* when the pointer moves beyond the movement threshold after a `pointerdown`.
 *
 * @property {(selected: PIXI.DisplayObject[], event: PIXI.FederatedPointerEvent) => void} [onDrag]
 * Callback fired repeatedly during `pointermove` *after* a drag or paint has started.
 *
 * @property {(selected: PIXI.DisplayObject[], event: PIXI.FederatedPointerEvent) => void} [onDragEnd]
 * Callback fired on `pointerup` *only if* a drag or paint operation was in progress.
 *
 * @property {(hovered: PIXI.DisplayObject | null, event: PIXI.FederatedPointerEvent) => void} [onOver]
 * Callback fired on `pointerover` when the pointer enters a new object (and not dragging).
 */

const defaultConfig = {
  draggable: false,
  paintSelection: false,
  filter: () => true,
  selectUnit: 'entity',
  drillDown: false,
  deepSelect: false,
  onDown: () => {},
  onUp: () => {},
  onClick: () => {},
  onDoubleClick: () => {},
  onRightClick: () => {},
  onDragStart: noop,
  onDrag: noop,
  onDragEnd: noop,
  onOver: noop,
  selectionBoxStyle: {
    fill: { color: '#9FD6FF', alpha: 0.2 },
    stroke: { width: 2, color: '#1099FF' },
  },
};

export default class SelectionState extends State {
  static handledEvents = [
    'onpointerdown',
    'onpointermove',
    'onpointerup',
    'onpointerover',
    'onpointerleave',
    'onclick',
    'ontap',
    'rightclick',
  ];

  /** @type {SelectionStateConfig} */
  config = {};

  interactionState = stateSymbol.IDLE;
  dragStartPoint = null;
  movedViewport = false;
  viewportSnapshot = null;
  _selectionBox = new Graphics();
  _selectionBoxFrame = null;
  _pendingSelectionBox = null;
  _latestSelectionBox = null;
  _selectionBoxOverlay = null;

  _paintedObjects = new Set();
  _lastPaintPoint = null;

  /**
   * Enters the selection state with a given store and configuration.
   * @param {...*} args - Additional arguments passed to the state.
   */
  enter(...args) {
    super.enter(...args);
    const [_, config] = args;
    this.config = deepMerge(defaultConfig, config);
    this.viewport = this.store.viewport;
    this.viewport.addChild(this._selectionBox);
  }

  exit() {
    super.exit();
    this.#clear({ state: true, selectionBox: true, gesture: true });
    this.#destroySelectionBoxOverlay();
    if (this._selectionBox.parent) {
      this._selectionBox.parent.removeChild(this._selectionBox);
    }
  }

  pause() {
    this.#clear({ selectionBox: true });
  }

  onpointerdown(e) {
    this.#clear({ gesture: true });
    this.interactionState = stateSymbol.PRESSING;
    this.dragStartPoint = this.viewport.toWorld(e.global);
    this._lastPaintPoint = this.dragStartPoint;
    this.viewportSnapshot = this.#captureViewportState();

    const target = this.#searchObject(this.dragStartPoint, e, true);
    this.config.onDown(target, e);

    if (e.button === 2) {
      this.#clear({ state: true, selectionBox: true, gesture: true });
    }
  }

  onpointermove(e) {
    if (this.interactionState === stateSymbol.IDLE || !this.config.draggable) {
      return;
    }

    if (
      this.interactionState === stateSymbol.PRESSING &&
      this.viewport.moving
    ) {
      this.movedViewport = true;
    }

    const currentPoint = this.viewport.toWorld(e.global);
    if (
      this.interactionState === stateSymbol.PRESSING &&
      isMoved(this.dragStartPoint, currentPoint, this.viewport.scale)
    ) {
      this.interactionState = this.config.paintSelection
        ? stateSymbol.PAINTING
        : stateSymbol.DRAGGING;
      this.#setObjectAfterRenderSuspended(
        this.interactionState === stateSymbol.DRAGGING &&
          !this.#hasCustomHandler('onDrag'),
      );
      this.viewport.plugin.start('mouse-edges');
      this.config.onDragStart(e);
    }

    if (this.interactionState === stateSymbol.DRAGGING) {
      if (this.#hasCustomHandler('onDrag')) {
        this.#drawSelectionBox(this.dragStartPoint, currentPoint);
        const selected = this.#searchObjects(this._selectionBox);
        this.config.onDrag(selected, e);
      } else {
        this.#scheduleSelectionBoxDraw(this.dragStartPoint, currentPoint);
      }
    } else if (this.interactionState === stateSymbol.PAINTING) {
      const targets = findIntersectObjectsBySegment(
        this.viewport,
        this._lastPaintPoint,
        currentPoint,
        { ...this.config, filterParent: this.#getSelectionAncestors() },
      );

      const initialSize = this._paintedObjects.size;
      targets.forEach((target) => this._paintedObjects.add(target));

      if (this._paintedObjects.size > initialSize) {
        this.config.onDrag(Array.from(this._paintedObjects), e);
      }
    }

    this._lastPaintPoint = currentPoint;
  }

  onpointerup(e) {
    if (this.interactionState === stateSymbol.PRESSING) {
      const target = this.#searchObject(this.viewport.toWorld(e.global), e);
      this.config.onUp(target, e);
    } else if (this.interactionState === stateSymbol.DRAGGING) {
      this.#flushSelectionBoxDraw();
      const selected = this.#searchObjects(this._selectionBox);
      this.config.onDragEnd(selected, e);
      this.viewport.plugin.stop('mouse-edges');
    } else if (this.interactionState === stateSymbol.PAINTING) {
      this.config.onDragEnd(Array.from(this._paintedObjects), e);
      this.viewport.plugin.stop('mouse-edges');
    }
    this.#clear({ state: true, selectionBox: true });
  }

  onpointerover(e) {
    if (this.interactionState !== stateSymbol.IDLE) return;
    if (!this.#hasCustomHandler('onOver')) return;
    const target = this.#searchObject(this.viewport.toWorld(e.global), e);
    this.config.onOver(target, e);
  }

  onclick(e) {
    this.#processClick(e, (target, currentPoint) => {
      if (this.config.drillDown && e.detail >= 2) {
        for (let i = 1; i < e.detail; i++) {
          if (!target) break;
          const deeperTarget = findIntersectObject(
            target,
            currentPoint,
            this.config,
          );
          if (!deeperTarget) break;
          target = deeperTarget;
        }
      }

      if (e.detail === 2) {
        this.config.onDoubleClick(target, e);
      } else {
        this.config.onClick(target, e);
      }
    });
  }

  ontap(e) {
    this.onclick(e);
  }

  rightclick(e) {
    this.#processClick(e, (target) => {
      this.config.onRightClick(target, e);
    });
  }

  onpointerleave() {
    this.#clear({ state: true, selectionBox: true, gesture: true });
  }

  #processClick(e, callback) {
    const currentPoint = this.viewport.toWorld(e.global);
    const isActuallyMoved =
      this.movedViewport ||
      this.#hasViewportChanged() ||
      isMoved(this.dragStartPoint, currentPoint, this.viewport.scale);

    if (!isActuallyMoved) {
      const target = this.#searchObject(currentPoint, e);
      callback(target, currentPoint);
    }
    this.#clear({ gesture: true });
  }

  #searchObject(point, e, skipWireframeCheck) {
    if (this.config.deepSelect && (e.ctrlKey || e.metaKey)) {
      return this.#findByPoint(
        point,
        { ...this.config, selectUnit: 'grid' },
        skipWireframeCheck,
      );
    }

    return this.#findByPoint(
      point,
      { ...this.config, filterParent: this.#getSelectionAncestors() },
      skipWireframeCheck,
    );
  }

  #searchObjects(polygon) {
    return this.#findByPolygon(polygon, {
      ...this.config,
      filterParent: this.#getSelectionAncestors(),
    });
  }

  #findByPoint(point, config = this.config, skipWireframeCheck = false) {
    const object = findIntersectObject(this.viewport, point, config);
    if (skipWireframeCheck || !object || object.type !== 'wireframe') {
      return object;
    }

    const underObject = findIntersectObject(this.viewport, point, {
      ...config,
      filter: (obj) => this.config.filter(obj) && obj.type !== 'wireframe',
    });
    if (!underObject || underObject.type === 'canvas') {
      return object;
    }
    return underObject;
  }

  #findByPolygon(polygon, config = this.config) {
    return findIntersectObjects(this.viewport, polygon, {
      ...config,
      filter: (obj) => this.config.filter(obj) && obj.type !== 'wireframe',
    });
  }

  /**
   * Retrieves the ancestors of selected elements.
   * @private
   * @returns {Set<PIXI.DisplayObject>} A set of ancestors of selected elements.
   */
  #getSelectionAncestors() {
    const selectionAncestors = new Set();
    for (const element of this.store.transformer.elements) {
      let current = element.parent;
      while (current) {
        if (current.type === 'canvas') break;
        selectionAncestors.add(current);
        current = current.parent;
      }
    }
    return selectionAncestors;
  }

  /**
   * Draws the selection rectangle on the screen.
   * @private
   * @param {PIXI.Point} p1 - The starting point of the drag.
   * @param {PIXI.Point} p2 - The current pointer position.
   */
  #drawSelectionBox(p1, p2) {
    if (!p1 || !p2) return;

    const { fill, stroke } = this.config.selectionBoxStyle;
    this._selectionBox.clear();
    this._selectionBox
      .rect(
        Math.min(p1.x, p2.x),
        Math.min(p1.y, p2.y),
        Math.abs(p1.x - p2.x),
        Math.abs(p1.y - p2.y),
      )
      .fill(fill)
      .stroke({ ...stroke, pixelLine: true });
  }

  /**
   * Clears the selection state and optional components.
   * @private
   * @param {object} options - Options to control what to clear.
   * @param {boolean} [options.state=false] - Clear the interaction state.
   * @param {boolean} [options.selectionBox=false] - Clear the selection box.
   * @param {boolean} [options.gesture=false] - Clear gesture-related data.
   */
  #clear({ state = false, selectionBox = false, gesture = false }) {
    if (state) {
      this.interactionState = stateSymbol.IDLE;
      this.#setObjectAfterRenderSuspended(false);
    }
    if (selectionBox && !this._selectionBox.destroyed) {
      this.#cancelSelectionBoxDraw();
      this.#hideSelectionBoxOverlay();
      this._selectionBox.clear();
    }
    if (gesture) {
      this.dragStartPoint = null;
      this.movedViewport = false;
      this.viewportSnapshot = null;
      this._latestSelectionBox = null;
      this._paintedObjects.clear();
      this._lastPaintPoint = null;
    }
  }

  #captureViewportState() {
    if (!this.viewport) return null;
    return {
      x: this.viewport.x,
      y: this.viewport.y,
      scaleX: this.viewport.scale?.x ?? 1,
      scaleY: this.viewport.scale?.y ?? 1,
    };
  }

  #hasViewportChanged() {
    if (!this.viewportSnapshot || !this.viewport) return false;
    const current = this.#captureViewportState();
    return (
      Math.abs(current.x - this.viewportSnapshot.x) > VIEWPORT_CHANGE_EPSILON ||
      Math.abs(current.y - this.viewportSnapshot.y) > VIEWPORT_CHANGE_EPSILON ||
      Math.abs(current.scaleX - this.viewportSnapshot.scaleX) >
        VIEWPORT_CHANGE_EPSILON ||
      Math.abs(current.scaleY - this.viewportSnapshot.scaleY) >
        VIEWPORT_CHANGE_EPSILON
    );
  }

  #hasCustomHandler(key) {
    return this.config[key] !== defaultConfig[key];
  }

  #setObjectAfterRenderSuspended(value) {
    if (this.viewport) {
      this.viewport._suspendObjectAfterRender = value;
    }
  }

  #scheduleSelectionBoxDraw(p1, p2) {
    this._pendingSelectionBox = { p1, p2 };
    this._latestSelectionBox = this._pendingSelectionBox;
    if (this._selectionBoxFrame !== null) return;

    const requestFrame =
      globalThis.requestAnimationFrame ??
      ((callback) => globalThis.setTimeout(callback, 16));
    this._selectionBoxFrame = requestFrame(() => {
      this._selectionBoxFrame = null;
      this.#flushSelectionBoxOverlay();
    });
  }

  #flushSelectionBoxDraw() {
    const pending = this._pendingSelectionBox ?? this._latestSelectionBox;
    this._pendingSelectionBox = null;
    if (pending) {
      this.#drawSelectionBox(pending.p1, pending.p2);
    }
  }

  #cancelSelectionBoxDraw() {
    if (this._selectionBoxFrame === null) return;

    const cancelFrame =
      globalThis.cancelAnimationFrame ?? globalThis.clearTimeout;
    cancelFrame?.(this._selectionBoxFrame);
    this._selectionBoxFrame = null;
    this._pendingSelectionBox = null;
  }

  #flushSelectionBoxOverlay() {
    const pending = this._pendingSelectionBox;
    this._pendingSelectionBox = null;
    if (pending) {
      this.#drawSelectionBoxOverlay(pending.p1, pending.p2);
    }
  }

  #drawSelectionBoxOverlay(p1, p2) {
    const overlay = this.#getSelectionBoxOverlay();
    if (!overlay || !p1 || !p2) {
      return;
    }

    const start = this.viewport.toGlobal(p1);
    const end = this.viewport.toGlobal(p2);
    const left = Math.min(start.x, end.x);
    const top = Math.min(start.y, end.y);
    const width = Math.abs(start.x - end.x);
    const height = Math.abs(start.y - end.y);
    const { fill, stroke } = this.config.selectionBoxStyle;

    this.#resizeSelectionBoxOverlay(overlay);
    const strokeWidth = getPixelLineWidth(overlay.ratio);
    const rect = alignPixelLineRect(
      { left, top, width, height },
      strokeWidth,
      overlay.ratio,
    );

    overlay.canvas.style.display = 'block';
    overlay.context.clearRect(
      0,
      0,
      overlay.canvas.width,
      overlay.canvas.height,
    );
    overlay.context.save();
    overlay.context.scale(overlay.ratio, overlay.ratio);
    overlay.context.fillStyle = toCssColor(fill.color, fill.alpha);
    overlay.context.strokeStyle = toCssColor(stroke.color, stroke.alpha);
    overlay.context.lineWidth = strokeWidth;
    overlay.context.fillRect(rect.left, rect.top, rect.width, rect.height);
    overlay.context.strokeRect(
      rect.left + strokeWidth / 2,
      rect.top + strokeWidth / 2,
      Math.max(rect.width - strokeWidth, 0),
      Math.max(rect.height - strokeWidth, 0),
    );
    overlay.context.restore();
  }

  #getSelectionBoxOverlay() {
    if (this._selectionBoxOverlay?.canvas?.isConnected) {
      return this._selectionBoxOverlay;
    }
    if (typeof document === 'undefined') {
      return null;
    }

    const parent = this.viewport?.app?.canvas?.parentElement;
    if (!parent) {
      return null;
    }

    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    canvas.style.display = 'none';
    if (getComputedStyle(parent).position === 'static') {
      parent.style.position = 'relative';
    }
    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }
    parent.appendChild(canvas);
    this._selectionBoxOverlay = {
      canvas,
      context,
      ratio: 1,
      width: 0,
      height: 0,
    };
    return this._selectionBoxOverlay;
  }

  #resizeSelectionBoxOverlay(overlay) {
    const width = this.viewport?.app?.screen?.width ?? 0;
    const height = this.viewport?.app?.screen?.height ?? 0;
    const ratio = globalThis.devicePixelRatio || 1;
    if (
      overlay.width === width &&
      overlay.height === height &&
      overlay.ratio === ratio
    ) {
      return;
    }

    overlay.width = width;
    overlay.height = height;
    overlay.ratio = ratio;
    overlay.canvas.width = Math.max(Math.ceil(width * ratio), 1);
    overlay.canvas.height = Math.max(Math.ceil(height * ratio), 1);
  }

  #hideSelectionBoxOverlay() {
    if (this._selectionBoxOverlay?.canvas) {
      this._selectionBoxOverlay.context.clearRect(
        0,
        0,
        this._selectionBoxOverlay.canvas.width,
        this._selectionBoxOverlay.canvas.height,
      );
      this._selectionBoxOverlay.canvas.style.display = 'none';
    }
  }

  #destroySelectionBoxOverlay() {
    this._selectionBoxOverlay?.canvas?.remove();
    this._selectionBoxOverlay = null;
  }
}

const toCssColor = (color, alpha) => {
  const hex = normalizeCssHex(color);
  if (alpha == null || !hex) {
    return hex ?? color;
  }

  const value = hex.slice(1);
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const normalizeCssHex = (color) => {
  if (typeof color === 'number') {
    return `#${color.toString(16).padStart(6, '0')}`;
  }
  if (typeof color !== 'string') {
    return null;
  }
  const value = color.startsWith('#')
    ? color.slice(1)
    : color.startsWith('0x')
      ? color.slice(2)
      : null;
  if (!value) {
    return null;
  }
  if (value.length === 3) {
    return `#${value
      .split('')
      .map((digit) => `${digit}${digit}`)
      .join('')}`;
  }
  return `#${value.padStart(6, '0')}`;
};

const getPixelLineWidth = (ratio) => 1 / Math.max(ratio || 1, 1);

const alignPixelLineRect = (
  { left, top, width, height },
  strokeWidth,
  ratio,
) => {
  const unit = 1 / Math.max(ratio || 1, 1);
  const alignedLeft = Math.round(left / unit) * unit;
  const alignedTop = Math.round(top / unit) * unit;
  const alignedRight = Math.round((left + width) / unit) * unit;
  const alignedBottom = Math.round((top + height) / unit) * unit;

  return {
    left: alignedLeft,
    top: alignedTop,
    width: Math.max(alignedRight - alignedLeft, strokeWidth),
    height: Math.max(alignedBottom - alignedTop, strokeWidth),
  };
};
