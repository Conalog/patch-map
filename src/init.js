import { Viewport } from 'pixi-viewport';
import { Assets } from 'pixi.js';
import { firaCode } from './assets/fonts';
import { icons } from './assets/icons';
import { background } from './assets/textures/background';
import { bars } from './assets/textures/bars';
import { addTexture } from './assets/textures/utils';
import { transformManifest } from './assets/utils';
import * as viewportEvents from './events/viewport';
import { deepMerge } from './utils/deepmerge/deepmerge';
import { getColor } from './utils/get';

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
      combine: { src: icons.combine },
      edge: { src: icons.edge },
      device: { src: icons.device },
      loading: { src: icons.loading },
      warning: { src: icons.warning },
      wifi: { src: icons.wifi },
    },
  },
  textures: {
    background: {
      base: {
        label: 'base',
        type: 'base',
        borderWidth: 2,
        borderColor: 'primary.dark',
      },
      'base-selected': {
        label: 'base',
        type: 'base',
        borderWidth: 4,
        borderColor: 'primary.accent',
      },
      label: {
        label: 'label',
        type: 'label',
        borderWidth: 2,
        borderColor: 'primary.dark',
      },
      'label-selected': {
        label: 'label',
        type: 'label',
        borderWidth: 4,
        borderColor: 'primary.accent',
      },
      icon: {
        label: 'icon',
        type: 'base',
        borderWidth: 2,
        borderColor: 'primary.default',
        radius: 4,
        defaultWidth: 24,
        defaultHeight: 24,
      },
      'icon-selected': {
        label: 'icon',
        type: 'base',
        borderWidth: 4,
        borderColor: 'primary.accent',
        radius: 4,
        defaultWidth: 24,
        defaultHeight: 24,
      },
    },
    bars: {
      base: {
        label: 'bar',
        type: 'base',
        borderWidth: 0,
      },
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
  viewport.plugins.addItems = (plugins = {}) =>
    viewportEvents.addPlugins(viewport, plugins);
  viewport.plugins.removeItems = (plugins = []) =>
    viewportEvents.removePlugins(viewport, plugins);
  viewport.plugins.resumeItems = (plugins = []) =>
    viewportEvents.resumePlugins(viewport, plugins);
  viewport.plugins.pauseItems = (plugins = []) =>
    viewportEvents.pausePlugins(viewport, plugins);
  viewport.events = {};

  viewport.plugins.addItems(options.plugins);
  app.stage.addChild(viewport);
  return viewport;
};

export const initAssets = async (opts = {}) => {
  const options = deepMerge(DEFAULT_INIT_OPTIONS.assets, opts);
  const manifest = transformManifest(options);
  await Assets.init({ manifest });
  Assets.addBundle('fonts', [
    ...Object.entries(firaCode).map(([key, font]) => ({
      alias: `firaCode-${key}`,
      src: font,
    })),
  ]);
  await Assets.loadBundle([...Object.keys(options), 'fonts']);
};

export const initTextures = (app, opts = {}) => {
  const options = deepMerge(DEFAULT_INIT_OPTIONS.textures, opts);

  for (const [key, textures] of Object.entries(options)) {
    for (const [name, option] of Object.entries(textures)) {
      let texture = null;
      if (key === 'background') {
        texture = background[option.type](app, {
          name,
          ...option,
          borderColor: getColor(option.borderColor, opts.theme),
        });
      } else if (key === 'bars') {
        texture = bars[option.type](app, { name, ...option });
      }
      addTexture(key, name, texture);
    }
  }
};
