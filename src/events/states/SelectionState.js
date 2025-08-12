import { Graphics } from 'pixi.js';
import Transformer from '../../transformer/Transformer';
import { findIntersectObject, findIntersectObjects } from '../find';
import { isMoved } from '../utils';
import State from './State';
import TransformState from './TransformState';

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
      filter: () => true,
      selectUnit: 'entity',
      transformer: null,
      onOver: () => {},
      onSelect: () => {},
      onDragSelect: () => {},
      ...config,
    };

    if (
      this.config.transformer &&
      !this.context.stateManager.stateRegistry.has('transform')
    ) {
      this.context.stateManager.register('transform', TransformState, false);
    }
  }

  exit() {
    super.exit();
    this.#clear();
  }

  destroy() {
    this._selectionBox.destroy(true);
    super.destroy();
  }

  onpointerdown(e) {
    this.isDragging = true;
    this.dragStartPoint = this.context.viewport.toWorld(e.global);

    const transformer = this.config.transformer;
    if (transformer) {
      const selected = this.findPoint(this.dragStartPoint);
      if (
        !transformer.elements.includes(selected) &&
        selected !== transformer
      ) {
        this.config.onSelect(selected, e);
      }

      if (selected) {
        this.context.stateManager.pushState(
          'transform',
          e,
          transformer.elements,
        );
        this.#clear();
      }
    }
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
      const selected = this.findPolygon(
        this._selectionBox,
        (obj) => this.config.filter(obj) && !(obj instanceof Transformer),
      );
      this.config.onDragSelect(selected, e);
    } else {
      const selected = this.findPoint(
        this.dragStartPoint,
        (obj) => this.config.filter(obj) && !(obj instanceof Transformer),
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

  findPoint(point, filter) {
    return findIntersectObject(this.context.viewport, point, {
      ...this.config,
      filter,
    });
  }

  findPolygon(polygon, filter) {
    return findIntersectObjects(this.context.viewport, polygon, {
      ...this.config,
      filter,
    });
  }
}
