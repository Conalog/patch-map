import {
  Container,
  Graphics,
  Point,
  Rectangle,
  type FederatedPointerEvent,
} from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';

import { Transformer, type TransformerOptions } from '../src';

type TestElement = Container & {
  type: string;
  props: Record<string, unknown>;
};

type GestureEvent = {
  kind: 'resize' | 'rotate';
  phase: 'start' | 'change' | 'end';
  historyId: string | undefined;
  keepRatio?: boolean;
};

type ResizeRatioContext = Parameters<
  NonNullable<TransformerOptions['getResizeKeepRatio']>
>[0];

const createElement = (
  type = 'rect',
  options: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    locked?: boolean;
    angle?: number;
    rotation?: number;
  } = {},
): TestElement => {
  const element = new Container({
    x: options.x ?? 0,
    y: options.y ?? 0,
    boundsArea: new Rectangle(
      0,
      0,
      options.width ?? 100,
      options.height ?? 50,
    ),
  }) as TestElement;
  element.type = type;
  const attrs: Record<string, number> = {
    x: options.x ?? 0,
    y: options.y ?? 0,
  };
  if (options.rotation !== undefined) {
    element.rotation = options.rotation;
    attrs.rotation = options.rotation;
  } else {
    element.angle = options.angle ?? 0;
    attrs.angle = options.angle ?? 0;
  }
  element.props = {
    id: `${type}-${options.x ?? 0}-${options.y ?? 0}`,
    type,
    locked: options.locked ?? false,
    attrs,
  };
  return element;
};

const setup = (
  elements: TestElement[],
  options: ConstructorParameters<typeof Transformer>[0] = {},
): { root: Container; transformer: Transformer } => {
  const root = new Container();
  const transformer = new Transformer({ ...options, elements });
  root.addChild(...elements, transformer);
  transformer.refresh();
  return { root, transformer };
};

const handle = (transformer: Transformer, label: string): Container => {
  const found = transformer.getChildByLabel(label, true);
  expect(found, label).toBeInstanceOf(Container);
  return found as Container;
};

const emitDown = (
  transformer: Transformer,
  target: Container,
  shiftKey = false,
): Point => {
  const global = transformer.toGlobal(target.position);
  target.emit('pointerdown', pointerEvent(global, shiftKey));
  return global;
};

const pointerEvent = (
  global: Point,
  shiftKey = false,
): FederatedPointerEvent =>
  ({ global, shiftKey }) as unknown as FederatedPointerEvent;

const emitUp = (transformer: Transformer, target: Container): void => {
  target.emit(
    'pointerup',
    pointerEvent(transformer.toGlobal(target.position)),
  );
};

const rotatePoint = (
  point: Point,
  center: Point,
  angle: number,
): Point => {
  const x = point.x - center.x;
  const y = point.y - center.y;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return new Point(
    center.x + x * cosine - y * sine,
    center.y + x * sine + y * cosine,
  );
};

describe('Transformer wireframes and handles', () => {
  it('keeps all visual and interaction affordances hidden without a selection', () => {
    const transformer = new Transformer({
      elements: [],
      resizeHandles: true,
      rotateHandles: true,
    });

    expect(
      handle(transformer, 'transformer:element-wireframes').visible,
    ).toBe(false);
    expect(handle(transformer, 'transformer:group-wireframe').visible).toBe(
      false,
    );
    expect(handle(transformer, 'transformer:resize:se').visible).toBe(false);
    expect(handle(transformer, 'transformer:rotate:se').visible).toBe(false);

    transformer.destroy();
  });

  it('applies every documented bounds display mode', () => {
    const expected = {
      all: [true, true],
      groupOnly: [false, true],
      elementOnly: [true, false],
      none: [false, false],
    } as const;

    for (const [boundsDisplayMode, visibility] of Object.entries(expected)) {
      const element = createElement();
      const { root, transformer } = setup([element], {
        boundsDisplayMode: boundsDisplayMode as keyof typeof expected,
      });
      const elementWireframes = handle(
        transformer,
        'transformer:element-wireframes',
      );
      const groupWireframe = handle(
        transformer,
        'transformer:group-wireframe',
      );

      expect([
        elementWireframes.visible,
        groupWireframe.visible,
      ]).toEqual(visibility);

      root.destroy({ children: true });
    }
  });

  it('uses an oriented frame for one rotated element and an axis-aligned group frame for multiple elements', () => {
    const rotated = createElement('rect', { angle: 30 });
    const { root, transformer } = setup([rotated], { resizeHandles: true });
    const northwest = handle(transformer, 'transformer:resize:nw');
    const northeast = handle(transformer, 'transformer:resize:ne');

    expect(
      Math.atan2(
        northeast.y - northwest.y,
        northeast.x - northwest.x,
      ) * 180 / Math.PI,
    ).toBeCloseTo(30, 6);

    const second = createElement('rect', { x: 200, y: 80 });
    root.addChildAt(second, 1);
    transformer.selection.add(second);
    transformer.refresh();

    expect(northwest.y).toBeCloseTo(northeast.y, 8);

    root.destroy({ children: true });
  });

  it('creates visible resize handles and invisible outside-corner rotation hit targets', () => {
    const element = createElement();
    const { root, transformer } = setup([element], {
      resizeHandles: true,
      rotateHandles: true,
    });
    const resize = handle(transformer, 'transformer:resize:ne');
    const rotate = handle(transformer, 'transformer:rotate:ne');
    const center = new Point(
      (handle(transformer, 'transformer:resize:nw').x
        + handle(transformer, 'transformer:resize:se').x) / 2,
      (handle(transformer, 'transformer:resize:nw').y
        + handle(transformer, 'transformer:resize:se').y) / 2,
    );

    expect(resize).toBeInstanceOf(Graphics);
    expect(resize.visible).toBe(true);
    expect(rotate.children).toHaveLength(0);
    expect(rotate.hitArea).toBeInstanceOf(Rectangle);
    expect(Math.hypot(rotate.x - center.x, rotate.y - center.y)).toBeGreaterThan(
      Math.hypot(resize.x - center.x, resize.y - center.y),
    );

    root.destroy({ children: true });
  });
});

describe('Transformer resize gestures', () => {
  it.each([
    ['nw', -20, -10, 1.2, 1.2],
    ['n', 0, -10, 1, 1.2],
    ['ne', 20, -10, 1.2, 1.2],
    ['e', 20, 0, 1.2, 1],
    ['se', 20, 10, 1.2, 1.2],
    ['s', 0, 10, 1, 1.2],
    ['sw', -20, 10, 1.2, 1.2],
    ['w', -20, 0, 1.2, 1],
  ] as const)(
    'resizes through the %s handle around its opposite edge',
    (name, deltaX, deltaY, expectedScaleX, expectedScaleY) => {
      const element = createElement();
      const { root, transformer } = setup([element], { resizeHandles: true });
      const resize = handle(transformer, `transformer:resize:${name}`);
      const start = emitDown(transformer, resize);

      resize.emit(
        'globalpointermove',
        pointerEvent(new Point(start.x + deltaX, start.y + deltaY)),
      );
      emitUp(transformer, resize);

      expect(Math.abs(element.scale.x)).toBeCloseTo(expectedScaleX, 8);
      expect(Math.abs(element.scale.y)).toBeCloseTo(expectedScaleY, 8);
      root.destroy({ children: true });
    },
  );

  it.each(['pointerupoutside', 'pointercancel'] as const)(
    'ends an active gesture once on %s',
    (endEvent) => {
      const element = createElement();
      const { root, transformer } = setup([element], {
        resizeHandles: true,
        transformHistory: true,
      });
      const resize = handle(transformer, 'transformer:resize:se');
      const events: GestureEvent[] = [];
      transformer.on('transform', (event: GestureEvent) => events.push(event));
      const start = emitDown(transformer, resize);
      resize.emit(
        'globalpointermove',
        pointerEvent(new Point(start.x + 20, start.y + 10)),
      );
      resize.emit(endEvent, pointerEvent(start));
      resize.emit('pointerup', pointerEvent(start));

      expect(events.map(({ phase }) => phase)).toEqual(['start', 'change', 'end']);
      expect(new Set(events.map(({ historyId }) => historyId)).size).toBe(1);
      root.destroy({ children: true });
    },
  );

  it('resizes around the opposite corner and emits one stable gesture history identity', () => {
    const element = createElement();
    const { root, transformer } = setup([element], {
      resizeHandles: true,
      transformHistory: true,
    });
    const southeast = handle(transformer, 'transformer:resize:se');
    const events: GestureEvent[] = [];
    transformer.on('transform', (event: GestureEvent) => events.push(event));
    const start = emitDown(transformer, southeast);

    southeast.emit(
      'globalpointermove',
      pointerEvent(new Point(start.x + 100, start.y + 50)),
    );
    emitUp(transformer, southeast);

    expect(element.scale.x).toBeCloseTo(2, 8);
    expect(element.scale.y).toBeCloseTo(2, 8);
    expect(element.position.x).toBeCloseTo(0, 8);
    expect(element.position.y).toBeCloseTo(0, 8);
    expect(events.map(({ phase }) => phase)).toEqual(['start', 'change', 'end']);
    expect(new Set(events.map(({ historyId }) => historyId)).size).toBe(1);
    expect(events[0]?.historyId).toMatch(/^transformer:resize:/);

    root.destroy({ children: true });
  });

  it('locks the ratio while Shift is held', () => {
    const element = createElement();
    const { root, transformer } = setup([element], { resizeHandles: true });
    const southeast = handle(transformer, 'transformer:resize:se');
    const start = emitDown(transformer, southeast);

    southeast.emit(
      'globalpointermove',
      pointerEvent(new Point(start.x + 100, start.y + 10), true),
    );

    expect(element.scale.x).toBeCloseTo(2, 8);
    expect(element.scale.y).toBeCloseTo(2, 8);

    emitUp(transformer, southeast);
    root.destroy({ children: true });
  });

  it('honors the dynamic ratio callback on each resize move', () => {
    const callback = vi.fn<(context: ResizeRatioContext) => boolean>(() => true);
    const element = createElement();
    const { root, transformer } = setup([element], {
      resizeHandles: true,
      getResizeKeepRatio: callback,
    });
    const southeast = handle(transformer, 'transformer:resize:se');
    const start = emitDown(transformer, southeast);

    southeast.emit(
      'globalpointermove',
      pointerEvent(new Point(start.x + 100, start.y + 10)),
    );

    expect(element.scale.x).toBeCloseTo(2, 8);
    expect(element.scale.y).toBeCloseTo(2, 8);
    expect(callback).toHaveBeenCalledTimes(1);
    const context = callback.mock.calls[0]?.[0];
    expect(context?.event.shiftKey).toBe(false);
    expect(context?.handle).toBe(southeast);
    expect(context?.elements).toEqual([element]);

    emitUp(transformer, southeast);
    root.destroy({ children: true });
  });

  it('keeps locked and unsupported members selected but does not resize them', () => {
    const eligible = createElement('rect');
    const locked = createElement('rect', { x: 150, locked: true });
    const unsupported = createElement('relations', { x: 300 });
    const { root, transformer } = setup([eligible, locked, unsupported], {
      resizeHandles: true,
    });
    const southeast = handle(transformer, 'transformer:resize:se');
    const start = emitDown(transformer, southeast);

    southeast.emit(
      'globalpointermove',
      pointerEvent(new Point(start.x + 100, start.y + 50)),
    );

    expect(transformer.elements).toEqual([eligible, locked, unsupported]);
    expect(eligible.scale.x).toBeGreaterThan(1);
    expect(locked.scale.x).toBe(1);
    expect(locked.position.x).toBe(150);
    expect(unsupported.scale.x).toBe(1);
    expect(unsupported.position.x).toBe(300);

    emitUp(transformer, southeast);
    root.destroy({ children: true });
  });
});

describe('Transformer rotation gestures', () => {
  it('rotates around the visible center and snaps Shift rotation to 15 degrees', () => {
    const element = createElement();
    const { root, transformer } = setup([element], { rotateHandles: true });
    const rotate = handle(transformer, 'transformer:rotate:ne');
    const northwest = handle(transformer, 'transformer:resize:nw');
    const southeast = handle(transformer, 'transformer:resize:se');
    const center = transformer.toGlobal(new Point(
      (northwest.x + southeast.x) / 2,
      (northwest.y + southeast.y) / 2,
    ));
    const start = emitDown(transformer, rotate);
    const moved = rotatePoint(start, center, 22 * Math.PI / 180);

    rotate.emit('globalpointermove', pointerEvent(moved, true));

    expect(element.angle).toBeCloseTo(15, 8);
    expect(recordAttrs(element).angle).toBeCloseTo(15, 8);

    emitUp(transformer, rotate);
    root.destroy({ children: true });
  });

  it('preserves the rotation attribute unit and skips locked or unsupported elements', () => {
    const eligible = createElement('rect', { rotation: 0 });
    const locked = createElement('image', { x: 150, locked: true });
    const unsupported = createElement('group', { x: 300 });
    const { root, transformer } = setup([eligible, locked, unsupported], {
      rotateHandles: true,
      transformHistory: true,
    });
    const rotate = handle(transformer, 'transformer:rotate:se');
    const northwest = handle(transformer, 'transformer:resize:nw');
    const southeast = handle(transformer, 'transformer:resize:se');
    const center = transformer.toGlobal(new Point(
      (northwest.x + southeast.x) / 2,
      (northwest.y + southeast.y) / 2,
    ));
    const events: GestureEvent[] = [];
    transformer.on('transform', (event: GestureEvent) => events.push(event));
    const start = emitDown(transformer, rotate);

    rotate.emit(
      'globalpointermove',
      pointerEvent(rotatePoint(start, center, Math.PI / 2)),
    );
    emitUp(transformer, rotate);

    expect(eligible.rotation).toBeCloseTo(Math.PI / 2, 8);
    expect(recordAttrs(eligible).rotation).toBeCloseTo(Math.PI / 2, 8);
    expect(Object.hasOwn(recordAttrs(eligible), 'angle')).toBe(false);
    expect(locked.rotation).toBe(0);
    expect(unsupported.rotation).toBe(0);
    expect(transformer.elements).toEqual([eligible, locked, unsupported]);
    expect(new Set(events.map(({ historyId }) => historyId)).size).toBe(1);
    expect(events[0]?.historyId).toMatch(/^transformer:rotate:/);

    root.destroy({ children: true });
  });
});

const recordAttrs = (element: TestElement): Record<string, number> =>
  element.props.attrs as Record<string, number>;
