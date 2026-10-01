/** Installed ESM consumer: real pixels and fonts from a detached image session. */
export const PACKED_IMAGE_CONSUMER_SOURCE = `
import { PatchMap as ImagePatchMap } from '@conalog/patch-map/image';

const imageGpuResources = [];

async function createVerifiedImage(options) {
  const original = HTMLCanvasElement.prototype.getContext;
  let gl;
  HTMLCanvasElement.prototype.getContext = function(...args) {
    const context = original.apply(this, args);
    if (args[0] === 'webgl2' && context && args[1]?.depth === false && args[1]?.stencil === false) {
      gl = context;
      if (this.width !== 1 || this.height !== 1) throw new Error('image GPU carrier must be 1x1');
      const resources = new Map();
      imageGpuResources.push(resources);
      const allocate = gl.renderbufferStorageMultisample;
      gl.renderbufferStorageMultisample = function(target, samples, format, width, height) {
        allocate.call(this, target, samples, format, width, height);
        const actual = this.getRenderbufferParameter(target, this.RENDERBUFFER_SAMPLES);
        if (samples !== 4 || actual !== 4 || width > 2048 || height > 2048) throw new Error('unbounded or non-AA4 image allocation');
        resources.set(this.getParameter(this.RENDERBUFFER_BINDING), { samples: actual, width, height, released: false });
      };
      const release = gl.deleteRenderbuffer;
      gl.deleteRenderbuffer = function(buffer) { if (resources.has(buffer)) resources.get(buffer).released = true; return release.call(this, buffer); };
    }
    return context;
  };
  let map;
  try { map = await ImagePatchMap.create(options); }
  finally { HTMLCanvasElement.prototype.getContext = original; }
  const attributes = gl?.getContextAttributes();
  if (!attributes || attributes.depth !== false || attributes.stencil !== false) {
    await map.destroy();
    throw new Error('image context did not omit unused buffers: ' + JSON.stringify(attributes));
  }
  return map;
}

async function verifyImageEntry(runtimeBaseline = { resourceCount: 0, leaseCount: 0 }) {
  const input = [
    { type: 'rect', id: 'image-square', show: true, attrs: { x: 40, y: 30 }, size: { width: 80, height: 80 }, fill: '#ff0000' },
    {
      type: 'item', id: 'image-item', show: true,
      attrs: { x: 160, y: 30 }, size: { width: 80, height: 120 },
      components: [
        { type: 'background', id: 'bg', source: { type: 'rect', fill: '#eeeeee' } },
        { type: 'bar', id: 'bar', source: { type: 'rect', fill: '#0000ff' }, size: { width: '70%', height: 20 }, placement: 'bottom', animation: true },
        { type: 'text', id: 'label', text: 'before', placement: 'top' },
      ],
    },
  ];
  const before = JSON.stringify(input);
  const originalCanvasCount = document.querySelectorAll('canvas').length;
  const fontCount = () => [...document.fonts].filter((face) => face.family.replaceAll(/["']/gu, '') === 'FiraCode').length;
  const fontsBefore = fontCount();
  let pngSize;
  let jpegSize;
  let pngPixels = false;
  let jpegPixels = false;
  let finalBarPixels = false;
  let fontsReady = false;
  let detached = true;
  let released = true;
  for (let cycle = 0; cycle < 5; cycle += 1) {
    const map = await createVerifiedImage({
      data: input, width: 320, height: 180, fit: false, background: '#ffffff',
      antialias: true,
      viewport: { initial: { centerWorld: [160, 90], scale: 1 } },
    });
    try {
      detached &&= document.querySelectorAll('canvas').length === originalCanvasCount;
      fontsReady = [300, 400, 500, 600, 700].every((weight) => document.fonts.check(weight + ' 12px FiraCode'));
      const png = await map.render();
      const decodedPng = await decodeImage(png.blob);
      pngSize = [decodedPng.width, decodedPng.height];
      pngPixels = isPixel(decodedPng, 60, 50, [255, 0, 0, 255]) && isPixel(decodedPng, 5, 5, [255, 255, 255, 255]);
      const update = map.updateBatch({ targets: ['image-item'], bar: { height: [60] }, text: { text: ['123456789012'] } });
      if (update.status !== 'committed') throw new Error('image batch did not commit');
      map.update({ id: 'image-square', changes: { fill: '#00ff00' } });
      const jpeg = await map.render({ format: 'jpeg', quality: 0.9 });
      const decodedJpeg = await decodeImage(jpeg.blob);
      jpegSize = [decodedJpeg.width, decodedJpeg.height];
      jpegPixels = isPixel(decodedJpeg, 60, 50, [0, 255, 0, 255], 8);
      finalBarPixels = isPixel(decodedJpeg, 200, 105, [0, 0, 255, 255], 8);
      if (png.mime !== 'image/png' || jpeg.mime !== 'image/jpeg' ||
          JSON.stringify(png.size) !== JSON.stringify(pngSize) ||
          JSON.stringify(jpeg.size) !== JSON.stringify(jpegSize)) throw new Error('image result metadata differs from encoded pixels');
    } finally {
      const destroyed = await map.destroy();
      const destroyedAgain = await map.destroy();
      released &&= destroyed && map.destroyed && destroyedAgain === false;
    }
    const status = map.assets.status();
    released &&= status.runtime.resourceCount === runtimeBaseline.resourceCount && status.runtime.leaseCount === runtimeBaseline.leaseCount && fontCount() === fontsBefore;
  }
  const transparent = await createVerifiedImage({
    data: [input[0]], width: 160, height: 120, background: '#00000000', fit: false,
    viewport: { initial: { centerWorld: [80, 60], scale: 1 } },
  });
  let transparentPixels = false;
  try {
    const image = await transparent.render();
    const decoded = await decodeImage(image.blob);
    transparentPixels = isPixel(decoded, 5, 5, [0, 0, 0, 0]) && isPixel(decoded, 60, 50, [255, 0, 0, 255]);
  } finally { await transparent.destroy(); }
  released &&= fontCount() === fontsBefore;
  const tiled = await createVerifiedImage({
    data: [
      { type: 'rect', id: 'cross', show: true, attrs: { x: 2038, y: 2038 }, size: { width: 40, height: 40 }, fill: '#ff0000' },
      { type: 'rect', id: 'corner', show: true, attrs: { x: 2280, y: 2150 }, size: { width: 25, height: 27 }, fill: '#00ff00' },
      { type: 'rect', id: 'alpha', show: true, attrs: { x: 10, y: 10 }, size: { width: 20, height: 20 }, fill: '#ff000080' },
    ], width: 2305, height: 2177, background: '#20406080', fit: false,
    viewport: { initial: { centerWorld: [1152.5, 1088.5], scale: 1 } },
  });
  let tiledPixels = false;
  let tileWitness;
  try {
    const first = await decodeImage((await tiled.render()).blob);
    const seams = [2047, 2048, 2049].every(x => [2047, 2048, 2049].every(y => isPixel(first, x, y, [255, 0, 0, 255])));
    const edges = isPixel(first, 2304, 2176, [0, 255, 0, 255]) && isPixel(first, 2200, 2100, [32, 64, 96, 128], 1);
    const alpha = isPixel(first, 20, 20, [181, 21, 32, 192], 2);
    tiled.update({ id: 'cross', changes: { fill: '#0000ff' } });
    const second = await decodeImage((await tiled.render()).blob);
    const pixel = (image, x, y) => [...image.data.slice((y * image.width + x) * 4, (y * image.width + x) * 4 + 4)];
    tileWitness = { seams, edges, alpha, seam: pixel(first, 2048, 2048), corner: pixel(first, 2304, 2176), background: pixel(first, 2200, 2100), translucent: pixel(first, 20, 20), updated: pixel(second, 2048, 2048) };
    tiledPixels = seams && edges && alpha && isPixel(second, 2048, 2048, [0, 0, 255, 255]);
  } finally { await tiled.destroy(); }
  const aa4Released = imageGpuResources.every(resources => resources.size > 0 && [...resources.values()].every(r => r.released));
  const result = {
    createType: typeof ImagePatchMap.create, pngSize, jpegSize, pngPixels, jpegPixels,
    finalBarPixels, transparentPixels, tiledPixels, tileWitness, aa4Released, fontsReady, detached, released, cycles: 5,
    immutable: JSON.stringify(input) === before,
  };
  if (!result.pngPixels || !result.jpegPixels || !result.finalBarPixels || !result.transparentPixels ||
      !result.tiledPixels || !result.aa4Released || !result.fontsReady || !result.detached || !result.released || !result.immutable) {
    throw new Error('packed image API failed: ' + JSON.stringify(result));
  }
  return result;
}

async function decodeImage(blob) {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    context.drawImage(bitmap, 0, 0);
    return context.getImageData(0, 0, bitmap.width, bitmap.height);
  } finally { bitmap.close(); }
}

function isPixel(image, x, y, expected, tolerance = 0) {
  const offset = (y * image.width + x) * 4;
  return expected.every((value, channel) => Math.abs(image.data[offset + channel] - value) <= tolerance);
}

const imageEntry = await verifyImageEntry();
`;
