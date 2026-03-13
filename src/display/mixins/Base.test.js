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
