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

  it('skips after-render work while object after-render is suspended', () => {
    const instance = new StaticBaseElement({
      type: 'rect',
      store: { viewport: { _suspendObjectAfterRender: true } },
    });
    instance._afterRender = vi.fn();

    instance.onRender();

    expect(instance._afterRender).not.toHaveBeenCalled();

    instance.store.viewport._suspendObjectAfterRender = false;
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

  it('validates merge changes as deep partial without requiring complete state', () => {
    const instance = new StaticBaseElement({ type: 'image' });
    const schema = z
      .object({
        type: z.literal('image'),
        size: z.object({ width: z.number(), height: z.number() }).optional(),
      })
      .strict();

    instance.apply({ size: { width: 64 } }, schema);

    expect(instance.props).toEqual({
      type: 'image',
      size: { width: 64 },
    });
  });

  it('still rejects invalid values in deep partial merge changes', () => {
    const instance = new StaticBaseElement({ type: 'image' });
    const schema = z
      .object({
        type: z.literal('image'),
        size: z.object({ width: z.number(), height: z.number() }).optional(),
      })
      .strict();

    expect(() => instance.apply({ size: { width: '64' } }, schema)).toThrow();
  });

  it('does not inject defaults omitted from merge changes', () => {
    const instance = new StaticBaseElement({ type: 'text' });
    const schema = z
      .object({
        type: z.literal('text'),
        text: z.string().default(''),
        style: z.object({ fontSize: z.number().default(16) }).prefault({}),
      })
      .strict();

    instance.apply({ text: 'updated' }, schema);

    expect(instance.props).toEqual({ type: 'text', text: 'updated' });
  });

  it('requires complete state for replace changes', () => {
    const instance = new StaticBaseElement({ type: 'rect' });
    const schema = z
      .object({
        type: z.literal('rect'),
        size: z.object({ width: z.number(), height: z.number() }),
      })
      .strict();

    expect(() =>
      instance.apply({ size: { width: 64 } }, schema, {
        mergeStrategy: 'replace',
      }),
    ).toThrow();
  });
});
