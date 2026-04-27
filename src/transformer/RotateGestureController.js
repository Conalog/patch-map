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
  _isShiftPressed = false;
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
      currentPoint: viewport.toWorld(event.global),
      frame: rotateContext.frame,
      elementStates: createRotateElementStates({
        elements: rotateContext.elements,
        viewport,
      }),
      historyId: this._getTransformHistory() ? uid() : null,
    };
    this._isShiftPressed = Boolean(event.shiftKey);

    this._session.start();
    this.#startKeyboardTracking();
  };

  end() {
    this._session.stop();
    this.#stopKeyboardTracking();
    this._activeRotate = null;
    this._isShiftPressed = false;
  }

  destroy() {
    this.end();
  }

  #onMove = (event) => {
    const viewport = this._getViewport();
    if (!this._activeRotate || !viewport) return;

    event.stopPropagation();

    const currentPoint = viewport.toWorld(event.global);
    this._activeRotate.currentPoint = currentPoint;
    if (Object.hasOwn(event, 'shiftKey')) {
      this._isShiftPressed = Boolean(event.shiftKey);
    }
    this.#applyRotation(currentPoint, this._isShiftPressed);
  };

  #applyRotation(currentPoint, snap) {
    const viewport = this._getViewport();
    if (!this._activeRotate || !viewport || !currentPoint) return;

    const deltaAngle = computeRotationDelta({
      center: this._activeRotate.frame.center,
      startPoint: this._activeRotate.startPoint,
      currentPoint,
      snap,
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
  }

  #onUp = (event) => {
    if (!this._activeRotate) return;
    event.stopPropagation();
    this.end();
  };

  #onKeyDown = (event) => {
    if (event.key !== 'Shift' || this._isShiftPressed) return;
    this._isShiftPressed = true;
    this.#applyRotation(this._activeRotate?.currentPoint, true);
  };

  #onKeyUp = (event) => {
    if (event.key !== 'Shift' || !this._isShiftPressed) return;
    this._isShiftPressed = false;
    this.#applyRotation(this._activeRotate?.currentPoint, false);
  };

  #startKeyboardTracking() {
    globalThis.addEventListener?.('keydown', this.#onKeyDown);
    globalThis.addEventListener?.('keyup', this.#onKeyUp);
  }

  #stopKeyboardTracking() {
    globalThis.removeEventListener?.('keydown', this.#onKeyDown);
    globalThis.removeEventListener?.('keyup', this.#onKeyUp);
  }
}
