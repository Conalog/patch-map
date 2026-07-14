import type { Application } from 'pixi.js';

type PixiStage = Application['stage'];
type PixiRenderer = Application['renderer'];

type PixiDevtoolsRegistration =
  | { app: Application; stage?: never; renderer?: never }
  | { app?: never; stage: PixiStage; renderer: PixiRenderer };

declare global {
  interface Window {
    __PIXI_DEVTOOLS__?: PixiDevtoolsRegistration;
    __PIXI_APP__?: Application;
    __PIXI_STAGE__?: PixiStage;
    __PIXI_RENDERER__?: PixiRenderer;
  }
}

interface PublishedPixiApplication {
  readonly app: Application;
  readonly stage: PixiStage;
  readonly renderer: PixiRenderer;
}

const registrationMatches = (
  registration: PixiDevtoolsRegistration | undefined,
  target: PublishedPixiApplication,
): boolean => registration?.app === target.app ||
  (registration?.stage === target.stage && registration.renderer === target.renderer);

export class PixiDevtoolsBridge {
  #published: PublishedPixiApplication | null = null;

  public publish(app: Application): void {
    this.clear();
    const target: PublishedPixiApplication = {
      app,
      stage: app.stage,
      renderer: app.renderer,
    };
    window.__PIXI_DEVTOOLS__ = { app };
    window.__PIXI_APP__ = app;
    window.__PIXI_STAGE__ = target.stage;
    window.__PIXI_RENDERER__ = target.renderer;
    this.#published = target;
  }

  public clear(): void {
    const target = this.#published;
    if (!target) return;
    if (registrationMatches(window.__PIXI_DEVTOOLS__, target)) delete window.__PIXI_DEVTOOLS__;
    if (window.__PIXI_APP__ === target.app) delete window.__PIXI_APP__;
    if (window.__PIXI_STAGE__ === target.stage) delete window.__PIXI_STAGE__;
    if (window.__PIXI_RENDERER__ === target.renderer) delete window.__PIXI_RENDERER__;
    this.#published = null;
  }

}
