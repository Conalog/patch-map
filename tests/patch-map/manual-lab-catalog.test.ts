import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  PATCH_MAP_CONTRACT_PRESENTERS,
  selectPatchMapContractPresenter,
} from '../../lab/patch-map/contract/presenters';
import {
  PATCH_MAP_KOREAN_CASE_TITLES,
  patchMapKoreanCaseTitle,
} from '../../lab/patch-map/contract/korean-copy';
import { renderPatchMapManualWorkbench } from '../../lab/patch-map/interactive/manual-workbench';
import {
  PATCH_MAP_MANUAL_ACTION_COUNT,
  PATCH_MAP_MANUAL_CASE_CATALOG,
  PATCH_MAP_MANUAL_CASE_COUNT,
  PATCH_MAP_MANUAL_TOOL_LABELS,
  selectPatchMapManualCase,
} from '../../lab/patch-map/interactive/manual-case-catalog';
import {
  buildPatchMapManualScene,
  buildPatchMapManualSceneAsync,
  PATCH_MAP_MANUAL_SCENE_SIZE_OPTIONS,
} from '../../lab/patch-map/interactive/manual-scene';
import { PATCH_MAP_MANUAL_LAB_ZOOM_LIMITS } from '../../lab/patch-map/lab-settings';
import { materializePatchMapDataset } from '../../src/patch-map/semantic/dataset';

describe('PatchMap human-operated Lab catalog', () => {
  it('maps all 173 cases and 646 approved actions without a second case runtime', () => {
    expect(PATCH_MAP_MANUAL_CASE_COUNT).toBe(173);
    expect(PATCH_MAP_MANUAL_ACTION_COUNT).toBe(646);
    expect(PATCH_MAP_MANUAL_CASE_CATALOG.map(({ caseId }) => caseId))
      .toEqual(PATCH_MAP_CONTRACT_PRESENTERS.map(({ caseId }) => caseId));

    for (const [index, descriptor] of PATCH_MAP_MANUAL_CASE_CATALOG.entries()) {
      const presenter = PATCH_MAP_CONTRACT_PRESENTERS[index];
      expect(presenter, descriptor.caseId).toBeDefined();
      expect(descriptor).toMatchObject({
        revision: 'core-v2-manual-lab/1',
        caseId: presenter?.caseId,
        title: patchMapKoreanCaseTitle(descriptor.caseId),
      });
      expect(descriptor.title, `${descriptor.caseId} Korean title`).toMatch(/[가-힣]/u);
      expect(descriptor.tasks.join(' '), `${descriptor.caseId} Korean tasks`).toMatch(/[가-힣]/u);
      expect(descriptor.tools.length, `${descriptor.caseId} tools`).toBeGreaterThan(0);
      expect(new Set(descriptor.tools).size, `${descriptor.caseId} unique tools`)
        .toBe(descriptor.tools.length);
      expect(descriptor.tasks.length, `${descriptor.caseId} tasks`).toBeGreaterThanOrEqual(2);
      expect(descriptor.actions.map(({ index: actionIndex, type }) => ({
        index: actionIndex,
        type,
      }))).toEqual(presenter?.actions.map(({ index: actionIndex, type }) => ({
        index: actionIndex,
        type,
      })));
      for (const action of descriptor.actions) {
        expect(descriptor.tools, `${descriptor.caseId}:${action.type} tool`).toContain(action.group);
        expect(PATCH_MAP_MANUAL_TOOL_LABELS[action.group]).toBeTypeOf('string');
        expect(action.label, `${descriptor.caseId}:${action.type} Korean label`).toMatch(/[가-힣]/u);
        expect(action.instruction, `${descriptor.caseId}:${action.type} Korean instruction`)
          .toMatch(/[가-힣]/u);
        expect(action.instruction.length, `${descriptor.caseId}:${action.type} instruction`)
          .toBeGreaterThan(12);
      }
      expect(JSON.stringify(descriptor)).not.toMatch(
        /normalizedExpected|approvedExpected|comparisonResult/u,
      );
    }
    expect(Object.keys(PATCH_MAP_KOREAN_CASE_TITLES)).toHaveLength(173);
  });

  it('pins direct free-play recipes for history, selection, transformer, and bars', () => {
    expect(selectPatchMapManualCase('HIS-001').tools[0]).toBe('history');
    expect(selectPatchMapManualCase('SEL-005').tools[0]).toBe('selection');
    expect(selectPatchMapManualCase('TRN-009').tools[0]).toBe('transform');
    expect(selectPatchMapManualCase('REN-009').tools[0]).toBe('animation');
    expect(selectPatchMapManualCase('CSM-038').tools[0]).toBe('assets');
    expect(selectPatchMapManualCase('HIS-001').tasks.join(' ')).toMatch(
      /실행 취소.+Ctrl\/Cmd\+Z/u,
    );
    expect(selectPatchMapManualCase('SEL-005').tasks.join(' ')).toMatch(
      /영역 선택.+드래그.+Shift/u,
    );
    expect(selectPatchMapManualCase('TRN-009').tasks.join(' ')).toMatch(
      /드래그.+히스토리 한 단계.+Escape/u,
    );
    expect(selectPatchMapManualCase('REN-009').tasks.join(' ')).toMatch(
      /전체.+10%.+선택 막대/u,
    );
  });

  it('renders a persistent workbench and per-action manual tool links on every route', () => {
    for (const caseId of ['HIS-001', 'SEL-005', 'TRN-009', 'REN-009', 'CSM-038']) {
      const presenter = selectPatchMapContractPresenter(caseId);
      const markup = renderPatchMapManualWorkbench(presenter);
      expect(markup).toContain('data-testid="manual-workbench"');
      expect(markup).toContain('data-testid="manual-canvas-host"');
      expect(markup).toContain('173/173');
      expect(markup).toContain('646/646개 작업');
      expect(markup).toContain('처음이라면 여기부터');
      expect(markup).toContain('버튼은 세 단계로 사용하면 됩니다');
      expect(markup).toContain('<details open>');
      expect(markup).toContain('화면 구성과 많은 버튼을 빠르게 이해하기');
      expect(markup).toContain('직접 조작하는 제품 실험실');
      expect(markup).toContain('초당 프레임 / 최대 간격');
      expect(markup).toContain('data-manual-command="undo"');
      expect(markup).toContain('data-manual-command="animate-all"');
      expect(markup).toContain('data-manual-command="scene-size"');
      expect(markup).toContain('data-manual-scene-size');
      expect(markup).toContain('<option value="10000">10,000개 · 탐색용</option>');
      expect(markup).toContain('data-manual-command="destroy-session"');
      for (const action of presenter.actions) {
        expect(markup).toContain(`data-manual-approved-action="${action.type}"`);
      }
      expect(markup).not.toMatch(
        /Human-operated product Lab|Keep the engine alive|Selection you can keep changing|Approved action map/u,
      );
    }
  });

  it('keeps pure workbench rendering separate from the live product session', async () => {
    const [sessionSource, viewSource] = await Promise.all([
      readFile(
        new URL('../../lab/patch-map/interactive/manual-workbench.ts', import.meta.url),
        'utf8',
      ),
      readFile(
        new URL('../../lab/patch-map/interactive/manual-workbench-view.ts', import.meta.url),
        'utf8',
      ),
    ]);

    expect(sessionSource).toContain(
      "export { renderPatchMapManualWorkbench } from './manual-workbench-view';",
    );
    expect(sessionSource).toContain('const next = new PatchMap({');
    expect(sessionSource).not.toContain('function renderSelectionPanel(');
    expect(viewSource).toContain('export function renderPatchMapManualWorkbench(');
    expect(viewSource).toContain('function renderSelectionPanel(');
    for (const sessionToken of [
      'new PatchMap(',
      'PatchMapAssetRuntime',
      'addEventListener(',
      'ResizeObserver',
      'querySelector',
    ]) {
      expect(viewSource).not.toContain(sessionToken);
    }
    expect(viewSource).not.toMatch(
      /normalizedExpected|approvedExpected|comparisonResult/u,
    );
  });

  it('uses the package frame loop without whole-scene probes or Lab-owned cadence', async () => {
    const [source, adaptiveFrameBudgetSource] = await Promise.all([
      readFile(
        new URL('../../lab/patch-map/interactive/manual-workbench.ts', import.meta.url),
        'utf8',
      ),
      readFile(new URL(
        '../../src/patch-map/scheduler/adaptive-frame-budget.ts',
        import.meta.url,
      ), 'utf8'),
    ]);
    const refresh = source.slice(
      source.indexOf('  function refresh(): void {'),
      source.indexOf('  function queueRefresh(): void {'),
    );
    const frameLoop = source.slice(
      source.indexOf('  function startFrameLoop(durationMs: number): void {'),
      source.indexOf('  function publishNow(action: string): void {'),
    );
    const framePublication = source.slice(
      source.indexOf('  function publishEngineFrame('),
      source.indexOf('  function installResizeObserver(): void {'),
    );
    const stateSnapshot = source.slice(
      source.indexOf('  function stateSnapshot(): PatchMapManualLabState {'),
      source.indexOf('  function requireEngine(): PatchMap {'),
    );
    const animationProbe = source.slice(
      source.indexOf('  function activeAnimationCount(next: PatchMap | null): number {'),
      source.indexOf('  async function destroyEngine(): Promise<void> {'),
    );

    for (const hotPath of [refresh, stateSnapshot]) {
      expect(hotPath).toContain('activeAnimationCount(next)');
      expect(hotPath).not.toContain('semanticProbe(');
    }
    expect(frameLoop).not.toContain('semanticProbe(');
    expect(animationProbe).toContain('next?.activeAnimations ?? 0');
    expect(animationProbe).not.toContain('semanticProbe(');
    expect(source).toContain('next.createFrameLoop({');
    expect(source).not.toContain('setViewportGestureActive');
    expect(source).not.toContain('setWorkloadSize');
    expect(frameLoop).toContain('frameLoop?.request(durationMs)');
    expect(framePublication).toContain('frameLoop?.publishNow()');
    expect(source).not.toContain('deferHeavyPanFrame');
    expect(source).not.toContain('pendingAnimationElapsed');
    expect(adaptiveFrameBudgetSource).toContain('export class PatchMapAdaptiveFrameBudget');
    expect(adaptiveFrameBudgetSource).toContain('largePresentationIntervalMs ?? 75');
    expect(adaptiveFrameBudgetSource).toContain('largeViewportFramesPerPresentation ?? 3');
    expect(source).toContain('next.updateBatch({');
    expect(source).toContain('const heights = new Float64Array(targetCount);');
    expect(source).toContain("scope: manualSceneSize === 'actual-production' ? 'instances' : 'authored'");
    expect(source).toContain('text: { text: texts }');
  });
});

describe('PatchMap manual Lab scene', () => {
  it('is deterministic, immutable, directly materializable PATCH MAP input', () => {
    const first = buildPatchMapManualScene('100', 319);
    const second = buildPatchMapManualScene('100', 319);
    const before = JSON.stringify(first.dataset);
    const materialized = materializePatchMapDataset(first.dataset);

    expect(first).toEqual(second);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.dataset)).toBe(true);
    expect(JSON.stringify(first.dataset)).toBe(before);
    expect(materialized.rootIds).toHaveLength(105);
    expect(materialized.rootIds.slice(0, 5)).toEqual([
      'manual-rect-a',
      'manual-rect-b',
      'manual-text',
      'manual-group',
      'manual-relations',
    ]);
    expect(first.barTargets).toHaveLength(100);
    expect(first.instanceBarTargets).toHaveLength(100);
    expect(first.instanceBarTargets[0]).toEqual({
      id: first.barTargets[0]?.ownerId,
      componentId: first.barTargets[0]?.componentId,
    });
    expect(first.textTargets).toHaveLength(100);
    expect(materialized.semanticHash).toMatch(/^fnv1a64:[a-f0-9]{16}$/u);
  });

  it('preserves canonical scale selections through the same generator', () => {
    expect(PATCH_MAP_MANUAL_SCENE_SIZE_OPTIONS).toEqual([
      '100',
      '500',
      '1000',
      '2000',
      '5000',
      '10000',
      'production',
      'actual-production',
    ]);
    expect(buildPatchMapManualScene('1', 0).barTargets).toHaveLength(1);
    expect(buildPatchMapManualScene('5000', 0xffff_ffff).barTargets).toHaveLength(5_000);
    const exploratory = buildPatchMapManualScene('10000', 319);
    expect(exploratory.barTargets).toHaveLength(10_000);
    expect(exploratory.instanceBarTargets).toHaveLength(10_000);
    expect(exploratory.textTargets).toHaveLength(10_000);
    expect(Object.isFrozen(exploratory.dataset)).toBe(true);
    expect(buildPatchMapManualScene('production', 319).barTargets).toHaveLength(500);
  });

  it('reveals bars in the Lab without mutating the actual production JSON', async () => {
    const first = await buildPatchMapManualSceneAsync('actual-production', 319);
    const second = await buildPatchMapManualSceneAsync('actual-production', 999);
    const sourceModule = await import('../../lab/fixtures/actual-production.json');
    const before = JSON.stringify(first.dataset);
    const materialized = materializePatchMapDataset(first.dataset);
    const visibleBars = collectComponents(first.dataset, 'bar');
    const sourceBars = collectComponents(sourceModule.default, 'bar');

    expect(first.dataset).toBe(second.dataset);
    expect(first.dataset).toHaveLength(605);
    expect(first.primaryIds).toEqual([
      '0VQUL2c700nbal7',
      '0VQUMUbL004tcz7',
      'F70QxBkaoSjfPH8',
      'iH20HgdUEFOBr7g',
      'GK72GTlPzbeRyKt',
      'Ogb2flEqTTcIdcC',
    ]);
    expect(first.relationIds).toEqual(['0VOBsciH00fn0Va']);
    expect(first.barTargets).toHaveLength(309);
    expect(first.instanceBarTargets).toHaveLength(2_701);
    expect(first.textTargets).toHaveLength(0);
    expect(visibleBars).toHaveLength(309);
    expect(visibleBars.every((component) => component.show === true)).toBe(true);
    expect(sourceBars).toHaveLength(309);
    expect(sourceBars.every((component) => component.show === false)).toBe(true);
    expect(materialized.rootIds).toHaveLength(605);
    expect(JSON.stringify(first.dataset)).toBe(before);
    expect(Object.isFrozen(first.dataset)).toBe(true);
  });

  it('uses the exploratory zoom floor only in the human-operated Lab', () => {
    expect(PATCH_MAP_MANUAL_LAB_ZOOM_LIMITS).toEqual([0.025, 30]);
    expect(Object.isFrozen(PATCH_MAP_MANUAL_LAB_ZOOM_LIMITS)).toBe(true);
  });

  it('ships one PatchMap-based Lab entry without the low-level Playground', async () => {
    const [markup, viteConfig, packageJson, publicEntry] = await Promise.all([
      readFile(new URL('../../lab/patch-map/index.html', import.meta.url), 'utf8'),
      readFile(new URL('../../vite.patch-map-lab.config.ts', import.meta.url), 'utf8'),
      readFile(new URL('../../package.json', import.meta.url), 'utf8'),
      readFile(new URL('../../src/patch-map/index.ts', import.meta.url), 'utf8'),
    ]);

    expect(markup).toContain('data-patch-map-contract-lab');
    expect(markup).toContain('./contract/main.ts');
    expect(markup).not.toContain('Aggregate GPU renderer lab');
    expect(viteConfig).toContain("lab: fileURLToPath(new URL('./lab/patch-map/index.html'");
    expect(viteConfig).not.toContain('performance:');
    expect(viteConfig).not.toContain('/lab/core-v2');
    expect(packageJson).not.toContain('lab:contract');
    expect(packageJson).not.toContain('verify:lab:webgpu');
    expect(publicEntry).not.toContain('createPatchMapRuntime');
    expect(publicEntry).not.toContain('PatchMapRuntime,');
  });

  it('applies a bounded human-Lab animation duration without mutating seeded input', () => {
    const scene = buildPatchMapManualScene('100', 319, 5_000);
    const durations = scene.dataset.flatMap((record) => {
      const components = Array.isArray(record.components)
        ? record.components as readonly unknown[]
        : [];
      return components.flatMap((component) =>
        isUnknownRecord(component) && component.type === 'bar'
          ? [component.animationDuration]
          : []);
    });

    expect(scene.animationDurationMs).toBe(5_000);
    expect(durations).toHaveLength(100);
    expect(durations.every((duration) => duration === 5_000)).toBe(true);
    expect(() => buildPatchMapManualScene('100', 319, 60_001)).toThrow(
      'manual bar animation duration is invalid',
    );
  });
});

function isUnknownRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function collectComponents(
  value: unknown,
  type: string,
): readonly Readonly<Record<string, unknown>>[] {
  if (Array.isArray(value)) {
    return value.flatMap((child) => collectComponents(child, type));
  }
  if (!isUnknownRecord(value)) return [];
  return [
    ...(value.type === type ? [value] : []),
    ...Object.values(value).flatMap((child) => collectComponents(child, type)),
  ];
}
