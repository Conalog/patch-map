import { Graphics } from 'pixi.js';
import { findIntersectObject, findIntersectObjects } from '../find';
import { isMoved } from '../utils';
import State from './State';

export default class SelectionState extends State {
  static handledEvents = ['onpointerdown', 'onpointermove', 'onpointerup'];

  isDragging = false;
  dragStartPoint = null;
  isDragSelecting = false;
  _selectionBox = new Graphics();

  enter(context, config) {
    super.enter(context);
    this.config = {
      draggable: false,
      filter: null,
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

  onpointerdown(e) {
    this.isDragging = true;
    this.dragStartPoint = this.context.viewport.toWorld(e.global);
  }

  onpointermove(e) {
    if (!this.isDragging) return;
    const currentPoint = this.context.viewport.toWorld(e.global);

    if (
      this.config.draggable &&
      isMoved(this.dragStartPoint, currentPoint, this.context.viewport.scale)
    ) {
      this.isDragSelecting = true;
      this.#drawSelectionBox(this.dragStartPoint, currentPoint);
    }
  }

  onpointerup(e) {
    if (!this.isDragging) return;

    if (this.isDragSelecting) {
      const selected = findIntersectObjects(
        this.context.viewport,
        this._selectionBox,
        this.config,
      );
      this.config.onDragSelect(selected, e);
    } else {
      const selected = findIntersectObject(
        this.context.viewport,
        this.dragStartPoint,
        this.config,
      );
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
    this.isDragging = false;
    this.dragStartPoint = null;
    this.isDragSelecting = false;
    this._selectionBox.clear();
  }
}
