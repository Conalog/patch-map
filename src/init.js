import { gsap } from 'gsap';
import { PixiPlugin } from 'gsap/PixiPlugin';
import { Viewport } from 'pixi-viewport';
import * as PIXI from 'pixi.js';
import { firaCode } from './assets/fonts';
import { icons } from './assets/icons';
import { transformManifest } from './assets/utils';
import { plugin } from './events/viewport';
import { deepMerge } from './utils/deepmerge/deepmerge';
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
  assets: {
    icons: {
      object: { src: icons.object },
      inverter: { src: icons.inverter },
      combiner: { src: icons.combiner },
      edge: { src: icons.edge },
      device: { src: icons.device },
      loading: { src: icons.loading },
      warning: { src: icons.warning },
      wifi: { src: icons.wifi },
    },
  },
};

export const initApp = async (app, opts = {}) => {
  const options = deepMerge(DEFAULT_INIT_OPTIONS.app, opts);
  await app.init(options);
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
  const viewport = new Viewport(options);
  viewport.type = 'canvas';
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

export const initAssets = async (opts = {}) => {
  const options = deepMerge(DEFAULT_INIT_OPTIONS.assets, opts);
  const manifest = transformManifest(options);
  await PIXI.Assets.init({ manifest });
  PIXI.Assets.addBundle('fonts', [
    ...Object.entries(firaCode).map(([key, font]) => ({
      alias: `firaCode-${key}`,
      src: font,
      data: { family: `FiraCode ${key}` },
    })),
  ]);
  await PIXI.Assets.loadBundle([...Object.keys(options), 'fonts']);
};
