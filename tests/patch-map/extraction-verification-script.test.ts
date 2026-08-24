import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const performanceSource = readFileSync(
  new URL(
    '../../scripts/verification/patch-map-extraction-performance.mjs',
    import.meta.url,
  ),
  'utf8',
);
const harnessFacadeSource = readFileSync(
  new URL('../../performance/patch-map/harness.ts', import.meta.url),
  'utf8',
);
const ownedHarnessSource = [
  harnessFacadeSource,
  ...[
    '../../performance/patch-map/harness/contracts.ts',
    '../../performance/patch-map/harness/extraction-trial.ts',
    '../../performance/patch-map/harness/phase-measurements.ts',
    '../../performance/patch-map/harness/renderer-trial.ts',
  ].map((relativePath) =>
    readFileSync(new URL(relativePath, import.meta.url), 'utf8')),
].join('\n');
const packageSource = [
  '../../scripts/verification/patch-map-package.mjs',
  '../../scripts/verification/patch-map-package/consumer-sources.mjs',
].map((relativePath) =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8')).join('\n');
const memorySource = readFileSync(
  new URL('../../scripts/verification/patch-map-memory.mjs', import.meta.url),
  'utf8',
);

describe('PatchMap extraction verification scripts', () => {
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
    expect(harnessFacadeSource).toContain('runExtraction(spec: BenchmarkSpec)');
    expect(ownedHarnessSource).toContain('engine.extractPublishedScene({');
    expect(ownedHarnessSource).toContain(
      'sameCanvasObject: beforeCanvas.element === afterCanvas.element',
    );
    expect(ownedHarnessSource).toContain(
      'canvasCountAfterDestroy: destroyedSnapshot.resources.canvasCount',
    );
    expect(ownedHarnessSource).not.toContain('catalog-normalized-expected');
    expect(performanceSource).not.toContain('catalog-normalized-expected');
  });

  it('keeps packed and lifecycle artifacts redirectable while probing extraction', () => {
    expect(packageSource).toContain('PATCH_MAP_PACKAGE_ARTIFACT_DIR');
    expect(packageSource).toContain('const capture = await map.capture.png()');
    expect(packageSource).toContain('capturePrefix: capture.dataUrl.slice(0, 22)');
    expect(packageSource).toContain('map.data.replace([');
    expect(packageSource).toContain('rejectedReplaceAtomic:');
    expect(packageSource).toContain('internalExportsAbsent: internalNames.every');
    expect(packageSource).toContain('canvasCountAfterDestroy:');
    expect(memorySource).toContain('PATCH_MAP_MEMORY_ARTIFACT_DIR');
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
    expect(memorySource).toContain("engine.accessibilityTree('scene')");
    expect(memorySource).toContain("engine.focusAccessibilityTarget('rect-b')");
    expect(memorySource).toContain(
      'trial.accessibilityBeforeDestroy?.surface?.shadowDomNodeCount !== 2',
    );
    expect(memorySource).toContain(
      'trial.accessibilityBeforeDestroy?.surface?.rootListenerCount !== 1',
    );
    expect(memorySource).toContain(
      'trial.accessibilityAfterDestroy?.surface !== null',
    );
    expect(memorySource).toContain('trial.retainedHostChildCount !== 0');
  });
});
