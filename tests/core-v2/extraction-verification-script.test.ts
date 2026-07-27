import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const performanceSource = readFileSync(
  new URL(
    '../../scripts/verification/core-v2-extraction-performance.mjs',
    import.meta.url,
  ),
  'utf8',
);
const harnessSource = readFileSync(
  new URL('../../performance/core-v2/harness.ts', import.meta.url),
  'utf8',
);
const packageSource = readFileSync(
  new URL('../../scripts/verification/core-v2-package.mjs', import.meta.url),
  'utf8',
);
const memorySource = readFileSync(
  new URL('../../scripts/verification/core-v2-memory.mjs', import.meta.url),
  'utf8',
);

describe('Core v2 extraction verification scripts', () => {
  it('pins the six-scale 2+7 Chromium 4x protocol with ten captures per trial', () => {
    expect(performanceSource).toContain(
      "const SCALES = Object.freeze([100, 500, 1_000, 2_000, 5_000, 'production']);",
    );
    expect(performanceSource).toContain('const WARMUPS = 2;');
    expect(performanceSource).toContain('const MEASURED = 7;');
    expect(performanceSource).toContain('const EXTRACTIONS_PER_TRIAL = 10;');
    expect(performanceSource).toContain('const CPU_THROTTLE_RATE = 4;');
    expect(performanceSource).toContain("windowsNative: 'pending'");
  });

  it('measures the public exact-tuple Engine API without normalized expected evidence', () => {
    expect(harnessSource).toContain('runExtraction(spec: BenchmarkSpec)');
    expect(harnessSource).toContain('engine.extractPublishedScene({');
    expect(harnessSource).toContain('sameCanvasObject: beforeCanvas.element === afterCanvas.element');
    expect(harnessSource).toContain('canvasCountAfterDestroy: destroyedSnapshot.resources.canvasCount');
    expect(harnessSource).not.toContain('catalog-normalized-expected');
    expect(performanceSource).not.toContain('catalog-normalized-expected');
  });

  it('keeps packed and lifecycle artifacts redirectable while probing extraction', () => {
    expect(packageSource).toContain('CORE_V2_PACKAGE_ARTIFACT_DIR');
    expect(packageSource).toContain('engine.extractPublishedScene({');
    expect(packageSource).toContain('extractionType: typeof CoreV2Engine.prototype.extractPublishedScene');
    expect(packageSource).toContain('validateCoreV2DatasetReferences(engine.exportDataset())');
    expect(packageSource).toContain("strictReferenceValidatorType: typeof validateCoreV2DatasetReferences");
    expect(packageSource).toContain('resolveCoreV2EditorMount(false)');
    expect(packageSource).toContain('engine.bindTooltipHost(');
    expect(packageSource).toContain('engine.hoverTooltipAtScreen({ x: 20, y: 30 }, [160, 80])');
    expect(packageSource).toContain("tooltipRevision: CORE_V2_HOST_TOOLTIP_REVISION");
    expect(packageSource).toContain("editorMountRevision: CORE_V2_EDITOR_MOUNT_REVISION");
    expect(packageSource).toContain(
      'pageLifecycleRevision: CORE_V2_PAGE_LIFECYCLE_REVISION',
    );
    expect(packageSource).toContain('engine.setDocumentVisibility({');
    expect(memorySource).toContain('CORE_V2_MEMORY_ARTIFACT_DIR');
    expect(memorySource).toContain('engine.extractPublishedScene({');
    expect(memorySource).toContain('tooltipSubscription = engine.bindTooltipHost(');
    expect(memorySource).toContain(
      "JSON.stringify(['hover', 'pin', 'drag', 'redraw', 'destroy'])",
    );
    expect(memorySource).toContain('engine.registerPageLifecycleWork({');
    expect(memorySource).toContain(
      'trial.pageLifecycleAfterDestroy?.pendingWorkCount !== 0',
    );
    expect(memorySource).toContain(
      "trial.tooltipSubscriptionDisposeAfterDestroy !== 'disposed'",
    );
    expect(memorySource).toContain('trial.extractionBeforeDestroy?.pendingWorkAfter !== 0');
  });
});
