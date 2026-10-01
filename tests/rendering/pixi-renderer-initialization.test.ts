import { Application } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PatchMapPixiRenderer } from '../../src/rendering/pixi-renderer';

function surface(attributes: Partial<WebGLContextAttributes> | null = { depth: false, stencil: false }) {
  const loseContext = vi.fn();
  const context = {
    getContextAttributes: vi.fn(() => attributes),
    getExtension: vi.fn(() => ({ loseContext })),
  };
  const canvas = {
    width: 300, height: 150, parentNode: null, dataset: {},
    style: {
      cssText: '', getPropertyValue: () => '', getPropertyPriority: () => '',
      setProperty: vi.fn(),
    },
    getContext: vi.fn(() => context),
    remove: vi.fn(),
  };
  return { canvas, context, loseContext };
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('image renderer context initialization', () => {
  it('passes a depth/stencil-free context to Pixi and releases it when initialization fails', async () => {
    const { canvas, context, loseContext } = surface();
    vi.stubGlobal('document', { createElement: vi.fn(() => canvas) });
    const failure = new Error('Pixi init failed');
    const init = vi.spyOn(Application.prototype, 'init').mockRejectedValue(failure);
    await expect(PatchMapPixiRenderer.create({
      interactive: false, requireWebGL2: true, preference: 'webgl',
      width: 320, height: 180, pixelRatio: 1, antialias: true, background: 0xffffff00,
      powerPreference: 'low-power',
    })).rejects.toBe(failure);
    expect([canvas.width, canvas.height]).toEqual([320, 180]);
    expect(canvas.getContext).toHaveBeenCalledWith('webgl2', {
      alpha: true, premultipliedAlpha: true, antialias: true,
      depth: false, stencil: false, preserveDrawingBuffer: false,
      powerPreference: 'low-power',
    });
    expect(init).toHaveBeenCalledWith(expect.objectContaining({ canvas, context, antialias: true }));
    expect(loseContext).toHaveBeenCalledOnce();
    expect(canvas.remove).toHaveBeenCalledOnce();
  });

  it.each([{ depth: true, stencil: false }, { depth: false, stencil: true }, null])(
    'rejects a context that cannot satisfy the buffer policy: %j', async (attributes) => {
      const { canvas, loseContext } = surface(attributes);
      vi.stubGlobal('document', { createElement: vi.fn(() => canvas) });
      const init = vi.spyOn(Application.prototype, 'init');
      await expect(PatchMapPixiRenderer.create({
        interactive: false, requireWebGL2: true, preference: 'webgl',
      })).rejects.toMatchObject({ code: 'UNSUPPORTED_RUNTIME' });
      expect(init).not.toHaveBeenCalled();
      expect(loseContext).toHaveBeenCalledOnce();
      expect(canvas.remove).toHaveBeenCalledOnce();
    },
  );

  it('leaves context creation with Pixi for mounted renderers', async () => {
    const failure = new Error('stop before GPU allocation');
    const init = vi.spyOn(Application.prototype, 'init').mockRejectedValue(failure);
    await expect(PatchMapPixiRenderer.create({ preference: 'webgl', requireWebGL2: true })).rejects.toBe(failure);
    expect(init).toHaveBeenCalledOnce();
    expect(init.mock.calls[0]?.[0]?.context).toBeUndefined();
  });
});
