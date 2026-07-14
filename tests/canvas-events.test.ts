import { Container } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';

import { CanvasEventManager } from '../src/canvas-events';

const emit = (target: Container, action: string, event: unknown): void => {
  const boundEmit = target.emit.bind(target) as (
    eventName: string,
    payload: unknown,
  ) => unknown;
  boundEmit(action, event);
};

describe('CanvasEventManager', () => {
  it('registers whitespace-separated actions and exposes the public option record', () => {
    const target = new Container();
    const fn = vi.fn();
    const manager = new CanvasEventManager((path) => path === '$' ? [target] : []);
    const id = manager.add({ path: '$', action: 'click  tap click', fn });

    expect(id).toMatch(/^[0-9A-Z_a-z-]{15}$/);
    expect(manager.get(id)).toEqual({
      path: '$',
      action: 'click  tap click',
      fn,
    });
    expect(Object.keys(manager.getAll())).toEqual([id]);
    emit(target, 'click', { kind: 'click' });
    emit(target, 'tap', { kind: 'tap' });
    expect(fn).toHaveBeenCalledTimes(2);

    manager.destroy();
    target.destroy();
  });

  it('toggles multiple IDs and restores target event modes after detaching', () => {
    const target = new Container();
    target.eventMode = 'passive';
    const first = vi.fn();
    const second = vi.fn();
    const manager = new CanvasEventManager(() => [target]);
    manager.add({ id: 'first', path: '$', action: 'click', fn: first });
    manager.add({ id: 'second', path: '$', action: 'click', fn: second });

    expect(target.eventMode).toBe('static');
    manager.off('first second');
    expect(target.eventMode).toBe('passive');
    emit(target, 'click', {});
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();

    manager.on('first second');
    emit(target, 'click', {});
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    manager.removeAll();
    expect(Object.keys(manager.getAll())).toEqual([]);
    expect(target.eventMode).toBe('passive');
    target.destroy();
  });

  it('replaces an existing ID without retaining the previous callback', () => {
    const target = new Container();
    const previous = vi.fn();
    const next = vi.fn();
    const manager = new CanvasEventManager(() => [target]);
    manager.add({ id: 'same', path: '$', action: 'click', fn: previous });
    manager.add({ id: 'same', path: '$', action: 'click', fn: next });

    emit(target, 'click', {});
    expect(previous).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect(Object.keys(manager.getAll())).toEqual(['same']);
    expect(manager.remove('missing same')).toBeUndefined();
    expect(manager.remove('same')).toBeUndefined();
    target.destroy();
  });

  it('preserves length as an ordinary explicit event ID', () => {
    const target = new Container();
    const fn = vi.fn();
    const manager = new CanvasEventManager(() => [target]);

    manager.add({ id: 'length', path: '$', action: 'click', fn });

    expect(manager.getAll().length).toEqual({ path: '$', action: 'click', fn });
    manager.destroy();
    target.destroy();
  });

  it('rebinds enabled paths after a structural scene replacement', () => {
    const first = new Container();
    const second = new Container();
    let current = first;
    const fn = vi.fn();
    const manager = new CanvasEventManager(() => [current]);
    manager.add({ id: 'stable-path', path: '$..target', action: 'click', fn });

    emit(first, 'click', { phase: 'before' });
    current = second;
    manager.refresh();
    emit(first, 'click', { phase: 'stale' });
    emit(second, 'click', { phase: 'after' });

    expect(fn.mock.calls).toEqual([
      [{ phase: 'before' }],
      [{ phase: 'after' }],
    ]);
    manager.destroy();
    first.destroy();
    second.destroy();
  });

  it('rejects incomplete registrations', () => {
    const manager = new CanvasEventManager(() => []);
    expect(() => manager.add({ path: '', action: 'click', fn: () => undefined })).toThrow(
      TypeError,
    );
    expect(() => manager.add({ path: '$', action: ' ', fn: () => undefined })).toThrow(
      TypeError,
    );
  });
});
