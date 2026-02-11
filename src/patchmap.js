import gsap from 'gsap';
import { Application, UPDATE_PRIORITY } from 'pixi.js';
import { isValidationError } from 'zod-validation-error';
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
import Transformer from './transformer/Transformer';
import { convertLegacyData } from './utils/convert';
import { event } from './utils/event/canvas';
import { WildcardEventEmitter } from './utils/event/WildcardEventEmitter';
import { selector } from './utils/selector/selector';
import { themeStore } from './utils/theme';
import { validateMapData } from './utils/validator';

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
  _viewTransform = this._createViewTransform();

  get app() {
    return this._app;
  }

  get viewport() {
    return this._viewport;
  }

  set viewport(value) {
    this._viewport = value;
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
        const id = event.addEvent(this.viewport, opts);
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

  async init(element, opts = {}) {
    if (this.isInit) return;

    const {
      app: appOptions = {},
      viewport: viewportOptions = {},
      theme: themeOptions = {},
      assets: assetsOptions = [],
      transformer,
    } = opts;

    this.undoRedoManager._setHotkeys();
    this._theme.set(themeOptions);
    this._app = new Application();
    await initApp(this.app, { resizeTo: element, ...appOptions });

    const store = {
      undoRedoManager: this.undoRedoManager,
      theme: this.theme,
      animationContext: this.animationContext,
    };
    store.view = this._viewTransform.viewState;
    this.viewport = initViewport(this.app, viewportOptions, store);
    this._world = new World({ store });
    store.world = this._world;
    this.viewport.addChild(this._world);
    this._viewTransform.attach({ viewport: this.viewport, world: this._world });

    await initAsset(assetsOptions);
    initCanvas(element, this.app);

    this._resizeObserver = initResizeObserver(element, this.app, this.viewport);
    this._stateManager = new StateManager(this);
    this._stateManager.register('selection', SelectionState, true);
    if (transformer) {
      this.transformer = transformer;
    }
    this.isInit = true;
    this.emit('patchmap:initialized', { target: this });
  }

  destroy() {
    if (!this.isInit) return;

    this.undoRedoManager.destroy();
    this.animationContext.revert();
    this.stateManager.resetState();
    this.stateManager.destroy();
    event.removeAllEvent(this.viewport);
    this.viewport.destroy({ children: true, context: true, style: true });
    const parentElement = this.app.canvas.parentElement;
    this.app.destroy(true);
    parentElement.remove();
    if (this._resizeObserver) this._resizeObserver.disconnect();

    this._app = null;
    this.viewport = null;
    this._resizeObserver = null;
    this.isInit = false;
    this._theme = themeStore();
    this._undoRedoManager = new UndoRedoManager();
    this._animationContext = gsap.context(() => {});
    this._transformer = null;
    this._stateManager = null;
    this._world = null;
    this._viewTransform = this._createViewTransform();
    this.emit('patchmap:destroyed', { target: this });
    this.removeAllListeners();
  }

  draw(data) {
    const processedData = processData(JSON.parse(JSON.stringify(data)));
    if (!processedData) return;

    const validatedData = validateMapData(processedData);
    if (isValidationError(validatedData)) throw validatedData;

    const store = {
      viewport: this.viewport,
      world: this.world,
      undoRedoManager: this.undoRedoManager,
      theme: this.theme,
      animationContext: this.animationContext,
    };

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
        this.update({ path: '$..[?(@.type=="relations")]', refresh: true });
      },
      undefined,
      UPDATE_PRIORITY.UTILITY,
    );

    this.app.start();
    scheduler.postTask(
      () => this.emit('patchmap:draw', { data: validatedData, target: this }),
      { priority: 'user-visible' },
    );
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
    const updatedElements = update(this.viewport, opts);
    if (opts.emit !== false) {
      this.emit('patchmap:updated', {
        elements: updatedElements,
        target: this,
      });
    }
    return updatedElements;
  }

  focus(ids) {
    focus(this.viewport, ids);
  }

  fit(ids) {
    fitViewport(this.viewport, ids);
  }

  get rotation() {
    return this._viewTransform.rotation;
  }

  get flip() {
    return this._viewTransform.flip;
  }

  selector(path, opts) {
    return selector(this.viewport, path, opts);
  }

  _createViewTransform() {
    return new ViewTransform({
      onRotate: (angle) =>
        this.emit('patchmap:rotated', { angle, target: this }),
      onFlip: (flip) =>
        this.emit('patchmap:flipped', { ...flip, target: this }),
    });
  }
}

export { Patchmap };
