import { describe, expect, it, vi } from 'vitest';
import { PatchMapAssetRuntime } from '../../src/assets';
import { createImagePatchMap } from '../../src/composition/image';
import type { PatchMapSurfaceOptions } from '../../src/engine/contracts';
import { PatchMap } from '../../src/image';
import type { PatchMapImageMutationOptions, PatchMapImageOptions, PatchMapImageRenderOptions } from '../../src/public/image-contracts';
import { TransactionSurface } from '../support/engine-update-transaction-surface';

class ImageSurface extends TransactionSurface {
  public readonly encodes: Array<{ mime: string | undefined; quality: number | undefined }> = [];
  public readonly canvas = {
    toBlob: (callback: BlobCallback, mime?: string, quality?: number): void => {
      this.encodes.push({ mime, quality });
      callback(new Blob(['encoded'], { type: mime ?? 'image/png' }));
    },
  } as HTMLCanvasElement;
  public canvasElement(): HTMLCanvasElement { return this.canvas; }
}

function options(overrides: Partial<PatchMapImageOptions> = {}): PatchMapImageOptions {
  return {
    width: 320, height: 180, fit: false,
    data: [{
      type: 'item', id: 'panel', show: true,
      attrs: { x: 20, y: 30 }, size: { width: 80, height: 120 },
      components: [
        { type: 'background', id: 'bg', source: { type: 'rect', fill: '#ffffff' } },
        { type: 'bar', id: 'bar', source: { type: 'rect', fill: '#2563eb' }, size: { width: 40, height: 20 } },
        { type: 'text', id: 'label', text: 'initial' },
      ],
    }],
    assetRuntime: new PatchMapAssetRuntime({
      get: () => undefined,
      load: () => Promise.resolve({ font: true }),
      unload: () => Promise.resolve(),
    }),
    ...overrides,
  };
}

async function create(input = options()) {
  let surface!: ImageSurface;
  let surfaceOptions!: PatchMapSurfaceOptions;
  const map = await createImagePatchMap(input, (value) => {
    surfaceOptions = value;
    surface = new ImageSurface(value);
    return Promise.resolve(surface);
  });
  return { map, surface, surfaceOptions };
}

describe('image API', () => {
  it('reuses root input and columnar updates without automatic frames, history, or animation', async () => {
    const input = options();
    const before = JSON.stringify(input.data);
    const { map, surface, surfaceOptions } = await create(input);
    try {
      expect(surfaceOptions.target).toBeUndefined();
      expect(surfaceOptions.pixelRatio).toBe(1);
      expect(surface.frameCount).toBe(0);
      expect(Object.keys(map).sort()).toEqual([
        'assets', 'data', 'destroy', 'destroyed', 'render', 'rotation', 'targets',
        'transaction', 'update', 'updateBatch', 'viewport',
      ]);
      const result = map.updateBatch({ targets: ['panel'], bar: { height: new Float64Array([64]) }, text: { text: ['123456789012'] } });
      expect(result.status).toBe('committed');
      expect(map.targets.get({ id: 'panel', componentId: 'bar' })?.value).toMatchObject({ size: { height: 64 } });
      expect(map.targets.get({ id: 'panel', componentId: 'label' })?.value).toMatchObject({ text: '123456789012' });
      expect(surface.frameCount).toBe(0);
      expect(surface.reconcileCalls.every((call) => call.options.animateBarChanges === false)).toBe(true);
      const png = await map.render();
      const jpeg = await map.render({ format: 'jpeg', quality: 0.9 });
      expect(png).toMatchObject({ mime: 'image/png', size: [320, 180] });
      expect(jpeg).toMatchObject({ mime: 'image/jpeg', size: [320, 180] });
      expect(Object.isFrozen(png)).toBe(true);
      expect(Object.isFrozen(png.size)).toBe(true);
      expect(surface.frameCount).toBe(2);
      expect(surface.encodes).toEqual([{ mime: 'image/png', quality: undefined }, { mime: 'image/jpeg', quality: 0.9 }]);
      expect(JSON.stringify(input.data)).toBe(before);
    } finally {
      expect(await map.destroy()).toBe(true);
      expect(await map.destroy()).toBe(false);
    }
    expect(surface.canvasCount).toBe(0);
    expect(map.destroyed).toBe(true);
    await expect(map.render()).rejects.toMatchObject({ diagnostic: { code: 'DESTROYED' } });
  });

  it('supports replacement, transactions, orientation, and absolute viewport state', async () => {
    const { map } = await create();
    try {
      expect(map.update({ id: 'panel', text: { text: 'next' } }).changed).toBe(true);
      expect(map.transaction([{ type: 'update', id: 'panel', bar: { height: 70 } }]).status).toBe('committed');
      map.rotation.value = 90;
      expect(map.rotation.value).toBe(90);
      map.rotation.reset();
      map.viewport.restore({ centerWorld: [200, 100], scale: 2 });
      expect(map.viewport.snapshot()).toEqual({ centerWorld: [200, 100], scale: 2 });
      map.data.replace([], { fit: false });
      expect(map.data.snapshot()).toEqual([]);
      await expect(map.render()).resolves.toMatchObject({ size: [320, 180] });
    } finally { await map.destroy(); }
  });

  it.each([0, -1, 1.5, NaN, Infinity])('rejects invalid output width %s before allocation', async (width) => {
    const factory = vi.fn();
    await expect(createImagePatchMap(options({ width }), factory)).rejects.toThrow('positive integers');
    expect(factory).not.toHaveBeenCalled();
  });

  it('destroys an initialized surface when dataset admission fails', async () => {
    let surface!: ImageSurface;
    await expect(createImagePatchMap(options({ data: [{ type: 'unknown', id: 'bad' }] }), (value) => {
      surface = new ImageSurface(value);
      return Promise.resolve(surface);
    })).rejects.toThrow();
    expect(surface.destroyed).toBe(true);
  });

  it('rejects unsupported interactive and rendering options', async () => {
    await expect(createImagePatchMap({ ...options(), container: '#host' } as PatchMapImageOptions, vi.fn())).rejects.toThrow('container');
    const { map, surface } = await create();
    try {
      for (const value of [{ format: 'webp' }, { format: null }, { quality: 0.9 }, { format: 'jpeg', quality: NaN }, { format: 'jpeg', quality: 1.1 }, { strategy: 'tiled' }]) {
        await expect(map.render(value as PatchMapImageRenderOptions)).rejects.toThrow();
      }
      expect(() => map.update({ id: 'panel' }, { animate: true } as PatchMapImageMutationOptions)).toThrow('animate');
      expect(surface.frameCount).toBe(0);
      const controller = new AbortController();
      controller.abort();
      await expect(map.render({ signal: controller.signal })).rejects.toMatchObject({ diagnostic: { code: 'CANCELLED' } });
    } finally { await map.destroy(); }
  });

  it('exports create under the same PatchMap name and explains the browser requirement', async () => {
    expect(typeof PatchMap.create).toBe('function');
    expect('mount' in PatchMap).toBe(false);
    expect(() => Reflect.construct(PatchMap as unknown as new () => object, [])).toThrow('PatchMap.create');
    await expect(PatchMap.create(options())).rejects.toThrow('browser with WebGL2');
  });
});
