import { uid } from '../utils/uuid';
import GestureSession from './gesture-session';
import {
  applyResizeUpdates,
  computeResizeUpdates,
  createResizeDelta,
  createResizeElementStates,
} from './resize-apply';
import { normalizeBounds } from './resize-context';

/**
 * @typedef {object} ResizeContext
 * @property {PIXI.DisplayObject[]} elements
 * @property {{ x: number, y: number, width: number, height: number }} bounds
 */

/**
 * @typedef {object} ActiveResizeSession
 * @property {string} handle
 * @property {{ x: number, y: number }} startPoint
 * @property {{ x: number, y: number, width: number, height: number }} bounds
 * @property {Array<{ element: PIXI.DisplayObject, x: number, y: number, width: number, height: number }>} elementStates
 * @property {string | null} historyId
 */

/**
 * @typedef {object} ResizeGestureControllerOptions
 * @property {() => import('pixi-viewport').Viewport | null} getViewport
 * @property {() => boolean} canStart
 * @property {() => ResizeContext | null} getResizeContext
 * @property {() => boolean} getTransformHistory
 * @property {(context: { event: PIXI.FederatedPointerEvent, handle: string, elements: PIXI.DisplayObject[] }) => boolean} getResizeKeepRatio
 * @property {() => void} emitUpdateElements
 * @property {() => void} requestRender
 */

/**
 * Handles pointer gesture lifecycle for resizing: start, move, and finish.
 * It owns gesture-local state and delegates geometry/application to helpers.
 */
export default class ResizeGestureController {
  /**
   * @private
   * @type {() => import('pixi-viewport').Viewport | null}
   */
  _getViewport;

  /**
   * @private
   * @type {() => boolean}
   */
  _canStart;

  /**
   * @private
   * @type {() => ResizeContext | null}
   */
  _getResizeContext;

  /**
   * @private
   * @type {() => boolean}
   */
  _getTransformHistory;

  /**
   * @private
   * @type {(context: { event: PIXI.FederatedPointerEvent, handle: string, elements: PIXI.DisplayObject[] }) => boolean}
   */
  _getResizeKeepRatio;

  /**
   * @private
   * @type {() => void}
   */
  _emitUpdateElements;

  /**
   * @private
   * @type {() => void}
   */
  _requestRender;

  /**
   * @private
   * @type {ActiveResizeSession | null}
   */
  _activeResize = null;

  /**
   * @private
   * @type {GestureSession}
   */
  _session;

  /**
   * @param {ResizeGestureControllerOptions} options
   */
  constructor({
    getViewport,
    canStart,
    getResizeContext,
    getTransformHistory,
    getResizeKeepRatio,
    emitUpdateElements,
    requestRender,
  }) {
    this._getViewport = getViewport;
    this._canStart = canStart;
    this._getResizeContext = getResizeContext;
    this._getTransformHistory = getTransformHistory;
    this._getResizeKeepRatio = getResizeKeepRatio;
    this._emitUpdateElements = emitUpdateElements;
    this._requestRender = requestRender;
    this._session = new GestureSession({
      getViewport,
      onMove: this.#onMove,
      onUp: this.#onUp,
    });
  }

  /**
   * Starts a resize gesture from the given handle.
   *
   * @param {string} handle
   * @param {import('pixi.js').FederatedPointerEvent} event
   * @returns {void}
   */
  begin = (handle, event) => {
    const viewport = this._getViewport();
    if (!this._canStart() || !viewport) return;

    event.stopPropagation();
    this.end();

    const resizeContext = this._getResizeContext();
    if (!resizeContext) return;

    const startPoint = viewport.toWorld(event.global);
    const elementStates = createResizeElementStates({
      elements: resizeContext.elements,
      viewport,
    });

    this._activeResize = {
      handle,
      startPoint,
      bounds: normalizeBounds(resizeContext.bounds),
      frame: resizeContext.frame,
      elementStates,
      historyId: this._getTransformHistory() ? uid() : null,
    };

    this._session.start();
  };

  /**
   * Ends the current resize gesture and removes all viewport listeners.
   *
   * @returns {void}
   */
  end() {
    this._session.stop();
    this._activeResize = null;
  }

  /**
   * Releases gesture resources. Safe to call multiple times.
   *
   * @returns {void}
   */
  destroy() {
    this.end();
  }

  #onMove = (event) => {
    const viewport = this._getViewport();
    if (!this._activeResize || !viewport) return;

    event.stopPropagation();

    const currentPoint = viewport.toWorld(event.global);
    const delta = createResizeDelta(
      this._activeResize.startPoint,
      currentPoint,
    );
    const keepRatio =
      Boolean(event.shiftKey) ||
      Boolean(
        this._getResizeKeepRatio?.({
          event,
          handle: this._activeResize.handle,
          elements: this._activeResize.elementStates.map(
            (state) => state.element,
          ),
        }),
      );
    const updates = computeResizeUpdates({
      activeResize: this._activeResize,
      delta,
      keepRatio,
    });

    applyResizeUpdates({
      updates,
      viewport,
      historyId: this._activeResize.historyId,
    });

    this._emitUpdateElements();
    this._requestRender();
  };

  #onUp = (event) => {
    if (!this._activeResize) return;
    event.stopPropagation();
    this.end();
  };
}
