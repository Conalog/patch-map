/** Observe image AA4/readback work without retaining pixel backing stores. */
export function observeImageWebGL() {
  let canvas;
  let gl;
  const tileAllocations = [];
  const readback = {
    calls: 0, buffers: 0, requestedBytes: 0, minCapacityBytes: null, maxCapacityBytes: 0,
  };
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (...args) {
    const context = original.apply(this, args);
    if (args[0] === 'webgl2' && context && args[1]?.depth === false) {
      canvas = this;
      gl = context;
      const buffers = new WeakSet();
      const nativeRead = gl.readPixels;
      gl.readPixels = function (...args) {
        const pixels = args[6];
        if (ArrayBuffer.isView(pixels)) {
          readback.calls++;
          readback.requestedBytes += args[2] * args[3] * 4;
          if (!buffers.has(pixels.buffer)) { buffers.add(pixels.buffer); readback.buffers++; }
          readback.minCapacityBytes = readback.minCapacityBytes === null
            ? pixels.byteLength : Math.min(readback.minCapacityBytes, pixels.byteLength);
          readback.maxCapacityBytes = Math.max(readback.maxCapacityBytes, pixels.byteLength);
        }
        return nativeRead.apply(this, args);
      };
      const allocate = gl.renderbufferStorageMultisample;
      gl.renderbufferStorageMultisample = function (target, samples, format, width, height) {
        allocate.call(this, target, samples, format, width, height);
        tileAllocations.push({
          requestedSamples: samples,
          samples: this.getRenderbufferParameter(target, this.RENDERBUFFER_SAMPLES), width, height,
        });
      };
    }
    return context;
  };
  return {
    get canvas() { return canvas; },
    get gl() { return gl; },
    tileAllocations,
    readback,
    restore() { HTMLCanvasElement.prototype.getContext = original; },
  };
}
