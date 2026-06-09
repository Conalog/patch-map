import { Assets, Texture } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupPatchmapTests } from './patchmap.setup';

const flushPromises = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

const createDeferred = () => {
  let resolve;
  let reject;

  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
};

describe('Image Render', () => {
  const { getPatchmap } = setupPatchmapTests();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const drawImage = (patchmap, overrides = {}) => {
    const imageData = {
      type: 'image',
      id: 'slow-image',
      source: 'mock://slow-image',
      size: { width: 48, height: 24 },
      attrs: { x: 80, y: 80 },
      ...overrides,
    };
    patchmap.draw([imageData]);
    return patchmap.selector(`$..[?(@.id=="${imageData.id}")]`)[0];
  };

  it('ignores late source loads after the image is destroyed by redraw', async () => {
    const patchmap = getPatchmap();
    const deferred = createDeferred();
    const loadSpy = vi.spyOn(Assets, 'load').mockReturnValue(deferred.promise);

    const image = drawImage(patchmap);
    const setTextureSpy = vi.spyOn(image, '_setTexture');
    const sizeSpy = vi.spyOn(image, '_applyImageSize');

    patchmap.draw([]);

    expect(image.destroyed).toBe(true);

    deferred.resolve(Texture.WHITE);
    await flushPromises();

    expect(loadSpy).toHaveBeenCalledWith('mock://slow-image');
    expect(setTextureSpy).not.toHaveBeenCalled();
    expect(sizeSpy).not.toHaveBeenCalled();
  });

  it('loads AssetSource descriptors with an internal alias', async () => {
    const patchmap = getPatchmap();
    const deferred = createDeferred();
    const loadSpy = vi.spyOn(Assets, 'load').mockReturnValue(deferred.promise);

    const image = drawImage(patchmap, {
      id: 'descriptor-image',
      source: {
        src: 'mock://descriptor-image',
        data: { resolution: 3 },
      },
    });

    expect(loadSpy).toHaveBeenCalledWith({
      alias: expect.stringContaining('patchmap:asset-source:'),
      src: 'mock://descriptor-image',
      data: { resolution: 3 },
    });

    deferred.resolve(Texture.WHITE);
    await flushPromises();

    expect(image.props.source).toEqual({
      src: 'mock://descriptor-image',
      data: { resolution: 3 },
    });
    expect(image.sprite.texture).toBe(Texture.WHITE);
  });

  it('falls back to Texture.EMPTY when an AssetSource load fails', async () => {
    const patchmap = getPatchmap();
    const error = new Error('load failed');
    vi.spyOn(Assets, 'load').mockRejectedValue(error);
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const source = { src: 'mock://missing-image', data: { resolution: 2 } };

    const image = drawImage(patchmap, {
      id: 'missing-descriptor-image',
      source,
    });

    await vi.waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        '[patchmap:source] failed to load',
        source,
        error,
      );
    });

    expect(image.sprite.texture).toBe(Texture.EMPTY);
  });

  it('ignores late source loads after the image source is cleared', async () => {
    const patchmap = getPatchmap();
    const deferred = createDeferred();
    const loadSpy = vi.spyOn(Assets, 'load').mockReturnValue(deferred.promise);

    const image = drawImage(patchmap);

    patchmap.update({
      path: '$..[?(@.id=="slow-image")]',
      changes: { source: '' },
    });

    deferred.resolve(Texture.WHITE);
    await flushPromises();

    expect(loadSpy).toHaveBeenCalledWith('mock://slow-image');
    expect(image.props.source).toBe('');
    expect(image.sprite.texture).toBe(Texture.EMPTY);
  });
});
