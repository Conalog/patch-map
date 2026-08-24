import { GPU_EVIDENCE_CASES } from './catalog.mjs';

export async function installWebGlCanvasProbe(page, caseId, probeName) {
  if (!GPU_EVIDENCE_CASES.has(caseId)) return;
  await page.addInitScript(({ probeName, caseIdentity }) => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    const contextMetadata = new WeakMap();
    const instrumentedContexts = new WeakSet();
    const state = {
      session: 0,
      caseId: caseIdentity,
      operation: null,
      contexts: [],
      frames: [],
      currentFrames: new Map(),
      errors: [],
    };

    const probe = Object.freeze({
      revision: 'core-v2-webgl-browser-probe/1',
      begin(input) {
        if (!input || input.caseId !== caseIdentity || typeof input.operation !== 'string') {
          throw new Error('Invalid Core v2 WebGL probe run identity');
        }
        state.session += 1;
        state.operation = input.operation;
        state.contexts = [];
        state.frames = [];
        state.currentFrames = new Map();
        state.errors = [];
      },
      snapshot() {
        return JSON.parse(JSON.stringify({
          revision: 'core-v2-webgl-browser-probe/1',
          caseId: state.caseId,
          operation: state.operation,
          contexts: state.contexts,
          frames: state.frames,
          errors: state.errors,
        }));
      },
    });

    Object.defineProperty(window, probeName, {
      configurable: false,
      enumerable: false,
      writable: false,
      value: probe,
    });

    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      writable: true,
      value(type, ...options) {
        const context = Reflect.apply(originalGetContext, this, [type, ...options]);
        if (
          context
          && (type === 'webgl2' || type === 'webgl' || type === 'experimental-webgl')
        ) {
          let metadata = contextMetadata.get(context);
          if (!metadata) {
            metadata = {
              canvas: this,
              requestedContext: type,
              actualContext: typeof WebGL2RenderingContext !== 'undefined'
                && context instanceof WebGL2RenderingContext
                ? 'webgl2'
                : 'webgl',
              session: -1,
              contextIndex: -1,
              frameIndex: 0,
            };
            contextMetadata.set(context, metadata);
          }
          instrumentContext(context, metadata);
        }
        return context;
      },
    });

    function instrumentContext(context, metadata) {
      if (instrumentedContexts.has(context)) return;
      instrumentedContexts.add(context);
      wrapContextMethod(context, metadata, 'clear', (args) => {
        const mask = args[0];
        if (
          typeof mask === 'number'
          && (mask & context.COLOR_BUFFER_BIT) !== 0
          && isDefaultFramebuffer(context)
        ) {
          startFrame(context, metadata, 'clear');
        }
      });
      for (const method of [
        'drawArrays',
        'drawElements',
        'drawArraysInstanced',
        'drawElementsInstanced',
        'drawRangeElements',
      ]) {
        wrapContextMethod(context, metadata, method, () => {
          if (isDefaultFramebuffer(context)) recordDraw(context, metadata, method);
        });
      }
    }

    function wrapContextMethod(context, metadata, method, after) {
      const original = context[method];
      if (typeof original !== 'function') return;
      try {
        Object.defineProperty(context, method, {
          configurable: true,
          writable: true,
          value(...args) {
            const result = Reflect.apply(original, this, args);
            try {
              after(args);
            } catch (error) {
              recordProbeError(metadata, method, error);
            }
            return result;
          },
        });
      } catch (error) {
        recordProbeError(metadata, `instrument:${method}`, error);
      }
    }

    function ensureSessionContext(metadata) {
      if (metadata.session === state.session) return metadata.contextIndex;
      metadata.session = state.session;
      metadata.contextIndex = state.contexts.length;
      metadata.frameIndex = 0;
      state.contexts.push({
        index: metadata.contextIndex,
        requestedContext: metadata.requestedContext,
        actualContext: metadata.actualContext,
        width: metadata.canvas.width,
        height: metadata.canvas.height,
        trackedCanvas: metadata.canvas.dataset.patchMapProduct === 'patch-map',
      });
      return metadata.contextIndex;
    }

    function startFrame(context, metadata, source) {
      if (state.operation === null) return;
      const contextIndex = ensureSessionContext(metadata);
      const frame = {
        contextIndex,
        frameIndex: metadata.frameIndex,
        source,
        width: metadata.canvas.width,
        height: metadata.canvas.height,
        trackedCanvas: metadata.canvas.dataset.patchMapProduct === 'patch-map',
        draws: [],
      };
      metadata.frameIndex += 1;
      state.frames.push(frame);
      state.currentFrames.set(contextIndex, frame);
    }

    function recordDraw(context, metadata, method) {
      if (state.operation === null) return;
      const contextIndex = ensureSessionContext(metadata);
      let frame = state.currentFrames.get(contextIndex);
      if (!frame) {
        startFrame(context, metadata, 'implicit-draw');
        frame = state.currentFrames.get(contextIndex);
      }
      if (!frame || frame.draws.length >= 96) return;
      frame.draws.push({
        index: frame.draws.length,
        method,
        centerRgba: readPixelAtCssPoint(context, metadata.canvas, 10, 10),
        barColumn: readBarColumn(context, metadata.canvas),
      });
    }

    function readPixelAtCssPoint(context, canvas, cssX, cssY) {
      const x = Math.max(0, Math.min(canvas.width - 1, Math.floor(cssX * canvas.width / 800)));
      const topY = Math.max(0, Math.min(canvas.height - 1, Math.floor(cssY * canvas.height / 600)));
      const y = canvas.height - topY - 1;
      const pixel = new Uint8Array(4);
      context.readPixels(x, y, 1, 1, context.RGBA, context.UNSIGNED_BYTE, pixel);
      return rgbaHex(pixel);
    }

    function readBarColumn(context, canvas) {
      const candidateCssXs = [32, 40, 48, 56, 64, 72, 80, 88];
      let bestColumn = null;
      for (const cssX of candidateCssXs) {
        const column = readBarColumnAtCssX(context, canvas, cssX);
        if (column !== null && (bestColumn === null || column.height > bestColumn.height)) {
          bestColumn = column;
        }
      }
      return bestColumn;
    }

    function readBarColumnAtCssX(context, canvas, cssX) {
      const x = Math.max(0, Math.min(canvas.width - 1, Math.floor(cssX * canvas.width / 800)));
      const pixels = new Uint8Array(canvas.height * 4);
      context.readPixels(x, 0, 1, canvas.height, context.RGBA, context.UNSIGNED_BYTE, pixels);
      let bestStart = -1;
      let bestEnd = -1;
      let runStart = -1;
      for (let y = 0; y < canvas.height; y += 1) {
        const offset = y * 4;
        const matches = Math.abs(pixels[offset] - 0) <= 4
          && Math.abs(pixels[offset + 1] - 170) <= 4
          && Math.abs(pixels[offset + 2] - 102) <= 4
          && pixels[offset + 3] >= 250;
        if (matches && runStart < 0) runStart = y;
        if ((!matches || y === canvas.height - 1) && runStart >= 0) {
          const runEnd = matches && y === canvas.height - 1 ? y : y - 1;
          if (bestStart < 0 || runEnd - runStart > bestEnd - bestStart) {
            bestStart = runStart;
            bestEnd = runEnd;
          }
          runStart = -1;
        }
      }
      if (bestStart < 0) return null;
      return {
        sampleX: x,
        top: canvas.height - bestEnd - 1,
        bottomExclusive: canvas.height - bestStart,
        height: bestEnd - bestStart + 1,
        rgba: '#00aa66ff',
      };
    }

    function rgbaHex(pixel) {
      return `#${[...pixel].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
    }

    function isDefaultFramebuffer(context) {
      return context.getParameter(context.FRAMEBUFFER_BINDING) === null;
    }

    function recordProbeError(metadata, operation, error) {
      if (state.operation === null) return;
      state.errors.push({
        contextIndex: metadata.contextIndex,
        operation,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, { probeName, caseIdentity: caseId });
}
