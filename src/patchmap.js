import gsap from 'gsap';
import { Application, Graphics } from 'pixi.js';
import { isValidationError } from 'zod-validation-error';
import { UndoRedoManager } from './command/undo-redo-manager';
import { draw } from './display/draw';
import { update } from './display/update/update';
import { dragSelect } from './events/drag-select';
import { fit, focus } from './events/focus-fit';
import { select } from './events/single-select';
import {
  initApp,
  initAsset,
  initCanvas,
  initResizeObserver,
  initViewport,
} from './init';
import { convertLegacyData } from './utils/convert';
import { event } from './utils/event/canvas';
import { selector } from './utils/selector/selector';
import { themeStore } from './utils/theme';
import { validateMapData } from './utils/validator';

class Patchmap {
  constructor() {
    this._app = null;
    this._viewport = null;
    this._resizeObserver = null;
    this._isInit = false;
    this._theme = themeStore();
    this._undoRedoManager = new UndoRedoManager();
    this._animationContext = gsap.context(() => {});

    this._singleSelectState = {
      config: {},
      position: { start: null, end: null },
    };
    this._dragSelectState = {
      config: {},
      lastMoveTime: 0,
      isDragging: false,
      point: { start: null, end: null, move: null },
      box: new Graphics(),
    };
  }

  get app() {
    return this._app;
  }

  get viewport() {
    return this._viewport;
  }

  get theme() {
    return this._theme.get();
  }

  get isInit() {
    return this._isInit;
  }

  get undoRedoManager() {
    return this._undoRedoManager;
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
      assets: assetOptions = [],
    } = opts;

    this.undoRedoManager._setHotkeys();
    this._theme.set(themeOptions);
    this._app = new Application();
    await initApp(this.app, { resizeTo: element, ...appOptions });
    this._viewport = initViewport(this.app, viewportOptions);
    await initAsset(assetOptions);
    initCanvas(element, this.app);

    this._resizeObserver = initResizeObserver(element, this.app, this.viewport);
    this._isInit = true;
  }

  destroy() {
    this.animationContext.revert();
    const parentElement = this.app.canvas.parentElement;
    this.viewport.destroy(true);
    this.app.destroy(true);
    parentElement.remove();
    if (this._resizeObserver) this._resizeObserver.disconnect();

    this._app = null;
    this._viewport = null;
    this._resizeObserver = null;
    this._isInit = false;
  }

  draw(data) {
    const zData = preprocessData(data);
    if (!zData) return;

    const validatedData = validateMapData(zData);
    if (isValidationError(validatedData)) throw validatedData;

    this.app.stop();
    const context = {
      viewport: this.viewport,
      undoRedoManager: this.undoRedoManager,
      theme: this.theme,
      animationContext: this.animationContext,
    };
    draw(context, validatedData);
    this.app.start();
    this.undoRedoManager.clear();
    return validatedData;

    function preprocessData(data) {
      if (isLegacyData(data)) {
        return convertLegacyData(data);
      }

      if (!Array.isArray(data)) {
        console.error('Invalid data format. Expected an array.');
        return null;
      }
      return data;
    }

    function isLegacyData(data) {
      return (
        !Array.isArray(data) && typeof data === 'object' && 'grids' in data
      );
    }
  }

  update(opts) {
    const context = {
      viewport: this.viewport,
      undoRedoManager: this.undoRedoManager,
      theme: this.theme,
      animationContext: this.animationContext,
    };
    update(context, opts);
  }

  focus(ids) {
    focus(this.viewport, ids);
  }

  fit(ids) {
    fit(this.viewport, ids);
  }

  selector(path, opts) {
    return selector(this.viewport, path, opts);
  }

  select(opts) {
    select(this.viewport, this._singleSelectState, opts);
    dragSelect(this.viewport, this._dragSelectState, opts);
  }
}

export { Patchmap };
