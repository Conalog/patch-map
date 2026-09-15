export type ExtractionScale = 100 | 500 | 1_000 | 2_000 | 5_000 | 'production';

export interface ExtractionSpec {
  readonly scale: ExtractionScale;
  readonly seed: number;
  readonly warmups: number;
  readonly measured: number;
}

export interface ExtractionTrial {
  readonly trial: number;
  readonly seed: number;
  readonly extractionSamplesMs: readonly number[];
  readonly totalMs: number;
  readonly retainedJsHeapBytes: number;
  readonly diagnostics: Readonly<{
    sourceRootCount: number;
    requestedTuple: Readonly<{ scene: number; view: number; interaction: number }>;
    capturedTuple: Readonly<{ scene: number; view: number; interaction: number }>;
    cssSize: readonly number[];
    backingSize: readonly number[];
    dataUrlLengths: readonly number[];
    sameCanvasObject: boolean;
    authoritativeCanvasRetained: boolean;
    temporaryImageCount: number;
    renderTextureCount: number;
    pendingWorkAfter: number;
    inputUnchanged: boolean;
    backend: 'webgl' | 'webgpu' | null;
    destroyReturned: boolean;
    lifecycleAfterDestroy: string;
    canvasCountAfterDestroy: number;
  }>;
}

export interface ExtractionResult {
  readonly warmupRaw: readonly ExtractionTrial[];
  readonly measuredRaw: readonly ExtractionTrial[];
}
