import { Application, Assets } from 'pixi.js';
import { isValidationError } from 'zod-validation-error';
import { draw } from './display/draw';
import { update } from './display/update';
import { event } from './events/canvas';
import {
  addCanvas,
  initApp,
  initAsset,
  initResizeObserver,
  initViewport,
} from './init';
import { fit, focus } from './utils/canvas';
import { convertLegacyData } from './utils/convert';
import { deepMerge } from './utils/deepmerge/deepmerge';
import { renderer } from './utils/renderer';
import { selector } from './utils/selector/selector';
import { theme } from './utils/theme';
import { validateMapData } from './utils/vaildator';

export class PatchMap {
  _app = null;
  _viewport = null;
  _resizeObserver = null;
  _isInit = false;

  constructor() {
    this._app = new Application();
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
    const {
      app: appOptions = {},
      viewport: viewportOptions = {},
      theme: themeOptions = {},
      asset: assetOptions = {},
    } = opts;
    if (this.isInit) return;

    theme.set(deepMerge(this.theme, themeOptions));
    await initApp(this.app, { resizeTo: element, ...appOptions });
    this._viewport = initViewport(this.app, viewportOptions);
    await initAsset(assetOptions);
    renderer.set(this.app);
    addCanvas(element, this.app);

    this._resizeObserver = initResizeObserver(element, this.app, this.viewport);
    this._isInit = true;
  }

  destroy() {
    Assets.reset();
    this.app.destroy(true);
    if (this._resizeObserver) this._resizeObserver.disconnect();
  }

  draw(data) {
    let zData = isLegacyData(data) ? convertLegacyData(data) : data;
    if (!Array.isArray(zData)) {
      console.error('Invalid data format. Expected an array.');
      return;
    }

    this.app.stop();
    zData = validateMapData(zData);
    if (!isValidationError(zData)) {
      draw(this.viewport, zData);
    }
    this.app.start();
    return zData;

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
