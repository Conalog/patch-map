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
 * @property {(selected: PIXI.DisplayObject | null, event: PIXI.FederatedPointerEvent) => void} [onSelect=() => {}] - Callback for a single-object selection (click).
 * @property {(selected: PIXI.DisplayObject[], event: PIXI.FederatedPointerEvent) => void} [onDragSelect=() => {}] - Callback for a multi-object selection (drag).
 * @property {(hovered: PIXI.DisplayObject | null, event: PIXI.FederatedPointerEvent) => void} [onOver=() => {}] - Callback for hover events.
 * @property {object} [selectionBoxStyle] - Style options for the drag selection box.
 * @property {object} [selectionBoxStyle.fill={ color: '#9FD6FF', alpha: 0.2 }] - Fill style.
 * @property {object} [selectionBoxStyle.stroke={ width: 2, color: '#1099FF' }] - Stroke style.
 */

export default class SelectionState extends State {
  static handledEvents = [
    'onpointerdown',
    'onpointermove',
    'onpointerup',
    'onpointerover',
  ];

  /** @type {SelectionStateConfig} */
  config = {};
  interactionState = InteractionState.IDLE;
  dragStartPoint = null;
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
      onOver: () => {},
      onSelect: () => {},
      onDragSelect: () => {},
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
    this.dragStartPoint = null;
    this._selectionBox.clear();
  }

  destroy() {
    this._selectionBox.destroy(true);
    super.destroy();
  }

  onpointerdown(e) {
    this.interactionState = InteractionState.PRESSING;
    this.dragStartPoint = this.viewport.toWorld(e.global);
    this.select(e);
  }

  onpointermove(e) {
    if (this.interactionState === InteractionState.IDLE) return;
    const currentPoint = this.viewport.toWorld(e.global);

    if (
      this.interactionState === InteractionState.PRESSING &&
      isMoved(this.dragStartPoint, currentPoint, this.viewport.scale)
    ) {
      this.interactionState = InteractionState.DRAGGING;
      this.viewport.plugin.start('mouse-edges');
    }

    if (this.interactionState === InteractionState.DRAGGING) {
      this.#drawSelectionBox(this.dragStartPoint, currentPoint);
      this.dragSelect(e);
    }
  }

  onpointerup(e) {
    if (this.interactionState === InteractionState.PRESSING) {
      this.select(e);
    } else if (this.interactionState === InteractionState.DRAGGING) {
      this.dragSelect(e);
      this.viewport.plugin.stop('mouse-edges');
    }
    this.#clear();
  }

  onpointerover(e) {
    if (this.interactionState !== InteractionState.IDLE) return;
    this.hover(e);
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
   * Resets the internal state of the selection handler.
   * @private
   */
  #clear() {
    this.interactionState = InteractionState.IDLE;
    this._selectionBox.clear();
    this.dragStartPoint = null;
  }

  /** Finalizes a single object selection. */
  select(e) {
    const selected = this.findPoint(this.viewport.toWorld(e.global));
    this.config.onSelect(selected, e);
  }

  /** Finalizes a multi-object drag selection. */
  dragSelect(e) {
    const selected = this.findPolygon(this._selectionBox);
    this.config.onDragSelect(selected, e);
  }

  /** Handles hover-over objects. */
  hover(e) {
    const selected = this.findPoint(this.viewport.toWorld(e.global));
    this.config.onOver(selected, e);
  }

  findPoint(point) {
    return findIntersectObject(this.viewport, point, this.config);
  }

  findPolygon(polygon) {
    return findIntersectObjects(this.viewport, polygon, this.config);
  }
}
