import { Graphics } from 'pixi.js';
import { findIntersectObject, findIntersectObjects } from '../find';
import { isMoved } from '../utils';
import State from './State';

export default class SelectionState extends State {
  static handledEvents = [
    'onpointerdown',
    'onpointermove',
    'onpointerup',
    'onpointerover',
  ];

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
    this.viewport = this.context.viewport;
  }

  exit() {
    super.exit();
    this.#clear();
  }

  pause() {
    this._selectionBox.clear();
  }

  destroy() {
    this._selectionBox.destroy(true);
    super.destroy();
  }

  onpointerdown(e) {
    this.isPointerdown = true;
    this.dragStartPoint = this.viewport.toWorld(e.global);
    this.select(e);
  }

  onpointermove(e) {
    if (!this.isPointerdown) return;
    const currentPoint = this.viewport.toWorld(e.global);

    if (
      this.config.draggable &&
      isMoved(this.dragStartPoint, currentPoint, this.viewport.scale)
    ) {
      this.isDragging = true;
      this.#drawSelectionBox(this.dragStartPoint, currentPoint);
      this.dragSelect(e);
    }
  }

  onpointerup(e) {
    if (!this.isPointerdown) return;

    if (this.isDragging) {
      this.dragSelect(e);
    } else {
      this.select(e);
    }
    this.#clear();
  }

  onpointerover(e) {
    this.hover(e);
  }

  #drawSelectionBox(p1, p2) {
    if (!p1 || !p2) return;

    if (!this._selectionBox.parent) {
      this.viewport.addChild(this._selectionBox);
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

  select(e) {
    const selected = this.findPoint(this.dragStartPoint);
    this.config.onSelect(selected, e);
  }

  dragSelect(e) {
    const selected = this.findPolygon(this._selectionBox);
    this.config.onDragSelect(selected, e);
  }

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
