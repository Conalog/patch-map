import type { PatchMapApi } from './contracts';
import type {
  PatchMapImageInstance,
  PatchMapImageRenderOptions,
  PatchMapImageResult,
  PatchMapImageTransactionOptions,
} from './image-contracts';

interface ImageHost {
  renderImage(request: Readonly<{
    mime: 'image/png' | 'image/jpeg'; quality?: number; signal?: AbortSignal;
  }>): Promise<PatchMapImageResult>;
  readonly destroyed: boolean;
  destroy(): Promise<boolean>;
}

/** Stateless image facade over the same mutation and lifecycle authorities as mount. */
export function createPatchMapImageApi(host: ImageHost, api: PatchMapApi): PatchMapImageInstance {
  return Object.freeze({
    data: Object.freeze({
      replace: api.data.replace,
      snapshot: api.data.snapshot,
      serialize: api.data.serialize,
    }),
    targets: api.targets,
    assets: api.assets,
    viewport: Object.freeze({
      fit: api.viewport.fit,
      snapshot: api.viewport.snapshot,
      restore: api.viewport.restore,
      get state() { return api.viewport.state; },
    }),
    rotation: Object.freeze({
      get value() { return api.rotation.value; },
      set value(angle: number) { api.rotation.value = angle; },
      set: api.rotation.set,
      rotateBy: api.rotation.rotateBy,
      reset: api.rotation.reset,
    }),
    update: (input, options) => api.update(input, mutationOptions(options)),
    updateBatch: (input, options) => api.updateBatch(input, mutationOptions(options)),
    transaction: (operations, options) => api.transaction(operations, mutationOptions(options, true)),
    render: async (options?: PatchMapImageRenderOptions) => {
      const normalized = normalizeRenderOptions(options);
      return host.renderImage({
        mime: normalized.format === 'jpeg' ? 'image/jpeg' : 'image/png',
        ...(normalized.quality === undefined ? {} : { quality: normalized.quality }),
        ...(normalized.signal === undefined ? {} : { signal: normalized.signal }),
      });
    },
    get destroyed() { return host.destroyed; },
    destroy: () => host.destroy(),
  } satisfies PatchMapImageInstance);
}

function mutationOptions(
  options: PatchMapImageTransactionOptions | undefined,
  transaction = false,
) {
  if (options !== undefined) {
    assertOptionsObject(options, 'mutation options');
    for (const key of Object.keys(options)) {
      if (key !== 'actionId' && !(transaction && key === 'conflictPolicy')) {
        throw new TypeError(`Image mutations do not support ${key}`);
      }
    }
  }
  const actionId = options?.actionId;
  const conflictPolicy = transaction ? options?.conflictPolicy : undefined;
  return {
    ...(actionId === undefined ? {} : { actionId }),
    ...(conflictPolicy === undefined ? {} : { conflictPolicy }),
    animate: false,
    recordHistory: false,
  };
}

function normalizeRenderOptions(options: PatchMapImageRenderOptions | undefined): PatchMapImageRenderOptions {
  if (options === undefined) return { format: 'png' };
  assertOptionsObject(options, 'render options');
  for (const key of Object.keys(options)) {
    if (key !== 'format' && key !== 'quality' && key !== 'signal') {
      throw new TypeError(`render does not support ${key}`);
    }
  }
  const format = options.format === undefined ? 'png' : options.format;
  if (format !== 'png' && format !== 'jpeg') throw new TypeError('format must be png or jpeg');
  if (options.quality !== undefined && (
    format !== 'jpeg' || !Number.isFinite(options.quality) || options.quality < 0 || options.quality > 1
  )) throw new RangeError('quality requires JPEG and a finite number between 0 and 1');
  if (options.signal !== undefined && !(options.signal instanceof AbortSignal)) {
    throw new TypeError('signal must be an AbortSignal');
  }
  return options;
}

function assertOptionsObject(value: unknown, name: string): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
}
