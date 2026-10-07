import { Container, RenderTexture, type WebGLRenderer } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PatchMapPixiImageTileOutput } from '../../src/rendering/pixi-renderer/image-tile-output';

function setup(width: number, height: number, alpha = 1) {
  const writes: Array<{ x: number; y: number; width: number; height: number; data: Uint8ClampedArray }> = [];
  const events: string[] = [];
  const context = { putImageData: vi.fn((data: ImageData, x: number, y: number) => {
    writes.push({ x, y, width: data.width, height: data.height, data: data.data.slice() });
    events.push('write');
  }) };
  const canvas = { width: 0, height: 0, getContext: vi.fn(() => context), remove: vi.fn() };
  vi.stubGlobal('document', { createElement: () => canvas });
  vi.stubGlobal('ImageData', class {
    public constructor(public data: Uint8ClampedArray, public width: number, public height: number) {}
  });
  const translations: number[][] = [];
  const drawTarget = { name: 'MSAA draw target' };
  const readTarget = { name: 'resolved read target' };
  const renderer = {
    background: { colorRgba: [0, 0, 0, alpha] },
    gl: { SAMPLES: 1, FRAMEBUFFER: 2, FRAMEBUFFER_COMPLETE: 3, RGBA: 4, UNSIGNED_BYTE: 5, READ_FRAMEBUFFER: 6, NO_ERROR: 0,
      isContextLost: vi.fn(() => false), getParameter: vi.fn(() => 4), checkFramebufferStatus: vi.fn(() => 3),
      bindFramebuffer: vi.fn((_target: number, framebuffer: unknown) => events.push(framebuffer === readTarget ? 'bind-read' : 'restore-read')),
      getError: vi.fn(() => 0),
      readPixels: vi.fn((_x: number, _y: number, width: number, height: number, _format: number, _type: number, pixels: Uint8Array) => {
        events.push('read');
        pixels.fill(0, 0, width * height * 4);
      }),
    },
    render: vi.fn(({ transform }: { transform: { tx: number; ty: number } }) => {
      translations.push([transform.tx || 0, transform.ty || 0]); events.push('render');
      // Model Pixi's renderEnd: readback must use this resolve without repeating it.
      renderer.renderTarget.finishRenderPass();
    }),
    renderTarget: {
      finishRenderPass: vi.fn(() => events.push('resolve')),
      getRenderTarget: vi.fn((work: RenderTexture) => work),
      getGpuRenderTarget: vi.fn(() => ({ framebuffer: drawTarget, resolveTargetFramebuffer: readTarget })),
    },
  };
  const allocation = vi.spyOn(RenderTexture, 'create');
  const output = new PatchMapPixiImageTileOutput(renderer as unknown as WebGLRenderer, width, height, 1);
  return { output, renderer, canvas, writes, events, translations, allocation, drawTarget, readTarget };
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('image tile raster resources', () => {
  it('covers partial edges without a full-size GPU allocation and reuses work across renders', () => {
    const s = setup(2305, 2177);
    s.output.render(new Container());
    expect(s.renderer.renderTarget.finishRenderPass).toHaveBeenCalledTimes(4);
    expect(s.translations).toEqual([[0, 0], [-2048, 0], [0, -2048], [-2048, -2048]]);
    expect(s.writes.map(({ x, y, width, height }) => [x, y, width, height])).toEqual([
      [0, 0, 2048, 2048], [2048, 0, 257, 2048], [0, 2048, 2048, 129], [2048, 2048, 257, 129],
    ]);
    expect(s.events).toEqual(Array(4).fill(['render', 'resolve', 'bind-read', 'read', 'restore-read', 'write']).flat());
    s.output.render(new Container());
    const readCalls = s.renderer.gl.readPixels.mock.calls;
    expect(s.renderer.renderTarget.finishRenderPass).toHaveBeenCalledTimes(readCalls.length);
    expect(new Set(readCalls.map(call => call[6].buffer)).size).toBe(1);
    expect(readCalls.every(call => call[6].byteLength === 2048 * 2048 * 4)).toBe(true);
    expect(readCalls.slice(0, 4).map(call => call.slice(0, 6))).toEqual([
      [0, 0, 2048, 2048, 4, 5], [0, 0, 257, 2048, 4, 5], [0, 0, 2048, 129, 4, 5], [0, 0, 257, 129, 4, 5],
    ]);
    expect(s.renderer.gl.bindFramebuffer.mock.calls.every(call => call[0] === s.renderer.gl.READ_FRAMEBUFFER)).toBe(true);
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
    s.renderer.gl.readPixels.mockImplementation((_x, _y, _w, _h, _format, _type, pixels) => { pixels.set([64, 32, 16, 128]); });
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
    expect(s.renderer.gl.readPixels).not.toHaveBeenCalled();
    s.output.destroy();
  });

  it('can retry a partial readback failure without allocating another work texture', () => {
    const s = setup(2049, 1);
    s.renderer.gl.readPixels.mockImplementationOnce(() => {})
      .mockImplementationOnce(() => { throw new Error('readback failed'); });
    expect(() => s.output.render(new Container())).toThrow('readback failed');
    expect(s.renderer.gl.bindFramebuffer).toHaveBeenLastCalledWith(s.renderer.gl.READ_FRAMEBUFFER, s.drawTarget);
    s.output.render(new Container());
    expect(s.writes.map(({ x }) => x)).toEqual([0, 0, 2048]);
    expect(s.allocation).toHaveBeenCalledOnce();
    s.output.destroy();
  });

  it('rejects a WebGL read error without publishing stale pixels, and can retry', () => {
    const s = setup(2049, 1);
    s.renderer.gl.readPixels.mockImplementation((_x, _y, _w, _h, _format, _type, pixels) => { pixels.fill(77); });
    s.renderer.gl.getError.mockReturnValueOnce(0).mockReturnValueOnce(1282);
    expect(() => s.output.render(new Container())).toThrow('WebGL error 1282');
    expect(s.writes).toHaveLength(1);
    expect(s.renderer.gl.bindFramebuffer).toHaveBeenLastCalledWith(s.renderer.gl.READ_FRAMEBUFFER, s.drawTarget);
    s.output.render(new Container());
    expect(s.writes.map(({ x }) => x)).toEqual([0, 0, 2048]);
    expect(new Set(s.renderer.gl.readPixels.mock.calls.map(call => call[6].buffer)).size).toBe(1);
    s.output.destroy();
  });

  it('copies each tile before later reads overwrite the shared buffer', () => {
    const s = setup(2049, 1);
    let fill = 1;
    s.renderer.gl.readPixels.mockImplementation((_x, _y, _w, _h, _format, _type, pixels) => { pixels.fill(fill++); });
    s.output.render(new Container());
    expect(s.writes[0]!.data[0]).toBe(1);
    expect(s.writes[1]!.data[0]).toBe(2);
    expect(s.writes[1]!.data).toHaveLength(4);
    s.output.resize(2, 1, 1);
    s.output.render(new Container());
    expect(s.renderer.gl.readPixels.mock.calls.at(-1)![6].byteLength).toBe(8);
    expect(new Set(s.renderer.gl.readPixels.mock.calls.map(call => call[6].buffer)).size).toBe(2);
    s.output.destroy();
  });

  it('rejects context loss before reading or writing incomplete pixels', () => {
    const s = setup(1, 1);
    s.renderer.gl.readPixels.mockImplementationOnce(() => {
      s.renderer.gl.isContextLost.mockReturnValue(true);
    });
    expect(() => s.output.render(new Container())).toThrow('context lost');
    expect(s.writes).toHaveLength(0);
    s.output.destroy();
  });
});
