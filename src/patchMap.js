import { Application } from 'pixi.js';
import {} from './assets/textures/utils';
import { assets } from './assets/utils';
import { THEME_CONFIG } from './config/theme';
import { DRAW_DEFAULT_OPTIONS } from './display/config';
import { draw } from './display/draw/draw';
import { update } from './display/update/update';
import { event } from './events/canvas';
import { initApp, initAssets, initTextures, initViewport } from './init';
import { fit, focus } from './utils/canvas';
import { convertLegacyData } from './utils/convert';
import { deepMerge } from './utils/merge';

export class PatchMap {
  _app = null;
  _viewport = null;
  _resizeObserver = null;
  _theme = THEME_CONFIG;
  _setOptions = DRAW_DEFAULT_OPTIONS;

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

    await initAssets(assetOptions);
    initTextures(this.app, textureOptions);

    const div = document.createElement('div');
    div.classList.add('w-full', 'h-full', 'overflow-hidden');
    div.appendChild(this.app.canvas);
    element.appendChild(div);
  }

  draw(opts = {}) {
    this._setOptions = deepMerge(this._setOptions, {
      ...opts,
      theme: this.theme,
    });
    const isNewMapData = 'mapData' in opts && typeof opts.mapData === 'object';
    draw(this.viewport, isNewMapData, this._setOptions);
  }

  update(opts = {}) {
    update(this.viewport, { ...opts, theme: this.theme });
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
}
