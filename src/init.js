import { gsap } from 'gsap';
import { PixiPlugin } from 'gsap/PixiPlugin';
import { Viewport } from 'pixi-viewport';
import * as PIXI from 'pixi.js';
import { firaCode } from './assets/fonts';
import { icons } from './assets/icons';
import { Type } from './display/mixins/Type';
import { deepMerge } from './utils/deepmerge/deepmerge';
import { plugin } from './utils/event/viewport';
import { uid } from './utils/uuid';

gsap.registerPlugin(PixiPlugin);
PixiPlugin.registerPIXI(PIXI);

const DEFAULT_INIT_OPTIONS = {
  app: {
    background: '#FAFAFA',
    antialias: true,
    autoStart: true,
    autoDensity: true,
    useContextAlpha: true,
    resolution: 2,
  },
  viewport: {
    passiveWheel: false,
    plugins: {
      clampZoom: { minScale: 0.5, maxScale: 30 },
      drag: {},
      wheel: {},
      pinch: {},
      decelerate: {},
    },
  },
  assets: [
    {
      name: 'icons',
      items: Object.entries(icons).map(([alias, src]) => ({
        alias,
        src,
        data: { resolution: 3 },
      })),
    },
    {
      name: 'fonts',
      items: Object.entries(firaCode).map(([key, font]) => ({
        alias: `firaCode-${key}`,
        src: font,
        data: { family: `FiraCode ${key}` },
      })),
    },
  ],
};

export const initApp = async (app, opts = {}) => {
  const options = deepMerge(DEFAULT_INIT_OPTIONS.app, opts);
  await app.init(options);
  app.renderer.uid = uid();
};

export const initViewport = (app, opts = {}) => {
  const options = deepMerge(
    {
      ...DEFAULT_INIT_OPTIONS.viewport,
      screenWidth: app.screen.width,
      screenHeight: app.screen.height,
      events: app.renderer.events,
    },
    opts,
  );
  const viewport = new (Type(Viewport))({ ...options, type: 'canvas' });
  viewport.app = app;
  viewport.events = {};
  viewport.plugin = {
    add: (plugins) => plugin.add(viewport, plugins),
    remove: (keys) => plugin.remove(viewport, keys),
    start: (keys) => plugin.start(viewport, keys),
    stop: (keys) => plugin.stop(viewport, keys),
  };
  viewport.plugin.add(options.plugins);
  app.stage.addChild(viewport);
  return viewport;
};

export const initAsset = async (opts = {}) => {
  const assets = deepMerge(DEFAULT_INIT_OPTIONS.assets, opts, {
    mergeBy: ['name', 'alias'],
  });

  const bundlesToLoad = [];
  const assetsToLoad = [];
  for (const asset of assets) {
    if (asset.name && Array.isArray(asset.items)) {
      if (!PIXI.Assets.resolver.hasBundle(asset.name)) {
        PIXI.Assets.addBundle(asset.name, asset.items);
        bundlesToLoad.push(asset.name);
      }
    } else if (asset.alias && asset.src) {
      if (!PIXI.Assets.cache.has(asset.alias)) {
        PIXI.Assets.add(asset);
        assetsToLoad.push(asset.alias);
      }
    }
  }
  await Promise.all([
    bundlesToLoad.length > 0
      ? PIXI.Assets.loadBundle(bundlesToLoad)
      : Promise.resolve(),
    assetsToLoad.length > 0
      ? PIXI.Assets.load(assetsToLoad)
      : Promise.resolve(),
  ]);
};

export const initResizeObserver = (el, app, viewport) => {
  const resizeObserver = new ResizeObserver(() => {
    app.resize();
    const screen = app.screen;
    viewport.resize(screen.width, screen.height);
  });
  resizeObserver.observe(el);
  return resizeObserver;
};

export const initCanvas = (el, app) => {
  const div = document.createElement('div');
  div.classList.add('w-full', 'h-full', 'overflow-hidden');
  div.appendChild(app.canvas);
  el.appendChild(div);
};
