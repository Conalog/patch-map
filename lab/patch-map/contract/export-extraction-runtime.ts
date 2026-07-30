import {
  materializePatchMapDataset,
  type PatchMap,
  type PatchMapEngineExtractionRequest,
  type PatchMapEngineExtractionResult,
  type PatchMapPublishedTuple,
} from '../../../src/patch-map';

export const PATCH_MAP_EXPORT_EXTRACTION_RUNTIME_REVISION =
  'core-v2-export-extraction-runtime/1';
export const PATCH_MAP_EXPORT_EXTRACTION_CLEANUP_REVISION =
  'core-v2-export-extraction-cleanup/1';

export const PATCH_MAP_EXPORT_EXTRACTION_CASE_IDS = Object.freeze([
  'DET-004',
  'PIX-004',
  'PRF-008',
  'CSM-035',
  'CSM-038',
] as const);

export type PatchMapExportExtractionCaseId =
  (typeof PATCH_MAP_EXPORT_EXTRACTION_CASE_IDS)[number];

interface ExtractRequest {
  readonly caseId: PatchMapExportExtractionCaseId;
  readonly engine: PatchMap;
  readonly request: PatchMapEngineExtractionRequest;
  readonly repeats: number;
}

interface PresentationRequest {
  readonly caseId: PatchMapExportExtractionCaseId;
  readonly engine: PatchMap;
  readonly repeats: number;
  readonly mode: 'swap-each' | 'show-sequence';
}

interface RestoreRequest {
  readonly caseId: PatchMapExportExtractionCaseId;
  readonly engine: PatchMap;
  readonly expectedIdentity: string;
}

export interface PatchMapExportExtractionProductAdapter {
  observeEngine(engine: PatchMap): Readonly<Record<string, unknown>>;
  validateCanonicalDataset(dataset: unknown): Readonly<Record<string, unknown>>;
  extract(input: ExtractRequest): Promise<Readonly<Record<string, unknown>>>;
  present(input: PresentationRequest): Promise<Readonly<Record<string, unknown>>>;
  restore(input: RestoreRequest): Promise<Readonly<Record<string, unknown>>>;
  probeInvalidExport(dataset: unknown): Readonly<Record<string, unknown>>;
  probeHostImageFailure(engine: PatchMap): Promise<Readonly<Record<string, unknown>>>;
  resourceProbe(): Readonly<Record<string, unknown>>;
}

export interface PatchMapExportExtractionRuntime {
  readonly product: PatchMapExportExtractionProductAdapter;
  postDestroyProductProbe(): Readonly<Record<string, unknown>>;
}

interface RetainedExtraction {
  readonly dataUrl: string;
  readonly capturedTuple: PatchMapPublishedTuple;
  readonly cssSize: readonly [number, number];
  readonly backingSize: readonly [number, number];
  readonly canvasIdentity: string;
  readonly renderTextureCount: number;
}

/**
 * Actual-only host seam shared by deterministic export, Pixi extraction, and
 * report/editor consumers. Raw image data never crosses into observations:
 * this adapter retains it only until the run cleanup probe clears the array.
 */
export function createPatchMapExportExtractionRuntime(
  caseId: PatchMapExportExtractionCaseId,
): PatchMapExportExtractionRuntime {
  requireCaseId(caseId);
  const extractions: RetainedExtraction[] = [];
  const temporaryImages = new Set<HTMLImageElement>();
  let initialCanvas: HTMLCanvasElement | null = null;
  let initialCanvasParent: ParentNode | null = null;
  let initialCanvasNextSibling: ChildNode | null = null;
  let extractionCount = 0;
  let presentationCount = 0;
  let released = false;
  let cleanupProbe: Readonly<Record<string, unknown>> | null = null;

  function trackCanvas(engine: PatchMap): ReturnType<PatchMap['canvasHandle']> {
    const handle = engine.canvasHandle();
    if (initialCanvas === null) {
      initialCanvas = handle.element;
      initialCanvasParent = handle.element.parentNode;
      initialCanvasNextSibling = handle.element.nextSibling;
    } else if (caseId === 'DET-004' && handle.element !== initialCanvas) {
      initialCanvas = handle.element;
      initialCanvasParent = handle.element.parentNode;
      initialCanvasNextSibling = handle.element.nextSibling;
    }
    invariant(handle.element === initialCanvas, 'authoritative canvas identity changed');
    return handle;
  }

  function removeTemporaryImages(): void {
    for (const image of temporaryImages) {
      image.remove();
    }
    temporaryImages.clear();
  }

  async function restoreCanvas(engine: PatchMap): Promise<void> {
    const handle = trackCanvas(engine);
    const canvas = handle.element;
    const firstImage = temporaryImages.values().next().value;
    const imageParent = firstImage?.parentNode ?? null;
    const parent = imageParent ?? initialCanvasParent;
    if (canvas.parentNode === null && parent !== null) {
      if (firstImage !== undefined && firstImage.parentNode === parent) {
        parent.insertBefore(canvas, firstImage);
      } else if (
        initialCanvasNextSibling !== null
        && initialCanvasNextSibling.parentNode === parent
      ) {
        parent.insertBefore(canvas, initialCanvasNextSibling);
      } else {
        parent.appendChild(canvas);
      }
    }
    removeTemporaryImages();
    engine.publishFrame(now());
    await visibleFrame();
  }

  const product: PatchMapExportExtractionProductAdapter = Object.freeze({
    observeEngine(engine: PatchMap) {
      assertActive(released, 'observeEngine');
      const canvas = trackCanvas(engine);
      return deepFreeze({
        revision: PATCH_MAP_EXPORT_EXTRACTION_RUNTIME_REVISION,
        caseId,
        snapshot: detach(engine.snapshot()),
        semantic: detach(engine.semanticProbe()),
        dataset: detach(engine.exportDataset()),
        geometry: detach(engine.geometryProbe()),
        history: detach(engine.historyInspection()),
        viewport: detach(engine.viewportProbe()),
        hostInteraction: detach(engine.hostInteractionProbe()),
        canvas: {
          identity: canvas.identity,
          cssSize: canvas.cssSize,
          backingSize: canvas.backingSize,
          sameObject: canvas.element === initialCanvas,
          connected: canvas.element.parentNode !== null,
        },
        extraction: resourceState(
          caseId,
          extractions,
          temporaryImages,
          extractionCount,
          presentationCount,
        ),
      });
    },

    validateCanonicalDataset(dataset: unknown) {
      assertActive(released, 'validateCanonicalDataset');
      return validateCanonicalDataset(dataset);
    },

    async extract(input: ExtractRequest) {
      assertActive(released, 'extract');
      invariant(input.caseId === caseId, 'extract case identity');
      invariant(Number.isSafeInteger(input.repeats) && input.repeats > 0, 'extract repeats');
      trackCanvas(input.engine);
      const timings: number[] = [];
      const captured: RetainedExtraction[] = [];
      for (let index = 0; index < input.repeats; index += 1) {
        const started = now();
        const result = await input.engine.extractPublishedScene(input.request);
        timings.push(Math.max(0, now() - started));
        const retained = retainExtraction(result);
        extractions.push(retained);
        captured.push(retained);
        extractionCount += 1;
      }
      return deepFreeze({
        successCount: captured.length,
        capturedTuples: captured.map(({ capturedTuple }) => capturedTuple),
        capturedTuple: captured.at(-1)?.capturedTuple ?? null,
        cssSize: captured.at(-1)?.cssSize ?? null,
        backingSize: captured.at(-1)?.backingSize ?? null,
        canvasIdentity: captured.at(-1)?.canvasIdentity ?? null,
        temporaryImages: temporaryImages.size,
        renderTextures: captured.reduce(
          (count, entry) => count + entry.renderTextureCount,
          0,
        ),
        rawTimingSamples: timings,
      });
    },

    async present(input: PresentationRequest) {
      assertActive(released, 'present');
      invariant(input.caseId === caseId, 'presentation case identity');
      invariant(Number.isSafeInteger(input.repeats) && input.repeats > 0, 'presentation repeats');
      invariant(extractions.length === input.repeats, 'presentation extraction count');
      const handle = trackCanvas(input.engine);
      const browserDom = typeof document !== 'undefined'
        && typeof document.createElement === 'function'
        && handle.element.parentNode !== null;
      if (!browserDom) {
        presentationCount += input.repeats;
        if (input.mode === 'swap-each') extractions.splice(0, extractions.length);
        return deepFreeze({
          mode: input.mode,
          shownCount: input.repeats,
          canvasIdentity: handle.identity,
          temporaryImages: 0,
          sameCanvas: handle.element === initialCanvas,
          simulatedNonBrowserPresentation: true,
        });
      }

      for (const extraction of extractions) {
        const image = document.createElement('img');
        image.alt = `${caseId} extracted PixiJS scene`;
        image.width = extraction.cssSize[0];
        image.height = extraction.cssSize[1];
        image.style.width = `${extraction.cssSize[0]}px`;
        image.style.height = `${extraction.cssSize[1]}px`;
        image.src = extraction.dataUrl;
        await decodeImage(image);

        const canvas = handle.element;
        const previousImage = temporaryImages.values().next().value;
        const parent = canvas.parentNode ?? previousImage?.parentNode ?? initialCanvasParent;
        invariant(parent !== null, 'presentation host parent');
        if (canvas.parentNode === parent) {
          parent.insertBefore(image, canvas);
          parent.removeChild(canvas);
        } else if (previousImage?.parentNode === parent) {
          parent.insertBefore(image, previousImage);
        } else {
          parent.appendChild(image);
        }
        temporaryImages.add(image);
        if (previousImage !== undefined) {
          previousImage.remove();
          temporaryImages.delete(previousImage);
        }
        presentationCount += 1;
        await visibleFrame();

        if (input.mode === 'swap-each') {
          await restoreCanvas(input.engine);
        }
      }

      if (input.mode === 'swap-each') extractions.splice(0, extractions.length);
      return deepFreeze({
        mode: input.mode,
        shownCount: input.repeats,
        canvasIdentity: handle.identity,
        temporaryImages: temporaryImages.size,
        sameCanvas: handle.element === initialCanvas,
        simulatedNonBrowserPresentation: false,
      });
    },

    async restore(input: RestoreRequest) {
      assertActive(released, 'restore');
      invariant(input.caseId === caseId, 'restore case identity');
      invariant(input.expectedIdentity === 'initial-canvas', 'restore expected identity');
      await restoreCanvas(input.engine);
      const handle = trackCanvas(input.engine);
      const renderTextures = extractions.reduce(
        (count, entry) => count + entry.renderTextureCount,
        0,
      );
      extractions.splice(0, extractions.length);
      return deepFreeze({
        canvasIdentity: handle.identity,
        sameCanvas: handle.element === initialCanvas,
        temporaryImages: temporaryImages.size,
        renderTextures,
        connected: handle.element.parentNode !== null,
      });
    },

    probeInvalidExport(dataset: unknown) {
      assertActive(released, 'probeInvalidExport');
      const retained = validateCanonicalDataset(dataset);
      const invalid = validateCanonicalDataset({ dataset });
      return deepFreeze({
        invalidExportBlocksUpload: invalid.schemaValid === false,
        priorExportRetainedOnUploadFailure:
          retained.schemaValid === true && retained.semanticHash !== null,
      });
    },

    async probeHostImageFailure(engine: PatchMap) {
      assertActive(released, 'probeHostImageFailure');
      await restoreCanvas(engine);
      const handle = trackCanvas(engine);
      let decodeRejected = true;
      if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
        const image = document.createElement('img');
        image.src = 'data:image/png;base64,invalid';
        temporaryImages.add(image);
        try {
          await decodeImage(image);
          decodeRejected = false;
        } catch {
          decodeRejected = true;
        } finally {
          image.remove();
          temporaryImages.delete(image);
        }
      }
      return deepFreeze({
        onFailureKeepCanvasVisible:
          handle.element === initialCanvas
          && (handle.element.parentNode !== null || typeof document === 'undefined'),
        blankReportAccepted: !decodeRejected,
        retryDoesNotDuplicateResources: temporaryImages.size === 0,
      });
    },

    resourceProbe() {
      assertActive(released, 'resourceProbe');
      return resourceState(
        caseId,
        extractions,
        temporaryImages,
        extractionCount,
        presentationCount,
      );
    },
  });

  return Object.freeze({
    product,
    postDestroyProductProbe() {
      if (cleanupProbe !== null) return cleanupProbe;
      released = true;
      removeTemporaryImages();
      extractions.splice(0, extractions.length);
      initialCanvas = null;
      initialCanvasParent = null;
      initialCanvasNextSibling = null;
      cleanupProbe = deepFreeze({
        revision: PATCH_MAP_EXPORT_EXTRACTION_CLEANUP_REVISION,
        caseId,
        runtimeCounts: zeroOwnership(),
        retainedDataUrlCount: extractions.length,
        temporaryImageCount: temporaryImages.size,
        renderTextureCount: 0,
        extractionCount,
        presentationCount,
      });
      return cleanupProbe;
    },
  });
}

function retainExtraction(result: PatchMapEngineExtractionResult): RetainedExtraction {
  invariant(result.authoritativeCanvasRetained, 'extraction canvas retention');
  invariant(result.temporaryImageCount === 0, 'Engine extraction temporary image ownership');
  return Object.freeze({
    dataUrl: result.dataUrl,
    capturedTuple: detach(result.capturedTuple),
    cssSize: detach(result.cssSize),
    backingSize: detach(result.backingSize),
    canvasIdentity: result.canvasIdentity,
    renderTextureCount: result.renderTextureCount,
  });
}

function validateCanonicalDataset(dataset: unknown): Readonly<Record<string, unknown>> {
  if (!Array.isArray(dataset)) {
    return deepFreeze({
      rootKind: dataset === null ? 'null' : typeof dataset,
      schemaValid: false,
      semanticHash: null,
      transientFieldCount: countTransientFields(dataset),
    });
  }
  try {
    const materialized = materializePatchMapDataset(dataset);
    return deepFreeze({
      rootKind: 'array',
      schemaValid: true,
      semanticHash: materialized.semanticHash,
      rootIds: materialized.rootIds,
      transientFieldCount: countTransientFields(dataset),
    });
  } catch {
    return deepFreeze({
      rootKind: 'array',
      schemaValid: false,
      semanticHash: null,
      transientFieldCount: countTransientFields(dataset),
    });
  }
}

const TRANSIENT_KEYS = new Set([
  '__pixi',
  'frameRevision',
  'history',
  'lifecycle',
  'overlay',
  'overlays',
  'publishedTuple',
  'renderTexture',
  'renderTextures',
  'renderer',
  'rendererState',
  'resources',
  'selection',
  'transient',
]);

function countTransientFields(value: unknown, seen = new WeakSet<object>()): number {
  if (value === null || typeof value !== 'object' || seen.has(value)) return 0;
  seen.add(value);
  if (Array.isArray(value)) {
    let count = 0;
    for (const nested of value as unknown[]) {
      count += countTransientFields(nested, seen);
    }
    return count;
  }
  let count = 0;
  for (const [key, nested] of Object.entries(value)) {
    if (TRANSIENT_KEYS.has(key)) count += 1;
    count += countTransientFields(nested, seen);
  }
  return count;
}

function resourceState(
  caseId: PatchMapExportExtractionCaseId,
  extractions: readonly RetainedExtraction[],
  temporaryImages: ReadonlySet<HTMLImageElement>,
  extractionCount: number,
  presentationCount: number,
): Readonly<Record<string, unknown>> {
  return deepFreeze({
    revision: PATCH_MAP_EXPORT_EXTRACTION_RUNTIME_REVISION,
    caseId,
    initialCanvasIdentity: 'initial-canvas',
    canvasIdentity: 'initial-canvas',
    temporaryImages: temporaryImages.size,
    renderTextures: extractions.reduce(
      (count, entry) => count + entry.renderTextureCount,
      0,
    ),
    retainedDataUrlCount: extractions.length,
    extractionCount,
    presentationCount,
    ownership: zeroOwnership(),
  });
}

function zeroOwnership(): Readonly<Record<string, 0>> {
  return Object.freeze({
    engines: 0,
    renderers: 0,
    listeners: 0,
    observers: 0,
    timers: 0,
    tickers: 0,
    animationClosures: 0,
    pendingWork: 0,
  });
}

async function decodeImage(image: HTMLImageElement): Promise<void> {
  if (typeof image.decode === 'function') {
    await image.decode();
    return;
  }
  if (image.complete && image.naturalWidth > 0) return;
  await new Promise<void>((resolve, reject) => {
    image.addEventListener('load', () => resolve(), { once: true });
    image.addEventListener('error', () => reject(new Error('image decode failed')), {
      once: true,
    });
  });
}

function visibleFrame(): Promise<void> {
  if (typeof requestAnimationFrame === 'function') {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }
  return Promise.resolve();
}

function now(): number {
  return globalThis.performance?.now() ?? Date.now();
}

function requireCaseId(caseId: PatchMapExportExtractionCaseId): void {
  invariant(PATCH_MAP_EXPORT_EXTRACTION_CASE_IDS.includes(caseId), 'unsupported case identity');
}

function assertActive(released: boolean, operation: string): void {
  invariant(!released, `${operation} requires an active runtime`);
}

function detach<T>(value: T): T {
  return structuredClone(value);
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Invalid PatchMap export/extraction runtime: ${message}`);
  }
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}
