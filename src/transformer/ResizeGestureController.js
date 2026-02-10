import { uid } from '../utils/uuid';
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
 * @property {() => boolean} getResizeHistory
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
  _getResizeHistory;

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
   * @type {boolean}
   */
  _ownsMouseEdgesSession = false;

  /**
   * @param {ResizeGestureControllerOptions} options
   */
  constructor({
    getViewport,
    canStart,
    getResizeContext,
    getResizeHistory,
    emitUpdateElements,
    requestRender,
  }) {
    this._getViewport = getViewport;
    this._canStart = canStart;
    this._getResizeContext = getResizeContext;
    this._getResizeHistory = getResizeHistory;
    this._emitUpdateElements = emitUpdateElements;
    this._requestRender = requestRender;
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
      elementStates,
      historyId: this._getResizeHistory() ? uid() : null,
    };

    this.#startMouseEdges();
    viewport.on('pointermove', this.#onMove);
    viewport.on('pointerup', this.#onUp);
    viewport.on('pointerupoutside', this.#onUp);
  };

  /**
   * Ends the current resize gesture and removes all viewport listeners.
   *
   * @returns {void}
   */
  end() {
    this.#stopMouseEdges();

    const viewport = this._getViewport();
    if (viewport) {
      viewport.off('pointermove', this.#onMove);
      viewport.off('pointerup', this.#onUp);
      viewport.off('pointerupoutside', this.#onUp);
    }

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
    const updates = computeResizeUpdates({
      activeResize: this._activeResize,
      delta,
      keepRatio: Boolean(event.shiftKey),
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

  #startMouseEdges() {
    const viewport = this._getViewport();
    if (!viewport?.plugin?.start || this._ownsMouseEdgesSession) return;

    const mouseEdgesPlugin = viewport?.plugins?.get?.('mouse-edges');
    if (!mouseEdgesPlugin) {
      this._ownsMouseEdgesSession = false;
      return;
    }

    const wasPaused = Boolean(mouseEdgesPlugin.paused);
    if (!wasPaused) {
      this._ownsMouseEdgesSession = false;
      return;
    }

    viewport.plugin.start('mouse-edges');
    this._ownsMouseEdgesSession = true;
  }

  #stopMouseEdges() {
    if (!this._ownsMouseEdgesSession) return;

    const viewport = this._getViewport();
    viewport?.plugin?.stop?.('mouse-edges');
    this._ownsMouseEdgesSession = false;
  }
}
