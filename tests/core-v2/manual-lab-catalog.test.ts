import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  CORE_V2_CONTRACT_PRESENTERS,
  selectCoreV2ContractPresenter,
} from '../../lab/performance-v2/contract/presenters';
import {
  CORE_V2_KOREAN_CASE_TITLES,
  coreV2KoreanCaseTitle,
} from '../../lab/performance-v2/contract/korean-copy';
import { renderCoreV2ManualWorkbench } from '../../lab/performance-v2/interactive/manual-workbench';
import {
  CORE_V2_MANUAL_ACTION_COUNT,
  CORE_V2_MANUAL_CASE_CATALOG,
  CORE_V2_MANUAL_CASE_COUNT,
  CORE_V2_MANUAL_TOOL_LABELS,
  selectCoreV2ManualCase,
} from '../../lab/performance-v2/interactive/manual-case-catalog';
import {
  buildCoreV2ManualScene,
  CORE_V2_MANUAL_SCENE_SIZE_OPTIONS,
} from '../../lab/performance-v2/interactive/manual-scene';
import { materializeCoreV2Dataset } from '../../src/core-v2/semantic/dataset';

describe('Core v2 human-operated Lab catalog', () => {
  it('maps all 173 cases and 646 approved actions without a second case runtime', () => {
    expect(CORE_V2_MANUAL_CASE_COUNT).toBe(173);
    expect(CORE_V2_MANUAL_ACTION_COUNT).toBe(646);
    expect(CORE_V2_MANUAL_CASE_CATALOG.map(({ caseId }) => caseId))
      .toEqual(CORE_V2_CONTRACT_PRESENTERS.map(({ caseId }) => caseId));

    for (const [index, descriptor] of CORE_V2_MANUAL_CASE_CATALOG.entries()) {
      const presenter = CORE_V2_CONTRACT_PRESENTERS[index];
      expect(presenter, descriptor.caseId).toBeDefined();
      expect(descriptor).toMatchObject({
        revision: 'core-v2-manual-lab/1',
        caseId: presenter?.caseId,
        title: coreV2KoreanCaseTitle(descriptor.caseId),
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
        expect(CORE_V2_MANUAL_TOOL_LABELS[action.group]).toBeTypeOf('string');
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
    expect(Object.keys(CORE_V2_KOREAN_CASE_TITLES)).toHaveLength(173);
  });

  it('pins direct free-play recipes for history, selection, transformer, and bars', () => {
    expect(selectCoreV2ManualCase('HIS-001').tools[0]).toBe('history');
    expect(selectCoreV2ManualCase('SEL-005').tools[0]).toBe('selection');
    expect(selectCoreV2ManualCase('TRN-009').tools[0]).toBe('transform');
    expect(selectCoreV2ManualCase('REN-009').tools[0]).toBe('animation');
    expect(selectCoreV2ManualCase('CSM-038').tools[0]).toBe('assets');
    expect(selectCoreV2ManualCase('HIS-001').tasks.join(' ')).toMatch(
      /실행 취소.+Ctrl\/Cmd\+Z/u,
    );
    expect(selectCoreV2ManualCase('SEL-005').tasks.join(' ')).toMatch(
      /영역 선택.+드래그.+Shift/u,
    );
    expect(selectCoreV2ManualCase('TRN-009').tasks.join(' ')).toMatch(
      /드래그.+히스토리 한 단계.+Escape/u,
    );
    expect(selectCoreV2ManualCase('REN-009').tasks.join(' ')).toMatch(
      /전체.+10%.+선택 막대/u,
    );
  });

  it('renders a persistent workbench and per-action manual tool links on every route', () => {
    for (const caseId of ['HIS-001', 'SEL-005', 'TRN-009', 'REN-009', 'CSM-038']) {
      const presenter = selectCoreV2ContractPresenter(caseId);
      const markup = renderCoreV2ManualWorkbench(presenter);
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

  it('keeps whole-scene semantic probes out of frame and status hot paths', async () => {
    const source = await readFile(
      new URL('../../lab/performance-v2/interactive/manual-workbench.ts', import.meta.url),
      'utf8',
    );
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
      source.indexOf('  function stateSnapshot(): CoreV2ManualLabState {'),
      source.indexOf('  function requireEngine(): CoreV2Engine {'),
    );
    const animationProbe = source.slice(
      source.indexOf('  function activeAnimationCount(next: CoreV2Engine | null): number {'),
      source.indexOf('  async function destroyEngine(): Promise<void> {'),
    );

    for (const hotPath of [refresh, frameLoop, stateSnapshot]) {
      expect(hotPath).toContain('activeAnimationCount(next)');
      expect(hotPath).not.toContain('semanticProbe(');
    }
    expect(animationProbe).toContain('pageLifecycleProbe().activeAnimationCount');
    expect(animationProbe).not.toContain('semanticProbe(');
    expect(frameLoop).toContain('panPointerId !== null');
    expect(frameLoop).toContain('scene.barTargets.length >= 2_000');
    expect(frameLoop).toContain('animationsBefore >= 2_000 ? 75 : 50');
    expect(frameLoop).toContain('animationsBefore >= 2_000 ? 3 : 1');
    expect(frameLoop).toContain('const deferHeavyPanFrame');
    expect(frameLoop).toContain('time - lastAnimationAdvanceWallTime < panFrameInterval');
    expect(frameLoop).toContain(
      'panViewportFramesSinceAnimationAdvance < viewportFramesRequired',
    );
    expect(frameLoop).toContain(
      'publishEngineFrame(next, time, !deferHeavyPanFrame)',
    );
    expect(framePublication).toContain('pendingAnimationElapsed');
    expect(framePublication).toContain(
      'lastAnimationAdvanceWallTime = performance.now()',
    );
    expect(source).toContain('next.updateBarHeights({');
    expect(source).toContain('const heights = new Float64Array(targets.length);');
    expect(source).toContain('next.updateTexts({');
  });
});

describe('Core v2 manual Lab scene', () => {
  it('is deterministic, immutable, directly materializable PATCH MAP input', () => {
    const first = buildCoreV2ManualScene('100', 319);
    const second = buildCoreV2ManualScene('100', 319);
    const before = JSON.stringify(first.dataset);
    const materialized = materializeCoreV2Dataset(first.dataset);

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
    expect(first.textTargets).toHaveLength(100);
    expect(materialized.semanticHash).toMatch(/^fnv1a64:[a-f0-9]{16}$/u);
  });

  it('preserves canonical scale selections through the same generator', () => {
    expect(CORE_V2_MANUAL_SCENE_SIZE_OPTIONS).toEqual([
      '100',
      '500',
      '1000',
      '2000',
      '5000',
      '10000',
      'production',
    ]);
    expect(buildCoreV2ManualScene('1', 0).barTargets).toHaveLength(1);
    expect(buildCoreV2ManualScene('5000', 0xffff_ffff).barTargets).toHaveLength(5_000);
    const exploratory = buildCoreV2ManualScene('10000', 319);
    expect(exploratory.barTargets).toHaveLength(10_000);
    expect(exploratory.textTargets).toHaveLength(10_000);
    expect(Object.isFrozen(exploratory.dataset)).toBe(true);
    expect(buildCoreV2ManualScene('production', 319).barTargets).toHaveLength(500);
  });

  it('exposes 10,000 only as an exploratory Lab size while preserving exact route inputs', async () => {
    const [markup, source] = await Promise.all([
      readFile(
        new URL('../../lab/performance-v2/index.html', import.meta.url),
        'utf8',
      ),
      readFile(
        new URL('../../lab/performance-v2/main.ts', import.meta.url),
        'utf8',
      ),
    ]);

    expect(markup).toContain(
      '<option value="10000">Synthetic / 10,000 items · exploratory</option>',
    );
    expect(source).toContain("| '10000'");
    expect(source).toContain("value === '10000'");
  });

  it('applies a bounded human-Lab animation duration without mutating seeded input', () => {
    const scene = buildCoreV2ManualScene('100', 319, 5_000);
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
    expect(() => buildCoreV2ManualScene('100', 319, 60_001)).toThrow(
      'manual bar animation duration is invalid',
    );
  });
});

function isUnknownRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
