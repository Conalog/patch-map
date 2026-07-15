import { describe, expect, it } from 'vitest';

import {
  Canvas2DRenderer,
  NoopRenderer,
  RenderAlign,
  RenderFlags,
  RenderKind,
  type CanvasSurface,
  type RenderStoreView,
} from '../../src/core-v1/renderer';
import { DenseStore } from '../../src/core-v1/store';

interface ContextCall {
  readonly name: string;
  readonly args: readonly unknown[];
}

class FakeContext {
  public fillStyle: string | CanvasGradient | CanvasPattern = '#000';
  public strokeStyle: string | CanvasGradient | CanvasPattern = '#000';
  public globalAlpha = 1;
  public lineWidth = 1;
  public font = '';
  public textAlign: CanvasTextAlign = 'start';
  public textBaseline: CanvasTextBaseline = 'alphabetic';
  public readonly calls: ContextCall[] = [];

  public setTransform(...args: readonly unknown[]): void { this.record('setTransform', args); }
  public clearRect(...args: readonly unknown[]): void { this.record('clearRect', args); }
  public fillRect(...args: readonly unknown[]): void {
    this.record('fillRect', [...args, this.fillStyle, this.globalAlpha]);
  }
  public strokeRect(...args: readonly unknown[]): void { this.record('strokeRect', args); }
  public translate(...args: readonly unknown[]): void { this.record('translate', args); }
  public rotate(...args: readonly unknown[]): void { this.record('rotate', args); }
  public scale(...args: readonly unknown[]): void { this.record('scale', args); }
  public save(): void { this.record('save', []); }
  public restore(): void { this.record('restore', []); }
  public beginPath(): void { this.record('beginPath', []); }
  public closePath(): void { this.record('closePath', []); }
  public rect(...args: readonly unknown[]): void { this.record('rect', args); }
  public moveTo(...args: readonly unknown[]): void { this.record('moveTo', args); }
  public lineTo(...args: readonly unknown[]): void { this.record('lineTo', args); }
  public clip(): void { this.record('clip', []); }
  public drawImage(...args: readonly unknown[]): void { this.record('drawImage', args); }
  public quadraticCurveTo(...args: readonly unknown[]): void { this.record('quadraticCurveTo', args); }
  public fill(): void { this.record('fill', [this.fillStyle, this.globalAlpha]); }
  public stroke(): void {
    this.record('stroke', [this.strokeStyle, this.globalAlpha, this.lineWidth]);
  }
  public fillText(...args: readonly unknown[]): void {
    this.record('fillText', [...args, this.fillStyle, this.globalAlpha, this.font, this.textAlign]);
  }

  private record(name: string, args: readonly unknown[]): void {
    this.calls.push({ name, args });
  }
}

class FakeCanvas implements CanvasSurface {
  public width = 0;
  public height = 0;
  public readonly style = { width: '', height: '' };
  public readonly context = new FakeContext();
  public contextOptions: CanvasRenderingContext2DSettings | undefined;

  public getContext(
    contextId: '2d',
    options?: CanvasRenderingContext2DSettings,
  ): CanvasRenderingContext2D | null {
    expect(contextId).toBe('2d');
    this.contextOptions = options;
    return this.context as unknown as CanvasRenderingContext2D;
  }
}

describe('Canvas2DRenderer', () => {
  it('uses backing resolution, preserves deterministic order, and batches compatible rectangles', () => {
    const canvas = new FakeCanvas();
    const renderer = new Canvas2DRenderer(canvas, { width: 120, height: 80, pixelRatio: 2 });
    const store = createStore();

    expect(canvas.width).toBe(240);
    expect(canvas.height).toBe(160);
    expect(canvas.style).toEqual({ width: '120px', height: '80px' });
    expect(canvas.contextOptions).toEqual({ alpha: true, desynchronized: true });

    const report = renderer.flush(store);
    expect(report.rendered).toBe(true);
    expect(report.commandCount).toBeGreaterThan(8);
    expect(canvas.context.calls).toContainEqual({
      name: 'fillRect',
      args: [0, 0, 240, 160, 'rgb(16 32 48)', 1],
    });
    expect(canvas.context.calls).toContainEqual({
      name: 'setTransform',
      args: [2, 0, 0, 2, 0, 0],
    });

    const redFills = canvas.context.calls.filter(
      (call) => call.name === 'fill' && call.args[0] === 'rgb(255 0 0)',
    );
    expect(redFills).toHaveLength(1);
    const firstRects = canvas.context.calls
      .filter((call) => call.name === 'rect')
      .slice(0, 2)
      .map((call) => call.args[0]);
    expect(firstRects).toEqual([40, 10]);

    const callsAfterFirstFrame = canvas.context.calls.length;
    expect(renderer.flush(store)).toEqual({ rendered: false, commandCount: 0 });
    expect(canvas.context.calls).toHaveLength(callsAfterFirstFrame);

    expect(renderer.resize(120, 80, 2)).toBe(false);
    expect(renderer.resize(100, 60, 1)).toBe(true);
    expect(renderer.flush(store).rendered).toBe(true);
    expect(canvas.width).toBe(100);
    expect(canvas.height).toBe(60);
  });

  it('draws bars, text, image placeholders, relations, and selection without entity nodes', () => {
    const canvas = new FakeCanvas();
    const renderer = new Canvas2DRenderer(canvas, { width: 200, height: 120 });
    const store = createStore();

    const report = renderer.flush(store);
    expect(report.rendered).toBe(true);
    expect(canvas.context.calls).toContainEqual({
      name: 'fillText',
      args: ['alpha', 85, 8, 30, 'rgb(17 34 51)', 1, '600 10px Inter', 'center'],
    });
    expect(canvas.context.calls).toContainEqual({
      name: 'fillText',
      args: ['beta', 85, 20, 30, 'rgb(17 34 51)', 1, '600 10px Inter', 'center'],
    });

    const relationMove = canvas.context.calls.find(
      (call) => call.name === 'moveTo' && call.args[0] === 50 && call.args[1] === 15,
    );
    const relationLine = canvas.context.calls.find(
      (call) => call.name === 'lineTo' && call.args[0] === 20 && call.args[1] === 15,
    );
    expect(relationMove).toBeDefined();
    expect(relationLine).toBeDefined();

    const imageCrossSegments = canvas.context.calls.filter((call) => call.name === 'lineTo');
    expect(imageCrossSegments.length).toBeGreaterThanOrEqual(3);
    expect(canvas.context.calls).toContainEqual({
      name: 'fill',
      args: ['rgba(0 204 102 / 0.502)', 1],
    });
    expect(canvas.context.calls).toContainEqual({
      name: 'stroke',
      args: ['rgb(245 158 11)', 1, 2],
    });
  });

  it('draws caller-registered decoded images and invalidates presentation state', () => {
    const canvas = new FakeCanvas();
    const renderer = new Canvas2DRenderer(canvas, { width: 200, height: 120 });
    const store = createStore();
    const image = { width: 48, height: 24 } as unknown as CanvasImageSource;

    expect(renderer.registerImage('/asset.png', image)).toBe(true);
    expect(renderer.registerImage('/asset.png', image)).toBe(false);
    renderer.flush(store);
    expect(canvas.context.calls).toContainEqual({
      name: 'drawImage',
      args: [image, 110, 16, 24, 12],
    });

    expect(renderer.unregisterImage('/asset.png')).toBe(true);
    expect(renderer.unregisterImage('/asset.png')).toBe(false);
    expect(renderer.flush(store).rendered).toBe(true);
  });

  it('publishes view changes, redraws on revision changes, and rejects invalid viewport state', () => {
    const canvas = new FakeCanvas();
    const renderer = new Canvas2DRenderer(canvas, { width: 100, height: 100 });
    const store = createStore({ view: { x: 5, y: 6, scale: 1.5, rotation: 45 } });

    expect(renderer.setView(store.view)).toBe(true);
    expect(renderer.setView(store.view)).toBe(false);
    renderer.flush(store);
    expect(canvas.context.calls).toContainEqual({ name: 'translate', args: [5, 6] });
    expect(canvas.context.calls).toContainEqual({ name: 'rotate', args: [Math.PI / 4] });
    expect(canvas.context.calls).toContainEqual({ name: 'scale', args: [1.5, 1.5] });

    const revised = { ...store, revision: store.revision + 1 } satisfies RenderStoreView;
    expect(renderer.flush(revised).rendered).toBe(true);
    expect(() => renderer.resize(-1, 10)).toThrow(RangeError);
    expect(() => renderer.setView({ x: 0, y: 0, scale: 0 })).toThrow(RangeError);
  });

  it('clears retained resources on idempotent destroy and rejects stale use', () => {
    const canvas = new FakeCanvas();
    const renderer = new Canvas2DRenderer(canvas, { width: 40, height: 30 });
    renderer.flush(createStore());

    expect(renderer.destroy()).toBe(true);
    expect(renderer.destroy()).toBe(false);
    expect(renderer.destroyed).toBe(true);
    expect(renderer.width).toBe(0);
    expect(canvas.context.calls.at(-1)).toEqual({ name: 'clearRect', args: [0, 0, 40, 30] });
    expect(() => renderer.flush(createStore())).toThrow('Renderer is destroyed');
    expect(() => renderer.resize(10, 10)).toThrow('Renderer is destroyed');
  });

  it('fails construction when Canvas2D is unavailable', () => {
    const canvas: CanvasSurface = {
      width: 10,
      height: 10,
      getContext: () => null,
    };
    expect(() => new Canvas2DRenderer(canvas)).toThrow('Canvas2D is unavailable');
  });

  it('consumes DenseStore directly through the narrow structural view', () => {
    const denseStore: RenderStoreView = new DenseStore(1);
    const renderer = new Canvas2DRenderer(new FakeCanvas(), { width: 10, height: 10 });
    expect(renderer.flush(denseStore)).toEqual({ rendered: true, commandCount: 2 });
  });
});

describe('NoopRenderer', () => {
  it('provides a lifecycle-safe headless flush boundary', () => {
    const renderer = new NoopRenderer();
    expect(renderer.resize(320, 180, 2)).toBe(true);
    expect(renderer.resize(320, 180, 2)).toBe(false);
    expect(renderer.setView({ x: 0, y: 0, scale: 1 })).toBe(false);
    expect(renderer.flush(createStore())).toEqual({ rendered: false, commandCount: 0 });
    expect(renderer.destroy()).toBe(true);
    expect(renderer.destroy()).toBe(false);
    expect(() => renderer.flush(createStore())).toThrow('Renderer is destroyed');
  });
});

function createStore(overrides: Partial<Pick<RenderStoreView, 'revision' | 'view'>> = {}): RenderStoreView {
  const capacity = 6;
  const alive = Uint8Array.from([1, 1, 1, 1, 1, 1]);
  const kind = Uint8Array.from([
    RenderKind.Rect,
    RenderKind.Rect,
    RenderKind.Bar,
    RenderKind.Text,
    RenderKind.Image,
    RenderKind.Relation,
  ]);
  const flags = Uint8Array.from([
    RenderFlags.Visible | RenderFlags.Selected,
    RenderFlags.Visible,
    RenderFlags.Visible,
    RenderFlags.Visible,
    RenderFlags.Visible,
    RenderFlags.Visible,
  ]);
  const zeros = (): Float64Array => new Float64Array(capacity);

  return {
    capacity,
    liveCount: capacity,
    revision: overrides.revision ?? 1,
    alive,
    kind,
    flags,
    zIndex: Int32Array.from([0, 0, 1, 2, 3, 4]),
    x: Float32Array.from([10, 40, 10, 70, 110, 0]),
    y: Float32Array.from([10, 10, 40, 8, 10, 0]),
    width: Float32Array.from([20, 20, 50, 30, 24, 0]),
    height: Float32Array.from([10, 10, 10, 30, 24, 0]),
    rotation: zeros(),
    opacity: Float32Array.from([1, 1, 1, 1, 1, 1]),
    fill: Uint32Array.from([0xff0000ff, 0xff0000ff, 0x00cc6680, 0, 0, 0]),
    stroke: new Uint32Array(capacity),
    strokeWidth: zeros(),
    radius: Float32Array.from([0, 0, 2, 0, 0, 0]),
    text: ['', '', '', 'alpha\nbeta', '', ''],
    color: Uint32Array.from([0, 0, 0, 0x112233ff, 0, 0x334455ff]),
    fontSize: Float32Array.from([0, 0, 0, 10, 0, 0]),
    fontFamily: ['', '', '', 'Inter', '', ''],
    fontWeight: Uint16Array.from([0, 0, 0, 600, 0, 0]),
    align: Uint8Array.from([0, 0, 0, RenderAlign.Center, 0, 0]),
    maxLines: Uint16Array.from([0, 0, 0, 2, 0, 0]),
    source: ['', '', '', '', '/asset.png', ''],
    tint: Uint32Array.from([0, 0, 0, 0, 0x778899ff, 0]),
    fit: new Uint8Array(capacity),
    value: Float32Array.from([0, 0, 25, 0, 0, 0]),
    min: zeros(),
    max: Float32Array.from([1, 1, 100, 1, 1, 1]),
    trackFill: Uint32Array.from([0, 0, 0xddeeffff, 0, 0, 0]),
    relationFrom: Int32Array.from([-1, -1, -1, -1, -1, 1]),
    relationTo: Int32Array.from([-1, -1, -1, -1, -1, 0]),
    lineWidth: Float32Array.from([0, 0, 0, 0, 0, 2]),
    ids: ['rect-a', 'rect-b', 'bar', 'text', 'image', 'relation'],
    view: overrides.view ?? { x: 0, y: 0, scale: 1 },
    background: 0x102030ff,
    renderOrder: () => Uint32Array.from([1, 0, 2, 3, 4, 5]),
  };
}
