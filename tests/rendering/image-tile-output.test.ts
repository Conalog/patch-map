import { Container, RenderTexture, type WebGLRenderer } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PatchMapPixiImageTileOutput } from '../../src/rendering/pixi-renderer/image-tile-output';

function setup(width: number, height: number, alpha = 1) {
  const writes: Array<{ x: number; y: number; width: number; height: number; data: Uint8ClampedArray }> = [];
  const events: string[] = [];
  const context = { putImageData: vi.fn((data: ImageData, x: number, y: number) => {
    writes.push({ x, y, width: data.width, height: data.height, data: data.data });
    events.push('write');
  }) };
  const canvas = { width: 0, height: 0, getContext: vi.fn(() => context), remove: vi.fn() };
  vi.stubGlobal('document', { createElement: () => canvas });
  vi.stubGlobal('ImageData', class {
    public constructor(public data: Uint8ClampedArray, public width: number, public height: number) {}
  });
  const translations: number[][] = [];
  const renderer = {
    background: { colorRgba: [0, 0, 0, alpha] },
    gl: { SAMPLES: 1, FRAMEBUFFER: 2, FRAMEBUFFER_COMPLETE: 3,
      isContextLost: vi.fn(() => false), getParameter: vi.fn(() => 4), checkFramebufferStatus: vi.fn(() => 3) },
    render: vi.fn(({ transform }: { transform: { tx: number; ty: number } }) => {
      translations.push([transform.tx || 0, transform.ty || 0]); events.push('render');
    }),
    renderTarget: { finishRenderPass: vi.fn(() => events.push('resolve')) },
    extract: { pixels: vi.fn((view: { width: number; height: number }) => {
      events.push('read');
      return { pixels: new Uint8ClampedArray(view.width * view.height * 4), width: view.width, height: view.height };
    }) },
  };
  const allocation = vi.spyOn(RenderTexture, 'create');
  const output = new PatchMapPixiImageTileOutput(renderer as unknown as WebGLRenderer, width, height, 1);
  return { output, renderer, canvas, writes, events, translations, allocation };
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('image tile raster resources', () => {
  it('covers partial edges without a full-size GPU allocation and reuses work across renders', () => {
    const s = setup(2305, 2177);
    s.output.render(new Container());
    expect(s.translations).toEqual([[0, 0], [-2048, 0], [0, -2048], [-2048, -2048]]);
    expect(s.writes.map(({ x, y, width, height }) => [x, y, width, height])).toEqual([
      [0, 0, 2048, 2048], [2048, 0, 257, 2048], [0, 2048, 2048, 129], [2048, 2048, 257, 129],
    ]);
    expect(s.events).toEqual(Array(4).fill(['render', 'resolve', 'read', 'write']).flat());
    s.output.render(new Container());
    expect(s.allocation).toHaveBeenCalledOnce();
    expect(s.allocation).toHaveBeenCalledWith({ width: 2048, height: 2048, resolution: 1, antialias: true });
    const work = s.allocation.mock.results[0]!.value as RenderTexture;
    const release = vi.spyOn(work, 'destroy');
    s.output.destroy();
    s.output.destroy();
    expect(release).toHaveBeenCalledExactlyOnceWith(true);
    expect([s.canvas.width, s.canvas.height]).toEqual([0, 0]);
  });

  it('converts premultiplied translucent pixels for ImageData', () => {
    const s = setup(1, 1, 0);
    s.renderer.extract.pixels.mockReturnValue({ pixels: new Uint8ClampedArray([64, 32, 16, 128]), width: 1, height: 1 });
    s.output.render(new Container());
    expect([...s.writes[0]!.data]).toEqual([128, 64, 32, 128]);
    s.output.destroy();
  });

  it('premultiplies translucent clear colors before rasterization', () => {
    const s = setup(1, 1, 0.5);
    s.renderer.background.colorRgba = [0.2, 0.4, 0.6, 0.5];
    s.output.render(new Container());
    expect(s.renderer.render).toHaveBeenCalledWith(expect.objectContaining({ clearColor: [0.1, 0.2, 0.3, 0.5] }));
    s.output.destroy();
  });

  it('refuses incomplete AA4 output before readback', () => {
    const s = setup(1, 1);
    s.renderer.gl.getParameter.mockReturnValue(2);
    expect(() => s.output.render(new Container())).toThrow('AA4');
    expect(s.renderer.extract.pixels).not.toHaveBeenCalled();
    s.output.destroy();
  });

  it('can retry a partial readback failure without allocating another work texture', () => {
    const s = setup(2049, 1);
    s.renderer.extract.pixels.mockImplementationOnce(() => ({ pixels: new Uint8ClampedArray(2048 * 4), width: 2048, height: 1 }))
      .mockImplementationOnce(() => { throw new Error('readback failed'); });
    expect(() => s.output.render(new Container())).toThrow('readback failed');
    s.output.render(new Container());
    expect(s.writes.map(({ x }) => x)).toEqual([0, 0, 2048]);
    expect(s.allocation).toHaveBeenCalledOnce();
    s.output.destroy();
  });

  it('rejects context loss before reading or writing incomplete pixels', () => {
    const s = setup(1, 1);
    s.renderer.extract.pixels.mockImplementationOnce(() => {
      s.renderer.gl.isContextLost.mockReturnValue(true);
      return { pixels: new Uint8ClampedArray(4), width: 1, height: 1 };
    });
    expect(() => s.output.render(new Container())).toThrow('context lost');
    expect(s.writes).toHaveLength(0);
    s.output.destroy();
  });
});
