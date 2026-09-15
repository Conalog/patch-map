import type { PatchMapPublishedTuple } from './lifecycle';

export interface PatchMapEngineCanvasHandle {
  readonly element: HTMLCanvasElement;
  readonly identity: 'initial-canvas';
  readonly cssSize: readonly [number, number];
  readonly backingSize: readonly [number, number];
}

export interface PatchMapEngineExtractionRequest {
  readonly targetTuple: PatchMapPublishedTuple;
  readonly cssSize: readonly [number, number];
  readonly mime: 'image/png';
}

export interface PatchMapEngineExtractionResult {
  readonly capturedTuple: PatchMapPublishedTuple;
  readonly cssSize: readonly [number, number];
  readonly backingSize: readonly [number, number];
  readonly mime: 'image/png';
  readonly dataUrl: string;
  readonly canvasIdentity: 'initial-canvas';
  readonly authoritativeCanvasRetained: true;
  readonly temporaryImageCount: 0;
  readonly renderTextureCount: 0;
}
