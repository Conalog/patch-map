import { describe, expect, it, vi } from 'vitest';
import Element from '../elements/Element';
import { Rect } from '../elements/Rect';
import { Lockedable } from './Lockedable';

class TestBase {
  static registerHandler() {}

  constructor(options = {}) {
    Object.assign(this, options);
  }
}

class StaticLockedElement extends Lockedable(TestBase) {}

describe('Lockedable', () => {
  it('should restore the default unlocked event mode when interaction is re-enabled', () => {
    const instance = new StaticLockedElement();

    instance._applyLocked({ locked: true });
    instance._applyLocked({ locked: false });

    expect(instance.eventMode).toBe('static');
  });

  it('should emit object_transformed when lock state changes', () => {
    const emit = vi.fn();
    const instance = new StaticLockedElement({
      store: { viewport: { emit } },
    });

    instance._applyLocked({ locked: true });

    expect(emit).toHaveBeenCalledWith('object_transformed', instance);
  });

  it('should not require production elements to declare an unlocked event mode', () => {
    expect(Object.hasOwn(Element, 'unlockedEventMode')).toBe(false);
    expect(Object.hasOwn(Rect, 'unlockedEventMode')).toBe(false);
  });
});
