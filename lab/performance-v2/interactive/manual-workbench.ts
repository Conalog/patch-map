import {
  CoreV2Engine,
  type CoreV2EngineHistoryResult,
} from '../../../src/core-v2/engine';
import type { CoreV2AssetAcquisition } from '../../../src/core-v2/assets';
import {
  coreV2KoreanStatus,
} from '../contract/korean-copy';
import type { CoreV2ContractPresenterDescriptor } from '../contract/presenters';
import {
  CORE_V2_MANUAL_ACTION_COUNT,
  CORE_V2_MANUAL_CASE_COUNT,
  CORE_V2_MANUAL_TOOL_DESCRIPTIONS,
  CORE_V2_MANUAL_TOOL_LABELS,
  selectCoreV2ManualCase,
  type CoreV2ManualToolGroup,
} from './manual-case-catalog';
import {
  buildCoreV2ManualScene,
  CORE_V2_MANUAL_SCENE_SIZE_OPTIONS,
  isCoreV2ManualSceneSize,
  type CoreV2ManualScene,
  type CoreV2ManualSceneSize,
} from './manual-scene';

type ManualPointerMode =
  | 'select'
  | 'box'
  | 'paint'
  | 'move'
  | 'resize'
  | 'rotate'
  | 'pan';

interface ManualPointerGesture {
  readonly pointerId: number;
  readonly kind: 'box' | 'paint' | 'transform';
  readonly startScreen: readonly [number, number];
  readonly startWorld: readonly [number, number];
  readonly selectionBefore: readonly string[];
  readonly transformKind?: 'move' | 'resize' | 'rotate';
  readonly resizeHandle?: 'nw' | 'ne' | 'sw' | 'se' | 'n' | 'e' | 's' | 'w';
  readonly rotationCenterScreen?: readonly [number, number];
  readonly rotationStartDegrees?: number;
  segments: Array<readonly [
    readonly [number, number],
    readonly [number, number],
  ]>;
  moved: boolean;
}

export interface CoreV2ManualLabState {
  readonly caseId: string;
  readonly sceneSize: string;
  readonly status: 'booting' | 'ready' | 'busy' | 'destroyed' | 'failed';
  readonly generation: number;
  readonly mode: ManualPointerMode;
  readonly selectedIds: readonly string[];
  readonly history: Readonly<{
    readonly undoDepth: number;
    readonly redoDepth: number;
  }>;
  readonly activeAnimations: number;
  readonly canvasCount: number;
  readonly lastAction: string;
  readonly error: string | null;
}

export interface CoreV2ManualLabBridge {
  readonly ready: Promise<void>;
  state(): CoreV2ManualLabState;
  engine(): CoreV2Engine | null;
  run(command: string): Promise<unknown>;
  destroy(): Promise<void>;
}

export interface CoreV2ManualLabMountOptions {
  readonly caseId: string;
  readonly title: string;
  readonly size: string;
  readonly seed: number;
}

declare global {
  interface Window {
    __PATCH_MAP_CORE_V2_MANUAL_LAB__?: CoreV2ManualLabBridge;
  }
}

const MANUAL_EVENT_NAMES = Object.freeze([
  'sceneCommitted',
  'frame',
  'viewChanged',
  'viewSettled',
  'selectionChanged',
  'change',
  'targetDestroyed',
  'historyUndone',
  'historyRedone',
  'historyVisible',
  'historyCleared',
  'diagnostic',
  'documentVisibilityChanged',
] as const);

const MANUAL_COMMAND_HELP: Readonly<Record<string, string>> = Object.freeze({
  'select-first': '첫 번째 예제 객체 하나를 선택합니다.',
  'select-first-three': '앞의 예제 객체 세 개를 한꺼번에 선택합니다.',
  'select-relations': '관계선이 연결한 양 끝 객체를 선택합니다.',
  'selection-clear': '현재 선택을 모두 해제합니다.',
  'nudge-up': '설정한 값만큼 위로 이동합니다.',
  'nudge-left': '설정한 값만큼 왼쪽으로 이동합니다.',
  'nudge-down': '설정한 값만큼 아래로 이동합니다.',
  'nudge-right': '설정한 값만큼 오른쪽으로 이동합니다.',
  'resize-grow': '오른쪽 아래 방향으로 크기를 늘립니다.',
  'resize-shrink': '오른쪽 아래 방향의 크기를 줄입니다.',
  'rotate-left': '설정한 각도만큼 반시계 방향으로 회전합니다.',
  'rotate-right': '설정한 각도만큼 시계 방향으로 회전합니다.',
  undo: '가장 최근 사용자 작업 하나를 되돌립니다.',
  redo: '되돌린 사용자 작업 하나를 다시 적용합니다.',
  'history-clear': '장면은 유지하고 실행 취소·다시 실행 기록만 비웁니다.',
  'history-capacity': '보관할 수 있는 최대 히스토리 수를 적용합니다.',
  'fit-all': '장면 전체가 캔버스 안에 들어오도록 맞춥니다.',
  'fit-selection': '선택한 객체가 캔버스 안에 들어오도록 맞춥니다.',
  'view-reset': '화면 중심·배율·월드 방향을 초기 상태로 돌립니다.',
  'zoom-in': '현재 화면 중심을 기준으로 확대합니다.',
  'zoom-out': '현재 화면 중심을 기준으로 축소합니다.',
  'world-rotate-left': '월드 전체를 화면 중심 기준으로 15° 반시계 회전합니다.',
  'world-rotate-right': '월드 전체를 화면 중심 기준으로 15° 시계 회전합니다.',
  'world-flip-x': '월드 전체를 좌우로 뒤집습니다.',
  'world-flip-y': '월드 전체를 위아래로 뒤집습니다.',
  'view-save': '현재 중심·배율·월드 방향을 임시 저장합니다.',
  'view-restore': '마지막으로 저장한 화면 상태를 복원합니다.',
  'animate-all': '모든 예제 막대의 높이를 무작위 값으로 애니메이션합니다.',
  'animate-partial': '예제 막대 중 시드로 고른 10%만 애니메이션합니다.',
  'animate-selected': '현재 선택한 항목의 막대만 애니메이션합니다.',
  'animation-duration': '입력한 재생 시간으로 사람 조작용 장면을 다시 만듭니다.',
  'random-text': '예제 라벨 텍스트를 시드 기반 값으로 바꿉니다.',
  'frames-toggle': '자동 프레임 게시를 일시 정지하거나 다시 시작합니다.',
  'publish-frame': '현재 상태를 화면에 한 프레임 게시합니다.',
  'reduced-motion': '체크한 동작 줄이기 정책을 현재 세션에 적용합니다.',
  'style-selected': '입력한 채움·투명도·모서리 값을 선택 객체에 적용합니다.',
  'text-selected': '입력한 텍스트를 선택한 텍스트 대상에 적용합니다.',
  'scene-size': '선택한 크기의 결정적인 예제 장면을 불러옵니다.',
  'scene-regenerate': '같은 크기와 시드로 결정적인 예제 장면을 다시 만듭니다.',
  'scene-export-json': '현재 장면을 아래 JSON 편집기로 내보냅니다.',
  'scene-invalid-json': '원자적 실패를 확인할 중복 ID 입력을 준비합니다.',
  'scene-load-json': '편집기의 JSON을 전체 기준 장면으로 불러옵니다.',
  'create-element': '선택한 종류의 새 객체를 현재 화면 중심에 만듭니다.',
  'duplicate-selected': '선택 객체를 새 ID로 복제합니다.',
  'group-selected': '선택 객체들을 새 그룹 하나로 묶습니다.',
  'ungroup-selected': '선택 그룹의 자식들을 꺼내고 그룹을 해제합니다.',
  'front-selected': '선택 객체를 같은 계층의 맨 앞으로 보냅니다.',
  'back-selected': '선택 객체를 같은 계층의 맨 뒤로 보냅니다.',
  'delete-selected': '선택 객체를 장면에서 삭제합니다.',
  'align-selected': '선택 객체들을 고른 기준선에 맞춥니다.',
  'distribute-selected': '선택 객체 세 개 이상을 일정한 간격으로 배치합니다.',
  'asset-acquire': '내장 예제 에셋의 사용권 하나를 얻습니다.',
  'asset-release': '현재 보유한 에셋 사용권 하나를 반납합니다.',
  capture: '현재 게시된 PixiJS 장면을 PNG 미리보기로 추출합니다.',
  'replace-session': '같은 런타임에서 장면 전체를 새 기준 장면으로 교체합니다.',
  'destroy-session': '렌더러·이벤트·자원을 포함한 현재 세션을 종료합니다.',
  'reinitialize-session': '종료된 세션을 새 렌더러와 장면으로 다시 시작합니다.',
  'resize-small': '캔버스 호스트를 작은 검증 크기로 바꿉니다.',
  'resize-large': '캔버스 호스트를 큰 검증 크기로 바꿉니다.',
  'page-hide': '페이지가 숨겨진 상황을 런타임에 전달합니다.',
  'page-show': '페이지가 다시 보이는 상황을 전달하고 프레임을 게시합니다.',
  'accessibility-tree': '현재 장면의 논리 접근성 트리를 만듭니다.',
  'accessibility-focus': '입력한 ID의 접근성 대상에 포커스를 옮깁니다.',
  'accessibility-activate': '포커스 대상을 키보드와 같은 경로로 활성화·선택합니다.',
  'probe-refresh': '선택한 제품 상태를 다시 읽어 아래에 표시합니다.',
  'events-clear': '수집한 이벤트 표시 목록만 비웁니다.',
  'advanced-run': '입력한 JSON으로 선택한 공개 Core v2 메서드를 실행합니다.',
});

export function renderCoreV2ManualWorkbench(
  presenter: CoreV2ContractPresenterDescriptor,
): string {
  const descriptor = selectCoreV2ManualCase(presenter.caseId);
  const primaryTool = descriptor.tools[0] ?? 'diagnostics';
  const toolButtons = descriptor.tools.map((tool, index) =>
    `<button type="button" data-manual-tool-button="${tool}"${index === 0 ? ' aria-pressed="true"' : ' aria-pressed="false"'} title="${escapeHtml(CORE_V2_MANUAL_TOOL_DESCRIPTIONS[tool])}"><strong>${escapeHtml(CORE_V2_MANUAL_TOOL_LABELS[tool])}</strong><small>${escapeHtml(CORE_V2_MANUAL_TOOL_DESCRIPTIONS[tool])}</small></button>`,
  ).join('');
  const tasks = descriptor.tasks.map((task) => `<li>${escapeHtml(task)}</li>`).join('');
  const actions = descriptor.actions.map((action) =>
    `<li data-manual-approved-action="${escapeHtml(action.type)}"><span>${String(action.index + 1).padStart(2, '0')}</span><div><strong>${escapeHtml(action.label)}</strong><p>${escapeHtml(action.instruction)}</p></div><button type="button" data-manual-focus-tool="${action.group}">${escapeHtml(CORE_V2_MANUAL_TOOL_LABELS[action.group])} 열기</button></li>`,
  ).join('');

  return `<section class="manual-workbench" data-testid="manual-workbench" data-manual-status="booting" data-manual-case="${escapeHtml(presenter.caseId)}">
    <header class="manual-workbench-header">
      <div>
        <span class="contract-kicker">직접 조작하는 제품 실험실</span>
        <h2>엔진을 켜둔 채, 원하는 동작을 직접 시험하세요.</h2>
        <p>아래 캔버스는 계속 살아 있는 PixiJS WebGL 세션입니다. 자동 증거 실행기는 화면 아래에 별도로 있습니다.</p>
      </div>
      <div class="manual-coverage-stamp">
        <strong>${CORE_V2_MANUAL_CASE_COUNT}/173</strong>
        <span>케이스 연결 완료</span>
        <small>${CORE_V2_MANUAL_ACTION_COUNT}/646개 작업</small>
      </div>
    </header>
    <section class="manual-case-guide" aria-labelledby="manual-case-guide-title">
      <div>
        <span class="manual-case-id">${escapeHtml(descriptor.caseId)}</span>
        <h3 id="manual-case-guide-title">${escapeHtml(descriptor.title)}</h3>
        <p>이 케이스에서 먼저 확인할 동작입니다.</p>
      </div>
      <ol>${tasks}</ol>
    </section>
    <section class="manual-onboarding" aria-labelledby="manual-onboarding-title">
      <div class="manual-onboarding-heading">
        <span class="contract-kicker">처음이라면 여기부터</span>
        <h3 id="manual-onboarding-title">버튼은 세 단계로 사용하면 됩니다</h3>
      </div>
      <ol>
        <li><span>1</span><div><strong>오른쪽에서 ‘${escapeHtml(CORE_V2_MANUAL_TOOL_LABELS[primaryTool])}’ 선택</strong><p>${escapeHtml(CORE_V2_MANUAL_TOOL_DESCRIPTIONS[primaryTool])}</p></div></li>
        <li><span>2</span><div><strong>버튼을 누르거나 캔버스에서 직접 조작</strong><p>${escapeHtml(descriptor.tasks[0] ?? '안내된 동작을 캔버스에서 실행하세요.')}</p></div></li>
        <li><span>3</span><div><strong>캔버스 아래 결과와 오른쪽 기록 확인</strong><p>선택 수·실행 취소 수·애니메이션·마지막 작업이 즉시 바뀝니다.</p></div></li>
      </ol>
      <details open>
        <summary>화면 구성과 많은 버튼을 빠르게 이해하기</summary>
        <div class="manual-layout-help">
          <p><strong>캔버스 위 7개 모드</strong><span>마우스로 직접 선택·드래그할 때의 동작을 정합니다. 선택된 모드 옆 설명을 먼저 읽으세요.</span></p>
          <p><strong>오른쪽 도구 탭</strong><span>관련 버튼만 묶어 둔 서랍입니다. 버튼 아래 짧은 설명이 실제로 바뀌는 내용을 알려줍니다.</span></p>
          <p><strong>캔버스 아래 상태</strong><span>선택·히스토리·프레임·애니메이션이 실제로 반영됐는지 확인하는 곳입니다.</span></p>
          <p><strong>맨 아래 자동 실행기</strong><span>승인된 순서를 자동으로 한 번 실행해 증거를 모읍니다. 자유 조작과는 별개입니다.</span></p>
        </div>
      </details>
    </section>
    <div class="manual-stage-layout">
      <section class="manual-stage-column">
        <div class="manual-mode-bar" role="toolbar" aria-label="캔버스 직접 조작 모드">
          ${modeButton('select', '선택', 'V')}
          ${modeButton('box', '영역 선택', 'B')}
          ${modeButton('paint', '붓질 선택', 'P')}
          ${modeButton('move', '이동', 'M')}
          ${modeButton('resize', '크기 조절', 'R')}
          ${modeButton('rotate', '회전', 'O')}
          ${modeButton('pan', '화면 이동', 'H')}
          <span class="manual-mode-help" data-testid="manual-mode-help"><strong>선택:</strong> 객체를 클릭하고 Shift로 선택을 추가·해제합니다.</span>
        </div>
        <div class="manual-canvas-frame" data-testid="manual-canvas-frame">
          <div class="manual-canvas-host" data-testid="manual-canvas-host" tabindex="0" aria-label="계속 유지되는 Core v2 직접 조작 캔버스"></div>
          <div class="manual-selection-marquee" data-manual-marquee hidden></div>
          <div class="manual-canvas-tooltip" data-manual-tooltip hidden></div>
          <div class="manual-canvas-loading" data-manual-loading>PixiJS WebGL 시작 중…</div>
        </div>
        <div class="manual-live-strip" aria-live="polite">
          <div><span>상태</span><strong data-manual-readout="status">시작 중</strong></div>
          <div><span>선택 수</span><strong data-manual-readout="selection-count">0</strong></div>
          <div><span>취소 / 재실행</span><strong data-manual-readout="history">0 / 0</strong></div>
          <div><span>애니메이션</span><strong data-manual-readout="animations">0</strong></div>
          <div><span>프레임</span><strong data-manual-readout="frame">0</strong></div>
          <div><span>초당 프레임 / 최대 간격</span><strong data-manual-readout="fps">—</strong></div>
          <div><span>캔버스 수</span><strong data-manual-readout="canvas">0</strong></div>
          <div><span>마지막 작업</span><strong data-manual-readout="last-action">시작</strong></div>
        </div>
        <p class="manual-status-message" data-manual-message>계속 사용할 수 있는 직접 조작 세션을 만드는 중입니다…</p>
      </section>
      <aside class="manual-controls-column">
        <nav class="manual-tool-tabs" aria-label="직접 조작 제품 도구">${toolButtons}</nav>
        <div class="manual-tool-panels">
          ${renderSelectionPanel()}
          ${renderTransformPanel()}
          ${renderHistoryPanel()}
          ${renderViewPanel()}
          ${renderAnimationPanel(presenter.caseId)}
          ${renderDataPanel()}
          ${renderAuthoringPanel()}
          ${renderAssetsPanel()}
          ${renderLifecyclePanel()}
          ${renderAccessibilityPanel()}
          ${renderDiagnosticsPanel()}
        </div>
      </aside>
    </div>
    <details class="manual-approved-actions">
      <summary><span>이 케이스의 승인 작업 연결표</span><strong>${descriptor.actions.length}/${descriptor.actions.length}개 직접 실행 가능</strong></summary>
      <p>이 조작은 승인된 예상값을 읽지 않고 공개 제품 엔진만 직접 호출합니다. 각 항목의 ‘도구 열기’로 관련 버튼을 찾을 수 있습니다.</p>
      <ol>${actions}</ol>
    </details>
  </section>`;
}

export function mountCoreV2ManualWorkbench(
  root: HTMLElement,
  options: CoreV2ManualLabMountOptions,
): CoreV2ManualLabBridge {
  const host = required<HTMLElement>(root, '[data-testid="manual-workbench"]');
  const surfaceHost = required<HTMLElement>(host, '[data-testid="manual-canvas-host"]');
  const canvasFrame = required<HTMLElement>(host, '[data-testid="manual-canvas-frame"]');
  const descriptor = selectCoreV2ManualCase(options.caseId);
  const abortController = new AbortController();
  const { signal } = abortController;
  let engine: CoreV2Engine | null = null;
  let manualSceneSize: CoreV2ManualSceneSize = requireManualSceneSize(options.size);
  let scene: CoreV2ManualScene = buildCoreV2ManualScene(
    manualSceneSize,
    options.seed,
    defaultManualAnimationDuration(options.caseId),
  );
  let status: CoreV2ManualLabState['status'] = 'booting';
  let generation = 0;
  let mode: ManualPointerMode = 'select';
  let lastAction = 'boot';
  let lastError: string | null = null;
  let actionSequence = 0;
  let animationSequence = 0;
  let activePointer: ManualPointerGesture | null = null;
  let panPointerId: number | null = null;
  let canvasAbortController: AbortController | null = null;
  let resizeFrame = 0;
  let renderFrame = 0;
  let refreshFrame = 0;
  let monitorUntil = 0;
  let framesPaused = false;
  let savedViewport: ReturnType<CoreV2Engine['serializeViewport']> | null = null;
  let lifecycleClock = 0;
  let frameClock = 0;
  let lastFrameWallTime: number | null = null;
  let pendingAnimationElapsed = 0;
  let lastAnimationAdvanceWallTime = 0;
  let panViewportFramesSinceAnimationAdvance = 0;
  let lastLiveRefreshWallTime = 0;
  let longTaskCount = 0;
  let eventJournal: Array<Readonly<Record<string, unknown>>> = [];
  let frameTimes: number[] = [];
  let assetLeases: CoreV2AssetAcquisition[] = [];
  let engineUnbinds: Array<() => void> = [];
  let resizeObserver: ResizeObserver | null = null;
  let performanceObserver: PerformanceObserver | null = null;
  let destroyed = false;

  const ready = boot();
  void ready.catch(() => undefined);

  required<HTMLSelectElement>(host, '[data-manual-scene-size]').value =
    manualSceneSize;
  bindStaticControls();
  activateTool(descriptor.tools[0] ?? 'diagnostics');
  installPerformanceObserver();

  const bridge: CoreV2ManualLabBridge = Object.freeze({
    ready,
    state: stateSnapshot,
    engine: () => liveEngine(),
    run: runCommand,
    destroy,
  });
  window.__PATCH_MAP_CORE_V2_MANUAL_LAB__ = bridge;
  window.addEventListener('pagehide', () => {
    void destroy().catch(() => undefined);
  }, { signal });

  return bridge;

  async function boot(): Promise<void> {
    try {
      await createSession(true);
      status = 'ready';
      setMessage(
        `${options.caseId} 세션이 준비되었습니다. 선택·변형·실행 취소·애니메이션·JSON 편집·종료·재시작을 원하는 만큼 반복하세요.`,
      );
    } catch (error) {
      fail(error);
      throw error;
    } finally {
      refresh();
    }
  }

  async function createSession(loadScene: boolean): Promise<CoreV2Engine> {
    status = 'busy';
    await destroyEngine();
    surfaceHost.replaceChildren();
    const size = surfaceSize(canvasFrame);
    const next = new CoreV2Engine({ historyLimit: 100 });
    const instanceId = `manual-${options.caseId.toLowerCase()}-${generation + 1}`;
    frameClock = 0;
    lastFrameWallTime = null;
    pendingAnimationElapsed = 0;
    lastAnimationAdvanceWallTime = 0;
    panViewportFramesSinceAnimationAdvance = 0;
    lastLiveRefreshWallTime = 0;
    generation += 1;
    next.registerAssets(instanceId);
    await next.initialize({
      instanceId,
      target: surfaceHost,
      width: size.width,
      height: size.height,
      pixelRatio: Math.min(2, window.devicePixelRatio || 1),
      strategy: 'mesh',
      preference: 'webgl',
      backend: 'webgl2',
      antialias: false,
      background: '#f8fafcff',
      devtools: true,
      powerPreference: 'high-performance',
    });
    engine = next;
    bindEngine(next);
    if (loadScene) {
      loadManualScene(next, scene);
      next.fitViewport({ paddingCssPx: 46 });
      publishEngineFrame(next, performance.now());
    }
    bindCanvas(next);
    installResizeObserver();
    required<HTMLElement>(host, '[data-manual-loading]').hidden = true;
    status = 'ready';
    lastError = null;
    lastAction = loadScene ? 'initialize + load' : 'initialize';
    refreshSceneEditor();
    activateMode(mode);
    refresh();
    return next;
  }

  function bindStaticControls(): void {
    for (const button of host.querySelectorAll<HTMLButtonElement>('[data-manual-tool-button]')) {
      button.addEventListener('click', () => {
        const tool = button.dataset.manualToolButton;
        if (isManualToolGroup(tool)) activateTool(tool);
      }, { signal });
    }
    for (const button of host.querySelectorAll<HTMLButtonElement>('[data-manual-focus-tool]')) {
      button.addEventListener('click', () => {
        const tool = button.dataset.manualFocusTool;
        if (isManualToolGroup(tool)) {
          activateTool(tool);
          required<HTMLElement>(host, `[data-manual-tool-panel="${tool}"]`).scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
          });
        }
      }, { signal });
    }
    for (const button of host.querySelectorAll<HTMLButtonElement>('[data-manual-mode]')) {
      button.addEventListener('click', () => {
        const nextMode = button.dataset.manualMode;
        if (isManualPointerMode(nextMode)) activateMode(nextMode);
      }, { signal });
    }
    for (const button of host.querySelectorAll<HTMLButtonElement>('[data-manual-command]')) {
      button.addEventListener('click', () => {
        void runCommand(button.dataset.manualCommand ?? '').catch(() => undefined);
      }, { signal });
    }
    const probe = required<HTMLSelectElement>(host, '[data-manual-probe-select]');
    probe.addEventListener('change', refreshProbe, { signal });
    const advancedMethod = required<HTMLSelectElement>(host, '[data-manual-advanced-method]');
    advancedMethod.addEventListener('change', () => {
      required<HTMLTextAreaElement>(host, '[data-manual-advanced-json]').value =
        advancedExample(advancedMethod.value);
    }, { signal });
    window.addEventListener('keydown', onKeyDown, { signal });
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (isEditableTarget(event.target)) return;
    const key = event.key.toLowerCase();
    const next = liveEngine();
    if (next === null) return;
    if (event.metaKey || event.ctrlKey) {
      if (key !== 'z' && key !== 'y') return;
      const shortcut = next.handleHistoryShortcut({
        key: event.key,
        code: event.code,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        pathKind: 'canvas',
      });
      if (shortcut.preventDefault) event.preventDefault();
      if (shortcut.handled) {
        lastAction = shortcut.action ?? 'history shortcut';
        startFrameLoop(500);
        refresh();
      }
      return;
    }
    if (event.altKey) return;
    const modeByKey: Readonly<Record<string, ManualPointerMode>> = {
      v: 'select',
      b: 'box',
      p: 'paint',
      m: 'move',
      r: 'resize',
      o: 'rotate',
      h: 'pan',
    };
    const shortcutMode = modeByKey[key];
    if (shortcutMode !== undefined) {
      event.preventDefault();
      activateMode(shortcutMode);
      return;
    }
    if (key === 'escape') {
      const gesture = activePointer;
      if (
        gesture?.kind === 'transform' &&
        next.transformerEditProbe().activeSessionCount > 0
      ) {
        next.cancelTransformerEdit(gesture.pointerId, 'escape');
        const canvas = next.canvasHandle().element;
        if (canvas.hasPointerCapture(gesture.pointerId)) {
          canvas.releasePointerCapture(gesture.pointerId);
        }
        activePointer = null;
        hideMarquee();
        publishEngineFrame(next, performance.now());
        lastAction = 'transform-cancelled';
        event.preventDefault();
        refresh();
      }
      return;
    }
    if (key === 'delete' || key === 'backspace') {
      event.preventDefault();
      void runCommand('delete-selected').catch(() => undefined);
      return;
    }
    const step = event.shiftKey ? 10 : 1;
    const deltaByKey: Readonly<Record<string, readonly [number, number]>> = {
      arrowleft: [-step, 0],
      arrowright: [step, 0],
      arrowup: [0, -step],
      arrowdown: [0, step],
    };
    const delta = deltaByKey[key];
    if (delta !== undefined) {
      event.preventDefault();
      try {
        transformSelection('move', delta);
        lastAction = 'keyboard-nudge';
        startFrameLoop(500);
        refresh();
      } catch (error) {
        fail(error);
        refresh();
      }
    }
  }

  function bindEngine(next: CoreV2Engine): void {
    engineUnbinds = [
      next.on('sceneCommitted', (event) => recordEvent('sceneCommitted', event)),
      next.on('frame', (event) => recordEvent('frame', event, false)),
      next.on('viewChanged', (event) => recordEvent('viewChanged', event, false)),
      next.on('viewSettled', (event) => recordEvent('viewSettled', event)),
      next.on('selectionChanged', (event) => {
        recordEvent('selectionChanged', event);
        refreshSelectionVisual(next);
      }),
      next.on('change', (event) => {
        recordEvent('change', event);
        startFrameLoop(500);
      }),
      next.on('targetDestroyed', (event) => recordEvent('targetDestroyed', event)),
      next.on('historyUndone', (event) => {
        recordEvent('historyUndone', event);
        startFrameLoop(500);
      }),
      next.on('historyRedone', (event) => {
        recordEvent('historyRedone', event);
        startFrameLoop(500);
      }),
      next.on('historyVisible', (event) => recordEvent('historyVisible', event)),
      next.on('historyCleared', (event) => recordEvent('historyCleared', event)),
      next.on('diagnostic', (event) => recordEvent('diagnostic', event)),
      next.on('documentVisibilityChanged', (event) =>
        recordEvent('documentVisibilityChanged', event)),
    ];
    if (engineUnbinds.length !== MANUAL_EVENT_NAMES.length) {
      throw new Error('Core v2 manual Lab event binding drift');
    }
  }

  function bindCanvas(next: CoreV2Engine): void {
    canvasAbortController?.abort();
    canvasAbortController = new AbortController();
    const canvasSignal = canvasAbortController.signal;
    const canvas = next.canvasHandle().element;
    canvas.dataset.manualCoreV2Canvas = 'true';
    canvas.setAttribute('aria-label', 'Core v2 직접 조작 화면');
    canvas.addEventListener('pointerdown', (event) => onPointerDown(event, next), {
      signal: canvasSignal,
    });
    canvas.addEventListener('pointermove', (event) => onPointerMove(event, next), {
      signal: canvasSignal,
    });
    canvas.addEventListener('pointerup', (event) => onPointerUp(event, next), {
      signal: canvasSignal,
    });
    canvas.addEventListener('pointercancel', (event) => onPointerCancel(event, next), {
      signal: canvasSignal,
    });
    canvas.addEventListener('pointerleave', (event) => {
      if (activePointer === null) clearTooltip();
      else if (activePointer.pointerId === event.pointerId) startFrameLoop(400);
    }, { signal: canvasSignal });
    canvas.addEventListener('wheel', () => {
      startFrameLoop(650);
      queueRefresh();
    }, { signal: canvasSignal, passive: true });
    canvas.addEventListener('contextmenu', (event) => {
      const point = canvasPoint(event, canvas);
      const tooltip = next.toggleTooltipPinAtScreen(
        { x: point[0], y: point[1] },
        [180, 44],
      );
      showTooltip(tooltip.targetId, event.clientX, event.clientY);
      queueRefresh();
    }, { signal: canvasSignal });
  }

  function onPointerDown(event: PointerEvent, next: CoreV2Engine): void {
    if (event.button !== 0 || activePointer !== null) return;
    const canvas = next.canvasHandle().element;
    const screen = canvasPoint(event, canvas);
    const world = next.screenToWorld({ x: screen[0], y: screen[1] });
    const selectionBefore = next.snapshot().selectionIds;
    if (mode === 'pan') {
      panPointerId = event.pointerId;
      panViewportFramesSinceAnimationAdvance = 0;
      canvas.setPointerCapture(event.pointerId);
      startFrameLoop(800);
      return;
    }
    if (mode === 'box' || mode === 'paint') {
      canvas.setPointerCapture(event.pointerId);
      activePointer = {
        pointerId: event.pointerId,
        kind: mode,
        startScreen: screen,
        startWorld: [world.x, world.y],
        selectionBefore,
        segments: [],
        moved: false,
      };
      if (mode === 'box') drawMarquee(screen, screen);
      startFrameLoop(500);
      return;
    }
    if (mode === 'move' || mode === 'resize' || mode === 'rotate') {
      const hit = next.selectionHitTestScreen({ x: screen[0], y: screen[1] });
      let selectionIds = selectionBefore;
      const hitSelectionId = hit.target?.selectionId ?? null;
      if (hitSelectionId !== null && !selectionIds.includes(hitSelectionId)) {
        selectionIds = next.applySelection({
          op: event.shiftKey ? 'add' : 'replace',
          ids: [hitSelectionId],
          source: 'canvas',
        }).current;
      }
      if (selectionIds.length === 0) return;
      refreshSelectionVisual(next);
      const visual = next.selectionVisualProbe();
      const center = visual?.frame === null || visual?.frame === undefined
        ? null
        : midpoint(visual.frame.screenCorners[0], visual.frame.screenCorners[2]);
      const actualHandle = next.hitTransformerHandle(screen);
      const resizeHandle = isResizeHandle(actualHandle) ? actualHandle : 'se';
      const transformerKind = mode;
      next.beginTransformerEdit({
        pointerId: event.pointerId,
        actionId: `manual-${transformerKind}-${++actionSequence}`,
        kind: transformerKind,
        handle: transformerKind === 'move'
          ? 'frame'
          : transformerKind === 'rotate'
            ? 'rotate'
            : resizeHandle,
        selectionIds,
      });
      canvas.setPointerCapture(event.pointerId);
      activePointer = {
        pointerId: event.pointerId,
        kind: 'transform',
        startScreen: screen,
        startWorld: [world.x, world.y],
        selectionBefore: selectionIds,
        transformKind: transformerKind,
        ...(transformerKind === 'resize' ? { resizeHandle } : {}),
        ...(transformerKind === 'rotate' && center !== null
          ? {
              rotationCenterScreen: center,
              rotationStartDegrees: angleDegrees(center, screen),
            }
          : {}),
        segments: [],
        moved: false,
      };
      startFrameLoop(800);
      return;
    }
    if (mode === 'select') {
      activePointer = {
        pointerId: event.pointerId,
        kind: 'paint',
        startScreen: screen,
        startWorld: [world.x, world.y],
        selectionBefore,
        segments: [],
        moved: false,
      };
      return;
    }
    startFrameLoop(800);
  }

  function onPointerMove(event: PointerEvent, next: CoreV2Engine): void {
    const canvas = next.canvasHandle().element;
    const screen = canvasPoint(event, canvas);
    const world = next.screenToWorld({ x: screen[0], y: screen[1] });
    setText(host, 'pointer', `${screen[0].toFixed(0)}, ${screen[1].toFixed(0)} → ${world.x.toFixed(1)}, ${world.y.toFixed(1)}`);
    const gesture = activePointer;
    if (gesture === null || gesture.pointerId !== event.pointerId) {
      if (mode === 'pan') {
        clearTooltip();
        return;
      }
      const tooltip = next.hoverTooltipAtScreen(
        { x: screen[0], y: screen[1] },
        [180, 44],
      );
      showTooltip(tooltip.targetId, event.clientX, event.clientY);
      if (mode === 'resize' || mode === 'rotate' || mode === 'move') {
        const handle = next.hitTransformerHandle(screen);
        canvas.style.cursor = handle === null
          ? mode === 'move'
            ? 'move'
            : mode === 'rotate'
              ? 'crosshair'
              : 'nwse-resize'
          : next.transformerHandleProbe()?.regions.find(({ id }) => id === handle)?.cursor ?? '';
      }
      return;
    }
    const distance = Math.hypot(
      screen[0] - gesture.startScreen[0],
      screen[1] - gesture.startScreen[1],
    );
    if (distance > 3) gesture.moved = true;
    if (gesture.kind === 'box') {
      drawMarquee(gesture.startScreen, screen);
    } else if (gesture.kind === 'paint' && mode === 'paint') {
      const previous = gesture.segments.at(-1)?.[1] ?? gesture.startScreen;
      gesture.segments.push(Object.freeze([previous, screen] as const));
      drawPaintTrail(gesture);
    } else if (gesture.kind === 'transform' && gesture.transformKind !== undefined) {
      const deltaWorld = Object.freeze([
        world.x - gesture.startWorld[0],
        world.y - gesture.startWorld[1],
      ] as const);
      if (gesture.transformKind === 'move') {
        next.previewTransformerEdit(event.pointerId, {
          kind: 'move',
          selectionIds: gesture.selectionBefore,
          deltaWorld,
          axisLock: event.shiftKey,
        });
      } else if (gesture.transformKind === 'resize') {
        next.previewTransformerEdit(event.pointerId, {
          kind: 'resize',
          selectionIds: gesture.selectionBefore,
          handle: gesture.resizeHandle ?? 'se',
          deltaWorld,
          lockAspectRatio: event.shiftKey,
          minSize: 8,
        });
      } else {
        const center = gesture.rotationCenterScreen ?? gesture.startScreen;
        const startDegrees = gesture.rotationStartDegrees ??
          angleDegrees(center, gesture.startScreen);
        let deltaDegrees = normalizeDeltaDegrees(
          angleDegrees(center, screen) - startDegrees,
        );
        if (event.shiftKey) deltaDegrees = Math.round(deltaDegrees / 15) * 15;
        next.previewTransformerEdit(event.pointerId, {
          kind: 'rotate',
          selectionIds: gesture.selectionBefore,
          deltaDegrees,
        });
      }
    }
    startFrameLoop(800);
    queueRefresh();
  }

  function onPointerUp(event: PointerEvent, next: CoreV2Engine): void {
    if (panPointerId === event.pointerId) {
      panPointerId = null;
      const canvas = next.canvasHandle().element;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      lastAction = 'pan-gesture';
      startFrameLoop(600);
      queueRefresh();
      return;
    }
    const gesture = activePointer;
    if (gesture === null || gesture.pointerId !== event.pointerId) return;
    const canvas = next.canvasHandle().element;
    const screen = canvasPoint(event, canvas);
    try {
      if (gesture.kind === 'box') {
        next.selectBox(gesture.startScreen, screen, {
          mode: event.shiftKey ? 'add' : 'replace',
          partialIntersection: true,
        });
      } else if (gesture.kind === 'paint' && mode === 'paint') {
        const segments = gesture.segments.length > 0
          ? gesture.segments
          : [Object.freeze([gesture.startScreen, screen] as const)];
        next.selectPaint(segments, {
          mode: event.shiftKey ? 'add' : 'replace',
          toleranceCssPx: 10,
        });
      } else if (
        gesture.kind === 'paint' &&
        mode === 'select' &&
        !gesture.moved
      ) {
        // Root pointer authority already applies replace/toggle selection from
        // the exact click event. Do not repeat the 5,000-scene selection pass
        // in the Lab host for Shift-click.
      } else if (
        gesture.kind === 'transform' &&
        next.transformerEditProbe().activeSessionCount > 0
      ) {
        next.completeTransformerEdit(event.pointerId);
      }
      lastAction = gesture.kind === 'transform'
        ? `${gesture.transformKind ?? 'transform'}-gesture`
        : `${gesture.kind}-selection`;
      publishEngineFrame(next, performance.now());
    } finally {
      activePointer = null;
      hideMarquee();
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      startFrameLoop(600);
      refresh();
    }
  }

  function onPointerCancel(event: PointerEvent, next: CoreV2Engine): void {
    if (panPointerId === event.pointerId) {
      panPointerId = null;
      lastAction = 'pan-cancelled';
      startFrameLoop(400);
      queueRefresh();
      return;
    }
    const gesture = activePointer;
    if (gesture === null || gesture.pointerId !== event.pointerId) return;
    if (
      gesture.kind === 'transform' &&
      next.transformerEditProbe().activeSessionCount > 0
    ) {
      next.cancelTransformerEdit(event.pointerId, 'pointer-cancel');
    }
    activePointer = null;
    hideMarquee();
    lastAction = 'gesture-cancelled';
    publishEngineFrame(next, performance.now());
    refresh();
  }

  async function runCommand(command: string): Promise<unknown> {
    if (destroyed) throw new Error('Core v2 직접 조작 실험실이 이미 종료되었습니다.');
    status = 'busy';
    lastError = null;
    let result: unknown = null;
    try {
      switch (command) {
        case 'select-first':
          result = requireEngine().select(scene.primaryIds.slice(0, 1));
          break;
        case 'select-first-three':
          result = requireEngine().select(scene.primaryIds.slice(0, 3));
          break;
        case 'select-relations':
          result = requireEngine().selectRelationEndpoints(scene.relationIds);
          break;
        case 'selection-clear':
          result = requireEngine().applySelection({ op: 'clear', source: 'programmatic' });
          break;
        case 'nudge-left':
          result = transformSelection('move', [-nudgeAmount(), 0]);
          break;
        case 'nudge-right':
          result = transformSelection('move', [nudgeAmount(), 0]);
          break;
        case 'nudge-up':
          result = transformSelection('move', [0, -nudgeAmount()]);
          break;
        case 'nudge-down':
          result = transformSelection('move', [0, nudgeAmount()]);
          break;
        case 'resize-grow':
          result = transformSelection('resize', [resizeAmount(), resizeAmount()]);
          break;
        case 'resize-shrink':
          result = transformSelection('resize', [-resizeAmount(), -resizeAmount()]);
          break;
        case 'rotate-left':
          result = transformSelection('rotate', -angleAmount());
          break;
        case 'rotate-right':
          result = transformSelection('rotate', angleAmount());
          break;
        case 'undo':
          result = historyAction('undo');
          break;
        case 'redo':
          result = historyAction('redo');
          break;
        case 'history-clear':
          result = requireEngine().clearHistory();
          break;
        case 'history-capacity':
          result = requireEngine().setHistoryCapacity(numberInput('history-capacity', 100));
          break;
        case 'fit-all':
          result = requireEngine().fitViewport({ paddingCssPx: 46 });
          publishNow('fit all');
          break;
        case 'fit-selection':
          result = requireEngine().fitViewport({
            targets: requireEngine().snapshot().selectionIds,
            paddingCssPx: 70,
          });
          publishNow('fit selection');
          break;
        case 'view-reset':
          requireEngine().setViewport({ centerWorld: [0, 0], scale: 1 });
          result = requireEngine().setWorldTransform({
            rotationDegrees: 0,
            flipX: false,
            flipY: false,
          });
          publishNow('reset view');
          break;
        case 'zoom-in':
          result = zoomAtCenter(1.25);
          break;
        case 'zoom-out':
          result = zoomAtCenter(0.8);
          break;
        case 'world-rotate-left':
          result = rotateWorld(-15);
          break;
        case 'world-rotate-right':
          result = rotateWorld(15);
          break;
        case 'world-flip-x':
          result = flipWorld('x');
          break;
        case 'world-flip-y':
          result = flipWorld('y');
          break;
        case 'view-save':
          requireEngine().settleViewport();
          savedViewport = requireEngine().serializeViewport();
          result = savedViewport;
          break;
        case 'view-restore':
          result = requireEngine().restoreViewport(savedViewport);
          publishNow('restore view');
          break;
        case 'animate-all':
          result = animateBars('all');
          break;
        case 'animate-partial':
          result = animateBars('partial');
          break;
        case 'animate-selected':
          result = animateBars('selected');
          break;
        case 'animation-duration': {
          const durationMs = manualAnimationDuration();
          scene = buildCoreV2ManualScene(manualSceneSize, options.seed, durationMs);
          result = loadManualScene(requireEngine(), scene);
          requireEngine().fitViewport({ paddingCssPx: 46 });
          publishNow(`bar animation ${durationMs}ms`);
          refreshSceneEditor();
          setMessage(
            `막대 애니메이션 시간을 ${(durationMs / 1_000).toFixed(1)}초로 적용했습니다.`,
          );
          break;
        }
        case 'random-text':
          result = randomizeTexts();
          break;
        case 'frames-toggle':
          framesPaused = !framesPaused;
          if (!framesPaused) startFrameLoop(800);
          result = { framesPaused };
          break;
        case 'reduced-motion':
          result = requireEngine().setReducedMotion(
            required<HTMLInputElement>(host, '[data-manual-reduced-motion]').checked,
          );
          break;
        case 'style-selected':
          result = styleSelected();
          break;
        case 'text-selected':
          result = editSelectedText();
          break;
        case 'scene-size': {
          const nextSize = selectedManualSceneSize();
          const nextScene = buildCoreV2ManualScene(
            nextSize,
            options.seed,
            manualAnimationDuration(),
          );
          result = loadManualScene(requireEngine(), nextScene, nextSize);
          manualSceneSize = nextSize;
          scene = nextScene;
          requireEngine().fitViewport({ paddingCssPx: 46 });
          publishNow(`load ${nextSize} example records`);
          refreshSceneEditor();
          break;
        }
        case 'scene-regenerate':
          scene = buildCoreV2ManualScene(
            manualSceneSize,
            (options.seed + ++actionSequence) >>> 0,
            manualAnimationDuration(),
          );
          result = loadManualScene(requireEngine(), scene);
          requireEngine().fitViewport({ paddingCssPx: 46 });
          publishNow('regenerate scene');
          refreshSceneEditor();
          break;
        case 'scene-load-json':
          result = loadJsonEditor();
          break;
        case 'scene-export-json':
          refreshSceneEditor();
          result = requireEngine().exportDataset();
          break;
        case 'scene-invalid-json':
          required<HTMLTextAreaElement>(host, '[data-manual-scene-json]').value =
            JSON.stringify([
              { type: 'rect', id: 'duplicate', size: { width: 30, height: 30 } },
              { type: 'rect', id: 'duplicate', size: { width: 40, height: 40 } },
            ], null, 2);
          result = '중복 ID 오류 예제가 준비되었습니다.';
          break;
        case 'publish-frame':
          publishNow('manual frame');
          result = requireEngine().snapshot().publishedTuple;
          break;
        case 'create-element':
          result = createElement();
          break;
        case 'duplicate-selected':
          result = duplicateSelected();
          break;
        case 'group-selected':
          result = groupSelected();
          break;
        case 'ungroup-selected':
          result = ungroupSelected();
          break;
        case 'front-selected':
          result = reorderSelected('front');
          break;
        case 'back-selected':
          result = reorderSelected('back');
          break;
        case 'align-selected':
          result = alignSelected();
          break;
        case 'distribute-selected':
          result = distributeSelected();
          break;
        case 'delete-selected':
          result = deleteSelected();
          break;
        case 'asset-acquire':
          result = await acquireAsset();
          break;
        case 'asset-release':
          result = await releaseAsset();
          break;
        case 'capture':
          result = await captureScene();
          break;
        case 'destroy-session':
          await destroyEngine();
          status = 'destroyed';
          result = { destroyed: true };
          break;
        case 'reinitialize-session':
          result = await createSession(true);
          break;
        case 'replace-session':
          result = loadManualScene(requireEngine(), scene);
          requireEngine().fitViewport({ paddingCssPx: 46 });
          publishNow('replace scene');
          break;
        case 'resize-small':
          result = resizeSurface(640, 420);
          break;
        case 'resize-large':
          result = resizeSurface(960, 620);
          break;
        case 'page-hide':
          lifecycleClock = Math.max(lifecycleClock + 1, frameClock, performance.now());
          result = requireEngine().setDocumentVisibility({
            state: 'hidden',
            timeMs: lifecycleClock,
          });
          break;
        case 'page-show':
          lifecycleClock = Math.max(lifecycleClock + 1, frameClock, performance.now());
          result = requireEngine().setDocumentVisibility({
            state: 'visible',
            timeMs: lifecycleClock,
          });
          frameClock = Math.max(frameClock, lifecycleClock);
          publishNow('page visible');
          break;
        case 'accessibility-tree':
          result = requireEngine().accessibilityTree();
          showAdvancedResult(result);
          break;
        case 'accessibility-focus':
          result = requireEngine().focusAccessibilityTarget(accessibilityTarget());
          break;
        case 'accessibility-activate':
          result = requireEngine().activateAccessibilityTarget(accessibilityTarget(), {
            source: 'host',
            activationId: `manual-a11y-${++actionSequence}`,
          });
          break;
        case 'probe-refresh':
          refreshProbe();
          result = currentProbe();
          break;
        case 'events-clear':
          eventJournal = [];
          result = { cleared: true };
          break;
        case 'advanced-run':
          result = runAdvancedOperation();
          showAdvancedResult(result);
          break;
        default:
          throw new Error(`알 수 없는 Core v2 직접 조작 명령입니다: ${command}`);
      }
      lastAction = command;
      status = liveEngine() === null ? 'destroyed' : 'ready';
      if (liveEngine() !== null) {
        startFrameLoop(500);
      }
      setMessage(`‘${actionDisplay(command)}’ 작업을 완료했습니다. 계속 조작하거나 같은 작업을 다시 실행해도 됩니다.`);
      return result;
    } catch (error) {
      fail(error);
      throw error;
    } finally {
      queueRefresh();
    }
  }

  function activateTool(tool: CoreV2ManualToolGroup): void {
    for (const button of host.querySelectorAll<HTMLButtonElement>('[data-manual-tool-button]')) {
      button.setAttribute(
        'aria-pressed',
        String(button.dataset.manualToolButton === tool),
      );
    }
    for (const panel of host.querySelectorAll<HTMLElement>('[data-manual-tool-panel]')) {
      panel.hidden = panel.dataset.manualToolPanel !== tool;
    }
  }

  function activateMode(nextMode: ManualPointerMode): void {
    mode = nextMode;
    for (const button of host.querySelectorAll<HTMLButtonElement>('[data-manual-mode]')) {
      button.setAttribute('aria-pressed', String(button.dataset.manualMode === mode));
    }
    const live = liveEngine();
    if (live !== null) {
      live.applyInteractionModeOperation({
        op: 'replace',
        state: mode === 'pan'
          ? 'pan'
          : mode === 'move' || mode === 'resize' || mode === 'rotate'
            ? 'transform'
            : mode === 'paint'
              ? 'relation-paint'
              : 'select',
      });
      live.configureViewportPolicy({
        op: mode === 'pan' ? 'start' : 'stop',
        policy: 'pan',
      });
      refreshSelectionVisual(live);
      live.canvasHandle().element.style.cursor = cursorForMode(mode);
    }
    const help = {
      select: '객체를 클릭하고 Shift로 선택을 추가·해제합니다.',
      box: '범위를 드래그합니다. Shift를 누르면 기존 선택에 추가합니다.',
      paint: '객체 위를 연속으로 문지릅니다. Shift를 누르면 기존 선택에 추가합니다.',
      move: '선택 객체를 드래그합니다. Shift를 누르면 한 축으로 고정합니다.',
      resize: '선택 핸들을 드래그합니다. Shift를 누르면 가로세로 비율을 고정합니다.',
      rotate: '회전 핸들을 드래그합니다. Shift를 누르면 15° 단위로 맞춥니다.',
      pan: '빈 캔버스를 드래그하고 휠로 확대·축소합니다.',
    } satisfies Record<ManualPointerMode, string>;
    setText(host, 'mode-help', `${manualModeLabel(mode)}: ${help[mode]}`);
    host.dataset.manualMode = mode;
  }

  function transformSelection(
    kind: 'move',
    delta: readonly [number, number],
  ): unknown;
  function transformSelection(
    kind: 'resize',
    delta: readonly [number, number],
  ): unknown;
  function transformSelection(kind: 'rotate', delta: number): unknown;
  function transformSelection(
    kind: 'move' | 'resize' | 'rotate',
    delta: readonly [number, number] | number,
  ): unknown {
    const next = requireEngine();
    const selectionIds = selectedIdsOrDefault(next);
    if (kind === 'move' && Array.isArray(delta)) {
      return next.applyTransformerEdit({
        kind,
        selectionIds,
        deltaWorld: [Number(delta[0]), Number(delta[1])],
      }, { actionId: `manual-nudge-${++actionSequence}` });
    }
    if (kind === 'resize' && Array.isArray(delta)) {
      return next.applyTransformerEdit({
        kind,
        selectionIds,
        handle: 'se',
        deltaWorld: [Number(delta[0]), Number(delta[1])],
        lockAspectRatio:
          required<HTMLInputElement>(host, '[data-manual-lock-ratio]').checked,
        minSize: 8,
      }, { actionId: `manual-resize-${++actionSequence}` });
    }
    return next.applyTransformerEdit({
      kind: 'rotate',
      selectionIds,
      deltaDegrees: Number(delta),
    }, { actionId: `manual-rotate-${++actionSequence}` });
  }

  function historyAction(direction: 'undo' | 'redo'): CoreV2EngineHistoryResult {
    const next = requireEngine();
    return direction === 'undo' ? next.undo() : next.redo();
  }

  function animateBars(scope: 'all' | 'partial' | 'selected'): unknown {
    const next = requireEngine();
    animationSequence += 1;
    const selected = new Set(next.snapshot().selectionIds);
    let targets = scene.barTargets;
    if (scope === 'partial') {
      targets = targets.filter((_, index) => index % 10 === animationSequence % 10);
    } else if (scope === 'selected') {
      targets = targets.filter(({ ownerId }) => selected.has(ownerId));
      if (targets.length === 0) targets = scene.barTargets.slice(0, 1);
    }
    const heights = new Float64Array(targets.length);
    for (let index = 0; index < targets.length; index += 1) {
      heights[index] = 8 + ((index * 17 + animationSequence * 23) % 52);
    }
    const result = next.updateBarHeights({
      actionId: `manual-bars-${scope}-${animationSequence}`,
      targets,
      heights,
    });
    startFrameLoop(1_200);
    return result;
  }

  function randomizeTexts(): unknown {
    const next = requireEngine();
    animationSequence += 1;
    const targets = scene.textTargets
      .filter((_, index) => index % 4 === animationSequence % 4);
    const texts = targets.map(({ ownerId }, index) =>
      `${ownerId.slice(5)}:${animationSequence}:${index}`);
    return next.updateTexts({
      actionId: `manual-text-${animationSequence}`,
      targets,
      texts,
    });
  }

  function styleSelected(): unknown {
    const next = requireEngine();
    const target = selectedElementIds(next)[0] ?? 'manual-rect-a';
    return next.author({
      type: 'apply-style',
      target,
      changes: {
        fill: required<HTMLInputElement>(host, '[data-manual-style-fill]').value,
        alpha: numberInput('style-alpha', 1),
        cornerRadius: numberInput('style-radius', 8),
      },
      strict: true,
      actionId: `manual-style-${++actionSequence}`,
    });
  }

  function editSelectedText(): unknown {
    const next = requireEngine();
    const value = required<HTMLInputElement>(host, '[data-manual-text-value]').value;
    const selected = next.snapshot().selectionIds;
    if (selected.includes('manual-text')) {
      return next.patch({ kind: 'element', id: 'manual-text' }, { text: value });
    }
    const ownerId = selected.find((id) => id.startsWith('node-')) ?? 'node-0';
    return next.patch(
      { kind: 'component', ownerId, id: 'label' },
      { text: value },
    );
  }

  function createElement(): unknown {
    const next = requireEngine();
    const kind = required<HTMLSelectElement>(host, '[data-manual-create-kind]').value;
    const id = `manual-${kind}-${++actionSequence}`;
    const viewport = next.viewportProbe();
    return next.author({
      type: 'create-element',
      kind,
      id,
      positionWorld: viewport.centerWorld,
      parentId: null,
      actionId: `manual-create-${actionSequence}`,
    });
  }

  function duplicateSelected(): unknown {
    const next = requireEngine();
    const target = selectedElementIds(next)[0] ?? 'manual-rect-a';
    return next.author({
      type: 'duplicate-tree',
      target,
      rootId: `${target}-copy-${++actionSequence}`,
      offsetWorld: [28, 28],
      rewriteInternalReferences: true,
      preserveExternalReferences: true,
      actionId: `manual-duplicate-${actionSequence}`,
    });
  }

  function groupSelected(): unknown {
    const next = requireEngine();
    const targets = selectedElementIds(next);
    return next.author({
      type: 'group-targets',
      targets,
      groupId: `manual-group-${++actionSequence}`,
      actionId: `manual-group-${actionSequence}`,
    });
  }

  function ungroupSelected(): unknown {
    const next = requireEngine();
    const target = selectedElementIds(next)[0] ?? 'manual-group';
    return next.author({
      type: 'ungroup-target',
      target,
      actionId: `manual-ungroup-${++actionSequence}`,
    });
  }

  function reorderSelected(placement: 'front' | 'back'): unknown {
    const next = requireEngine();
    return next.author({
      type: 'reorder-z',
      targets: selectedElementIds(next),
      placement,
      preserveRelativeOrder: true,
      actionId: `manual-${placement}-${++actionSequence}`,
    });
  }

  function alignSelected(): unknown {
    const next = requireEngine();
    return next.author({
      type: 'align-targets',
      targets: selectedElementIds(next),
      axis: required<HTMLSelectElement>(host, '[data-manual-align-axis]').value,
      actionId: `manual-align-${++actionSequence}`,
    });
  }

  function distributeSelected(): unknown {
    const next = requireEngine();
    return next.author({
      type: 'distribute-targets',
      targets: selectedElementIds(next),
      axis: required<HTMLSelectElement>(host, '[data-manual-distribute-axis]').value,
      basis: 'bounds',
      actionId: `manual-distribute-${++actionSequence}`,
    });
  }

  function deleteSelected(): readonly unknown[] {
    const next = requireEngine();
    const results: unknown[] = [];
    for (const id of selectedElementIds(next)) {
      results.push(next.destroyTarget({ kind: 'element', id }));
    }
    return Object.freeze(results);
  }

  function loadJsonEditor(): unknown {
    const next = requireEngine();
    const text = required<HTMLTextAreaElement>(host, '[data-manual-scene-json]').value;
    const input: unknown = JSON.parse(text);
    const before = fingerprint(input);
    const result = next.loadDataset(input, {
      strict: required<HTMLInputElement>(host, '[data-manual-strict-load]').checked,
      datasetRef: `manual-json:${options.caseId}`,
    });
    const after = fingerprint(input);
    setText(host, 'immutability', before === after ? '통과' : '실패');
    publishEngineFrame(next, performance.now());
    return result;
  }

  function loadManualScene(
    next: CoreV2Engine,
    nextScene: CoreV2ManualScene,
    size: CoreV2ManualSceneSize = manualSceneSize,
  ): unknown {
    const before = fingerprint(nextScene.dataset);
    const result = next.loadDataset(nextScene.dataset, {
      datasetRef: `manual:${options.caseId}:${size}:${options.seed}`,
    });
    const after = fingerprint(nextScene.dataset);
    setText(host, 'immutability', before === after ? '통과' : '실패');
    return result;
  }

  async function acquireAsset(): Promise<unknown> {
    const lease = await requireEngine().acquireAsset('device');
    assetLeases.push(lease);
    return requireEngine().assetProbe('device');
  }

  async function releaseAsset(): Promise<unknown> {
    const lease = assetLeases.pop();
    if (lease !== undefined) await lease.release();
    return requireEngine().assetProbe('device');
  }

  async function releaseAllAssets(): Promise<void> {
    const leases = assetLeases;
    assetLeases = [];
    await Promise.allSettled(leases.map(async (lease) => lease.release()));
  }

  async function captureScene(): Promise<unknown> {
    const next = requireEngine();
    publishEngineFrame(next, performance.now());
    const snapshot = next.snapshot();
    const capture = await next.extractPublishedScene({
      targetTuple: snapshot.publishedTuple,
      cssSize: snapshot.resources.canvas.cssSize,
      mime: 'image/png',
    });
    const image = required<HTMLImageElement>(host, '[data-manual-capture-image]');
    image.src = capture.dataUrl;
    image.hidden = false;
    return {
      capturedTuple: capture.capturedTuple,
      cssSize: capture.cssSize,
      backingSize: capture.backingSize,
      authoritativeCanvasRetained: capture.authoritativeCanvasRetained,
      dataUrlBytes: capture.dataUrl.length,
    };
  }

  function resizeSurface(width: number, height: number): unknown {
    canvasFrame.style.setProperty('--manual-canvas-width', `${width}px`);
    canvasFrame.style.setProperty('--manual-canvas-height', `${height}px`);
    const result = requireEngine().resize(
      Math.min(width, Math.max(1, surfaceHost.clientWidth)),
      Math.min(height, Math.max(1, surfaceHost.clientHeight)),
      Math.min(2, window.devicePixelRatio || 1),
    );
    publishNow(`resize ${width}×${height}`);
    return result;
  }

  function runAdvancedOperation(): unknown {
    const next = requireEngine();
    const method = required<HTMLSelectElement>(host, '[data-manual-advanced-method]').value;
    const input: unknown = JSON.parse(
      required<HTMLTextAreaElement>(host, '[data-manual-advanced-json]').value,
    );
    switch (method) {
      case 'author':
        return next.author(input);
      case 'patch': {
        const record = requireRecord(input, '부분 갱신 입력');
        return next.patch(
          record.target as Parameters<CoreV2Engine['patch']>[0],
          record.patch,
        );
      }
      case 'transact':
        return next.transact(input as Parameters<CoreV2Engine['transact']>[0]);
      case 'selection':
        return next.applySelection(
          input as Parameters<CoreV2Engine['applySelection']>[0],
        );
      case 'viewport':
        return next.setViewport(input as Parameters<CoreV2Engine['setViewport']>[0]);
      case 'world-transform':
        return next.setWorldTransform(
          input as Parameters<CoreV2Engine['setWorldTransform']>[0],
        );
      case 'history-companion':
        return next.setHistoryCompanion(
          input as Parameters<CoreV2Engine['setHistoryCompanion']>[0],
        );
      case 'live-overlay':
        return next.applyLiveOverlay(
          input as Parameters<CoreV2Engine['applyLiveOverlay']>[0],
        );
      case 'viewport-policy':
        return next.configureViewportPolicy(
          input as Parameters<CoreV2Engine['configureViewportPolicy']>[0],
        );
      default:
        throw new Error(`지원하지 않는 고급 작업입니다: ${method}`);
    }
  }

  function refresh(): void {
    const next = liveEngine();
    host.dataset.manualStatus = status;
    setText(host, 'status', coreV2KoreanStatus(status));
    setText(host, 'last-action', actionDisplay(lastAction));
    setText(host, 'scene-size', manualSceneSizeLabel(manualSceneSize));
    const history = next?.historyState() ?? { undoDepth: 0, redoDepth: 0 };
    const snapshot = next?.snapshot() ?? null;
    const selectedIds = snapshot?.selectionIds ?? [];
    const animations = activeAnimationCount(next);
    setText(host, 'selection-count', String(selectedIds.length));
    setText(host, 'selection-ids', selectedIds.length === 0 ? '선택 없음' : selectedIds.join('\n'));
    setText(host, 'history', `${history.undoDepth} / ${history.redoDepth}`);
    setText(host, 'animations', String(animations));
    setText(host, 'frame', String(snapshot?.frameRevision ?? 0));
    setText(host, 'canvas', String(snapshot?.resources.canvasCount ?? 0));
    setText(host, 'generation', String(generation));
    setText(
      host,
      'viewport',
      snapshot === null
        ? '세션 꺼짐'
        : `${snapshot.viewport.scale.toFixed(3)}× @ ${snapshot.viewport.centerWorld.map((value) => value.toFixed(1)).join(', ')}`,
    );
    setText(
      host,
      'history-stack',
      next === null ? '세션 꺼짐' : historySummary(next),
    );
    setText(host, 'asset-state', next === null
      ? '세션 꺼짐'
      : summarize(next.assetProbe('device')));
    setText(host, 'lifecycle-state', snapshot === null
      ? '종료됨'
      : summarize({
          '수명 주기': coreV2KoreanStatus(snapshot.lifecycle),
          '세대': snapshot.revisions.lifecycleGeneration,
          '대기 작업': snapshot.pendingWork,
          '캔버스 수': snapshot.resources.canvasCount,
          '구독 수': snapshot.resources.subscriptions.active,
        }));
    setText(host, 'event-count', String(eventJournal.length));
    required<HTMLElement>(host, '[data-manual-event-journal]').textContent =
      eventJournal.length === 0
        ? '아직 기록된 이벤트가 없습니다.'
        : eventJournal.slice(-18).map((event) => JSON.stringify(event)).join('\n');
    required<HTMLElement>(
      host,
      '[data-manual-command="frames-toggle"] [data-manual-command-label]',
    ).textContent =
      framesPaused ? '프레임 다시 시작' : '프레임 일시 정지';
    const deltas = frameTimes.slice(1).map((time, index) => time - (frameTimes[index] ?? time));
    const average = deltas.length === 0
      ? null
      : deltas.reduce((sum, value) => sum + value, 0) / deltas.length;
    const maxGap = deltas.length === 0 ? null : Math.max(...deltas);
    setText(
      host,
      'fps',
      average === null || maxGap === null
        ? '—'
        : `${(1000 / average).toFixed(0)} / ${maxGap.toFixed(1)} ms`,
    );
    setText(host, 'long-tasks', String(longTaskCount));
    syncDisabledState(next === null);
  }

  function queueRefresh(): void {
    cancelAnimationFrame(refreshFrame);
    refreshFrame = requestAnimationFrame(() => {
      refreshFrame = 0;
      refresh();
    });
  }

  function refreshProbe(): void {
    const output = required<HTMLElement>(host, '[data-manual-probe-output]');
    try {
      output.textContent = JSON.stringify(currentProbe(), null, 2);
    } catch (error) {
      output.textContent = errorMessage(error);
    }
  }

  function currentProbe(): unknown {
    const next = requireEngine();
    switch (required<HTMLSelectElement>(host, '[data-manual-probe-select]').value) {
      case 'history':
        return next.historyInspection();
      case 'geometry':
        return next.geometryProbe();
      case 'accessibility':
        return next.accessibilityProbe();
      case 'assets':
        return next.assetProbe();
      case 'interaction':
        return {
          mode: next.interactionModeProbe(),
          pointer: next.pointerGestureProbe(),
          transformer: next.transformerGestureProbe(),
          transformerEdit: next.transformerEditProbe(),
          ownership: next.interactionOwnershipProbe(),
        };
      case 'runtime':
        return next.runtimeDiagnostics();
      default:
        return next.snapshot();
    }
  }

  function refreshSceneEditor(): void {
    const next = liveEngine();
    if (next === null) return;
    required<HTMLTextAreaElement>(host, '[data-manual-scene-json]').value =
      JSON.stringify(next.exportDataset(), null, 2);
  }

  function refreshSelectionVisual(next: CoreV2Engine): void {
    next.setSelectionVisualPolicy({
      mode: mode === 'pan' ? 'hidden' : 'all',
      handleCssPx: 10,
      strokeCssPx: 2,
    });
  }

  function recordEvent(type: string, value: unknown, refreshNow = true): void {
    const summary = eventSummary(type, value);
    eventJournal.push(summary);
    if (eventJournal.length > 120) eventJournal = eventJournal.slice(-120);
    if (refreshNow) queueRefresh();
  }

  function startFrameLoop(durationMs: number): void {
    monitorUntil = Math.max(monitorUntil, performance.now() + durationMs);
    if (renderFrame !== 0 || framesPaused || liveEngine() === null) return;
    const tick = (time: number): void => {
      renderFrame = 0;
      const next = liveEngine();
      if (next === null || framesPaused) return;
      const animationsBefore = activeAnimationCount(next);
      const largeSceneAnimatedPan =
        panPointerId !== null &&
        scene.barTargets.length >= 2_000 &&
        animationsBefore > 0;
      const panFrameInterval = animationsBefore >= 2_000 ? 75 : 50;
      const viewportFramesRequired = animationsBefore >= 2_000 ? 3 : 1;
      const deferHeavyPanFrame =
        largeSceneAnimatedPan &&
        (
          panViewportFramesSinceAnimationAdvance < viewportFramesRequired ||
          time - lastAnimationAdvanceWallTime < panFrameInterval
        );
      // Keep publishing the cheap viewport-only frame while the expensive
      // all-bar interpolation is budgeted. This preserves direct-manipulation
      // motion instead of making the canvas wait for the next bar upload.
      publishEngineFrame(next, time, !deferHeavyPanFrame);
      if (largeSceneAnimatedPan) {
        panViewportFramesSinceAnimationAdvance = deferHeavyPanFrame
          ? panViewportFramesSinceAnimationAdvance + 1
          : 0;
      } else {
        panViewportFramesSinceAnimationAdvance = 0;
      }
      frameTimes.push(time);
      if (frameTimes.length > 120) frameTimes = frameTimes.slice(-120);
      const animations = activeAnimationCount(next);
      const shouldContinue =
        animations > 0 ||
        activePointer !== null ||
        panPointerId !== null ||
        time < monitorUntil;
      if (
        !shouldContinue ||
        time - lastLiveRefreshWallTime >= 200
      ) {
        lastLiveRefreshWallTime = time;
        queueRefresh();
      }
      if (shouldContinue) {
        renderFrame = requestAnimationFrame(tick);
      }
    };
    renderFrame = requestAnimationFrame(tick);
  }

  function publishNow(action: string): void {
    const next = requireEngine();
    publishEngineFrame(next, performance.now());
    lastAction = action;
    startFrameLoop(350);
  }

  function publishEngineFrame(
    next: CoreV2Engine,
    timeMs: number,
    advancePresentation = true,
  ): void {
    const elapsed = lastFrameWallTime === null
      ? 0.01
      : Math.max(0.01, Math.min(50, timeMs - lastFrameWallTime));
    lastFrameWallTime = timeMs;
    const animationsBefore = activeAnimationCount(next);
    if (animationsBefore === 0) {
      pendingAnimationElapsed = 0;
      frameClock += elapsed;
    } else if (advancePresentation) {
      frameClock += pendingAnimationElapsed + elapsed;
      pendingAnimationElapsed = 0;
    } else {
      pendingAnimationElapsed += elapsed;
    }
    next.publishFrame(frameClock);
    if (animationsBefore === 0 || advancePresentation) {
      // Start the next heavy-frame budget after the renderer has returned,
      // so one slow WebGL frame cannot immediately trigger another.
      lastAnimationAdvanceWallTime = performance.now();
    }
    if (activeAnimationCount(next) === 0) pendingAnimationElapsed = 0;
  }

  function installResizeObserver(): void {
    resizeObserver?.disconnect();
    resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = 0;
        const next = liveEngine();
        if (next === null) return;
        const size = surfaceSize(canvasFrame);
        if (size.width <= 0 || size.height <= 0) return;
        next.resize(size.width, size.height, Math.min(2, window.devicePixelRatio || 1));
        startFrameLoop(350);
      });
    });
    resizeObserver.observe(canvasFrame);
  }

  function installPerformanceObserver(): void {
    if (!('PerformanceObserver' in window)) return;
    try {
      performanceObserver = new PerformanceObserver((list) => {
        longTaskCount += list.getEntries().length;
        queueRefresh();
      });
      performanceObserver.observe({ type: 'longtask', buffered: true });
    } catch {
      performanceObserver = null;
    }
  }

  function drawMarquee(
    start: readonly [number, number],
    end: readonly [number, number],
  ): void {
    const marquee = required<HTMLElement>(host, '[data-manual-marquee]');
    const canvas = requireEngine().canvasHandle().element;
    const canvasRect = canvas.getBoundingClientRect();
    const frameRect = canvasFrame.getBoundingClientRect();
    const left = Math.min(start[0], end[0]) + canvasRect.left - frameRect.left;
    const top = Math.min(start[1], end[1]) + canvasRect.top - frameRect.top;
    marquee.style.left = `${left}px`;
    marquee.style.top = `${top}px`;
    marquee.style.width = `${Math.abs(end[0] - start[0])}px`;
    marquee.style.height = `${Math.abs(end[1] - start[1])}px`;
    marquee.dataset.kind = 'box';
    marquee.hidden = false;
  }

  function drawPaintTrail(gesture: ManualPointerGesture): void {
    const last = gesture.segments.at(-1)?.[1] ?? gesture.startScreen;
    const half = 12;
    drawMarquee(
      [last[0] - half, last[1] - half],
      [last[0] + half, last[1] + half],
    );
    required<HTMLElement>(host, '[data-manual-marquee]').dataset.kind = 'paint';
  }

  function hideMarquee(): void {
    required<HTMLElement>(host, '[data-manual-marquee]').hidden = true;
  }

  function showTooltip(targetId: string | null, clientX: number, clientY: number): void {
    const tooltip = required<HTMLElement>(host, '[data-manual-tooltip]');
    if (targetId === null) {
      tooltip.hidden = true;
      return;
    }
    const frameRect = canvasFrame.getBoundingClientRect();
    tooltip.textContent = targetId;
    tooltip.style.left = `${clientX - frameRect.left + 14}px`;
    tooltip.style.top = `${clientY - frameRect.top + 14}px`;
    tooltip.hidden = false;
  }

  function clearTooltip(): void {
    required<HTMLElement>(host, '[data-manual-tooltip]').hidden = true;
  }

  function zoomAtCenter(factor: number): unknown {
    const next = requireEngine();
    const snapshot = next.snapshot();
    const [width, height] = snapshot.resources.canvas.cssSize;
    const result = next.zoomViewportAt({
      factor,
      anchorCss: [width / 2, height / 2],
      source: 'programmatic',
    });
    publishNow(factor > 1 ? 'zoom in' : 'zoom out');
    return result;
  }

  function rotateWorld(delta: number): unknown {
    const next = requireEngine();
    const world = next.viewportTransformProbe().world;
    const result = next.setWorldTransform({
      rotationDegrees: world.rotationDegrees + delta,
      flipX: world.flipX,
      flipY: world.flipY,
    });
    publishNow('rotate world');
    return result;
  }

  function flipWorld(axis: 'x' | 'y'): unknown {
    const next = requireEngine();
    const world = next.viewportTransformProbe().world;
    const result = next.setWorldTransform({
      rotationDegrees: world.rotationDegrees,
      flipX: axis === 'x' ? !world.flipX : world.flipX,
      flipY: axis === 'y' ? !world.flipY : world.flipY,
    });
    publishNow(`flip ${axis}`);
    return result;
  }

  function accessibilityTarget(): string {
    const value = required<HTMLInputElement>(host, '[data-manual-accessibility-target]')
      .value.trim();
    return value || requireEngine().snapshot().selectionIds[0] || 'manual-rect-a';
  }

  function selectedIdsOrDefault(next: CoreV2Engine): readonly string[] {
    const selected = next.snapshot().selectionIds;
    if (selected.length > 0) return selected;
    next.select(['manual-rect-a']);
    return ['manual-rect-a'];
  }

  function selectedElementIds(next: CoreV2Engine): readonly string[] {
    return selectedIdsOrDefault(next).filter((id) => !id.includes('::'));
  }

  function stateSnapshot(): CoreV2ManualLabState {
    const next = liveEngine();
    const snapshot = next?.snapshot() ?? null;
    const history = next?.historyState() ?? { undoDepth: 0, redoDepth: 0 };
    return Object.freeze({
      caseId: options.caseId,
      sceneSize: manualSceneSize,
      status,
      generation,
      mode,
      selectedIds: snapshot?.selectionIds ?? Object.freeze([]),
      history: Object.freeze({
        undoDepth: history.undoDepth,
        redoDepth: history.redoDepth,
      }),
      activeAnimations: activeAnimationCount(next),
      canvasCount: snapshot?.resources.canvasCount ?? 0,
      lastAction,
      error: lastError,
    });
  }

  function requireEngine(): CoreV2Engine {
    const next = liveEngine();
    if (next === null) {
      throw new Error('Core v2 직접 조작 세션이 종료되었습니다. ‘다시 초기화’를 누르세요.');
    }
    return next;
  }

  function liveEngine(): CoreV2Engine | null {
    if (engine === null) return null;
    const lifecycle = engine.snapshot().lifecycle;
    return lifecycle === 'destroyed' || lifecycle === 'destroying' ? null : engine;
  }

  function activeAnimationCount(next: CoreV2Engine | null): number {
    return next?.pageLifecycleProbe().activeAnimationCount ?? 0;
  }

  async function destroyEngine(): Promise<void> {
    canvasAbortController?.abort();
    canvasAbortController = null;
    resizeObserver?.disconnect();
    resizeObserver = null;
    cancelAnimationFrame(renderFrame);
    cancelAnimationFrame(refreshFrame);
    cancelAnimationFrame(resizeFrame);
    renderFrame = 0;
    refreshFrame = 0;
    resizeFrame = 0;
    activePointer = null;
    panPointerId = null;
    pendingAnimationElapsed = 0;
    panViewportFramesSinceAnimationAdvance = 0;
    hideMarquee();
    await releaseAllAssets();
    for (const unbind of engineUnbinds.splice(0)) unbind();
    const previous = engine;
    engine = null;
    if (previous !== null) await previous.destroy();
    surfaceHost.replaceChildren();
  }

  async function destroy(): Promise<void> {
    if (destroyed) return;
    destroyed = true;
    abortController.abort();
    performanceObserver?.disconnect();
    performanceObserver = null;
    await destroyEngine();
    status = 'destroyed';
    if (window.__PATCH_MAP_CORE_V2_MANUAL_LAB__ === bridge) {
      delete window.__PATCH_MAP_CORE_V2_MANUAL_LAB__;
    }
    refresh();
  }

  function fail(error: unknown): void {
    lastError = errorMessage(error);
    lastAction = 'failed';
    status = 'failed';
    setMessage(`오류 · ${lastError}`);
  }

  function actionDisplay(value: string): string {
    const label = host.querySelector<HTMLElement>(
      `[data-manual-command="${value}"] [data-manual-command-label]`,
    )?.textContent?.trim();
    return label && label.length > 0 ? label : manualActionDisplay(value);
  }

  function setMessage(value: string): void {
    required<HTMLElement>(host, '[data-manual-message]').textContent = value;
  }

  function syncDisabledState(offline: boolean): void {
    for (const button of host.querySelectorAll<HTMLButtonElement>('[data-manual-command]')) {
      const command = button.dataset.manualCommand;
      button.disabled = offline && command !== 'reinitialize-session';
    }
    for (const button of host.querySelectorAll<HTMLButtonElement>('[data-manual-mode]')) {
      button.disabled = offline;
    }
  }

  function showAdvancedResult(value: unknown): void {
    required<HTMLElement>(host, '[data-manual-advanced-output]').textContent =
      JSON.stringify(value, null, 2);
  }

  function numberInput(name: string, fallback: number): number {
    const value = Number(required<HTMLInputElement>(host, `[data-manual-${name}]`).value);
    return Number.isFinite(value) ? value : fallback;
  }

  function nudgeAmount(): number {
    return numberInput('nudge-amount', 10);
  }

  function resizeAmount(): number {
    return numberInput('resize-amount', 16);
  }

  function angleAmount(): number {
    return numberInput('angle-amount', 15);
  }

  function manualAnimationDuration(): number {
    const durationMs = numberInput(
      'animation-duration',
      defaultManualAnimationDuration(options.caseId),
    );
    if (
      !Number.isSafeInteger(durationMs) ||
      durationMs < 0 ||
      durationMs > 60_000
    ) {
      throw new RangeError('막대 애니메이션 시간은 0~60,000ms 정수여야 합니다.');
    }
    return durationMs;
  }

  function selectedManualSceneSize(): CoreV2ManualSceneSize {
    return requireManualSceneSize(
      required<HTMLSelectElement>(host, '[data-manual-scene-size]').value,
    );
  }
}

function renderSelectionPanel(): string {
  return toolPanel('selection', '선택을 계속 바꾸며 확인하기', `
    <p>캔버스 클릭은 이동·확대된 좌표까지 반영합니다. 캔버스 위에서 ‘영역 선택’과 ‘붓질 선택’도 사용할 수 있습니다.</p>
    <div class="manual-button-grid">
      ${commandButton('select-first', '첫 객체 선택')}
      ${commandButton('select-first-three', '처음 3개 선택')}
      ${commandButton('select-relations', '관계선 양 끝 선택')}
      ${commandButton('selection-clear', '선택 해제')}
    </div>
    <dl class="manual-mini-ledger">
      <div><dt>선택된 ID</dt><dd><pre data-manual-readout="selection-ids">선택 없음</pre></dd></div>
      <div><dt>포인터 좌표</dt><dd data-manual-readout="pointer">캔버스 위로 이동하세요</dd></div>
    </dl>
  `);
}

function renderTransformPanel(): string {
  return toolPanel('transform', '이동·크기 조절·회전·취소', `
    <p>먼저 객체를 선택하세요. ‘이동’은 객체를 직접 끌고, ‘크기 조절/회전’은 선택 테두리의 핸들을 끕니다. 진행 중 Escape를 누르면 취소됩니다.</p>
    <div class="manual-field-row">
      <label>이동량(px)<input data-manual-nudge-amount type="number" value="10" min="1" step="1"></label>
      <label>크기 변화(px)<input data-manual-resize-amount type="number" value="16" min="1" step="1"></label>
      <label>회전 각도(°)<input data-manual-angle-amount type="number" value="15" min="1" step="1"></label>
    </div>
    <div class="manual-nudge-pad" aria-label="키보드와 같은 미세 이동 버튼">
      ${commandButton('nudge-up', '↑')}
      ${commandButton('nudge-left', '←')}
      ${commandButton('nudge-down', '↓')}
      ${commandButton('nudge-right', '→')}
    </div>
    <div class="manual-button-grid">
      ${commandButton('resize-grow', '오른쪽 아래로 확대')}
      ${commandButton('resize-shrink', '오른쪽 아래로 축소')}
      ${commandButton('rotate-left', '반시계 회전')}
      ${commandButton('rotate-right', '시계 회전')}
    </div>
    <label class="manual-check"><input type="checkbox" data-manual-lock-ratio> 버튼으로 크기를 바꿀 때 가로세로 비율 고정</label>
    <p class="manual-shortcut-note">단축키: 방향키 1px 이동 · Shift+방향키 10px 이동 · Escape 진행 중 동작 취소</p>
  `);
}

function renderHistoryPanel(): string {
  return toolPanel('history', '직접 편집해 쌓는 실제 기록', `
    <p>이동·크기 조절·회전·생성 같은 편집을 먼저 해보세요. 아래 기록에 한 사용자 작업씩 쌓입니다.</p>
    <div class="manual-button-grid">
      ${commandButton('undo', '실행 취소 · ⌘/Ctrl Z')}
      ${commandButton('redo', '다시 실행 · ⇧⌘/Ctrl Z')}
      ${commandButton('history-clear', '기록 비우기')}
    </div>
    <div class="manual-field-action">
      <label>최대 기록 수<input data-manual-history-capacity type="number" value="100" min="0" max="1000" step="1"></label>
      ${commandButton('history-capacity', '적용')}
    </div>
    <pre class="manual-ledger-output" data-manual-readout="history-stack">기록 없음</pre>
  `);
}

function renderViewPanel(): string {
  return toolPanel('view', '화면 위치·배율과 월드 방향', `
    <p>캔버스의 빈 곳을 ‘화면 이동’ 모드로 끌거나 휠로 확대할 수 있습니다. 아래 버튼은 같은 동작을 정확한 값으로 반복합니다.</p>
    <div class="manual-button-grid">
      ${commandButton('fit-all', '전체 맞춤')}
      ${commandButton('fit-selection', '선택 맞춤')}
      ${commandButton('view-reset', '화면 초기화')}
      ${commandButton('zoom-in', '확대')}
      ${commandButton('zoom-out', '축소')}
      ${commandButton('world-rotate-left', '월드 −15°')}
      ${commandButton('world-rotate-right', '월드 +15°')}
      ${commandButton('world-flip-x', '좌우 뒤집기')}
      ${commandButton('world-flip-y', '위아래 뒤집기')}
      ${commandButton('view-save', '화면 저장')}
      ${commandButton('view-restore', '화면 복원')}
    </div>
    <dl class="manual-mini-ledger"><div><dt>현재 화면</dt><dd data-manual-readout="viewport">세션 꺼짐</dd></div></dl>
  `);
}

function renderAnimationPanel(caseId: string): string {
  const durationMs = defaultManualAnimationDuration(caseId);
  return toolPanel('animation', '애니메이션·텍스트·화면 스타일', `
    <p>막대 높이와 텍스트를 반복해서 바꾸거나 선택 객체의 보이는 스타일을 편집합니다. 막대가 움직일 때 캔버스도 함께 조작해보세요.</p>
    <div class="manual-field-action">
      <label>막대 재생 시간(ms)<input data-manual-animation-duration type="number" value="${durationMs}" min="0" max="60000" step="100"></label>
      ${commandButton('animation-duration', '재생 시간 적용')}
    </div>
    <div class="manual-button-grid">
      ${commandButton('animate-all', '전체 막대 움직이기')}
      ${commandButton('animate-partial', '막대 10% 움직이기')}
      ${commandButton('animate-selected', '선택 막대 움직이기')}
      ${commandButton('random-text', '무작위 텍스트')}
      ${commandButton('frames-toggle', '프레임 일시 정지')}
      ${commandButton('publish-frame', '한 프레임 게시')}
    </div>
    <label class="manual-check"><input type="checkbox" data-manual-reduced-motion> 동작 줄이기 사용</label>
    ${commandButton('reduced-motion', '동작 정책 적용')}
    <div class="manual-style-grid">
      <label>채움색<input data-manual-style-fill type="color" value="#ff6b35"></label>
      <label>투명도<input data-manual-style-alpha type="number" value="0.85" min="0" max="1" step="0.05"></label>
      <label>모서리 반경<input data-manual-style-radius type="number" value="12" min="0" step="1"></label>
    </div>
    ${commandButton('style-selected', '선택 객체 꾸미기')}
    <div class="manual-field-action">
      <label>바꿀 텍스트<input data-manual-text-value value="직접 변경한 텍스트"></label>
      ${commandButton('text-selected', '텍스트 적용')}
    </div>
  `);
}

function defaultManualAnimationDuration(caseId: string): number {
  return caseId === 'REN-009' ? 5_000 : 200;
}

function requireManualSceneSize(value: string): CoreV2ManualSceneSize {
  if (!isCoreV2ManualSceneSize(value)) {
    throw new RangeError(`지원하지 않는 직접 조작 예제 크기입니다: ${value}`);
  }
  return value;
}

function manualSceneSizeLabel(size: CoreV2ManualSceneSize): string {
  if (size === 'production') return 'production 예제';
  const suffix = size === '10000' ? ' · 탐색용' : '';
  return `${Number(size).toLocaleString('ko-KR')}개${suffix}`;
}

function renderDataPanel(): string {
  return toolPanel('data', 'PATCH MAP JSON 직접 입력과 원자적 갱신', `
    <p>현재 장면과 같은 v0.10 JSON을 직접 편집해 다시 불러올 수 있습니다. 실패하면 일부만 반영하지 않고 기존 장면을 유지합니다.</p>
    <div class="manual-field-action">
      <label>예제 데이터 크기
        <select data-manual-scene-size aria-label="예제 데이터 크기">
          ${CORE_V2_MANUAL_SCENE_SIZE_OPTIONS.map((size) =>
            `<option value="${size}">${manualSceneSizeLabel(size)}</option>`).join('')}
        </select>
      </label>
      ${commandButton('scene-size', '선택 크기 불러오기')}
    </div>
    <p>10,000개는 브라우저 한계를 직접 살펴보는 탐색용 장면입니다. 아래의 정확 계약 실행은 승인된 5,000개/production 측정 범위를 그대로 유지합니다.</p>
    <div class="manual-button-grid">
      ${commandButton('scene-regenerate', '시드 장면 다시 만들기')}
      ${commandButton('scene-export-json', '현재 장면 → 편집기')}
      ${commandButton('scene-invalid-json', '중복 ID 오류 준비')}
      ${commandButton('scene-load-json', '편집기 JSON 불러오기')}
    </div>
    <label class="manual-check"><input type="checkbox" data-manual-strict-load> 엄격한 참조 유효성 검사</label>
    <textarea class="manual-json-editor" data-manual-scene-json spellcheck="false" aria-label="편집 가능한 PATCH MAP JSON"></textarea>
    <dl class="manual-mini-ledger">
      <div><dt>예제 생성 크기</dt><dd data-manual-readout="scene-size">확인 전</dd></div>
      <div><dt>입력 객체 불변</dt><dd data-manual-readout="immutability">확인 전</dd></div>
    </dl>
  `);
}

function renderAuthoringPanel(): string {
  return toolPanel('authoring', '안정적인 논리 ID 기반 편집', `
    <p>객체를 만들거나 선택한 객체의 계층·순서·배치를 바꿉니다. 각 버튼은 실행 취소 가능한 한 사용자 작업으로 기록됩니다.</p>
    <div class="manual-field-action">
      <label>새 객체 종류
        <select data-manual-create-kind>
          <option value="rect">사각형</option>
          <option value="text">텍스트</option>
          <option value="item">항목</option>
          <option value="group">그룹</option>
          <option value="grid">그리드</option>
          <option value="relations">관계선</option>
          <option value="image">이미지</option>
        </select>
      </label>
      ${commandButton('create-element', '화면 중심에 만들기')}
    </div>
    <div class="manual-button-grid">
      ${commandButton('duplicate-selected', '선택 복제')}
      ${commandButton('group-selected', '선택 그룹화')}
      ${commandButton('ungroup-selected', '그룹 해제')}
      ${commandButton('front-selected', '맨 앞으로')}
      ${commandButton('back-selected', '맨 뒤로')}
      ${commandButton('delete-selected', '선택 삭제')}
    </div>
    <div class="manual-field-action">
      <label>정렬 기준
        <select data-manual-align-axis>
          <option value="left">왼쪽</option><option value="right">오른쪽</option>
          <option value="top">위쪽</option><option value="bottom">아래쪽</option>
          <option value="center-x">가로 중심</option><option value="center-y">세로 중심</option>
        </select>
      </label>
      ${commandButton('align-selected', '정렬 적용')}
    </div>
    <div class="manual-field-action">
      <label>간격 분배 방향
        <select data-manual-distribute-axis>
          <option value="horizontal">가로</option>
          <option value="vertical">세로</option>
        </select>
      </label>
      ${commandButton('distribute-selected', '분배 적용')}
    </div>
  `);
}

function renderAssetsPanel(): string {
  return toolPanel('assets', '캔버스를 유지하는 에셋·이미지 추출', `
    <p>에셋 사용권의 획득·반납과 현재 PixiJS 장면의 PNG 추출을 시험합니다. 캡처해도 위의 실제 캔버스는 교체되지 않습니다.</p>
    <div class="manual-button-grid">
      ${commandButton('asset-acquire', '내장 에셋 사용')}
      ${commandButton('asset-release', '사용권 1개 반납')}
      ${commandButton('capture', '현재 장면 캡처')}
    </div>
    <pre class="manual-ledger-output" data-manual-readout="asset-state">세션 꺼짐</pre>
    <figure class="manual-capture-preview">
      <img data-manual-capture-image hidden alt="캡처한 Core v2 장면">
      <figcaption>캡처 미리보기입니다. 실제 PixiJS 캔버스는 위에서 계속 동작합니다.</figcaption>
    </figure>
  `);
}

function renderLifecyclePanel(): string {
  return toolPanel('lifecycle', '종료·재시작·크기 조절·일시 중지', `
    <p>렌더러와 자원의 생명주기를 직접 시험합니다. ‘세션 종료’ 뒤에는 ‘다시 초기화’만 사용할 수 있습니다.</p>
    <div class="manual-button-grid">
      ${commandButton('replace-session', '장면 교체')}
      ${commandButton('destroy-session', '세션 종료')}
      ${commandButton('reinitialize-session', '다시 초기화')}
      ${commandButton('resize-small', '작게 크기 조절')}
      ${commandButton('resize-large', '크게 크기 조절')}
      ${commandButton('page-hide', '페이지 숨김 가정')}
      ${commandButton('page-show', '페이지 표시 가정')}
    </div>
    <dl class="manual-mini-ledger">
      <div><dt>세션 세대</dt><dd data-manual-readout="generation">0</dd></div>
      <div><dt>수명·자원</dt><dd><pre data-manual-readout="lifecycle-state">세션 꺼짐</pre></dd></div>
    </dl>
  `);
}

function renderAccessibilityPanel(): string {
  return toolPanel('accessibility', '논리 트리·포커스·키보드 동등 조작', `
    <p>캔버스 안의 논리 대상을 보조 기술과 키보드가 사용할 수 있는 경로로 확인합니다.</p>
    <div class="manual-field-action">
      <label>대상 ID<input data-manual-accessibility-target value="manual-rect-a"></label>
    </div>
    <div class="manual-button-grid">
      ${commandButton('accessibility-tree', '논리 트리 만들기')}
      ${commandButton('accessibility-focus', '대상에 포커스')}
      ${commandButton('accessibility-activate', '활성화·선택')}
    </div>
    <p>Tab으로 렌더러 소유 접근성 오버레이를 이동하고 Enter 또는 Space를 눌러 선택 결과를 비교하세요.</p>
  `);
}

function renderDiagnosticsPanel(): string {
  return toolPanel('diagnostics', '제품 상태·이벤트·고급 호출', `
    <p>일반 조작 결과를 더 자세히 확인하는 개발자용 정보입니다. 기술적인 필드명과 공개 기능 이름은 원문 그대로 표시됩니다.</p>
    <div class="manual-field-action">
      <label>확인할 상태
        <select data-manual-probe-select>
          <option value="snapshot">전체 스냅샷</option>
          <option value="runtime">런타임 자원</option>
          <option value="history">히스토리</option>
          <option value="geometry">도형 정보</option>
          <option value="interaction">상호작용</option>
          <option value="accessibility">접근성</option>
          <option value="assets">에셋</option>
        </select>
      </label>
      ${commandButton('probe-refresh', '상태 새로고침')}
    </div>
    <pre class="manual-probe-output" data-manual-probe-output>확인할 상태를 고른 뒤 새로고침하세요.</pre>
    <div class="manual-diagnostic-heading">
      <strong>이벤트 기록 · <span data-manual-readout="event-count">0</span></strong>
      ${commandButton('events-clear', '기록 비우기')}
    </div>
    <pre class="manual-event-journal" data-manual-event-journal>아직 기록된 이벤트가 없습니다.</pre>
    <details class="manual-advanced-console">
      <summary>고급 제품 작업 콘솔</summary>
      <p>별도 화면 조작이 필요 없는 케이스별 의미를 확인합니다. 공개 Core v2 메서드만 호출하며 메서드명과 JSON 필드는 기술 식별자이므로 원문을 유지합니다.</p>
      <select data-manual-advanced-method>
        <option value="author">author(action)</option>
        <option value="patch">patch(target, patch)</option>
        <option value="transact">transact(request)</option>
        <option value="selection">applySelection(operation)</option>
        <option value="viewport">setViewport(state)</option>
        <option value="world-transform">setWorldTransform(state)</option>
        <option value="history-companion">setHistoryCompanion(value)</option>
        <option value="live-overlay">applyLiveOverlay(input)</option>
        <option value="viewport-policy">configureViewportPolicy(operation)</option>
      </select>
      <textarea data-manual-advanced-json spellcheck="false">${escapeHtml(advancedExample('author'))}</textarea>
      ${commandButton('advanced-run', '공개 작업 실행')}
      <pre data-manual-advanced-output>실행 결과가 여기에 표시됩니다.</pre>
    </details>
    <dl class="manual-mini-ledger">
      <div><dt>긴 작업 수</dt><dd data-manual-readout="long-tasks">0</dd></div>
    </dl>
  `);
}

function toolPanel(
  group: CoreV2ManualToolGroup,
  title: string,
  content: string,
): string {
  return `<section class="manual-tool-panel" data-manual-tool-panel="${group}"${group === 'selection' ? '' : ' hidden'}>
    <span class="contract-kicker">${escapeHtml(CORE_V2_MANUAL_TOOL_LABELS[group])}</span>
    <h3>${escapeHtml(title)}</h3>
    ${content}
  </section>`;
}

function modeButton(mode: ManualPointerMode, label: string, shortcut: string): string {
  return `<button type="button" data-manual-mode="${mode}" aria-pressed="${mode === 'select'}" title="${escapeHtml(manualModeHelp(mode))}"><span>${escapeHtml(label)}</span><kbd>${escapeHtml(shortcut)}</kbd></button>`;
}

function commandButton(command: string, label: string): string {
  const help = MANUAL_COMMAND_HELP[command];
  return `<button type="button" data-manual-command="${escapeHtml(command)}"${help === undefined ? '' : ` title="${escapeHtml(help)}"`}><span data-manual-command-label>${escapeHtml(label)}</span>${help === undefined ? '' : `<small>${escapeHtml(help)}</small>`}</button>`;
}

function advancedExample(method: string): string {
  const examples: Readonly<Record<string, unknown>> = {
    author: {
      type: 'edit-position-angle',
      target: 'manual-rect-a',
      x: 80,
      y: 80,
      angleDegrees: 12,
      actionId: 'manual-console-position',
    },
    patch: {
      target: { kind: 'element', id: 'manual-text' },
      patch: { text: '고급 콘솔 텍스트' },
    },
    transact: {
      strict: true,
      actionId: 'manual-console-transaction',
      operations: [{
        op: 'merge',
        target: { kind: 'element', id: 'manual-rect-b' },
        changes: [{ path: ['attrs', 'x'], value: 260 }],
      }],
    },
    selection: { op: 'replace', ids: ['manual-rect-a'], source: 'programmatic' },
    viewport: { centerWorld: [300, 200], scale: 1.2 },
    'world-transform': { rotationDegrees: 15, flipX: false, flipY: false },
    'history-companion': {
      selectedIds: ['manual-rect-a'],
      mode: 'transform',
      dirty: true,
    },
    'live-overlay': {
      sourceRevision: 1,
      payloadHash: 'manual-overlay-1',
      transaction: {
        strict: true,
        recordHistory: false,
        operations: [{
          op: 'merge',
          target: { kind: 'component', ownerId: 'node-0', id: 'label' },
          changes: [{ path: ['text'], value: '실시간' }],
        }],
      },
    },
    'viewport-policy': { op: 'temporary', policy: 'pan' },
  };
  return JSON.stringify(examples[method] ?? examples.author, null, 2);
}

function historySummary(engine: CoreV2Engine): string {
  const inspection = engine.historyInspection();
  if (inspection.commands.length === 0) {
    return `기록 없음 · 최대 ${inspection.state.capacity}개`;
  }
  return [
    `최대 기록 ${inspection.state.capacity}개`,
    ...inspection.commands.map((command, index) =>
      `${index < inspection.state.undoDepth ? '취소 가능' : '재실행 가능'}  ${command.id}  ×${command.recordCount}`),
  ].join('\n');
}

function eventSummary(
  type: string,
  value: unknown,
): Readonly<Record<string, unknown>> {
  const record = isRecord(value) ? value : {};
  const revisions = isRecord(record.revisions) ? record.revisions : null;
  return Object.freeze({
    '시각(ms)': Math.round(performance.now()),
    '이벤트': manualEventLabel(type),
    ...(typeof record.status === 'string'
      ? { '상태': coreV2KoreanStatus(record.status) }
      : {}),
    ...(typeof record.direction === 'string'
      ? { '방향': record.direction === 'undo' ? '실행 취소' : record.direction === 'redo' ? '다시 실행' : record.direction }
      : {}),
    ...(revisions !== null && typeof revisions.sceneRevision === 'number'
      ? { '장면 리비전': revisions.sceneRevision }
      : {}),
    ...(Array.isArray(record.current) ? { '선택': record.current } : {}),
    ...(typeof record.code === 'string' ? { '코드': record.code } : {}),
  });
}

function manualEventLabel(type: string): string {
  const labels: Readonly<Record<string, string>> = {
    sceneCommitted: '장면 반영',
    frame: '프레임 게시',
    viewChanged: '화면 변경',
    viewSettled: '화면 이동 완료',
    selectionChanged: '선택 변경',
    change: '제품 상태 변경',
    targetDestroyed: '대상 제거',
    historyUndone: '히스토리 실행 취소',
    historyRedone: '히스토리 다시 실행',
    historyVisible: '히스토리 표시',
    historyCleared: '히스토리 비움',
    diagnostic: '진단',
    documentVisibilityChanged: '페이지 표시 상태 변경',
  };
  return labels[type] ?? type;
}

function canvasPoint(
  event: Pick<PointerEvent | MouseEvent, 'clientX' | 'clientY'>,
  canvas: HTMLCanvasElement,
): readonly [number, number] {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  const cssWidth = Number.parseFloat(canvas.style.width) || width;
  const cssHeight = Number.parseFloat(canvas.style.height) || height;
  return Object.freeze([
    (event.clientX - rect.left) * (cssWidth / width),
    (event.clientY - rect.top) * (cssHeight / height),
  ]);
}

function surfaceSize(frame: HTMLElement): Readonly<{ width: number; height: number }> {
  return Object.freeze({
    width: Math.max(480, Math.round(frame.clientWidth || 900)),
    height: Math.max(420, Math.round(frame.clientHeight || 560)),
  });
}

function midpoint(
  left: readonly [number, number],
  right: readonly [number, number],
): readonly [number, number] {
  return Object.freeze([(left[0] + right[0]) / 2, (left[1] + right[1]) / 2]);
}

function angleDegrees(
  center: readonly [number, number],
  point: readonly [number, number],
): number {
  return Math.atan2(point[1] - center[1], point[0] - center[0]) * 180 / Math.PI;
}

function normalizeDeltaDegrees(value: number): number {
  let result = value % 360;
  if (result > 180) result -= 360;
  if (result < -180) result += 360;
  return result;
}

function cursorForMode(mode: ManualPointerMode): string {
  const cursors: Record<ManualPointerMode, string> = {
    select: 'default',
    box: 'crosshair',
    paint: 'cell',
    move: 'move',
    resize: 'nwse-resize',
    rotate: 'crosshair',
    pan: 'grab',
  };
  return cursors[mode];
}

function isResizeHandle(
  value: unknown,
): value is 'nw' | 'ne' | 'sw' | 'se' | 'n' | 'e' | 's' | 'w' {
  return typeof value === 'string' &&
    ['nw', 'ne', 'sw', 'se', 'n', 'e', 's', 'w'].includes(value);
}

function isManualPointerMode(value: unknown): value is ManualPointerMode {
  return typeof value === 'string' &&
    ['select', 'box', 'paint', 'move', 'resize', 'rotate', 'pan'].includes(value);
}

function isManualToolGroup(value: unknown): value is CoreV2ManualToolGroup {
  return typeof value === 'string' && Object.hasOwn(CORE_V2_MANUAL_TOOL_LABELS, value);
}

function required<T extends Element>(
  root: ParentNode,
  selector: string,
): T {
  const element = root.querySelector<T>(selector);
  if (element === null) throw new Error(`Missing Core v2 manual Lab element: ${selector}`);
  return element;
}

function setText(root: ParentNode, key: string, value: string): void {
  const target = root.querySelector<HTMLElement>(`[data-manual-readout="${key}"]`);
  if (target !== null) target.textContent = value;
}

function summarize(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function fingerprint(input: unknown): string {
  const value = JSON.stringify(input);
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${value.length}:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function manualModeLabel(mode: ManualPointerMode): string {
  const labels: Readonly<Record<ManualPointerMode, string>> = {
    select: '선택',
    box: '영역 선택',
    paint: '붓질 선택',
    move: '이동',
    resize: '크기 조절',
    rotate: '회전',
    pan: '화면 이동',
  };
  return labels[mode];
}

function manualModeHelp(mode: ManualPointerMode): string {
  const help: Readonly<Record<ManualPointerMode, string>> = {
    select: '객체를 클릭하고 Shift로 선택을 추가·해제합니다.',
    box: '범위를 드래그하고 Shift로 기존 선택에 추가합니다.',
    paint: '객체 위를 문지르고 Shift로 기존 선택에 추가합니다.',
    move: '선택 객체를 끌고 Shift로 이동 축을 고정합니다.',
    resize: '선택 핸들을 끌고 Shift로 가로세로 비율을 고정합니다.',
    rotate: '회전 핸들을 끌고 Shift로 15° 단위에 맞춥니다.',
    pan: '빈 캔버스를 끌고 휠로 확대·축소합니다.',
  };
  return help[mode];
}

function manualActionDisplay(value: string): string {
  const labels: Readonly<Record<string, string>> = {
    boot: '시작',
    initialize: '초기화',
    'initialize + load': '초기화·장면 불러오기',
    'history shortcut': '히스토리 단축키',
    'transform-cancelled': '변형 취소',
    'keyboard-nudge': '키보드 미세 이동',
    'move-gesture': '드래그 이동',
    'resize-gesture': '드래그 크기 조절',
    'rotate-gesture': '드래그 회전',
    'transform-gesture': '드래그 변형',
    'box-selection': '영역 선택',
    'paint-selection': '붓질 선택',
    'gesture-cancelled': '제스처 취소',
    'replace scene': '장면 교체',
    'page visible': '페이지 다시 표시',
    'zoom in': '확대',
    'zoom out': '축소',
    'rotate world': '월드 회전',
    'flip x': '월드 좌우 뒤집기',
    'flip y': '월드 위아래 뒤집기',
    failed: '실패',
  };
  return labels[value] ?? '직접 조작';
}

function requireRecord(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (!isRecord(value)) throw new TypeError(`${label} 값은 객체여야 합니다.`);
  return value;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isEditableTarget(value: EventTarget | null): boolean {
  if (!(value instanceof HTMLElement)) return false;
  return value.matches('input, textarea, select, [contenteditable="true"]') ||
    value.closest('[contenteditable="true"]') !== null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
