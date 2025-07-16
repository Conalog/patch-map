import gsap from 'gsap';
import { Application, Graphics } from 'pixi.js';
import { isValidationError } from 'zod-validation-error';
import { UndoRedoManager } from './command/undo-redo-manager';
import { draw } from './display/draw';
import { update } from './display/update';
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
import './display/elements/registry';
import './display/components/registry';

class Patchmap {
  constructor() {
    this._app = null;
    this._viewport = null;
    this._resizeObserver = null;
    this._isInit = false;
    this._theme = themeStore();
    this._undoRedoManager = new UndoRedoManager();
    this._animationContext = gsap.context(() => {});

    this._singleSelectState = null;
    this._dragSelectState = null;
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

  set isInit(value) {
    this._isInit = value;
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
    } = opts;

    this.undoRedoManager._setHotkeys();
    this._theme.set(themeOptions);
    this._app = new Application();
    await initApp(this.app, { resizeTo: element, ...appOptions });
    this._viewport = initViewport(this.app, viewportOptions);
    await initAsset(assetsOptions);
    initCanvas(element, this.app);

    this._resizeObserver = initResizeObserver(element, this.app, this.viewport);
    this.isInit = true;
  }

  destroy() {
    if (!this.isInit) return;

    this.undoRedoManager.destroy();
    this.animationContext.revert();
    event.removeAllEvent(this.viewport);
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
    this._singleSelectState = null;
    this._dragSelectState = null;
  }

  draw(data) {
    const processedData = processData(JSON.parse(JSON.stringify(data)));
    if (!processedData) return;

    const validatedData = validateMapData(processedData);
    if (isValidationError(validatedData)) throw validatedData;

    const context = {
      viewport: this.viewport,
      undoRedoManager: this.undoRedoManager,
      theme: this.theme,
      animationContext: this.animationContext,
    };

    this.app.stop();
    this.undoRedoManager.clear();
    this.animationContext.revert();
    event.removeAllEvent(this.viewport);
    this.initSelectState();
    draw(context, validatedData);

    // Force a refresh of all relation elements after the initial draw. This ensures
    // that all link targets exist in the scene graph before the relations
    // attempt to draw their links.
    this.update({ path: '$..children[?(@.type=="relations")]', refresh: true });

    this.app.start();
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

  update(opts) {
    update(this.viewport, opts);
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

  initSelectState() {
    this._singleSelectState = {
      config: {},
      position: { start: null, end: null },
      viewportPosStart: null,
    };
    this._dragSelectState = {
      config: {},
      lastMoveTime: 0,
      isDragging: false,
      point: { start: null, end: null, move: null },
      box: new Graphics(),
    };
  }
}

export { Patchmap };
