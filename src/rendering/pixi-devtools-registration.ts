import type { Application } from 'pixi.js';

interface PixiDevtoolsHandle {
  readonly app: Application;
}

interface PixiDevtoolsRegistration {
  readonly token: object;
  readonly handle: PixiDevtoolsHandle;
}

type PixiDevtoolsGlobal = typeof globalThis & {
  __PIXI_DEVTOOLS__?: PixiDevtoolsHandle;
};

const REGISTRATIONS: PixiDevtoolsRegistration[] = [];
let previousHandle: PixiDevtoolsHandle | undefined;
let previousHandleWasPresent = false;

export function registerPixiDevtools(token: object, application: Application): void {
  const root = globalThis as PixiDevtoolsGlobal;
  if (REGISTRATIONS.length === 0) {
    previousHandleWasPresent = Object.hasOwn(
      root,
      '__PIXI_DEVTOOLS__',
    );
    previousHandle = root.__PIXI_DEVTOOLS__;
  }
  const registration = Object.freeze({
    token,
    handle: Object.freeze({ app: application }),
  });
  REGISTRATIONS.push(registration);
  root.__PIXI_DEVTOOLS__ = registration.handle;
}

export function unregisterPixiDevtools(token: object): void {
  const index = REGISTRATIONS.findIndex((entry) => entry.token === token);
  if (index < 0) return;
  const [registration] = REGISTRATIONS.splice(index, 1);
  const root = globalThis as PixiDevtoolsGlobal;
  if (root.__PIXI_DEVTOOLS__ !== registration?.handle) return;
  const next = REGISTRATIONS.at(-1);
  if (next) {
    root.__PIXI_DEVTOOLS__ = next.handle;
    return;
  }
  if (previousHandleWasPresent) {
    Reflect.set(root, '__PIXI_DEVTOOLS__', previousHandle);
  } else {
    Reflect.deleteProperty(root, '__PIXI_DEVTOOLS__');
  }
  previousHandle = undefined;
  previousHandleWasPresent = false;
}

export function pixiDevtoolsOwnsApplication(application: Application): boolean {
  return (globalThis as PixiDevtoolsGlobal).__PIXI_DEVTOOLS__?.app === application;
}
