import {
  Container,
  Graphics,
  Point,
  Rectangle,
  type FederatedPointerEvent,
} from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';

import { Transformer, type TransformerOptions } from '../src';
import type { RectElementData } from '../src/contracts';
import { materializeElement } from '../src/model/materialize';
import { ManagedNode, type ManagedNodeProps } from '../src/scene/managed-node';

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

const resizeHandleLabels = {
  nw: 'resize-handle:top-left',
  n: 'resize-edge:top',
  ne: 'resize-handle:top-right',
  e: 'resize-edge:right',
  se: 'resize-handle:bottom-right',
  s: 'resize-edge:bottom',
  sw: 'resize-handle:bottom-left',
  w: 'resize-edge:left',
} as const;

const rotateHandleLabels = {
  nw: 'rotate-handle:top-left',
  ne: 'rotate-handle:top-right',
  se: 'rotate-handle:bottom-right',
  sw: 'rotate-handle:bottom-left',
} as const;

const emitDown = (
  transformer: Transformer,
  target: Container,
  shiftKey = false,
): Point => {
  const global = transformer.toGlobal(target.position);
  transformer.emit(
    'pointerdown',
    pointerEvent(global, shiftKey, target, 'pointerdown'),
  );
  return global;
};

const pointerEvent = (
  global: Point,
  shiftKey = false,
  target?: Container,
  type = 'pointermove',
): FederatedPointerEvent =>
  ({ global, shiftKey, target, type, pointerType: 'mouse' }) as unknown as FederatedPointerEvent;

const emitMove = (
  transformer: Transformer,
  target: Container,
  global: Point,
  shiftKey = false,
): void => {
  transformer.emit(
    'globalpointermove',
    pointerEvent(global, shiftKey, target),
  );
};

const emitUp = (transformer: Transformer, target: Container): void => {
  transformer.emit(
    'pointerup',
    pointerEvent(transformer.toGlobal(target.position), false, target, 'pointerup'),
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

    expect(handle(transformer, 'Graphics').visible).toBe(false);
    expect(handle(transformer, 'resize-frame').visible).toBe(false);
    expect(handle(transformer, resizeHandleLabels.se).visible).toBe(false);
    expect(handle(transformer, rotateHandleLabels.se).visible).toBe(false);

    transformer.destroy();
  });

  it('applies every documented bounds display mode', () => {
    const expected = {
      all: true,
      groupOnly: true,
      elementOnly: true,
      none: false,
    } as const;

    for (const [boundsDisplayMode, visible] of Object.entries(expected)) {
      const element = createElement();
      const { root, transformer } = setup([element], {
        boundsDisplayMode: boundsDisplayMode as keyof typeof expected,
      });
      expect(handle(transformer, 'Graphics').visible).toBe(visible);

      root.destroy({ children: true });
    }
  });

  it('uses an oriented frame for one rotated element and an axis-aligned group frame for multiple elements', () => {
    const rotated = createElement('rect', { angle: 30 });
    const { root, transformer } = setup([rotated], { resizeHandles: true });
    const northwest = handle(transformer, resizeHandleLabels.nw);
    const northeast = handle(transformer, resizeHandleLabels.ne);

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

  it('creates visible resize and outside-corner rotation handles', () => {
    const element = createElement();
    const { root, transformer } = setup([element], {
      resizeHandles: true,
      rotateHandles: true,
    });
    const resize = handle(transformer, resizeHandleLabels.ne);
    const rotate = handle(transformer, rotateHandleLabels.ne);
    const center = new Point(
      (handle(transformer, resizeHandleLabels.nw).x
        + handle(transformer, resizeHandleLabels.se).x) / 2,
      (handle(transformer, resizeHandleLabels.nw).y
        + handle(transformer, resizeHandleLabels.se).y) / 2,
    );

    expect(resize).toBeInstanceOf(Graphics);
    expect(resize.visible).toBe(true);
    expect(rotate).toBeInstanceOf(Graphics);
    expect(rotate.visible).toBe(true);
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
      const resize = handle(transformer, resizeHandleLabels[name]);
      const start = emitDown(transformer, resize);

      emitMove(
        transformer,
        resize,
        new Point(start.x + deltaX, start.y + deltaY),
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
      const resize = handle(transformer, resizeHandleLabels.se);
      const events: GestureEvent[] = [];
      transformer.on('transform', (event: GestureEvent) => events.push(event));
      const start = emitDown(transformer, resize);
      emitMove(
        transformer,
        resize,
        new Point(start.x + 20, start.y + 10),
      );
      transformer.emit(endEvent, pointerEvent(start, false, resize, endEvent));
      transformer.emit(
        'pointerup',
        pointerEvent(start, false, resize, 'pointerup'),
      );

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
    const southeast = handle(transformer, resizeHandleLabels.se);
    const events: GestureEvent[] = [];
    transformer.on('transform', (event: GestureEvent) => events.push(event));
    const start = emitDown(transformer, southeast);

    emitMove(
      transformer,
      southeast,
      new Point(start.x + 100, start.y + 50),
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
    const southeast = handle(transformer, resizeHandleLabels.se);
    const start = emitDown(transformer, southeast);

    emitMove(
      transformer,
      southeast,
      new Point(start.x + 100, start.y + 10),
      true,
    );

    expect(element.scale.x).toBeCloseTo(1.2, 8);
    expect(element.scale.y).toBeCloseTo(1.2, 8);

    emitUp(transformer, southeast);
    root.destroy({ children: true });
  });

  it('materializes semantic size while preserving the TRN-101 rotated anchor', () => {
    const callback = vi.fn<(context: ResizeRatioContext) => boolean>(() => true);
    const managed = new ManagedNode(
      materializeElement({
        type: 'rect',
        id: 'trn-a',
        size: { width: 60, height: 40 },
        attrs: { x: 80, y: 80, angle: 15 },
      } satisfies RectElementData) as ManagedNodeProps,
    );
    managed.setLocalBounds({ width: 60, height: 40 });
    const element = managed as unknown as TestElement;
    const { root, transformer } = setup([element], {
      resizeHandles: true,
      getResizeKeepRatio: callback,
    });
    const northwest = handle(transformer, resizeHandleLabels.nw);
    const start = emitDown(transformer, northwest);

    emitMove(
      transformer,
      northwest,
      new Point(start.x + 18, start.y + 12),
    );
    emitUp(transformer, northwest);

    expect(element.props.size).toEqual({ width: 50, height: 34 });
    expect(element.scale).toMatchObject({ x: 1, y: 1 });
    expect(recordAttrs(element).x).toBeCloseTo(88.25, 12);
    expect(recordAttrs(element).y).toBeCloseTo(89.38749537379655, 12);
    expect(element.getLocalBounds()).toMatchObject({ width: 50, height: 34 });
    const bounds = element.getBounds();
    expect(bounds.x).toBeCloseTo(79.4502, 4);
    expect(bounds.y).toBeCloseTo(89.3875, 4);
    expect(bounds.width).toBeCloseTo(57.0961, 4);
    expect(bounds.height).toBeCloseTo(45.7824, 4);
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      handle: 'top-left',
      elements: [element],
    }));

    root.destroy({ children: true });
  });

  it('honors the dynamic ratio callback on each resize move', () => {
    const callback = vi.fn<(context: ResizeRatioContext) => boolean>(() => true);
    const element = createElement();
    const { root, transformer } = setup([element], {
      resizeHandles: true,
      getResizeKeepRatio: callback,
    });
    const southeast = handle(transformer, resizeHandleLabels.se);
    const start = emitDown(transformer, southeast);

    emitMove(
      transformer,
      southeast,
      new Point(start.x + 100, start.y + 10),
    );

    expect(element.scale.x).toBeCloseTo(1.2, 8);
    expect(element.scale.y).toBeCloseTo(1.2, 8);
    expect(callback).toHaveBeenCalledTimes(1);
    const context = callback.mock.calls[0]?.[0];
    expect(context?.event.shiftKey).toBe(false);
    expect(context?.handle).toBe('bottom-right');
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
    const southeast = handle(transformer, resizeHandleLabels.se);
    const start = emitDown(transformer, southeast);

    emitMove(
      transformer,
      southeast,
      new Point(start.x + 100, start.y + 50),
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
    const rotate = handle(transformer, rotateHandleLabels.ne);
    const northwest = handle(transformer, resizeHandleLabels.nw);
    const southeast = handle(transformer, resizeHandleLabels.se);
    const center = transformer.toGlobal(new Point(
      (northwest.x + southeast.x) / 2,
      (northwest.y + southeast.y) / 2,
    ));
    const start = emitDown(transformer, rotate);
    const moved = rotatePoint(start, center, 22 * Math.PI / 180);

    emitMove(transformer, rotate, moved, true);

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
    const rotate = handle(transformer, rotateHandleLabels.se);
    const northwest = handle(transformer, resizeHandleLabels.nw);
    const southeast = handle(transformer, resizeHandleLabels.se);
    const center = transformer.toGlobal(new Point(
      (northwest.x + southeast.x) / 2,
      (northwest.y + southeast.y) / 2,
    ));
    const events: GestureEvent[] = [];
    transformer.on('transform', (event: GestureEvent) => events.push(event));
    const start = emitDown(transformer, rotate);

    emitMove(
      transformer,
      rotate,
      rotatePoint(start, center, Math.PI / 2),
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
