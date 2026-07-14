import EventEmitter from 'eventemitter3';
import { Application, Container } from 'pixi.js';
import type { ApplicationOptions } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import type { IViewportOptions } from 'pixi-viewport';

import {
  getCachedSceneTexture,
  ManagedAssets,
  ManagedSceneAssets,
} from './assets';
import { CanvasEventManager } from './canvas-events';
import type {
  DrawInput,
  DrawResult,
  FitOptions,
  FocusIds,
  FocusOptions,
  PublicDisplayHandle,
  PublicElementHandle,
  SelectorOptions,
  SelectorResult,
  UpdateOptions,
  UpdateResult,
} from './contracts';
import {
  APPLY_VIEW_TRANSFORM,
  FlipController,
  RotationController,
} from './controllers';
import { UndoRedoManager } from './history';
import { materializeMapData, type MaterializedMapData } from './model/materialize';
import { selectScene } from './scene-selector';
import { SelectionState } from './selection-state';
import {
  buildManagedScene,
  reindexManagedScene,
  syncRelationPathGeometry,
  type ManagedScene,
} from './scene/build-scene';
import { applyContentOrientation } from './scene/content-orientation';
import { ManagedNode } from './scene/managed-node';
import { AggregateRenderLayer } from './scene/render-layer';
import { StateManager } from './state';
import {
  materializeTheme,
  type DeepPartial,
  type PatchmapTheme,
} from './theme';
import type { Transformer, TransformerGesturePayload } from './transformer';
import {
  AppliedTransformCommand,
  captureManagedTransforms,
  sameManagedTransforms,
  type ManagedTransformSnapshot,
} from './transformer-command';
import { applyManagedUpdates } from './update/apply';
import { ManagedUpdateCommand } from './update/command';
import {
  fitScaleFor,
  measureViewTargets,
  normalizeFitPadding,
  resolveViewTargets,
} from './view';
import { convertLegacyData } from './utils';

type ViewportPluginName = 'clampZoom' | 'drag' | 'wheel' | 'pinch' | 'decelerate';
type ViewportPluginOptions = Record<
  ViewportPluginName,
  ({ disabled?: boolean } & Record<string, unknown>) | undefined
>;

interface PendingManagedSceneRefresh {
  reindex: boolean;
  assets: boolean;
  orientation: boolean;
  componentTypes: Set<string> | null;
  restartAnimations: boolean;
}

export interface PatchmapViewportPluginFacade {
  add(plugins: Record<string, ({ disabled?: boolean } & Record<string, unknown>) | undefined>): Viewport;
  stop(name: string): void;
  start(name: string): void;
  remove(name: string): void;
}

export type PatchmapViewport = Viewport & {
  readonly plugin: PatchmapViewportPluginFacade;
};

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

const isManagedNodeValue = (value: unknown): value is ManagedNode =>
  value instanceof ManagedNode;

const pluginInstallerName = (name: string): string =>
  name.replace(/-([a-z])/gu, (_match, letter: string) => letter.toUpperCase());

const pluginManagerName = (name: string): string =>
  name.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`);

const resolveViewportPlugin = (
  viewport: Viewport,
  name: string,
): { key: string; plugin: NonNullable<ReturnType<Viewport['plugins']['get']>> } | null => {
  const candidates = new Set([
    name,
    pluginManagerName(name),
    pluginInstallerName(name),
  ]);
  for (const candidate of candidates) {
    const plugin = viewport.plugins.get(candidate);
    if (plugin) return { key: candidate, plugin };
  }
  return null;
};

const installViewportPluginFacade = (viewport: Viewport): PatchmapViewport => {
  const facade: PatchmapViewportPluginFacade = {
    add(plugins) {
      for (const [name, options] of Object.entries(plugins)) {
        if (!options || options.disabled) continue;
        const { disabled: _disabled, ...cleanOptions } = options;
        const installer: unknown = (
          viewport as unknown as Record<string, unknown>
        )[pluginInstallerName(name)];
        if (typeof installer !== 'function') {
          throw new TypeError(`Unknown viewport plugin: ${name}`);
        }
        const install = installer as (
          this: Viewport,
          options: Record<string, unknown>,
        ) => unknown;
        Reflect.apply(install, viewport, [cleanOptions]);
      }
      return viewport;
    },
    stop(name) {
      resolveViewportPlugin(viewport, name)?.plugin.pause();
    },
    start(name) {
      resolveViewportPlugin(viewport, name)?.plugin.resume();
    },
    remove(name) {
      const registered = resolveViewportPlugin(viewport, name);
      if (registered) viewport.plugins.remove(registered.key);
    },
  };
  Object.defineProperty(viewport, 'plugin', {
    configurable: true,
    enumerable: true,
    value: facade,
  });
  return viewport as PatchmapViewport;
};

export class Patchmap extends EventEmitter {
  public app: Application | null = null;
  public viewport: PatchmapViewport | null = null;
  public world: Container | null = null;
  public theme: PatchmapTheme = materializeTheme();
  public isInit = false;
  public undoRedoManager = new UndoRedoManager();
  public stateManager: StateManager | null = null;
  public readonly rotation = new RotationController(this);
  public readonly flip = new FlipController(this);
  public readonly event = new CanvasEventManager((path) => {
    if (path === '$') return this.viewport ? [this.viewport] : [];
    return this.selector<unknown>(path).filter(
      (value): value is Container => value instanceof Container,
    );
  });
  #animationContext: Record<string, unknown> = {};

  #transformer: Transformer | null = null;
  #resizeObserver: ResizeObserver | null = null;
  #initPromise: Promise<void> | null = null;
  #renderLayer: AggregateRenderLayer | null = null;
  #managedScene: ManagedScene | null = null;
  #pendingManagedSceneRefresh: PendingManagedSceneRefresh | null = null;
  #managedSceneRefreshFrame: number | null = null;
  #drawVersion = 0;
  readonly #assets = new ManagedAssets();
  readonly #sceneAssets = new ManagedSceneAssets();
  #assetCleanup: Promise<void> = Promise.resolve();
  #stateUnbind: Array<() => void> = [];
  #transformerUnbind: (() => void) | null = null;
  #transformBefore: ManagedTransformSnapshot[] | null = null;

  public get animationContext(): Record<string, unknown> {
    return this.#animationContext;
  }

  public set animationContext(_value: never) {
    throw new TypeError(
      'Cannot set property animationContext of #<az> which has only a getter',
    );
  }

  public get transformer(): Transformer | null {
    return this.#transformer;
  }

  public set transformer(value: Transformer | null) {
    if (value === this.#transformer) return;
    const previous = this.#transformer;
    this.#unbindTransformer();
    this.#transformer = value;
    if (previous && !previous.destroyed) previous.destroy();
    if (value && this.viewport && value.parent !== this.viewport) {
      this.viewport.addChild(value);
    }
    if (value) this.#bindTransformer(value);
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
      if (this.app !== app) {
        this.#destroyApplication(app);
        return;
      }
      await this.#assetCleanup;
      if (this.app !== app) {
        this.#destroyApplication(app);
        return;
      }
      if (options.assets !== undefined) await this.#assets.register(options.assets);
      if (this.app !== app) {
        this.#destroyApplication(app);
        return;
      }

      const { plugins: requestedPlugins, ...viewportOptions } = options.viewport ?? {};
      const viewport = installViewportPluginFacade(new Viewport({
        screenWidth: app.screen.width,
        screenHeight: app.screen.height,
        passiveWheel: false,
        ...viewportOptions,
        events: app.renderer.events,
      }));
      const world = new Container();
      world.label = 'patch-map-world';
      const renderLayer = new AggregateRenderLayer(() => this.theme);
      renderLayer.onRender = () => {
        if (this.#renderLayer !== renderLayer) return;
        this.#flushManagedSceneRefresh();
        syncRelationPathGeometry(this.#managedScene);
      };
      viewport.addChild(renderLayer);
      viewport.addChild(world);
      app.stage.addChild(viewport);

      this.#configureViewport(viewport, requestedPlugins);
      this.viewport = viewport;
      this.world = world;
      this.#renderLayer = renderLayer;
      this.theme = materializeTheme(options.theme);
      this.stateManager = new StateManager({ patchmap: this });
      this.stateManager.register('selection', SelectionState);
      this.#bindStateEvents(app, viewport, this.stateManager);
      element.appendChild(app.canvas);
      this.#observeResize(element, app, viewport);
      this.rotation.apply();
      this.flip.apply();
      if (options.transformer && options.transformer !== this.#transformer) {
        this.transformer = options.transformer;
      }
      if (
        this.#transformer &&
        !this.#transformer.destroyed &&
        this.#transformer.parent !== viewport
      ) {
        viewport.addChild(this.#transformer);
      }
      this.isInit = true;
      this.emit('patchmap:initialized', { target: this });
    } catch (error) {
      if (this.app === app) {
        this.app = null;
      }
      this.#destroyApplication(app);
      this.#unbindStateEvents();
      await this.#clearAssets();
      throw error;
    } finally {
      this.#initPromise = null;
    }
  }

  public destroy(): void {
    if (!this.isInit) {
      // A destroy before init() is a no-op. Once init() has started, however,
      // invalidate its ownership so a late async completion cannot resurrect
      // an instance the consumer already discarded.
      if (this.#initPromise && this.app) {
        this.app = null;
        this.#drawVersion += 1;
        this.#clearPendingManagedSceneRefresh();
        this.#unbindStateEvents();
        this.event.removeAll();
        this.#assetCleanup = this.#clearAssets();
      }
      return;
    }

    const app = this.app;
    const stateManager = this.stateManager;
    const transformer = this.#transformer;
    const history = this.undoRedoManager;
    const renderLayer = this.#renderLayer;

    this.isInit = false;
    this.app = null;
    this.viewport = null;
    this.world = null;
    this.stateManager = null;
    this.#transformer = null;
    this.#renderLayer = null;
    this.#managedScene = null;
    this.#clearPendingManagedSceneRefresh();
    if (renderLayer) renderLayer.onRender = null;
    this.#drawVersion += 1;
    this.theme = materializeTheme();
    this.#animationContext = {};
    this.rotation.restoreInitialState();
    this.flip.restoreInitialState();
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
    this.#unbindStateEvents();
    this.#unbindTransformer();
    this.event.removeAll();
    this.#assetCleanup = this.#clearAssets();

    stateManager?.destroy();
    if (transformer && !transformer.destroyed) transformer.destroy();
    history.destroy();
    this.undoRedoManager = new UndoRedoManager();
    app?.destroy({ removeView: true }, { children: true });

    this.emit('patchmap:destroyed', { target: this });
    this.removeAllListeners();
  }

  public draw(input: DrawInput): DrawResult;
  public draw(input: unknown): MaterializedMapData | undefined {
    const world = this.world;
    const renderLayer = this.#renderLayer;
    if (!this.isInit || !world || !renderLayer) return undefined;

    const legacyCandidate = input as Record<string, unknown>;
    const data = materializeMapData(
      typeof input === 'object' &&
      ('grids' in legacyCandidate || 'devices' in legacyCandidate)
        ? convertLegacyData(input)
        : input,
    );
    const scene = buildManagedScene(data, this.theme);
    const version = ++this.#drawVersion;
    this.#clearPendingManagedSceneRefresh();
    this.event.removeAll();
    const previousChildren = world.removeChildren();
    for (const child of previousChildren) {
      if (!child.destroyed) child.destroy({ children: true });
    }
    if (scene.roots.length > 0) world.addChild(...scene.roots);
    this.#managedScene = scene;
    this.#applyLoadedAssetBounds();
    applyContentOrientation(scene, this.rotation.value, {
      x: this.flip.x,
      y: this.flip.y,
    });
    renderLayer.renderScene(scene.roots);
    this.undoRedoManager.clear();

    void this.#sceneAssets.refresh(data, () => {
      if (!this.isInit || version !== this.#drawVersion) return;
      this.#applyLoadedAssetBounds();
      this.#queueManagedSceneRefresh(false, false, false);
    });

    queueMicrotask(() => {
      if (this.isInit && version === this.#drawVersion) {
        this.emit('patchmap:draw', { target: this, data });
      }
    });
    return data;
  }

  public selector<T = PublicDisplayHandle>(
    path: string,
    options: SelectorOptions = {},
  ): SelectorResult<T> {
    this.#flushPendingManagedSceneReindex();
    if (!this.world) return [];
    if (path === '$') return [this.world] as T[];
    const indexed = /^\$\.\.children\[\?\(@\.(id|type|label)===("(?:\\.|[^"])*")\)\]$/.exec(path);
    if (indexed && this.#managedScene) {
      const field = indexed[1];
      const encoded = indexed[2];
      if (field && encoded) {
        const value = JSON.parse(encoded) as string;
        if (field === 'id') {
          const node = this.#managedScene.byId.get(value);
          return (node ? [node] : []) as T[];
        }
        return [...(field === 'type'
          ? this.#managedScene.byType.get(value)
          : this.#managedScene.byLabel.get(value)) ?? []] as T[];
      }
    }
    return selectScene(this.world, path, options) as T[];
  }

  public update<TElement extends PublicDisplayHandle = PublicDisplayHandle>(
    options?: UpdateOptions<TElement>,
  ): UpdateResult<TElement>;
  public update(
    options: UpdateOptions<PublicDisplayHandle> = {},
  ): PublicDisplayHandle[] {
    if (options.changes === undefined && options.refresh !== true) {
      throw new TypeError('Patchmap.update requires changes unless refresh is true.');
    }
    const targets: ManagedNode[] = [];
    const append = (value: unknown): void => {
      if (Array.isArray(value)) {
        for (const entry of value) append(entry);
      } else if (isManagedNodeValue(value) && !value.destroyed) {
        targets.push(value);
      }
    };

    if (options.elements !== undefined) append(options.elements);
    if (options.path !== undefined) append(this.selector(options.path));

    const refreshScene = (): void => this.#refreshManagedScene(
      true,
      true,
      true,
      null,
      options.refresh === true,
    );
    if (options.history === true || typeof options.history === 'string') {
      void this.undoRedoManager.execute(
        new ManagedUpdateCommand(targets, options, refreshScene),
        typeof options.history === 'string'
          ? { historyId: options.history }
          : undefined,
      );
    } else {
      const effects = applyManagedUpdates(targets, options);
      this.#refreshManagedScene(
        effects.reindex,
        effects.assets,
        effects.orientation,
        effects.componentTypes,
        options.refresh === true,
      );
    }
    if (options.emit !== false) {
      this.emit('patchmap:updated', { target: this, elements: targets });
    }
    return targets as unknown as PublicDisplayHandle[];
  }

  public focus(
    ids?: FocusIds,
    options: FocusOptions<PublicElementHandle> = {},
  ): void {
    this.#flushManagedSceneRefresh();
    const viewport = this.viewport;
    if (!viewport) return;
    const targets = resolveViewTargets(
      this.#managedScene,
      ids,
      options.filter as ((element: ManagedNode) => unknown) | undefined,
    );
    const bounds = measureViewTargets(targets, viewport);
    if (!bounds) return;
    viewport.moveCenter(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  }

  public fit(
    ids?: FocusIds,
    options: FitOptions<PublicElementHandle> = {},
  ): void {
    this.#flushManagedSceneRefresh();
    const viewport = this.viewport;
    if (!viewport) return;
    const padding = normalizeFitPadding(options.padding);
    const targets = resolveViewTargets(
      this.#managedScene,
      ids,
      options.filter as ((element: ManagedNode) => unknown) | undefined,
    );
    const bounds = measureViewTargets(targets, viewport);
    if (!bounds) return;
    const scale = fitScaleFor(
      bounds,
      { width: viewport.screenWidth, height: viewport.screenHeight },
      padding,
    );
    if (scale !== null) viewport.setZoom(scale, false);
    viewport.moveCenter(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  }

  public [APPLY_VIEW_TRANSFORM](): void {
    const world = this.world;
    const renderLayer = this.#renderLayer;
    if (!world || !renderLayer) return;
    const center = this.viewport?.center;
    if (center) {
      world.position.copyFrom(center);
      world.pivot.copyFrom(center);
    }
    renderLayer.angle = world.angle;
    renderLayer.scale.copyFrom(world.scale);
    renderLayer.position.copyFrom(world.position);
    renderLayer.pivot.copyFrom(world.pivot);
    applyContentOrientation(this.#managedScene, this.rotation.value, {
      x: this.flip.x,
      y: this.flip.y,
    });
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
    this.#resizeObserver = new ResizeObserver((entries) => {
      if (this.app !== app || !this.isInit) return;
      const entry = entries.find(({ target }) => target === element);
      const width = entry?.contentRect.width ?? element.clientWidth;
      const height = entry?.contentRect.height ?? element.clientHeight;
      if (!(width > 0 && height > 0)) return;
      app.renderer.resize(width, height);
      viewport.resize(app.screen.width, app.screen.height);
    });
    this.#resizeObserver.observe(element);
  }

  #bindStateEvents(
    app: Application,
    viewport: Viewport,
    stateManager: StateManager,
  ): void {
    this.#unbindStateEvents();
    viewport.eventMode = 'static';
    const handledNativeEvents = new WeakSet<Event>();
    const replayedNativeEvents = new WeakSet<Event>();
    const capturedFederatedEvents = new WeakMap<Event, {
      propagationImmediatelyStopped?: boolean;
      propagationStopped?: boolean;
    }>();
    const nativeEventOf = (event: unknown): Event | null => {
      const nativeEvent = (
        event as { nativeEvent?: unknown } | null | undefined
      )?.nativeEvent;
      return nativeEvent instanceof Event ? nativeEvent : null;
    };
    const markHandled = (event: unknown): void => {
      const nativeEvent = nativeEventOf(event);
      if (nativeEvent) handledNativeEvents.add(nativeEvent);
    };
    const markCaptured = (event: unknown): void => {
      const nativeEvent = nativeEventOf(event);
      if (!nativeEvent || !event || typeof event !== 'object') return;
      capturedFederatedEvents.set(nativeEvent, event);
    };
    const dispatch = (name: string, event: unknown): void => {
      stateManager.dispatch(name, event);
      stateManager.dispatch(`on${name}`, event);
    };
    for (const name of [
      'pointerdown',
      'pointermove',
      'pointerup',
      'pointerupoutside',
      'click',
      'tap',
      'pointerover',
      'rightclick',
    ]) {
      const listener = (event: unknown): void => {
        markHandled(event);
        dispatch(name, event);
      };
      const captureListener = (event: unknown): void => markCaptured(event);
      viewport.on(name, listener);
      this.#stateUnbind.push(() => viewport.off(name, listener));
      if (typeof viewport.addEventListener === 'function') {
        viewport.addEventListener(name, captureListener, { capture: true });
        this.#stateUnbind.push(() => {
          viewport.removeEventListener(name, captureListener, { capture: true });
        });
      }
    }

    const replayMissed = (event: PointerEvent): void => {
      if (handledNativeEvents.has(event) || replayedNativeEvents.has(event)) return;
      const captured = capturedFederatedEvents.get(event);
      if (
        captured?.propagationStopped === true ||
        captured?.propagationImmediatelyStopped === true
      ) return;
      replayedNativeEvents.add(event);
      setTimeout(() => {
        if (this.app === app && this.isInit) app.canvas.dispatchEvent(event);
      }, 0);
    };
    for (const name of ['pointerdown', 'pointermove', 'pointerup'] as const) {
      app.canvas.addEventListener(name, replayMissed);
      this.#stateUnbind.push(() => {
        app.canvas.removeEventListener(name, replayMissed);
      });
    }

    const contextMenu = (event: Event): void => event.preventDefault();
    app.canvas.addEventListener('contextmenu', contextMenu);
    this.#stateUnbind.push(() => app.canvas.removeEventListener('contextmenu', contextMenu));

    if (typeof window !== 'undefined') {
      const modifier = (key: string): string | null => {
        switch (key) {
          case 'Shift': return 'shift';
          case 'Control': return 'control';
          case 'Meta': return 'meta';
          case 'Alt': return 'alt';
          default: return null;
        }
      };
      const keydown = (event: KeyboardEvent): void => {
        const name = modifier(event.key);
        if (name) stateManager.activateModifier(name, event);
        dispatch('keydown', event);
      };
      const keyup = (event: KeyboardEvent): void => {
        const name = modifier(event.key);
        if (name) stateManager.deactivateModifier(name, event);
        dispatch('keyup', event);
      };
      window.addEventListener('keydown', keydown);
      window.addEventListener('keyup', keyup);
      this.#stateUnbind.push(() => window.removeEventListener('keydown', keydown));
      this.#stateUnbind.push(() => window.removeEventListener('keyup', keyup));
    }
  }

  #unbindStateEvents(): void {
    for (const unbind of this.#stateUnbind.splice(0)) unbind();
  }

  #refreshManagedScene(
    reindex: boolean,
    refreshAssets = true,
    refreshOrientation = true,
    componentTypes: readonly string[] | null = null,
    restartAnimations = false,
  ): void {
    this.#queueManagedSceneRefresh(
      reindex,
      refreshAssets,
      refreshOrientation,
      componentTypes,
      restartAnimations,
    );
    // Canvas-event paths are observable immediately after update/undo/redo.
    // Keep their bindings synchronous without paying a full-scene reindex for
    // update bursts that have no registered canvas events.
    if (Object.keys(this.event.getAll()).length > 0) {
      this.#flushPendingManagedSceneReindex();
      this.event.refresh();
    }
  }

  #queueManagedSceneRefresh(
    reindex: boolean,
    refreshAssets: boolean,
    refreshOrientation: boolean,
    componentTypes: readonly string[] | null = null,
    restartAnimations = false,
  ): void {
    if (!this.#managedScene) return;
    const pending = this.#pendingManagedSceneRefresh;
    if (!pending) {
      this.#pendingManagedSceneRefresh = {
        reindex,
        assets: refreshAssets,
        orientation: refreshOrientation,
        componentTypes: componentTypes ? new Set(componentTypes) : null,
        restartAnimations,
      };
    } else {
      pending.reindex ||= reindex;
      pending.assets ||= refreshAssets;
      pending.orientation ||= refreshOrientation;
      pending.restartAnimations ||= restartAnimations;
      if (pending.componentTypes && componentTypes) {
        for (const type of componentTypes) pending.componentTypes.add(type);
      } else {
        pending.componentTypes = null;
      }
    }

    if (
      this.#managedSceneRefreshFrame === null &&
      typeof requestAnimationFrame !== 'undefined'
    ) {
      this.#managedSceneRefreshFrame = requestAnimationFrame(() => {
        this.#managedSceneRefreshFrame = null;
        this.#flushManagedSceneRefresh();
      });
    }
  }

  #flushManagedSceneRefresh(): void {
    const pending = this.#pendingManagedSceneRefresh;
    const scene = this.#managedScene;
    const renderLayer = this.#renderLayer;
    if (!pending || !scene || !renderLayer) return;

    this.#pendingManagedSceneRefresh = null;
    this.#cancelManagedSceneRefreshFrame();
    if (pending.reindex) {
      reindexManagedScene(scene);
    }
    if (pending.assets) this.#applyLoadedAssetBounds();
    if (pending.orientation) {
      applyContentOrientation(scene, this.rotation.value, {
        x: this.flip.x,
        y: this.flip.y,
      });
    }
    const componentTypes = pending.componentTypes
      ? [...pending.componentTypes]
      : null;
    renderLayer.renderScene(
      scene.roots,
      componentTypes || pending.restartAnimations
        ? {
          ...(componentTypes ? { componentTypes } : {}),
          ...(pending.restartAnimations ? { restartAnimations: true } : {}),
        }
        : undefined,
    );
    if (!pending.assets) return;

    const version = this.#drawVersion;
    void this.#sceneAssets.refresh(
      scene.all.map((node) => node.props),
      () => {
        if (!this.isInit || version !== this.#drawVersion) return;
        this.#applyLoadedAssetBounds();
        this.#queueManagedSceneRefresh(false, false, false);
      },
    );
  }

  #flushPendingManagedSceneReindex(): void {
    const pending = this.#pendingManagedSceneRefresh;
    const scene = this.#managedScene;
    if (!pending?.reindex || !scene) return;

    pending.reindex = false;
    reindexManagedScene(scene);
  }

  #cancelManagedSceneRefreshFrame(): void {
    if (this.#managedSceneRefreshFrame === null) return;
    if (typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.#managedSceneRefreshFrame);
    }
    this.#managedSceneRefreshFrame = null;
  }

  #clearPendingManagedSceneRefresh(): void {
    this.#pendingManagedSceneRefresh = null;
    this.#cancelManagedSceneRefreshFrame();
  }

  #applyLoadedAssetBounds(): void {
    if (!this.#managedScene) return;
    for (const node of this.#managedScene.all) {
      if (node.type !== 'image') continue;
      const props = node.props as unknown as Record<string, unknown>;
      if (props.size !== undefined) continue;
      const texture = getCachedSceneTexture(props.source);
      if (texture && texture.width > 0 && texture.height > 0) {
        node.setLocalBounds({ width: texture.width, height: texture.height });
      } else {
        const builtIn = props.source === 'device' || props.source === 'loading';
        node.setLocalBounds({
          width: builtIn ? 72 : 1,
          height: builtIn ? 72 : 1,
        });
      }
    }
  }

  #bindTransformer(transformer: Transformer): void {
    const onTransform = (payload: TransformerGesturePayload): void => {
      if (payload.phase === 'start') {
        this.#transformBefore = captureManagedTransforms(payload.elements);
        return;
      }

      this.#refreshManagedScene(false, false);
      if (payload.phase !== 'end') return;
      const before = this.#transformBefore;
      this.#transformBefore = null;
      if (!before || payload.historyId === undefined) return;
      const after = captureManagedTransforms(payload.elements);
      if (sameManagedTransforms(before, after)) return;
      void this.undoRedoManager.execute(
        new AppliedTransformCommand(
          payload.historyId,
          before,
          after,
          () => this.#refreshManagedScene(false, false),
        ),
        { historyId: payload.historyId },
      );
    };
    transformer.on('transform', onTransform);
    this.#transformerUnbind = () => transformer.off('transform', onTransform);
  }

  #unbindTransformer(): void {
    this.#transformerUnbind?.();
    this.#transformerUnbind = null;
    this.#transformBefore = null;
  }

  #destroyApplication(app: Application): void {
    try {
      app.destroy({ removeView: true }, { children: true });
    } catch {
      // The renderer may be only partially initialized.
    }
  }

  async #clearAssets(): Promise<void> {
    await Promise.allSettled([
      this.#assets.clear(),
      this.#sceneAssets.clear(),
    ]);
  }
}
