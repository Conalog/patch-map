import gsap from 'gsap';
import { Application } from 'pixi.js';
import { isValidationError } from 'zod-validation-error';
import { UndoRedoManager } from './command/UndoRedoManager';
import ViewTransform from './display/view-transform/ViewTransform';
import World from './display/World';
import { PatchMapEngine, PixiRenderer } from './engine';
import { warmFindBoundsCache } from './events/find';
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
  _drawToken = 0;
  _drawCacheSource = null;
  _drawCacheKey = null;
  _drawCacheData = null;
  _engine = null;
  _renderer = null;
  _renderScheduled = false;
  _updateQueue = [];
  _coalescedUpdateQueue = new Map();

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

    const store = this._createStoreContext();
    this._viewport = initViewport(this.app, viewportOptions, store);
    this._world = new World({ store });
    this._world.enableRenderGroup?.();
    store.world = this._world;
    this.viewport.addChild(this._world);
    this._engine = new PatchMapEngine({ theme: this.theme, store });
    this._renderer = new PixiRenderer({ store, target: this._world });
    this._viewTransform.attach({ viewport: this.viewport, world: this._world });

    await initAsset(assetsOptions);
    initCanvas(element, this.app);

    this._resizeObserver = initResizeObserver(
      element,
      this.app,
      this.viewport,
      () => this._viewTransform.applyWorldTransform(),
    );
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
    this._renderer?.destroy();
    this.viewport.destroy({ children: true, context: true, style: true });
    const parentElement = this.app.canvas.parentElement;
    this.app.destroy(true);
    parentElement.remove();
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
    this._viewTransform = this._createViewTransform();
    this._drawToken = 0;
    this._drawCacheSource = null;
    this._drawCacheKey = null;
    this._drawCacheData = null;
    this._engine = null;
    this._renderer = null;
    this._renderScheduled = false;
    this._updateQueue = [];
    this._coalescedUpdateQueue = new Map();
    this.emit('patchmap:destroyed', { target: this });
    this.removeAllListeners();
  }

  draw(data) {
    if (!this.isInit) return;

    const canReuseCurrentSource =
      this._drawCacheSource === data && this._engine?.model;
    const drawCacheKey = canReuseCurrentSource
      ? this._drawCacheKey
      : createDrawCacheKey(data);
    const canReuseCurrentScene =
      canReuseCurrentSource ||
      (this._drawCacheKey === drawCacheKey && this._engine?.model);
    const processedData = canReuseCurrentScene
      ? this._drawCacheData
      : processData(JSON.parse(JSON.stringify(data)));
    if (!processedData) return;

    const validatedData = canReuseCurrentScene
      ? processedData
      : validateMapData(processedData);
    if (isValidationError(validatedData)) throw validatedData;
    const drawToken = ++this._drawToken;

    this.app.stop();
    this.undoRedoManager.clear();
    this.animationContext.revert();
    event.removeAllEvent(this.viewport);
    const hadQueuedUpdates = this._updateQueue.length > 0 || this._engine.dirty;
    this._flushUpdateQueue();
    if (!canReuseCurrentScene) {
      const snapshot = this._engine.draw(validatedData);
      this._renderer.render(snapshot);
      this._engine.scheduler.flush();
      this._drawCacheSource = data;
      this._drawCacheKey = drawCacheKey;
      this._drawCacheData = validatedData;
    } else if (hadQueuedUpdates) {
      this._flushRender();
    }
    this.app.start();
    warmFindBoundsCache(this.viewport);
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
    const deferRender = opts.emit === false && opts.flush !== true;
    if (deferRender) {
      const targets = this._resolveUpdateTargets(opts);
      this._enqueueUpdate({ ...opts, _resolvedTargets: targets });
      this._scheduleRender();
      return targets;
    }

    this._flushUpdateQueue();
    const updatedElements = this._engine.update({
      ...opts,
      deferRender: false,
    });
    this._flushRender();
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
    this._flushUpdateQueue();
    this._flushRender();
    return focus(this.viewport, this._engine.model?.root?.ref, ids, opts);
  }

  /**
   * @param {string|string[]|null} [ids]
   * @param {import('./events/schema').FitOptions} [opts]
   * @returns {void|null}
   */
  fit(ids, opts) {
    this._flushUpdateQueue();
    this._flushRender();
    return fitViewport(this.viewport, this._engine.model?.root?.ref, ids, opts);
  }

  get rotation() {
    return this._viewTransform.rotation;
  }

  get flip() {
    return this._viewTransform.flip;
  }

  selector(path, opts) {
    this._flushUpdateQueue();
    this._flushRender();
    return this._engine.selector(path, opts);
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
    return {
      app: this.app,
      viewport: this._viewport,
      world: this._world,
      view: this._viewTransform.viewState,
      undoRedoManager: this.undoRedoManager,
      theme: this.theme,
      animationContext: this.animationContext,
    };
  }

  _scheduleRender() {
    if (this._renderScheduled) return;
    this._renderScheduled = true;
    const schedule =
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame
        : (callback) => setTimeout(callback, 0);
    schedule(() => {
      this._renderScheduled = false;
      if (this.isInit) {
        this._processUpdateQueue();
      }
    });
  }

  _processUpdateQueue() {
    const frameBudgetMs = 4;
    const maxUpdatesPerFrame = 750;
    const startedAt = performance.now();
    let processed = 0;
    while (
      this._updateQueue.length > 0 &&
      processed < maxUpdatesPerFrame &&
      performance.now() - startedAt < frameBudgetMs
    ) {
      const opts = this._dequeueUpdate();
      this._engine.update({ ...opts, deferRender: true });
      processed += 1;
    }

    if (processed > 0) {
      this._flushRender();
    }

    if (this._updateQueue.length > 0) {
      this._scheduleRender();
    }
  }

  _flushUpdateQueue() {
    while (this._updateQueue.length > 0) {
      const opts = this._dequeueUpdate();
      this._engine.update({ ...opts, deferRender: true });
    }
  }

  _flushRender() {
    if (!this._engine || !this._renderer) return;
    const snapshot = this._engine.flush();
    this._renderer.render(snapshot);
  }

  _resolveUpdateTargets(opts) {
    const elements = [];
    if (opts.elements) {
      elements.push(
        ...(Array.isArray(opts.elements) ? opts.elements : [opts.elements]),
      );
    }
    if (opts.path) {
      elements.push(...this._engine.selector(opts.path));
    }
    return [...new Set(elements.filter(Boolean))];
  }

  _enqueueUpdate(opts) {
    const key = getCoalescedUpdateKey(opts);
    if (!key) {
      this._updateQueue.push({ opts, key: null });
      return;
    }

    const existing = this._coalescedUpdateQueue.get(key);
    if (existing) {
      existing.opts = mergeQueuedUpdate(existing.opts, opts);
      return;
    }

    const entry = { opts, key };
    this._coalescedUpdateQueue.set(key, entry);
    this._updateQueue.push(entry);
  }

  _dequeueUpdate() {
    const entry = this._updateQueue.shift();
    if (!entry) return {};
    if (entry.key && this._coalescedUpdateQueue.get(entry.key) === entry) {
      this._coalescedUpdateQueue.delete(entry.key);
    }
    return entry.opts;
  }
}

function createDrawCacheKey(data) {
  return JSON.stringify(data);
}

function scheduleUserVisibleTask(task) {
  const scheduler = globalThis.scheduler;
  if (scheduler?.postTask) {
    scheduler.postTask(task, { priority: 'user-visible' });
    return;
  }
  setTimeout(task, 0);
}

function getCoalescedUpdateKey(opts) {
  if (!canCoalesceQueuedUpdate(opts)) return null;
  const target = opts._resolvedTargets[0];
  return `item:${target.id}:components`;
}

function canCoalesceQueuedUpdate(opts) {
  return (
    opts.emit === false &&
    opts.flush !== true &&
    opts.mergeStrategy !== 'replace' &&
    !opts.path &&
    Array.isArray(opts._resolvedTargets) &&
    opts._resolvedTargets.length === 1 &&
    opts._resolvedTargets[0]?.type === 'item' &&
    isPlainObject(opts.changes) &&
    Array.isArray(opts.changes.components) &&
    Object.keys(opts.changes).every((key) => key === 'components')
  );
}

function mergeQueuedUpdate(previous, next) {
  return {
    ...previous,
    ...next,
    changes: {
      components: mergeComponentChanges(
        previous.changes.components,
        next.changes.components,
      ),
    },
    _resolvedTargets: next._resolvedTargets ?? previous._resolvedTargets,
  };
}

function mergeComponentChanges(previousComponents = [], nextComponents = []) {
  const merged = previousComponents.map((component) => ({ ...component }));
  for (const component of nextComponents) {
    const index = merged.findIndex((current) =>
      isSameComponentChange(current, component),
    );
    if (index === -1) {
      merged.push({ ...component });
    } else {
      merged[index] = mergePatch(merged[index], component);
    }
  }
  return merged;
}

function isSameComponentChange(a, b) {
  if (a.id || b.id) return a.id === b.id;
  if (a.label || b.label) return a.label === b.label;
  return a.type === b.type;
}

function mergePatch(target, source) {
  if (source === undefined) return target;
  if (!isPlainObject(target) || !isPlainObject(source)) return source;

  const out = { ...target };
  for (const key of Object.keys(source)) {
    out[key] = mergePatch(out[key], source[key]);
  }
  return out;
}

function isPlainObject(value) {
  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

export { Patchmap };
