import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../selector/selector', () => {
  return { selector: vi.fn() };
});

import { selector } from '../selector/selector';
import {
  addEvent,
  offEvent,
  onEvent,
  removeAllEvent,
  removeEvent,
} from './canvas';

const createViewport = () => ({ events: {} });

const createListenerObject = () => ({
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});

beforeEach(() => {
  selector.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('canvas event utilities', () => {
  it('stores events with default path and inactive state', () => {
    const viewport = createViewport();
    const handler = vi.fn();

    const id = addEvent(viewport, {
      id: 'evt',
      action: 'click',
      fn: handler,
      options: { passive: true },
    });

    expect(id).toBe('evt');
    expect(viewport.events.evt).toMatchObject({
      path: '$',
      elements: null,
      action: 'click',
      fn: handler,
      options: { passive: true },
      active: false,
    });
  });

  it('stores elements without path when only elements are provided', () => {
    const viewport = createViewport();
    const object = createListenerObject();

    addEvent(viewport, {
      id: 'evt',
      elements: object,
      action: 'click',
      fn: vi.fn(),
      options: null,
    });

    expect(viewport.events.evt.path).toBeNull();
    expect(viewport.events.evt.elements).toEqual([object]);
  });

  it('attaches listeners to elements and selector results', () => {
    const viewport = createViewport();
    const elementObject = createListenerObject();
    const selectorObject = createListenerObject();

    selector.mockReturnValue([selectorObject]);

    addEvent(viewport, {
      id: 'evt',
      path: '$.children[*]',
      elements: [elementObject],
      action: 'click hover',
      fn: vi.fn(),
      options: { passive: true },
    });

    onEvent(viewport, 'evt');

    expect(selector).toHaveBeenCalledWith(viewport, '$.children[*]');
    expect(elementObject.addEventListener).toHaveBeenCalledTimes(2);
    expect(selectorObject.addEventListener).toHaveBeenCalledTimes(2);
    expect(viewport.events.evt.active).toBe(true);
  });

  it('skips selector when only elements are provided', () => {
    const viewport = createViewport();
    const elementObject = createListenerObject();

    addEvent(viewport, {
      id: 'evt',
      elements: [elementObject],
      action: 'click',
      fn: vi.fn(),
      options: null,
    });

    onEvent(viewport, 'evt');

    expect(selector).not.toHaveBeenCalled();
    expect(elementObject.addEventListener).toHaveBeenCalledTimes(1);
  });

  it('removes listeners when deactivating events', () => {
    const viewport = createViewport();
    const elementObject = createListenerObject();

    addEvent(viewport, {
      id: 'evt',
      elements: [elementObject],
      action: 'click hover',
      fn: vi.fn(),
      options: null,
    });

    onEvent(viewport, 'evt');
    offEvent(viewport, 'evt');
    offEvent(viewport, 'evt');

    expect(elementObject.removeEventListener).toHaveBeenCalledTimes(2);
    expect(viewport.events.evt.active).toBe(false);
  });

  it('removes events and detaches listeners', () => {
    const viewport = createViewport();
    const elementObject = createListenerObject();

    addEvent(viewport, {
      id: 'evt',
      elements: [elementObject],
      action: 'click',
      fn: vi.fn(),
      options: null,
    });

    onEvent(viewport, 'evt');
    removeEvent(viewport, 'evt');

    expect(viewport.events.evt).toBeUndefined();
    expect(elementObject.removeEventListener).toHaveBeenCalledTimes(1);
  });

  it('removes all events', () => {
    const viewport = createViewport();
    const objectA = createListenerObject();
    const objectB = createListenerObject();

    addEvent(viewport, {
      id: 'evt-a',
      elements: [objectA],
      action: 'click',
      fn: vi.fn(),
      options: null,
    });
    addEvent(viewport, {
      id: 'evt-b',
      elements: [objectB],
      action: 'hover',
      fn: vi.fn(),
      options: null,
    });

    onEvent(viewport, 'evt-a evt-b');
    removeAllEvent(viewport);

    expect(Object.keys(viewport.events)).toHaveLength(0);
    expect(objectA.removeEventListener).toHaveBeenCalledTimes(1);
    expect(objectB.removeEventListener).toHaveBeenCalledTimes(1);
  });

  it('warns when activating a missing event', () => {
    const viewport = createViewport();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    onEvent(viewport, 'missing');

    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
