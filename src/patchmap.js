import gsap from 'gsap';
import { Application, UPDATE_PRIORITY } from 'pixi.js';
import { isValidationError } from 'zod-validation-error';
import CanvasBoundsController from './canvas-bounds/controller';
import { normalizeCanvasBounds } from './canvas-bounds/options';
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
import { validateMapData } from './utils/validator';

/**
 * @typedef {object} CanvasBoundsInput
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
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
  /** @type {import('./canvas-bounds/options').CanvasBounds | null} */
  _canvasBounds = null;
  /** @type {import('./canvas-bounds/controller').default | null} */
  _canvasBoundsController = null;
  _minimaps = new Set();
  _drawToken = 0;

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
    const canvasBounds =
      canvasOptions && Object.hasOwn(canvasOptions, 'bounds')
        ? normalizeCanvasBounds(canvasOptions.bounds)
        : this._canvasBounds;

    this._element = element;
    this.undoRedoManager._setHotkeys();
    this._theme.set(themeOptions);
    this._canvasBounds = canvasBounds;
    this._app = new Application();
    await initApp(this.app, { resizeTo: element, ...appOptions });

    const store = this._createStoreContext();
    this._viewport = initViewport(this.app, viewportOptions, store);
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
    this._canvasBounds = null;
    this._canvasBoundsController = null;
    this._minimaps = new Set();
    this._drawToken = 0;
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
    const canvasBounds = normalizeCanvasBounds(bounds);
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
   * @param {HTMLElement | import('./minimap/Minimap').MinimapOptions} [containerOrOptions]
   * @param {import('./minimap/Minimap').MinimapOptions} [options]
   * @returns {Minimap}
   */
  createMinimap(containerOrOptions = {}, options = {}) {
    const hasContainer = isHTMLElement(containerOrOptions);
    const defaultContainer = hasContainer
      ? null
      : createDefaultMinimapContainer(this._element);
    const container = hasContainer
      ? containerOrOptions
      : defaultContainer.container;
    const minimapOptions = hasContainer ? options : containerOrOptions;
    const minimap = new Minimap({
      patchmap: this,
      container,
      options: minimapOptions,
      onDestroy: (target) => {
        this._minimaps.delete(target);
        if (!hasContainer) {
          container.remove();
          defaultContainer.restore();
        }
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

export { Patchmap };

const DEFAULT_MINIMAP_ROOTS = new WeakMap();

const isHTMLElement = (value) =>
  typeof HTMLElement !== 'undefined' && value instanceof HTMLElement;

const createDefaultMinimapContainer = (root) => {
  if (!root?.appendChild) {
    return { container: null, restore: () => {} };
  }
  const restoreRootPosition = retainPositionedRoot(root);
  const container = document.createElement('div');
  container.dataset.patchmapMinimap = 'true';
  container.dataset.patchmapMinimapAuto = 'true';
  root.appendChild(container);
  return {
    container,
    restore: restoreRootPosition,
  };
};

const retainPositionedRoot = (root) => {
  const existing = DEFAULT_MINIMAP_ROOTS.get(root);
  if (existing) {
    existing.count += 1;
    return () => releasePositionedRoot(root);
  }

  const shouldSetPosition = getComputedStyle(root).position === 'static';
  DEFAULT_MINIMAP_ROOTS.set(root, {
    count: 1,
    previousPosition: root.style.position,
    shouldSetPosition,
  });
  if (shouldSetPosition) {
    root.style.position = 'relative';
  }
  return () => releasePositionedRoot(root);
};

const releasePositionedRoot = (root) => {
  const entry = DEFAULT_MINIMAP_ROOTS.get(root);
  if (!entry) return;
  entry.count -= 1;
  if (entry.count > 0) return;
  if (entry.shouldSetPosition) {
    root.style.position = entry.previousPosition;
  }
  DEFAULT_MINIMAP_ROOTS.delete(root);
};
