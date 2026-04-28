import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { Margin } from '../data-schema/primitive-schema';
import { Base } from './Base';

class TestBase {
  constructor(options = {}) {
    Object.assign(this, options);
  }
}

class StaticBaseElement extends Base(TestBase) {}

describe('Base mixin', () => {
  it('emits object_transformed immediately when raw transform attrs change', () => {
    const emit = vi.fn();
    const updateLocalTransform = vi.fn();
    const instance = new StaticBaseElement({
      type: 'rect',
      store: { viewport: { emit } },
      position: { set: vi.fn() },
      updateLocalTransform,
      visible: true,
    });

    instance.apply(
      { type: 'rect', attrs: { x: 12, y: 24 } },
      z.object({
        type: z.literal('rect'),
        attrs: z.object({ x: z.number(), y: z.number() }),
      }),
    );

    expect(instance.position.set).toHaveBeenCalledWith(12, 24);
    expect(updateLocalTransform).toHaveBeenCalledOnce();
    expect(emit).toHaveBeenCalledWith('object_transformed', instance);
  });

  it('skips after-render work while the viewport is moving', () => {
    const instance = new StaticBaseElement({
      type: 'rect',
      store: { viewport: { moving: true } },
    });
    instance._afterRender = vi.fn();

    instance.onRender();

    expect(instance._afterRender).not.toHaveBeenCalled();

    instance.store.viewport.moving = false;
    instance.onRender();

    expect(instance._afterRender).toHaveBeenCalledOnce();
  });

  it('propagates normalized child changes back to the parent store', () => {
    const onChildUpdate = vi.fn();
    const instance = new StaticBaseElement({
      id: 'child-1',
      type: 'icon',
    });

    instance.parent = { _onChildUpdate: onChildUpdate };

    instance.apply(
      { margin: { top: 10, x: 5 } },
      z.object({
        type: z.literal('icon'),
        margin: Margin.optional(),
      }),
    );

    expect(onChildUpdate).toHaveBeenCalledWith(
      'child-1',
      { margin: { top: 10, right: 5, left: 5 } },
      'merge',
    );
  });
});
