import { update } from '../../display/update';
import { uid } from '../../utils/uuid';
import { isMoved } from '../utils';
import State from './State';

export default class TransformState extends State {
  #dragState = {};
  _elements = [];

  static handledEvents = ['onpointermove', 'onpointerup', 'onpointerupoutside'];

  enter(context, event, elements) {
    super.enter(context);
    Object.assign(this.#dragState, {
      isDragging: true,
      startPoint: this.context.viewport.toWorld({ ...event.global }),
      historyId: uid(),
    });
    this._elements = elements;
  }

  exit() {
    super.exit();
  }

  onpointermove(e) {
    if (!this.#dragState.isDragging || !e.global) return;
    this.#dragState.endPoint = this.context.viewport.toWorld({ ...e.global });

    this.#dragState.isMoved = isMoved(
      this.#dragState.startPoint,
      this.#dragState.endPoint,
      this.context.viewport.scale,
    );

    if (!this.#dragState.isMoved) {
      return;
    }

    const dx = this.#dragState.endPoint.x - this.#dragState.startPoint.x;
    const dy = this.#dragState.endPoint.y - this.#dragState.startPoint.y;

    update(this.context.viewport, {
      elements: this._elements,
      changes: { attrs: { x: dx, y: dy } },
      relativeTransform: true,
      history: this.#dragState.historyId,
    });
    this.#dragState.startPoint = this.#dragState.endPoint;
  }

  onpointerup() {
    this.context.stateManager.popState();
  }

  onpointerupoutside(e) {
    this.onpointerup(e);
  }
}
