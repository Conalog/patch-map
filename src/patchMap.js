import { Application } from 'pixi.js';
import { isValidationError } from 'zod-validation-error';
import {} from './assets/textures/utils';
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

  _setTheme(opts = {}) {
    this._theme = deepMerge(this.theme, opts);
  }

  async init(element, opts = {}) {
    const {
      app: appOptions = {},
      viewport: viewportOptions = {},
      theme: themeOptions = {},
      asset: assetOptions = {},
      texture: textureOptions = {},
    } = opts;

    this._setTheme(themeOptions);
    await initApp(this.app, { resizeTo: element, ...appOptions });
    this._viewport = initViewport(this.app, viewportOptions);
    this._viewport.theme = this._theme;

    await initAssets(assetOptions);
    initTextures(this.app, textureOptions);

    const div = document.createElement('div');
    div.classList.add('w-full', 'h-full', 'overflow-hidden');
    div.appendChild(this.app.canvas);
    element.appendChild(div);
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

    function isLegacyData(data) {
      return (
        !Array.isArray(data) && typeof data === 'object' && 'grids' in data
      );
    }
  }

  update(config) {
    update(this.viewport, config);
  }

  event() {
    return {
      add: (type, action, fn, opts = {}) => {
        const id = event.addEvent(this.viewport, type, action, fn, opts);
        event.onEvent(this.viewport, id);
        return id;
      },
      remove: (eventId) => {
        event.removeEvent(this.viewport, eventId);
      },
      on: (eventId) => {
        event.onEvent(this.viewport, eventId);
      },
      off: (eventId) => {
        event.offEvent(this.viewport, eventId);
      },
      get: (eventId) => {
        return event.getEvent(this.viewport, eventId);
      },
      getAll: () => {
        return event.getAllEvent(this.viewport);
      },
    };
  }

  convertLegacyData(data) {
    return convertLegacyData(data);
  }

  asset() {
    return {
      add: assets.addAsset,
      load: assets.loadAsset,
      get: assets.getAsset,
      addBundle: assets.addAssetBundle,
      loadBundle: assets.loadAssetBundle,
    };
  }

  canvas() {
    return {
      focus: (id) => focus(this.viewport, id),
      fit: (id) => fit(this.viewport, id),
    };
  }

  selector(config) {
    return selector(this.viewport, config);
  }

  deepMerge(target, source) {
    return deepMerge(target, source);
  }
}
