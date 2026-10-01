import type {
  PatchMapApi,
  PatchMapOptions,
  PatchMapRotationApi,
  PatchMapTransactionOperation,
  PatchMapTransactionOptions,
  PatchMapUpdate,
  PatchMapUpdateBatch,
  PatchMapUpdateResult,
  PatchMapViewportApi,
  PatchMapViewportSnapshot,
} from './contracts';

/** Browser image session. Width and height are final output pixels. */
export interface PatchMapImageOptions extends Pick<PatchMapOptions,
  'theme' | 'instanceId' | 'antialias' | 'background' | 'zoomLimits' |
  'assets' | 'assetRuntime' | 'assetPolicy' | 'fit' | 'powerPreference'
> {
  readonly data: unknown;
  readonly width: number;
  readonly height: number;
  readonly viewport?: Readonly<{ readonly initial?: PatchMapViewportSnapshot }>;
}

export interface PatchMapImageMutationOptions {
  readonly actionId?: string;
}

export interface PatchMapImageTransactionOptions extends PatchMapImageMutationOptions {
  readonly conflictPolicy?: NonNullable<PatchMapTransactionOptions['conflictPolicy']>;
}

export type PatchMapImageRenderOptions =
  | Readonly<{ readonly format?: 'png'; readonly quality?: never; readonly signal?: AbortSignal }>
  | Readonly<{ readonly format: 'jpeg'; readonly quality?: number; readonly signal?: AbortSignal }>;

export interface PatchMapImageResult {
  readonly blob: Blob;
  readonly mime: 'image/png' | 'image/jpeg';
  readonly size: readonly [number, number];
}

/** Reusable image session; mutations commit immediately without history or animation. */
export interface PatchMapImageInstance {
  readonly data: Pick<PatchMapApi['data'], 'replace' | 'snapshot' | 'serialize'>;
  readonly targets: PatchMapApi['targets'];
  readonly assets: PatchMapApi['assets'];
  readonly viewport: Pick<PatchMapViewportApi, 'fit' | 'snapshot' | 'restore' | 'state'>;
  readonly rotation: Omit<PatchMapRotationApi, 'animateTo'>;
  update(input: PatchMapUpdate, options?: PatchMapImageMutationOptions): PatchMapUpdateResult;
  updateBatch(input: PatchMapUpdateBatch, options?: PatchMapImageMutationOptions): PatchMapUpdateResult;
  transaction(
    operations: readonly PatchMapTransactionOperation[],
    options?: PatchMapImageTransactionOptions,
  ): PatchMapUpdateResult;
  render(options?: PatchMapImageRenderOptions): Promise<PatchMapImageResult>;
  readonly destroyed: boolean;
  destroy(): Promise<boolean>;
}

export interface PatchMapImageStatic {
  create(options: PatchMapImageOptions): Promise<PatchMapImageInstance>;
}
