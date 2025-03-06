import { Application, Assets } from 'pixi.js';
import { isValidationError } from 'zod-validation-error';
import { draw } from './display/draw';
import { update } from './display/update';
import { event } from './events/canvas';
import {
  initApp,
  initAsset,
  initCanvas,
  initResizeObserver,
  initViewport,
} from './init';
import { fit, focus } from './utils/canvas';
import { convertLegacyData } from './utils/convert';
import { renderer } from './utils/renderer';
import { selector } from './utils/selector/selector';
import { theme } from './utils/theme';
import { validateMapData } from './utils/vaildator';

class PatchMap {
  constructor() {
    this._app = new Application();
    this._viewport = null;
    this._resizeObserver = null;
    this._isInit = false;
  }

  get app() {
    return this._app;
  }

  get viewport() {
    return this._viewport;
  }

  get theme() {
    return theme.get();
  }

  get isInit() {
    return this._isInit;
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
      asset: assetOptions = {},
    } = opts;

    theme.set(themeOptions);
    await initApp(this.app, { resizeTo: element, ...appOptions });
    this._viewport = initViewport(this.app, viewportOptions);
    await initAsset(assetOptions);
    renderer.set(this.app.renderer);
    initCanvas(element, this.app);

    this._resizeObserver = initResizeObserver(element, this.app, this.viewport);
    this._isInit = true;
  }

  destroy() {
    Assets.reset();
    this.viewport.destroy(true);
    this.app.destroy(true);
    if (this._resizeObserver) this._resizeObserver.disconnect();

    this._viewport = null;
    this._resizeObserver = null;
    this._isInit = false;
  }

  draw(data) {
    const zData = preprocessData(data);
    if (!zData) return;

    this.app.stop();
    const validatedData = validateMapData(zData);

    if (!isValidationError(validatedData)) {
      draw(this.viewport, validatedData);
    }

    this.app.start();
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

  update(config) {
    update(this.viewport, config);
  }

  focus(id) {
    focus(this.viewport, id);
  }

  fit(id) {
    fit(this.viewport, id);
  }

  selector(path, options) {
    return selector(this.viewport, path, options);
  }
}

export { PatchMap };
