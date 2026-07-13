import EventEmitter from 'eventemitter3';
import { Application, Container } from 'pixi.js';
import type { ApplicationOptions } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import type { IViewportOptions } from 'pixi-viewport';

import { FlipController, RotationController } from './controllers';
import { UndoRedoManager } from './history';
import { SelectionState, StateManager } from './state';
import {
  materializeTheme,
  type DeepPartial,
  type PatchmapTheme,
} from './theme';
import type { Transformer } from './transformer';

type ViewportPluginName = 'clampZoom' | 'drag' | 'wheel' | 'pinch' | 'decelerate';
type ViewportPluginOptions = Record<
  ViewportPluginName,
  ({ disabled?: boolean } & Record<string, unknown>) | undefined
>;

export interface PatchmapInitOptions {
  app?: Partial<ApplicationOptions>;
  viewport?: Partial<Omit<IViewportOptions, 'events'>> & {
    plugins?: Partial<ViewportPluginOptions>;
  };
  theme?: DeepPartial<PatchmapTheme>;
  assets?: unknown;
  transformer?: Transformer;
}

const DEFAULT_APP_OPTIONS: Partial<ApplicationOptions> = {
  background: '#FAFAFA',
  antialias: true,
  autoDensity: true,
  resolution: 2,
  autoStart: true,
  preference: 'webgl',
};

const DEFAULT_VIEWPORT_PLUGINS: ViewportPluginOptions = {
  clampZoom: { minScale: 0.5, maxScale: 30 },
  drag: {},
  wheel: {},
  pinch: {},
  decelerate: {},
};

export class Patchmap extends EventEmitter {
  public app: Application | null = null;
  public viewport: Viewport | null = null;
  public world: Container | null = null;
  public theme: PatchmapTheme = materializeTheme();
  public isInit = false;
  public undoRedoManager = new UndoRedoManager();
  public stateManager: StateManager | null = null;
  public readonly rotation = new RotationController(this);
  public readonly flip = new FlipController(this);
  public animationContext: Record<string, unknown> | null = null;

  #transformer: Transformer | null = null;
  #resizeObserver: ResizeObserver | null = null;
  #initPromise: Promise<void> | null = null;

  public get transformer(): Transformer | null {
    return this.#transformer;
  }

  public set transformer(value: Transformer | null) {
    if (value === this.#transformer) return;
    const previous = this.#transformer;
    this.#transformer = value;
    if (previous && !previous.destroyed) previous.destroy();
    if (value && this.viewport && value.parent !== this.viewport) {
      this.viewport.addChild(value);
    }
  }

  public init(element: HTMLElement, options: PatchmapInitOptions = {}): Promise<void> {
    if (this.isInit) return Promise.resolve();
    if (this.#initPromise) return this.#initPromise;

    const app = new Application();
    this.app = app;
    this.#initPromise = this.#initialize(app, element, options);
    return this.#initPromise;
  }

  async #initialize(
    app: Application,
    element: HTMLElement,
    options: PatchmapInitOptions,
  ): Promise<void> {
    try {
      await app.init({ ...DEFAULT_APP_OPTIONS, ...options.app });
      if (this.app !== app) return;

      const { plugins: requestedPlugins, ...viewportOptions } = options.viewport ?? {};
      const viewport = new Viewport({
        screenWidth: app.screen.width,
        screenHeight: app.screen.height,
        passiveWheel: false,
        ...viewportOptions,
        events: app.renderer.events,
      });
      const world = new Container();
      world.label = 'patch-map-world';
      viewport.addChild(world);
      app.stage.addChild(viewport);

      this.#configureViewport(viewport, requestedPlugins);
      this.viewport = viewport;
      this.world = world;
      this.theme = materializeTheme(options.theme);
      this.stateManager = new StateManager({ patchmap: this });
      this.stateManager.register('selection', SelectionState);
      element.appendChild(app.canvas);
      this.#observeResize(element, app, viewport);
      this.rotation.apply();
      this.flip.apply();
      if (options.transformer) this.transformer = options.transformer;
      this.isInit = true;
      this.emit('patchmap:initialized', { target: this });
    } catch (error) {
      if (this.app === app) {
        try {
          app.destroy({ removeView: true }, { children: true });
        } catch {
          // The renderer may be only partially initialized.
        }
        this.app = null;
      }
      throw error;
    } finally {
      this.#initPromise = null;
    }
  }

  public destroy(): void {
    if (!this.isInit) return;

    const app = this.app;
    const stateManager = this.stateManager;
    const transformer = this.#transformer;
    const history = this.undoRedoManager;

    this.isInit = false;
    this.app = null;
    this.viewport = null;
    this.world = null;
    this.stateManager = null;
    this.#transformer = null;
    this.animationContext = null;
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;

    stateManager?.destroy();
    if (transformer && !transformer.destroyed) transformer.destroy();
    history.destroy();
    this.undoRedoManager = new UndoRedoManager();
    app?.destroy({ removeView: true }, { children: true });

    this.emit('patchmap:destroyed', { target: this });
    this.removeAllListeners();
  }

  #configureViewport(
    viewport: Viewport,
    requested: Partial<ViewportPluginOptions> | undefined,
  ): void {
    const plugins: ViewportPluginOptions = {
      ...DEFAULT_VIEWPORT_PLUGINS,
      ...requested,
    };
    for (const name of Object.keys(plugins) as ViewportPluginName[]) {
      const pluginOptions = plugins[name];
      if (!pluginOptions || pluginOptions.disabled) continue;
      const { disabled: _disabled, ...cleanOptions } = pluginOptions;
      const install = viewport[name] as (options?: Record<string, unknown>) => Viewport;
      install.call(viewport, cleanOptions);
    }
  }

  #observeResize(element: HTMLElement, app: Application, viewport: Viewport): void {
    if (typeof ResizeObserver === 'undefined') return;
    this.#resizeObserver = new ResizeObserver(() => {
      if (this.app !== app || !this.isInit) return;
      viewport.resize(app.screen.width, app.screen.height);
    });
    this.#resizeObserver.observe(element);
  }
}
