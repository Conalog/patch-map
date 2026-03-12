import { describe, expect, it, vi } from 'vitest';
import { Lockedable } from './Lockedable';

class TestBase {
  static registerHandler() {}

  constructor(options = {}) {
    Object.assign(this, options);
  }
}

class PassiveLockedElement extends Lockedable(TestBase) {
  static unlockedEventMode = 'passive';
}

class StaticLockedElement extends Lockedable(TestBase) {}

describe('Lockedable', () => {
  it('should use the class-level unlocked event mode when restoring interaction', () => {
    const instance = new PassiveLockedElement();

    instance._applyLocked({ locked: true });
    instance._applyLocked({ locked: false });

    expect(instance.eventMode).toBe('passive');
  });

  it('should fall back to static when no class-level unlocked mode is provided', () => {
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
});
