import { Application, Assets } from 'pixi.js';
import { isValidationError } from 'zod-validation-error';
import { assets } from './assets/utils';
import { THEME_CONFIG } from './config/theme';
import { draw } from './display/draw';
import { update } from './display/update';
import { event } from './events/canvas';
import { initApp, initAssets, initTextures, initViewport } from './init';
import { fit, focus } from './utils/canvas';
import { convertLegacyData } from './utils/convert';
import { deepMerge } from './utils/deepmerge/deepmerge';
import { selector } from './utils/selector/selector';
import { validateMapData } from './utils/vaildator';

export class PatchMap {
  _app = null;
  _viewport = null;
  _resizeObserver = null;
  _theme = THEME_CONFIG;
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
    return this._theme;
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

  get asset() {
    return {
      add: assets.addAsset,
      load: assets.loadAsset,
      get: assets.getAsset,
      addBundle: assets.addAssetBundle,
      loadBundle: assets.loadAssetBundle,
    };
  }

  _setTheme(opts = {}) {
    this._theme = deepMerge(this.theme, opts);
  }

  async init(element, opts = {}) {
    const {
      app: appOptions = {},
      viewport: viewportOptions = {},
      theme: themeOptions = {},
      asset: assetOptions = {},
      textures: textureOptions = {},
    } = opts;
    if (this.isInit) return;

    this._setTheme(themeOptions);
    await initApp(this.app, { resizeTo: element, ...appOptions });
    this._viewport = initViewport(this.app, viewportOptions);
    this._viewport.theme = this._theme;

    await initAssets(assetOptions);
    initTextures(this.app, { textures: textureOptions, theme: this._theme });

    const div = document.createElement('div');
    div.classList.add('w-full', 'h-full', 'overflow-hidden');
    div.appendChild(this.app.canvas);
    element.appendChild(div);

    this._resizeObserver = new ResizeObserver(() => {
      this.app.resize();
      const screen = this.app.screen;
      this.viewport.resize(screen.width, screen.height);
    });
    this._resizeObserver.observe(element);
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
