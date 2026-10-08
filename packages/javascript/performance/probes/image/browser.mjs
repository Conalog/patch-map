import { PatchMap } from '/dist/image.js';

window.runImageBenchmark = async ({ model, assets, size, format }) => {
  let session;
  let image;
  let canvas;
  const tileAllocations = [];
  const readback = { calls: 0, buffers: 0, requestedBytes: 0, maxCapacityBytes: 0 };
  let gl;
  const timings = {};
  const phase = async (name, operation) => {
    const start = performance.now();
    try { return await operation(); }
    finally { timings[name] = performance.now() - start; }
  };
  const isCell = (update) => /\.\d+\.\d+$/.test(String(update.id));
  const shape = (update) => JSON.stringify({
    display: update.display, barHeight: update.barHeight != null,
    barChanges: update.barHeight != null ? ['show', 'tint'] : [
      ...(update.barShow == null ? [] : ['show']), ...(update.tint == null ? [] : ['tint']),
    ], iconChanges: update.icon ? Object.keys(update.icon).sort() : [],
  });
  function applyUpdates(updates) {
    const results = [];
    for (let offset = 0; offset < updates.length;) {
      const first = updates[offset];
      const grid = isCell(first);
      const key = grid ? shape(first) : null;
      const batch = [];
      while (offset < updates.length && batch.length < 100) {
        const next = updates[offset];
        if (isCell(next) !== grid || (grid && shape(next) !== key)) break;
        batch.push(next); offset += 1;
      }
      const result = grid ? session.updateBatch({
        targets: batch.map(({ id }) => id),
        ...(first.barHeight == null && batch.some(({ barShow, tint }) => barShow != null || tint != null) ? {
          bar: { changes: {
            ...(first.barShow == null ? {} : { show: batch.map(({ barShow }) => barShow) }),
            ...(first.tint == null ? {} : { tint: batch.map(({ tint }) => tint) }),
          } },
        } : {}),
        ...(first.barHeight == null ? {} : { bar: {
          height: batch.map(({ barHeight }) => barHeight),
          changes: { show: batch.map(() => true), tint: batch.map(({ tint }) => tint) },
        } }),
        ...(first.icon ? { icon: { changes: Object.fromEntries(Object.keys(first.icon).map((key) => [key, batch.map(({ icon }) => icon[key])])) } } : {}),
        text: {
          ...(first.display === 'inverter' ? { componentId: 'inverter-value-text' } : {}),
          ...(first.display === 'ess' ? { componentId: 'ess-value-text' } : {}),
          text: batch.map(({ text, value }) => text ?? value),
          changes: { show: batch.map(({ showText }) => showText === true) },
        },
      })
        : session.transaction(batch.map((update) => {
          const componentId = update.display === 'inverter' ? 'inverter-value-text' : update.display === 'ess' ? 'ess-value-text' : undefined;
          return {
            type: 'update', id: update.id,
            ...(update.barHeight == null ? {} : { bar: { height: update.barHeight, changes: { show: true, tint: update.tint } } }),
            ...(update.barHeight == null && (update.barShow != null || update.tint != null) ? { bar: { changes: {
              ...(update.barShow == null ? {} : { show: update.barShow }), ...(update.tint == null ? {} : { tint: update.tint }),
            } } } : {}),
            ...(update.icon ? { icon: { changes: update.icon } } : {}),
            text: { ...(componentId ? { componentId } : {}), text: update.text ?? update.value, changes: { show: update.showText === true } },
          };
        }));
      results.push({ method: grid ? 'updateBatch' : 'transaction', count: batch.length, result });
      if (!['committed', 'unchanged'].includes(result?.status)) throw new Error(JSON.stringify(result));
    }
    return results;
  }

  const before = JSON.stringify(model);
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (...args) {
    const context = originalGetContext.apply(this, args);
    if (args[0] === 'webgl2' && context && args[1]?.depth === false) {
      canvas = this; gl = context;
      const buffers = new WeakSet();
      const nativeRead = gl.readPixels;
      gl.readPixels = function (...args) {
        const pixels = args[6];
        if (ArrayBuffer.isView(pixels)) {
          readback.calls++; readback.requestedBytes += args[2] * args[3] * 4;
          if (!buffers.has(pixels.buffer)) { buffers.add(pixels.buffer); readback.buffers++; }
          readback.maxCapacityBytes = Math.max(readback.maxCapacityBytes, pixels.byteLength);
        }
        return nativeRead.apply(this, args);
      };
      const allocate = gl.renderbufferStorageMultisample;
      gl.renderbufferStorageMultisample = function (target, samples, format, width, height) {
        allocate.call(this, target, samples, format, width, height);
        tileAllocations.push({ samples: this.getRenderbufferParameter(target, this.RENDERBUFFER_SAMPLES), width, height });
      };
    }
    return context;
  };
  const start = performance.now();
  let batches;
  let surface;
  try {
    try {
      session = await phase('createMs', () => PatchMap.create({
        data: model.blueprint, width: size, height: size, fit: model.fit,
        antialias: model.antialias, background: '#ffffff', zoomLimits: [0.1, 30], assets,
      }));
    } finally { HTMLCanvasElement.prototype.getContext = originalGetContext; }
    const debug = gl?.getExtension('WEBGL_debug_renderer_info');
    surface = {
      backingSize: [size, size], gpuCanvasSize: [canvas?.width, canvas?.height], tileAllocations, readback, context: gl ? 'webgl2' : null,
      samples: gl?.getParameter(gl.SAMPLES), attributes: gl?.getContextAttributes(),
      renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null,
      viewport: session.viewport.snapshot(),
    };
    batches = await phase('updatesMs', () => applyUpdates(model.runtimeUpdates));
    image = await phase('renderMs', () => session.render(
      format === 'jpeg' ? { format: 'jpeg', quality: 0.9 } : { format: 'png' },
    ));
    if (tileAllocations.length) {
      if (tileAllocations.some(t => t.samples !== 4 || t.width > 2048 || t.height > 2048)) throw new Error('invalid tile allocation');
      surface.samples = tileAllocations[0].samples;
    }
    if (JSON.stringify(image.size) !== JSON.stringify([size, size])) throw new Error('invalid image size');
    timings.blobReadyMs = performance.now() - start;
    await phase('transferMs', async () => {
      const response = await fetch('/output', { method: 'POST', body: image.blob });
      if (!response.ok) throw new Error('image transfer failed');
      await response.arrayBuffer();
    });
    timings.requestMs = performance.now() - start;
    // Decode and pixel verification are outside the latency and primary memory window.
    await (await fetch('/profile-end', { method: 'POST' })).arrayBuffer();
    const bitmap = await createImageBitmap(image.blob);
    const decodedSize = [bitmap.width, bitmap.height];
    const check = document.createElement('canvas'); check.width = check.height = 256;
    const ctx = check.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0, 256, 256); bitmap.close();
    const pixels = ctx.getImageData(0, 0, 256, 256).data;
    const pixelSha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', pixels))]
      .map(value => value.toString(16).padStart(2, '0')).join('');
    const distinctColors = new Set();
    for (let i = 0; i < pixels.length; i += 4) distinctColors.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`);
    return { timings, surface, decodedSize, bytes: image.blob.size, mime: image.mime,
      pixelSha256, distinctColors: distinctColors.size,
      blueprints: model.blueprint.length, updates: model.runtimeUpdates.length, batches: batches.length,
      accepted: batches.every(({result}) => ['committed','unchanged'].includes(result.status)),
      immutable: JSON.stringify(model) === before, appendedCanvases: document.querySelectorAll('canvas').length };
  } finally {
    if (session) await phase('destroyMs', () => session.destroy());
    image = null; session = null;

  }
};
