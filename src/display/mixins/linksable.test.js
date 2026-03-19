import { describe, expect, it, vi } from 'vitest';
import { Linksable } from './linksable';

class TestBase {
  static registerHandler() {}

  constructor(options = {}) {
    Object.assign(this, options);
  }

  destroy() {}
}

class StaticLinksElement extends Linksable(TestBase) {}

describe('Linksable', () => {
  it('subscribes only to object_transformed viewport events', () => {
    const viewport = {
      on: vi.fn(),
      off: vi.fn(),
    };
    const instance = new StaticLinksElement({
      store: { viewport },
    });

    expect(viewport.on).toHaveBeenCalledWith(
      'object_transformed',
      instance._boundOnObjectTransformed,
    );
    expect(viewport.on).not.toHaveBeenCalledWith('moved', expect.any(Function));
    expect(viewport.on).not.toHaveBeenCalledWith(
      'zoomed',
      expect.any(Function),
    );

    instance.destroy();

    expect(viewport.off).toHaveBeenCalledWith(
      'object_transformed',
      instance._boundOnObjectTransformed,
    );
    expect(viewport.off).not.toHaveBeenCalledWith(
      'moved',
      expect.any(Function),
    );
    expect(viewport.off).not.toHaveBeenCalledWith(
      'zoomed',
      expect.any(Function),
    );
  });
});
