import { describe, expect, it, vi } from 'vitest';

import { PROPAGATE_EVENT, State, StateManager } from '../src/state';

class EmptyState extends State {}

describe('StateManager public lifecycle', () => {
  it('emits state lifecycle events and namespace wildcards', () => {
    const manager = new StateManager();
    manager.register('empty', EmptyState);
    const pushed = vi.fn();
    const popped = vi.fn();
    const set = vi.fn();
    const reset = vi.fn();
    const wildcard = vi.fn();
    manager.on('state:pushed', pushed);
    manager.on('state:popped', popped);
    manager.on('state:set', set);
    manager.on('state:reset', reset);
    manager.on('state:*', wildcard);

    manager.pushState('empty');
    manager.popState();
    manager.setState('empty');
    manager.resetState();

    expect(pushed).toHaveBeenCalledTimes(2);
    expect(popped).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(wildcard).toHaveBeenCalledTimes(5);
    manager.destroy();
  });

  it('tracks modifier activation without duplicate events', () => {
    const manager = new StateManager();
    const activated = vi.fn();
    const deactivated = vi.fn();
    const wildcard = vi.fn();
    manager.on('modifier:activated', activated);
    manager.on('modifier:deactivated', deactivated);
    manager.on('modifier:*', wildcard);

    expect(manager.activateModifier('shift', { key: 'Shift' })).toBe(true);
    expect(manager.activateModifier('shift')).toBe(false);
    expect(manager.isModifierActive('shift')).toBe(true);
    expect(manager.deactivateModifier('shift', { key: 'Shift' })).toBe(true);
    expect(manager.deactivateModifier('shift')).toBe(false);
    expect(manager.isModifierActive('shift')).toBe(false);
    expect(activated).toHaveBeenCalledTimes(1);
    expect(deactivated).toHaveBeenCalledTimes(1);
    expect(wildcard).toHaveBeenCalledTimes(2);
    manager.destroy();
  });

  it('returns PROPAGATE_EVENT when no registered state handles an event', () => {
    const manager = new StateManager();
    expect(manager.dispatch('missing', {})).toBe(PROPAGATE_EVENT);
    manager.destroy();
  });
});
