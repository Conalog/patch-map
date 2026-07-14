import { Container } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';

import { Transformer } from '../src';

type SelectionPayload = {
  current: Container[];
  added: Container[];
  removed: Container[];
};

const collectSelectionEvents = (transformer: Transformer): SelectionPayload[] => {
  const events: SelectionPayload[] = [];
  transformer.on('update_elements', (payload: unknown) => {
    events.push(payload as SelectionPayload);
  });
  return events;
};

describe('Transformer options', () => {
  it('materializes the documented defaults', () => {
    const transformer = new Transformer();

    expect(transformer.options).toEqual({
      wireframeStyle: { thickness: 1.5, color: '#1099FF' },
      boundsDisplayMode: 'all',
      resizeHandles: false,
      rotateHandles: false,
      transformHistory: false,
      resizeKeepRatio: false,
      getResizeKeepRatio: undefined,
    });
    expect(transformer).toMatchObject({
      wireframeStyle: { thickness: 1.5, color: '#1099FF' },
      boundsDisplayMode: 'all',
      resizeHandles: false,
      rotateHandles: false,
      transformHistory: false,
      resizeKeepRatio: false,
    });

    transformer.destroy();
  });

  it('accepts one initial element and preserves explicit option values', () => {
    const element = new Container();
    const getResizeKeepRatio = vi.fn(() => true);
    const transformer = new Transformer({
      elements: element,
      wireframeStyle: { color: '#FF00FF' },
      boundsDisplayMode: 'groupOnly',
      resizeHandles: true,
      rotateHandles: true,
      transformHistory: true,
      resizeKeepRatio: true,
      getResizeKeepRatio,
    });

    expect(transformer.elements).toEqual([element]);
    expect(transformer.options).toEqual({
      wireframeStyle: { thickness: 1.5, color: '#FF00FF' },
      boundsDisplayMode: 'groupOnly',
      resizeHandles: true,
      rotateHandles: true,
      transformHistory: true,
      resizeKeepRatio: true,
      getResizeKeepRatio,
    });

    transformer.destroy();
    element.destroy();
  });

  it('preserves ABI-101 constructor validation errors', () => {
    expect(() => new Transformer(null)).toThrow(
      expect.objectContaining({
        name: 'ZodValidationError',
        message: 'Validation error: Expected object, received null',
      }),
    );
    expect(() => new Transformer({ boundsDisplayMode: 'invalid-mode' } as never)).toThrow(
      expect.objectContaining({
        name: 'ZodValidationError',
        message:
          'Validation error: Invalid enum value. Expected \'all\' | \'groupOnly\' | \'elementOnly\' | \'none\', received \'invalid-mode\' at "boundsDisplayMode"',
      }),
    );
  });
});

describe('Transformer selection', () => {
  it('adds, removes, sets, and clears unique elements with ordered payloads', () => {
    const transformer = new Transformer();
    const first = new Container();
    const second = new Container();
    const third = new Container();
    const events = collectSelectionEvents(transformer);

    transformer.selection.add([first, first, second]);
    transformer.selection.add([first, second]);
    transformer.selection.remove([second, second]);
    transformer.selection.set([third, first, third]);
    transformer.selection.clear();
    transformer.selection.clear();

    expect(events).toEqual([
      {
        current: [first, second],
        added: [first, second],
        removed: [],
      },
      { current: [first], added: [], removed: [second] },
      { current: [third, first], added: [third], removed: [] },
      { current: [], added: [], removed: [third, first] },
    ]);
    expect(transformer.elements).toEqual([]);

    transformer.destroy();
    first.destroy();
    second.destroy();
    third.destroy();
  });

  it('returns snapshots that cannot mutate the managed selection', () => {
    const transformer = new Transformer();
    const first = new Container();
    const second = new Container();
    transformer.elements = [first];

    const snapshot = transformer.selection.elements as Container[];
    snapshot.push(second);

    expect(transformer.elements).toEqual([first]);

    transformer.destroy();
    first.destroy();
    second.destroy();
  });

  it('keeps locked and unsupported elements selected', () => {
    const locked = Object.assign(new Container(), {
      type: 'rect',
      props: { locked: true },
    });
    const unsupported = Object.assign(new Container(), {
      type: 'relations',
      props: { locked: false },
    });
    const transformer = new Transformer({ elements: [locked, unsupported] });

    expect(transformer.elements).toEqual([locked, unsupported]);

    transformer.destroy();
    locked.destroy();
    unsupported.destroy();
  });
});

describe('Transformer destruction', () => {
  it('clears selection, destroys children, emits destroyed once, and is idempotent', () => {
    const selected = new Container();
    const child = new Container();
    const transformer = new Transformer({ elements: selected });
    transformer.addChild(child);
    const destroyed = vi.fn();
    transformer.on('destroyed', destroyed);

    transformer.destroy();
    transformer.destroy();
    transformer.selection.add(selected);

    expect(transformer.destroyed).toBe(true);
    expect(child.destroyed).toBe(true);
    expect(transformer.elements).toEqual([]);
    expect(destroyed).toHaveBeenCalledTimes(1);

    selected.destroy();
  });
});
