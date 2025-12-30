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
  onDragStart: () => {},
  onDrag: () => {},
  onDragEnd: () => {},
  onOver: () => {},
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
    'rightclick',
  ];

  /** @type {SelectionStateConfig} */
  config = {};

  interactionState = stateSymbol.IDLE;
  dragStartPoint = null;
  movedViewport = false;
  _selectionBox = new Graphics();

  _paintedObjects = new Set();
  _lastPaintPoint = null;

  /**
   * Enters the selection state with a given context and configuration.
   * @param {...*} args - Additional arguments passed to the state.
   */
  enter(...args) {
    super.enter(...args);
    const [_, config] = args;
    this.config = deepMerge(defaultConfig, config);
    this.viewport = this.context.viewport;
    this.viewport.addChild(this._selectionBox);
  }

  exit() {
    super.exit();
    this.#clear({ state: true, selectionBox: true, gesture: true });
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
      this.viewport.plugin.start('mouse-edges');
      this.config.onDragStart(e);
    }

    if (this.interactionState === stateSymbol.DRAGGING) {
      this.#drawSelectionBox(this.dragStartPoint, currentPoint);
      const selected = this.#searchObjects(this._selectionBox);
      this.config.onDrag(selected, e);
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
      const selected = this.#searchObjects(this._selectionBox);
      this.config.onDragEnd(selected, e);
      this.viewport.plugin.stop('mouse-edges');
    } else if (this.interactionState === stateSymbol.PAINTING) {
      this.config.onDragEnd(Array.from(this._paintedObjects), e);
      this.viewport.plugin.stop('mouse-edges');
    }
    this.#clear({ state: true, selectionBox: true, gesture: true });
  }

  onpointerover(e) {
    if (this.interactionState !== stateSymbol.IDLE) return;
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

  rightclick(e) {
    this.#processClick(e, (target) => {
      this.config.onRightClick(target, e);
    });
  }

  onpointerleave(e) {
    this.onpointerup(e);
  }

  #processClick(e, callback) {
    const currentPoint = this.viewport.toWorld(e.global);
    const isActuallyMoved =
      this.movedViewport ||
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
    for (const element of this.context.transformer.elements) {
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
    }
    if (selectionBox && !this._selectionBox.destroyed) {
      this._selectionBox.clear();
    }
    if (gesture) {
      this.dragStartPoint = null;
      this.movedViewport = false;
      this._paintedObjects.clear();
      this._lastPaintPoint = null;
    }
  }
}
