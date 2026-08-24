import { afterEach, describe, expect, it } from 'vitest';
import type { Application } from 'pixi.js';

import {
  pixiDevtoolsOwnsApplication,
  registerPixiDevtools,
  unregisterPixiDevtools,
} from '../../src/patch-map/renderers/pixi-devtools-registration';

type DevtoolsRoot = typeof globalThis & {
  __PIXI_DEVTOOLS__?: Readonly<{ readonly app: Application }>;
};

const root = globalThis as DevtoolsRoot;
const originalDescriptor = Object.getOwnPropertyDescriptor(root, '__PIXI_DEVTOOLS__');
const activeTokens = new Set<object>();

afterEach(() => {
  for (const token of activeTokens) unregisterPixiDevtools(token);
  activeTokens.clear();
  if (originalDescriptor === undefined) {
    Reflect.deleteProperty(root, '__PIXI_DEVTOOLS__');
  } else {
    Object.defineProperty(root, '__PIXI_DEVTOOLS__', originalDescriptor);
  }
});

describe('Pixi DevTools registration', () => {
  it('restores a previous host handle after the final registration leaves', () => {
    const previous = Object.freeze({ app: application('previous') });
    root.__PIXI_DEVTOOLS__ = previous;
    const token = register(application('current'));

    expect(root.__PIXI_DEVTOOLS__).not.toBe(previous);
    unregister(token);
    expect(root.__PIXI_DEVTOOLS__).toBe(previous);
  });

  it('reveals the prior live registration and ignores unknown tokens', () => {
    Reflect.deleteProperty(root, '__PIXI_DEVTOOLS__');
    const firstApplication = application('first');
    const secondApplication = application('second');
    const first = register(firstApplication);
    const second = register(secondApplication);

    expect(pixiDevtoolsOwnsApplication(secondApplication)).toBe(true);
    unregisterPixiDevtools(Object.freeze({}));
    expect(pixiDevtoolsOwnsApplication(secondApplication)).toBe(true);

    unregister(second);
    expect(pixiDevtoolsOwnsApplication(firstApplication)).toBe(true);
    unregister(first);
    expect(Object.prototype.hasOwnProperty.call(root, '__PIXI_DEVTOOLS__')).toBe(false);
  });
});

function register(value: Application): object {
  const token = Object.freeze({});
  activeTokens.add(token);
  registerPixiDevtools(token, value);
  return token;
}

function unregister(token: object): void {
  unregisterPixiDevtools(token);
  activeTokens.delete(token);
}

function application(label: string): Application {
  return Object.freeze({ label }) as unknown as Application;
}
