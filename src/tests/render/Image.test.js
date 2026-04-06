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

  it('ignores late source loads after the image is destroyed by redraw', async () => {
    const patchmap = getPatchmap();
    const deferred = createDeferred();
    const loadSpy = vi.spyOn(Assets, 'load').mockReturnValue(deferred.promise);

    patchmap.draw([
      {
        type: 'image',
        id: 'slow-image',
        source: 'mock://slow-image',
        size: { width: 48, height: 24 },
        attrs: { x: 80, y: 80 },
      },
    ]);

    const image = patchmap.selector('$..[?(@.id=="slow-image")]')[0];
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

  it('ignores late source loads after the image source is cleared', async () => {
    const patchmap = getPatchmap();
    const deferred = createDeferred();
    const loadSpy = vi.spyOn(Assets, 'load').mockReturnValue(deferred.promise);

    patchmap.draw([
      {
        type: 'image',
        id: 'slow-image',
        source: 'mock://slow-image',
        size: { width: 48, height: 24 },
        attrs: { x: 80, y: 80 },
      },
    ]);

    const image = patchmap.selector('$..[?(@.id=="slow-image")]')[0];

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
