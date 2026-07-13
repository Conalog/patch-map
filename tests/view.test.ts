import { Container } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { materializeMapData } from '../src/model/materialize';
import { buildManagedScene, type ManagedScene } from '../src/scene/build-scene';
import { materializeTheme } from '../src/theme';
import {
  fitScaleFor,
  measureViewTargets,
  normalizeFitPadding,
  resolveViewTargets,
} from '../src/view';

const identityViewport = {
  toWorld: (point: { x: number; y: number }) => ({ ...point }),
} as Pick<Viewport, 'toWorld'>;

describe('view target resolution and fitting', () => {
  let scene: ManagedScene;
  let world: Container;

  beforeEach(() => {
    scene = buildManagedScene(
      materializeMapData([
        {
          type: 'group',
          id: 'group',
          attrs: { x: 10, y: 20 },
          children: [
            { type: 'rect', id: 'left', size: 20, attrs: { x: 0, y: 0 } },
            { type: 'rect', id: 'right', size: 10, attrs: { x: 40, y: 30 } },
          ],
        },
        { type: 'rect', id: 'standalone', size: 8, attrs: { x: 100, y: 5 } },
        {
          type: 'relations',
          id: 'links',
          links: [{ source: 'left', target: { id: 'standalone' } }],
        },
      ]),
      materializeTheme(),
    );
    world = new Container();
    world.addChild(...scene.roots);
  });

  afterEach(() => {
    world.destroy({ children: true });
  });

  it('uses non-relation top-level descendants by default', () => {
    expect(resolveViewTargets(scene, undefined).map(({ id }) => id)).toEqual([
      'left',
      'right',
      'standalone',
    ]);
  });

  it('prunes a filtered container together with its subtree', () => {
    expect(
      resolveViewTargets(scene, null, (node) => node.id !== 'group').map(({ id }) => id),
    ).toEqual(['standalone']);
  });

  it('expands an explicit relation to managed endpoint IDs without assuming link keys', () => {
    expect(resolveViewTargets(scene, 'links').map(({ id }) => id)).toEqual([
      'left',
      'standalone',
    ]);
  });

  it('measures the union of target bounds in viewport world coordinates', () => {
    const targets = resolveViewTargets(scene, ['left', 'right']);
    expect(measureViewTargets(targets, identityViewport)).toEqual({
      x: 10,
      y: 20,
      width: 50,
      height: 40,
    });
  });

  it('normalizes only the documented axis padding forms', () => {
    expect(normalizeFitPadding(undefined)).toEqual({ x: 16, y: 16 });
    expect(normalizeFitPadding(24)).toEqual({ x: 24, y: 24 });
    expect(normalizeFitPadding({ x: 5 })).toEqual({ x: 5, y: 16 });
    expect(normalizeFitPadding({ x: 5, y: 10 })).toEqual({ x: 5, y: 10 });
    expect(() => normalizeFitPadding({ top: 2 } as never)).toThrow(TypeError);
    expect(() => normalizeFitPadding(-1)).toThrow(TypeError);
  });

  it('computes a contain scale from screen space after padding', () => {
    expect(
      fitScaleFor(
        { x: 0, y: 0, width: 200, height: 100 },
        { width: 500, height: 300 },
        { x: 20, y: 10 },
      ),
    ).toBe(2.3);
    expect(
      fitScaleFor(
        { x: 0, y: 0, width: 0, height: 0 },
        { width: 500, height: 300 },
        { x: 20, y: 10 },
      ),
    ).toBeNull();
  });
});
