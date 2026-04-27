import { uid } from '../utils/uuid';
import GestureSession from './gesture-session';
import {
  applyRotateUpdates,
  computeRotateUpdates,
  createRotateElementStates,
} from './rotate-apply';
import { computeRotationDelta } from './rotate-utils';

/**
 * Handles pointer gesture lifecycle for rotating selected elements.
 */
export default class RotateGestureController {
  _getViewport;
  _canStart;
  _getRotateContext;
  _getTransformHistory;
  _emitUpdateElements;
  _requestRender;
  _activeRotate = null;
  _session;

  constructor({
    getViewport,
    canStart,
    getRotateContext,
    getTransformHistory,
    emitUpdateElements,
    requestRender,
  }) {
    this._getViewport = getViewport;
    this._canStart = canStart;
    this._getRotateContext = getRotateContext;
    this._getTransformHistory = getTransformHistory;
    this._emitUpdateElements = emitUpdateElements;
    this._requestRender = requestRender;
    this._session = new GestureSession({
      getViewport,
      onMove: this.#onMove,
      onUp: this.#onUp,
    });
  }

  begin = (_handle, event) => {
    const viewport = this._getViewport();
    if (!this._canStart() || !viewport) return;

    event.stopPropagation();
    this.end();

    const rotateContext = this._getRotateContext();
    if (!rotateContext) return;

    this._activeRotate = {
      startPoint: viewport.toWorld(event.global),
      frame: rotateContext.frame,
      elementStates: createRotateElementStates({
        elements: rotateContext.elements,
        viewport,
      }),
      historyId: this._getTransformHistory() ? uid() : null,
    };

    this._session.start();
  };

  end() {
    this._session.stop();
    this._activeRotate = null;
  }

  destroy() {
    this.end();
  }

  #onMove = (event) => {
    const viewport = this._getViewport();
    if (!this._activeRotate || !viewport) return;

    event.stopPropagation();

    const currentPoint = viewport.toWorld(event.global);
    const deltaAngle = computeRotationDelta({
      center: this._activeRotate.frame.center,
      startPoint: this._activeRotate.startPoint,
      currentPoint,
      snap: Boolean(event.shiftKey),
    });
    const updates = computeRotateUpdates({
      activeRotate: this._activeRotate,
      deltaAngle,
    });

    applyRotateUpdates({
      updates,
      viewport,
      historyId: this._activeRotate.historyId,
    });

    this._emitUpdateElements();
    this._requestRender();
  };

  #onUp = (event) => {
    if (!this._activeRotate) return;
    event.stopPropagation();
    this.end();
  };
}
