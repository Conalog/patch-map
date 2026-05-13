import gsap from 'gsap';
import { Application, UPDATE_PRIORITY } from 'pixi.js';
import { isValidationError } from 'zod-validation-error';
import CanvasBoundsController from './canvas-bounds/controller';
import {
  hasAutoCanvasBounds,
  normalizeCanvasBounds,
} from './canvas-bounds/options';
import { UndoRedoManager } from './command/UndoRedoManager';
import './display/components/registry';
import { draw } from './display/draw';
import './display/elements/registry';
import { update } from './display/update';
import ViewTransform from './display/view-transform/ViewTransform';
import World from './display/World';
import { fit as fitViewport, focus } from './events/focus-fit';
import StateManager from './events/StateManager';
import SelectionState from './events/states/SelectionState';
import {
  initApp,
  initAsset,
  initCanvas,
  initResizeObserver,
  initViewport,
} from './init';
import Minimap from './minimap/Minimap';
import Transformer from './transformer/Transformer';
import { convertLegacyData } from './utils/convert';
import { event } from './utils/event/canvas';
import { WildcardEventEmitter } from './utils/event/WildcardEventEmitter';
import { selector } from './utils/selector/selector';
import { themeStore } from './utils/theme';
import { getBoundsFromPoints, getObjectWorldCorners } from './utils/transform';
import { validateMapData } from './utils/validator';

const AUTO_BOUNDS_PADDING = 500;

/**
 * @typedef {object} CanvasBoundsInput
 * @property {number} [x]
 * @property {number} [y]
 * @property {number} [width]
 * @property {number} [height]
 */

/**
 * @typedef {object} CanvasInitOptions
 * @property {CanvasBoundsInput} [bounds]
 */

/**
 * @typedef {object} PatchmapInitOptions
 * @property {object} [app]
 * @property {object} [viewport]
 * @property {object} [theme]
 * @property {Array<object>} [assets]
 * @property {CanvasInitOptions} [canvas]
 * @property {Transformer} [transformer]
 */

class Patchmap extends WildcardEventEmitter {
  _app = null;
  _viewport = null;
  _resizeObserver = null;
  _isInit = false;
  _theme = themeStore();
  _undoRedoManager = new UndoRedoManager();
  _animationContext = gsap.context(() => {});
  _transformer = null;
  _stateManager = null;
  _world = null;
  _element = null;
  _viewTransform = this._createViewTransform();
  _initPromise = null;
  _destroyRequestedDuringInit = false;
  /** @type {CanvasBoundsInput | null} */
  _canvasBoundsInput = null;
  /** @type {import('./canvas-bounds/options').CanvasBounds | null} */
  _canvasBounds = null;
  /** @type {import('./canvas-bounds/controller').default | null} */
  _canvasBoundsController = null;
  _minimaps = new Set();
  _drawToken = 0;
  _autoCanvasBoundsFrame = null;
  _requestAutoCanvasBoundsRefresh = () => this.requestAutoCanvasBoundsRefresh();

  get app() {
    return this._app;
  }

  get viewport() {
    return this._viewport;
  }

  get world() {
    return this._world;
  }

  get theme() {
    return this._theme.get();
  }

  get isInit() {
    return this._isInit;
  }

  /**
   * @returns {{ bounds: import('./canvas-bounds/options').CanvasBounds | null }}
   */
  get canvas() {
    return {
      bounds: this._canvasBounds,
    };
  }

  set isInit(value) {
    this._isInit = value;
  }

  get undoRedoManager() {
    return this._undoRedoManager;
  }

  get transformer() {
    return this._transformer;
  }

  set transformer(value) {
    if (this._transformer && !this._transformer.destroyed) {
      this.viewport.off('object_transformed', this.transformer.update);
      this._transformer.destroy(true);
    }

    if (value && !(value instanceof Transformer)) {
      console.error(
        'Transformer must be an instance of the Transformer class.',
      );
      this._transformer = null;
      return;
    }

    this._transformer = value;
    if (this._transformer) {
      this.viewport.addChild(this._transformer);
      this.viewport.on('object_transformed', this.transformer.update);
    }
  }

  get stateManager() {
    return this._stateManager;
  }

  get animationContext() {
    return this._animationContext;
  }

  get event() {
    return {
      add: (opts) => {
        const id = event.addEvent(this.viewport, opts, this.world);
        event.onEvent(this.viewport, id);
        return id;
      },
      remove: (id) => event.removeEvent(this.viewport, id),
      removeAll: () => event.removeAllEvent(this.viewport),
      on: (id) => event.onEvent(this.viewport, id),
      off: (id) => event.offEvent(this.viewport, id),
      get: (id) => event.getEvent(this.viewport, id),
      getAll: () => event.getAllEvent(this.viewport),
    };
  }

  /**
   * @param {HTMLElement} element
   * @param {PatchmapInitOptions} [opts]
   */
  async init(element, opts = {}) {
    if (this.isInit) return;
    if (this._initPromise) return this._initPromise;

    this._destroyRequestedDuringInit = false;
    this._initPromise = this._initialize(element, opts).finally(() => {
      this._initPromise = null;
    });
    return this._initPromise;
  }

  async _initialize(element, opts = {}) {
    const {
      app: appOptions = {},
      viewport: viewportOptions = {},
      theme: themeOptions = {},
      assets: assetsOptions = [],
      canvas: canvasOptions,
      transformer,
    } = opts;
    const canvasBoundsInput =
      canvasOptions && Object.hasOwn(canvasOptions, 'bounds')
        ? canvasOptions.bounds
        : this._canvasBoundsInput;
    const canvasBounds = normalizeCanvasBounds(canvasBoundsInput);

    this._element = element;
    this.undoRedoManager._setHotkeys();
    this._theme.set(themeOptions);
    this._canvasBoundsInput = canvasBoundsInput ?? null;
    this._canvasBounds = canvasBounds;
    this._app = new Application();
    await initApp(this.app, { resizeTo: element, ...appOptions });

    const store = this._createStoreContext();
    this._viewport = initViewport(this.app, viewportOptions, store);
    this.viewport.on?.(
      'object_transformed',
      this._requestAutoCanvasBoundsRefresh,
    );
    this._world = new World({ store });
    store.world = this._world;
    this.viewport.addChild(this._world);
    this._canvasBoundsController = canvasBounds
      ? new CanvasBoundsController({
          viewport: this.viewport,
          world: this._world,
          bounds: canvasBounds,
        })
      : null;
    this._viewTransform.attach({ viewport: this.viewport, world: this._world });

    await initAsset(assetsOptions);
    initCanvas(element, this.app);

    this._resizeObserver = initResizeObserver(
      element,
      this.app,
      this.viewport,
      () => {
        this._canvasBoundsController?.resize();
        this._viewTransform.applyWorldTransform();
        this._canvasBoundsController?.applyViewportClamp();
      },
    );
    this._stateManager = new StateManager(this);
    this._stateManager.register('selection', SelectionState, true);
    if (transformer) {
      this.transformer = transformer;
    }
    this.isInit = true;
    if (this._destroyRequestedDuringInit) {
      this.destroy();
      return;
    }
    this.emit('patchmap:initialized', { target: this });
  }

  destroy() {
    if (!this.isInit) {
      if (this._initPromise) {
        this._destroyRequestedDuringInit = true;
        this._destroyMinimaps();
      }
      return;
    }

    this._destroyMinimaps();
    this.undoRedoManager.destroy();
    this.animationContext.revert();
    this.stateManager?.resetState();
    this.stateManager?.destroy();
    this._canvasBoundsController?.destroy();
    this.viewport?.off?.(
      'object_transformed',
      this._requestAutoCanvasBoundsRefresh,
    );
    this.cancelPendingAutoCanvasBoundsRefresh();
    event.removeAllEvent(this.viewport);
    this.viewport.destroy({ children: true, context: true, style: true });
    const parentElement = this.app.canvas.parentElement;
    this.app.destroy(true);
    parentElement?.remove();
    if (this._resizeObserver) this._resizeObserver.disconnect();

    this._app = null;
    this._viewport = null;
    this._resizeObserver = null;
    this.isInit = false;
    this._theme = themeStore();
    this._undoRedoManager = new UndoRedoManager();
    this._animationContext = gsap.context(() => {});
    this._transformer = null;
    this._stateManager = null;
    this._world = null;
    this._element = null;
    this._viewTransform = this._createViewTransform();
    this._initPromise = null;
    this._destroyRequestedDuringInit = false;
    this._canvasBoundsInput = null;
    this._canvasBounds = null;
    this._canvasBoundsController = null;
    this._minimaps = new Set();
    this._drawToken = 0;
    this._autoCanvasBoundsFrame = null;
    this.emit('patchmap:destroyed', { target: this });
    this.removeAllListeners();
  }

  draw(data) {
    if (!this.isInit) return;

    const processedData = processData(JSON.parse(JSON.stringify(data)));
    if (!processedData) return;

    const validatedData = validateMapData(processedData);
    if (isValidationError(validatedData)) throw validatedData;
    const drawToken = ++this._drawToken;

    const store = this._createStoreContext();

    this.app.stop();
    this.undoRedoManager.clear();
    this.animationContext.revert();
    event.removeAllEvent(this.viewport);
    draw(store, validatedData);
    this._refreshAutoCanvasBounds(validatedData);

    // Force a refresh of all relation elements after the initial draw. This ensures
    // that all link targets exist in the scene graph before the relations
    // attempt to draw their links.
    this.app.ticker.addOnce(
      () => {
        this.update({
          path: '$..[?(@.type=="relations")]',
          refresh: true,
          emit: false,
        });
      },
      undefined,
      UPDATE_PRIORITY.UTILITY,
    );
    this.app.start();
    scheduleUserVisibleTask(() => {
      if (!this.isInit || drawToken !== this._drawToken) return;
      this.emit('patchmap:draw', { data: validatedData, target: this });
    });
    return validatedData;

    function processData(data) {
      return isLegacyData(data) ? convertLegacyData(data) : data;
    }

    function isLegacyData(data) {
      return (
        !Array.isArray(data) && typeof data === 'object' && 'grids' in data
      );
    }
  }

  update(opts = {}) {
    const updatedElements = update(this.world, opts);
    if (opts.emit !== false) {
      this.emit('patchmap:updated', {
        elements: updatedElements,
        target: this,
      });
    }
    return updatedElements;
  }

  /**
   * @param {string|string[]|null} [ids]
   * @param {import('./events/schema').FocusFitOptions} [opts]
   * @returns {void|null}
   */
  focus(ids, opts) {
    const result = focus(this.viewport, this.world, ids, opts);
    this._canvasBoundsController?.applyViewportClamp();
    this._emitViewportMoved('focus');
    return result;
  }

  /**
   * @param {string|string[]|null} [ids]
   * @param {import('./events/schema').FitOptions} [opts]
   * @returns {void|null}
   */
  fit(ids, opts) {
    const result = fitViewport(this.viewport, this.world, ids, opts);
    this._canvasBoundsController?.applyViewportClamp();
    this._emitViewportMoved('fit');
    return result;
  }

  /**
   * @param {CanvasBoundsInput | null | undefined} bounds
   * @returns {import('./canvas-bounds/options').CanvasBounds | null}
   */
  setCanvasBounds(bounds) {
    this._canvasBoundsInput = bounds ?? null;
    const canvasBounds = normalizeCanvasBounds(bounds);
    return this._applyCanvasBounds(canvasBounds);
  }

  _applyCanvasBounds(canvasBounds) {
    this._canvasBounds = canvasBounds;
    this._syncCanvasBoundsToStore();

    if (!this.isInit) {
      return canvasBounds;
    }

    if (!canvasBounds) {
      this._canvasBoundsController?.destroy();
      this._canvasBoundsController = null;
      this.viewport.forceHitArea = null;
    } else if (this._canvasBoundsController) {
      this._canvasBoundsController.setBounds(canvasBounds);
    } else {
      this._canvasBoundsController = new CanvasBoundsController({
        viewport: this.viewport,
        world: this.world,
        bounds: canvasBounds,
      });
    }

    this.emit('patchmap:canvas-bounds-changed', {
      bounds: canvasBounds,
      target: this,
    });
    return canvasBounds;
  }

  _refreshAutoCanvasBounds(data) {
    if (!hasAutoCanvasBounds(this._canvasBoundsInput)) return;

    const canvasBounds = normalizeCanvasBounds(this._canvasBoundsInput, {
      contentBounds: this._getCanvasContentBounds(data),
    });
    if (areCanvasBoundsEqual(canvasBounds, this._canvasBounds)) return;

    this._applyCanvasBounds(canvasBounds);
  }

  requestAutoCanvasBoundsRefresh() {
    if (!hasAutoCanvasBounds(this._canvasBoundsInput)) return;
    if (this._autoCanvasBoundsFrame !== null) return;

    const requestFrame =
      globalThis.requestAnimationFrame ??
      ((callback) => globalThis.setTimeout(callback, 16));
    this._autoCanvasBoundsFrame = requestFrame(() => {
      this._autoCanvasBoundsFrame = null;
      if (!this.isInit) return;
      this._refreshAutoCanvasBounds();
    });
  }

  cancelPendingAutoCanvasBoundsRefresh() {
    if (this._autoCanvasBoundsFrame === null) return;
    const cancelFrame =
      globalThis.cancelAnimationFrame ?? globalThis.clearTimeout;
    cancelFrame?.(this._autoCanvasBoundsFrame);
    this._autoCanvasBoundsFrame = null;
  }

  _getCanvasContentBounds(data) {
    const imageBounds = unionBounds(
      getElementsBounds(data, undefined, isImageElement),
      this._getRenderedCanvasContentBounds(isImageElement),
    );
    const nonImageBounds = unionBounds(
      getElementsBounds(data, undefined, isNonImageElement),
      this._getRenderedCanvasContentBounds(isNonImageElement),
    );
    return padBounds(
      unionBounds(imageBounds, nonImageBounds),
      AUTO_BOUNDS_PADDING,
    );
  }

  _getRenderedCanvasContentBounds(predicate = () => true) {
    const world = this.world;
    if (!world) return null;

    const elements = collectRenderedElements(world, predicate);
    if (elements.length === 0) return null;

    const canvasPoints = elements.flatMap((element) =>
      getObjectWorldCorners(element).map((point) => world.toLocal(point)),
    );
    if (canvasPoints.length === 0) return null;

    const bounds = getBoundsFromPoints(canvasPoints);
    return {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    };
  }

  get rotation() {
    return this._viewTransform.rotation;
  }

  get flip() {
    return this._viewTransform.flip;
  }

  selector(path, opts) {
    return selector(this.world, path, opts);
  }

  /**
   * @param {HTMLElement} container
   * @param {import('./minimap/Minimap').MinimapOptions} [options]
   * @returns {Minimap}
   */
  createMinimap(container, options = {}) {
    const minimap = new Minimap({
      patchmap: this,
      container,
      options,
      onDestroy: (target) => {
        this._minimaps.delete(target);
      },
    });
    this._minimaps.add(minimap);
    return minimap;
  }

  _destroyMinimaps() {
    for (const minimap of this._minimaps) {
      minimap.destroy();
    }
    this._minimaps.clear();
  }

  _createViewTransform() {
    return new ViewTransform({
      onRotate: (angle) =>
        this.emit('patchmap:rotated', { angle, target: this }),
      onFlip: (flip) =>
        this.emit('patchmap:flipped', { ...flip, target: this }),
    });
  }

  _createStoreContext() {
    const store = {
      app: this.app,
      viewport: this._viewport,
      world: this._world,
      view: this._viewTransform.viewState,
      undoRedoManager: this.undoRedoManager,
      theme: this.theme,
      animationContext: this.animationContext,
    };
    if (this._canvasBounds) {
      store.canvasBounds = this._canvasBounds;
    }
    return store;
  }

  _syncCanvasBoundsToStore() {
    const store = this.world?.store;
    if (!store) return;

    if (this._canvasBounds) {
      store.canvasBounds = this._canvasBounds;
    } else {
      delete store.canvasBounds;
    }
  }

  _emitViewportMoved(type) {
    this.viewport?.emit?.('moved', {
      viewport: this.viewport,
      type,
    });
  }
}

function scheduleUserVisibleTask(task) {
  const scheduler = globalThis.scheduler;
  if (scheduler?.postTask) {
    scheduler.postTask(task, { priority: 'user-visible' });
    return;
  }
  setTimeout(task, 0);
}

const areCanvasBoundsEqual = (a, b) =>
  a === b ||
  (a != null &&
    b != null &&
    a.x === b.x &&
    a.y === b.y &&
    a.width === b.width &&
    a.height === b.height);

const getElementsBounds = (
  elements,
  origin = { x: 0, y: 0 },
  predicate = () => true,
) => {
  if (!Array.isArray(elements) || elements.length === 0) return null;

  return elements
    .map((element) => getElementBounds(element, origin, predicate))
    .filter(Boolean)
    .reduce(unionBounds, null);
};

const getElementBounds = (element, origin, predicate) => {
  if (!element || element.show === false) return null;

  const x =
    origin.x + (Number.isFinite(element.attrs?.x) ? element.attrs.x : 0);
  const y =
    origin.y + (Number.isFinite(element.attrs?.y) ? element.attrs.y : 0);
  const ownBounds = predicate(element)
    ? getElementOwnBounds(element, { x, y })
    : null;
  const childBounds = getElementsBounds(element.children, { x, y }, predicate);

  return unionBounds(ownBounds, childBounds);
};

const getElementOwnBounds = (element, origin) => {
  const size = getElementSize(element);
  if (!size) return null;

  return {
    x: origin.x,
    y: origin.y,
    width: size.width,
    height: size.height,
  };
};

const getElementSize = (element) => {
  if (element.type === 'grid') {
    const rows = element.cells?.length ?? 0;
    const cols = Math.max(0, ...(element.cells ?? []).map((row) => row.length));
    const itemSize = normalizeSize(element.item?.size);
    if (!itemSize || rows === 0 || cols === 0) return null;

    const gap = element.gap ?? {};
    return {
      width: cols * itemSize.width + Math.max(cols - 1, 0) * (gap.x ?? 0),
      height: rows * itemSize.height + Math.max(rows - 1, 0) * (gap.y ?? 0),
    };
  }

  if (['item', 'image', 'rect', 'text'].includes(element.type)) {
    return normalizeSize(element.size);
  }

  return null;
};

const normalizeSize = (size) => {
  if (typeof size === 'number') {
    return { width: size, height: size };
  }
  if (Number.isFinite(size?.width) && Number.isFinite(size?.height)) {
    return { width: size.width, height: size.height };
  }
  return null;
};

const unionBounds = (a, b) => {
  if (!a) return b;
  if (!b) return a;

  const minX = Math.min(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxX = Math.max(a.x + a.width, b.x + b.width);
  const maxY = Math.max(a.y + a.height, b.y + b.height);

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
};

const padBounds = (bounds, padding) => {
  if (!bounds || padding <= 0) return bounds;
  return {
    x: bounds.x - padding,
    y: bounds.y - padding,
    width: bounds.width + padding * 2,
    height: bounds.height + padding * 2,
  };
};

const isImageElement = (element) => element?.type === 'image';

const isNonImageElement = (element) => element?.type !== 'image';

const collectRenderedElements = (root, predicate) => {
  const result = [];
  const visit = (node) => {
    if (!node) return;

    if (node !== root && node?.type && node?.constructor?.isElement) {
      if (
        predicate(node) &&
        node.visible !== false &&
        node.renderable !== false &&
        node.props?.show !== false
      ) {
        result.push(node);
      }
      if (node.type === 'grid') return;
    }

    for (const child of node.children ?? []) {
      visit(child);
    }
  };
  visit(root);
  return result;
};

export { Patchmap };
