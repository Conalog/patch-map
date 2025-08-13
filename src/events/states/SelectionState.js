import { Graphics } from 'pixi.js';
import { findIntersectObject, findIntersectObjects } from '../find';
import { isMoved } from '../utils';
import State from './State';

export default class SelectionState extends State {
  static handledEvents = ['onpointerdown', 'onpointermove', 'onpointerup'];

  isPointerdown = false;
  dragStartPoint = null;
  isDragging = false;
  _selectionBox = new Graphics();

  enter(context, config) {
    super.enter(context);
    this.config = {
      draggable: false,
      filter: () => true,
      selectUnit: 'entity',
      onOver: () => {},
      onSelect: () => {},
      onDragSelect: () => {},
      ...config,
    };
  }

  exit() {
    super.exit();
    this.#clear();
  }

  pause() {
    this.#clear();
  }

  destroy() {
    this._selectionBox.destroy(true);
    super.destroy();
  }

  onpointerdown(e) {
    this.isPointerdown = true;
    this.dragStartPoint = this.context.viewport.toWorld(e.global);

    const selected = this.findPoint(this.dragStartPoint);
    this.config.onSelect(selected, e);
  }

  onpointermove(e) {
    if (!this.isPointerdown) return;
    const currentPoint = this.context.viewport.toWorld(e.global);

    if (
      this.config.draggable &&
      isMoved(this.dragStartPoint, currentPoint, this.context.viewport.scale)
    ) {
      this.isDragging = true;
      this.#drawSelectionBox(this.dragStartPoint, currentPoint);
    }
  }

  onpointerup(e) {
    if (!this.isPointerdown) return;

    if (this.isDragging) {
      const selected = this.findPolygon(this._selectionBox);
      this.config.onDragSelect(selected, e);
    } else {
      const selected = this.findPoint(this.dragStartPoint);
      this.config.onSelect(selected, e);
    }
    this.#clear();
  }

  #drawSelectionBox(p1, p2) {
    if (!p1 || !p2) return;

    if (!this._selectionBox.parent) {
      this.context.viewport.addChild(this._selectionBox);
    }

    this._selectionBox.clear();
    this._selectionBox
      .rect(
        Math.min(p1.x, p2.x),
        Math.min(p1.y, p2.y),
        Math.abs(p1.x - p2.x),
        Math.abs(p1.y - p2.y),
      )
      .fill({ color: '#9FD6FF', alpha: 0.2 })
      .stroke({ width: 2, color: '#1099FF', pixelLine: true });
  }

  #clear() {
    this.isPointerdown = false;
    this.dragStartPoint = null;
    this.isDragging = false;
    this._selectionBox.clear();
  }

  findPoint(point) {
    return findIntersectObject(this.context.viewport, point, this.config);
  }

  findPolygon(polygon) {
    return findIntersectObjects(this.context.viewport, polygon, this.config);
  }
}
