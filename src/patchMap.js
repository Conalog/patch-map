import * as PIXI from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { deepMerge } from './utils/merge';
import { getSVGSource } from './utils/svg';
import { setCanvasEvents, toggleCanvasAddon } from './events/canvas';
import { frames } from './assets/frames';
import { icons } from './assets/icons';
import { frame } from './display/components/frame';
import { icon } from './display/components/icon';

const THEME = {
  primary: {
    default: '#0C73BF',
    dark: '#083967',
  },
  gray: {
    light: '#9EB3C3',
    default: '#D9D9D9',
    dark: '#71717A',
  },
  red: {
    default: '#EF4444',
  },
  white: '#FFFFFF',
  black: '#1A1A1A',
};

/**
 * PatchMap
 *
 * A class for managing a PixiJS-based interactive canvas with customizable viewport features.
 * Includes functionality for zooming, dragging, and other viewport behaviors.
 *
 * @extends PIXI.Application
 */
export class PatchMap extends PIXI.Application {
  constructor() {
    super();

    this._viewport = null;
    this._resizeObserver = null;

    this.theme = null;
  }

  get viewport() {
    return this._viewport;
  }

  setTheme(userOptions = {}) {
    this.theme = deepMerge(THEME, userOptions);
  }

  /**
   * Initializes the application and sets up the viewport.
   *
   * @param {HTMLElement} element - The container element where the canvas will be appended.
   * @param {Object} [options] - Configuration options for the application and viewport.
   * @param {Object} [options.app] - Options for the PIXI.Application.
   * @param {Object} [options.viewport] - Options for the Viewport.
   * @param {Object} [options.iconAsset] - Options for the iconAsset.
   * @returns {Promise<void>} Resolves when the initialization is complete.
   */
  async init(element, options = {}) {
    this.setTheme(options?.theme);
    await this.initApp(element, options?.app);

    const div = document.createElement('div');
    div.classList.add('w-full', 'h-full', 'overflow-hidden');
    div.appendChild(this.canvas);
    element.appendChild(div);

    this.initViewport(options?.viewport);
    await this.initAsset(options?.iconAsset);
    this.initTexture(options?.textures);

    this._resizeObserver = new ResizeObserver(() => {
      this.resize();
      this._viewport.worldWidth = this.canvas.width;
      this._viewport.worldHeight = this.canvas.height;
    });
    this._resizeObserver.observe(div);
  }

  destroy() {
    this.viewport.destroy(true, {
      children: true,
      context: true,
      style: true,
      texture: true,
      textureSource: true,
    });
    this.destroy(true, {
      children: true,
      context: true,
      style: true,
      texture: true,
      textureSource: true,
    });
    this._resizeObserver.disconnect();
  }

  /**
   * Initializes the PIXI.Application with user-provided options.
   *
   * @private
   * @param {HTMLElement} element - The container element for the application.
   * @param {Object} userOptions - Options for the application initialization.
   * @returns {Promise<void>} Resolves when the application initialization is complete.
   */
  async initApp(element, userOptions = {}) {
    const options = deepMerge(
      {
        background: '#FAFAFA',
        resizeTo: element,
        antialias: true,
        autoStart: true,
        autoDensity: true,
        useContextAlpha: false,
        resolution: 3,
      },
      userOptions,
    );
    await super.init(options);
  }

  /**
   * Initializes the viewport with user-provided options.
   *
   * @private
   * @param {Object} userOptions - Options for the viewport initialization.
   */
  initViewport(userOptions = {}) {
    const options = deepMerge(
      {
        passiveWheel: false,
        worldWidth: this.canvas.width,
        worldHeight: this.canvas.height,
        events: this.renderer.events,
        canvasEvents: {
          clampZoom: {},
          drag: {},
          wheel: {},
          pinch: {},
          decelerate: {},
        },
      },
      userOptions,
    );
    this._viewport = new Viewport(options);
    this.setCanvasEvents(options.canvasEvents);
    this.stage.addChild(this.viewport);
  }

  async initAsset(userOptions = {}) {
    const options = deepMerge(
      {
        icons: {
          inverter: {
            isDisabled: false,
            src: icons.inverter,
          },
          combine: {
            src: icons.combine,
          },
          edge: {
            src: icons.edge,
          },
          device: {
            src: icons.device,
          },
          loading: {
            src: icons.loading,
          },
          warning: {
            src: icons.warning,
          },
          wifi: {
            src: icons.wifi,
          },
        },
      },
      userOptions,
    );

    const manifest = transformManifest(options);
    await PIXI.Assets.init({ manifest });
    await PIXI.Assets.loadBundle(Object.keys(options));

    function transformManifest(data) {
      return {
        bundles: Object.entries(data).map(([name, assets]) => ({
          name,
          assets: Object.entries(assets)
            .filter(([_, details]) => !details.isDisabled)
            .map(([alias, details]) => {
              return {
                alias,
                src: getSVGSource(details.src),
                data: { resolution: 3 },
              };
            }),
        })),
      };
    }
  }

  initTexture(userOptions = {}) {
    const options = deepMerge(
      {
        frames: {
          base: {
            frame: 'base',
            fill: THEME.white,
            borderColor: THEME.primary.dark,
          },
          'base-selected': {
            frame: 'base',
            borderWidth: 4,
            borderColor: THEME.red.default,
          },
          label: {
            frame: 'label',
            fill: THEME.white,
            borderColor: THEME.primary.dark,
          },
          'label-selected': {
            frame: 'label',
            fill: THEME.white,
            borderWidth: 4,
            borderColor: THEME.red.default,
          },
        },
      },
      userOptions,
    );

    for (const [key, textures] of Object.entries(options)) {
      for (const [name, option] of Object.entries(textures)) {
        PIXI.Cache.set(
          `${key}-${name}`,
          frames[option.frame](this, {
            ...option,
          }),
        );
      }
    }
  }

  components() {
    return {
      icon: icon,
      frame: frame,
    };
  }

  assets() {
    return {
      add: assetUtils.addSVGAsset,
      get: assetUtils.getAsset,
      load: assetUtils.loadAsset,
      addBundle: assetUtils.addAssetBundle,
      loadBundle: assetUtils.loadAssetBundle,
    };
  }

  /**
   * Configures multiple viewport addons (plugins) at once.
   *
   * @param {Object} events - An object mapping addon names to their configuration options.
   *  - `true` to activate the addon with default options.
   *  - `false` to deactivate the addon.
   *  - An object to activate and configure the addon.
   */
  setCanvasEvents(events) {
    setCanvasEvents(this._viewport, events);
  }

  /**
   * Toggles a single viewport addon (plugin).
   *
   * @param {string} addonName - The name of the addon to configure.
   * @param {boolean|Object} [options=true] - The configuration options for the addon.
   *  - `true` to activate the addon with default options.
   *  - `false` to deactivate the addon.
   *  - An object to activate and configure the addon.
   */
  toggleCanvasAddon(addonName, options) {
    toggleCanvasAddon(this._viewport, addonName, options);
  }

  /**
   * Configures the drag addon for the viewport.
   *
   * @param {boolean|Object} [options=true] - Options for the drag addon.
   *  - `true` to activate with default options.
   *  - `false` to deactivate.
   *  - An object to configure the addon.
   */
  drag(options = true) {
    this.toggleCanvasAddon('drag', options);
  }

  /**
   * Configures the clampZoom addon for the viewport.
   *
   * @param {boolean|Object} [options=true] - Options for the clampZoom addon.
   *  - `true` to activate with default options.
   *  - `false` to deactivate.
   *  - An object to configure the addon.
   */
  clampZoom(options = true) {
    this.toggleCanvasAddon('clampZoom', options);
  }

  /**
   * Configures the wheel addon for the viewport.
   *
   * @param {boolean|Object} [options=true] - Options for the wheel addon.
   *  - `true` to activate with default options.
   *  - `false` to deactivate.
   *  - An object to configure the addon.
   */
  wheel(options = true) {
    this.toggleCanvasAddon('wheel', options);
  }

  /**
   * Configures the pinch addon for the viewport.
   *
   * @param {boolean|Object} [options=true] - Options for the pinch addon.
   *  - `true` to activate with default options.
   *  - `false` to deactivate.
   *  - An object to configure the addon.
   */
  pinch(options = true) {
    this.toggleCanvasAddon('pinch', options);
  }

  /**
   * Configures the decelerate addon for the viewport.
   *
   * @param {boolean|Object} [options=true] - Options for the decelerate addon.
   *  - `true` to activate with default options.
   *  - `false` to deactivate.
   *  - An object to configure the addon.
   */
  decelerate(options = true) {
    this.toggleCanvasAddon('decelerate', options);
  }
}
