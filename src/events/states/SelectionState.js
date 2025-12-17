import { Graphics } from 'pixi.js';
import { deepMerge } from '../../utils/deepmerge/deepmerge';
import { findIntersectObject, findIntersectObjects } from '../find';
import { isMoved } from '../utils';
import State from './State';

const InteractionState = {
  IDLE: 'idle',
  PRESSING: 'pressing',
  DRAGGING: 'dragging',
};

/**
 * @typedef {object} SelectionStateConfig
 * @property {boolean} [draggable=false] - Enables drag-to-select functionality.
 * @property {(obj: PIXI.DisplayObject) => boolean} [filter=() => true] - A function to filter which objects can be selected.
 * @property {'entity' | 'closestGroup' | 'highestGroup' | 'grid'} [selectUnit='entity'] - The logical unit of selection.
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
 * Callback fired repeatedly during `pointermove` *after* a drag has started.
 *
 * @property {(selected: PIXI.DisplayObject[], event: PIXI.FederatedPointerEvent) => void} [onDragEnd]
 * Callback fired on `pointerup` *only if* a drag operation was in progress.
 *
 * @property {(hovered: PIXI.DisplayObject | null, event: PIXI.FederatedPointerEvent) => void} [onOver]
 * Callback fired on `pointerover` when the pointer enters a new object (and not dragging).
 */

export default class SelectionState extends State {
  static handledEvents = [
    'onpointerdown',
    'onpointermove',
    'onpointerup',
    'onpointerover',
    'onclick',
  ];

  /** @type {SelectionStateConfig} */
  config = {};
  interactionState = InteractionState.IDLE;
  dragStartPoint = null;
  movedViewport = false;
  _selectionBox = new Graphics();

  /**
   * Enters the selection state with a given context and configuration.
   * @param {object} context - The application context, containing the viewport.
   * @param {SelectionStateConfig} config - Configuration for the selection behavior.
   */
  enter(context, config) {
    super.enter(context);
    const defaultConfig = {
      draggable: false,
      filter: () => true,
      selectUnit: 'entity',
      onDown: () => {},
      onUp: () => {},
      onClick: () => {},
      onDoubleClick: () => {},
      onDragStart: () => {},
      onDrag: () => {},
      onDragEnd: () => {},
      onOver: () => {},
      selectionBoxStyle: {
        fill: { color: '#9FD6FF', alpha: 0.2 },
        stroke: { width: 2, color: '#1099FF' },
      },
    };
    this.config = deepMerge(defaultConfig, config || {});

    this.viewport = this.context.viewport;
    this.viewport.addChild(this._selectionBox);
  }

  exit() {
    super.exit();
    this.#clear();
    if (this._selectionBox.parent) {
      this._selectionBox.parent.removeChild(this._selectionBox);
    }
  }

  pause() {
    this.#clearSelectionBox();
  }

  destroy() {
    this._selectionBox.destroy(true);
    super.destroy();
  }

  onpointerdown(e) {
    this.#clearGesture();
    this.interactionState = InteractionState.PRESSING;
    this.dragStartPoint = this.viewport.toWorld(e.global);

    const target = this.findPoint(this.dragStartPoint);
    this.config.onDown(target, e);
  }

  onpointermove(e) {
    if (
      this.interactionState === InteractionState.PRESSING &&
      this.viewport.moving
    ) {
      this.movedViewport = true;
    }

    if (
      this.interactionState === InteractionState.IDLE ||
      !this.config.draggable
    ) {
      return;
    }
    const currentPoint = this.viewport.toWorld(e.global);

    if (
      this.interactionState === InteractionState.PRESSING &&
      isMoved(this.dragStartPoint, currentPoint, this.viewport.scale)
    ) {
      this.interactionState = InteractionState.DRAGGING;
      this.viewport.plugin.start('mouse-edges');
      this.config.onDragStart(e);
    }

    if (this.interactionState === InteractionState.DRAGGING) {
      this.#drawSelectionBox(this.dragStartPoint, currentPoint);
      const selected = this.findPolygon(this._selectionBox);
      this.config.onDrag(selected, e);
    }
  }

  onpointerup(e) {
    if (this.interactionState === InteractionState.PRESSING) {
      const target = this.findPoint(this.viewport.toWorld(e.global));
      this.config.onUp(target, e);
    } else if (this.interactionState === InteractionState.DRAGGING) {
      const selected = this.findPolygon(this._selectionBox);
      this.config.onDragEnd(selected, e);
      this.viewport.plugin.stop('mouse-edges');
    }
    this.#clearSelectionBox();
    this.#clearInteractionState();
  }

  onpointerover(e) {
    if (this.interactionState !== InteractionState.IDLE) return;
    const selected = this.findPoint(this.viewport.toWorld(e.global));
    this.config.onOver(selected, e);
  }

  onclick(e) {
    if (this.movedViewport) {
      this.#clearGesture();
      return;
    }

    const currentPoint = this.viewport.toWorld(e.global);
    if (isMoved(this.dragStartPoint, currentPoint, this.viewport.scale)) {
      this.#clearGesture();
      return;
    }

    const target = this.findPoint(currentPoint);
    if (e.detail === 2) {
      this.config.onDoubleClick(target, e);
    } else {
      this.config.onClick(target, e);
    }
    this.#clearGesture();
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
   * Clears the selection box if it exists and is not destroyed.
   * @private
   */
  #clearSelectionBox() {
    if (!this._selectionBox.destroyed) {
      this._selectionBox.clear();
    }
  }

  /**
   * Clears the current interaction state and resets to IDLE.
   * @private
   */
  #clearInteractionState() {
    this.interactionState = InteractionState.IDLE;
  }

  /**
   * Resets gesture-related properties, clearing drag start point and moved viewport state.
   * @private
   */
  #clearGesture() {
    this.dragStartPoint = null;
    this.movedViewport = false;
  }

  /**
   * Resets the interaction and gesture states to their initial values.
   * Calls {@link #clearInteractionState} and {@link #clearGesture}.
   * @private
   */
  #clear() {
    this.#clearInteractionState();
    this.#clearSelectionBox();
    this.#clearGesture();
  }

  findPoint(point) {
    return findIntersectObject(this.viewport, point, this.config);
  }

  findPolygon(polygon) {
    return findIntersectObjects(this.viewport, polygon, this.config);
  }
}
