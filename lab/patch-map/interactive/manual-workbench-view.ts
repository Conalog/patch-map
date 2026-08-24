import type { PatchMapContractPresenterDescriptor } from '../contract/presenters';
import {
  PATCH_MAP_CONTRACT_CASE_COUNT,
  PATCH_MAP_MANUAL_DEDICATED_CASE_COUNT,
  PATCH_MAP_MANUAL_TOOL_DESCRIPTIONS,
  PATCH_MAP_MANUAL_TOOL_LABELS,
  PATCH_MAP_MANUAL_WORKFLOW_COUNT,
  selectPatchMapManualCase,
  type PatchMapManualCaseDescriptor,
  type PatchMapManualToolGroup,
} from './manual-case-catalog';
import {
  PATCH_MAP_MANUAL_SCENE_SIZE_OPTIONS,
  type PatchMapManualSceneSize,
} from './manual-scene';
import {
  manualModeTitleHelp,
  type ManualPointerMode,
} from './manual-workbench-input';

export { manualModeLabel, type ManualPointerMode } from './manual-workbench-input';

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
  'cell-presentation': '네 개 grid cell의 배경·텍스트·정렬·스타일을 서로 다른 값으로 바꿉니다.',
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
  'advanced-run': '입력한 JSON으로 선택한 공개 PatchMap 메서드를 실행합니다.',
});

export function renderPatchMapManualWorkbench(
  presenter: PatchMapContractPresenterDescriptor,
): string {
  const descriptor = selectPatchMapManualCase(presenter.caseId);
  const primaryTool = descriptor.tools[0] ?? 'diagnostics';
  const toolButtons = descriptor.tools.map((tool, index) =>
    `<button type="button" data-manual-tool-button="${tool}"${index === 0 ? ' aria-pressed="true"' : ' aria-pressed="false"'} title="${escapeHtml(PATCH_MAP_MANUAL_TOOL_DESCRIPTIONS[tool])}"><strong>${escapeHtml(PATCH_MAP_MANUAL_TOOL_LABELS[tool])}</strong><small>${escapeHtml(PATCH_MAP_MANUAL_TOOL_DESCRIPTIONS[tool])}</small></button>`,
  ).join('');
  const tasks = descriptor.tasks.map((task) => `<li>${escapeHtml(task)}</li>`).join('');

  return `<section class="manual-workbench" data-testid="manual-workbench" data-manual-status="booting" data-manual-case="${escapeHtml(presenter.caseId)}" data-manual-coverage="${descriptor.coverage}" data-manual-exact-action-count="${descriptor.exactActionCount}">
    <header class="manual-workbench-header">
      <div>
        <span class="contract-kicker">직접 조작하는 제품 실험실</span>
        <h2>엔진을 켜둔 채, 원하는 동작을 직접 시험하세요.</h2>
        <p>아래 캔버스는 ${PATCH_MAP_MANUAL_WORKFLOW_COUNT}개 공통 조작 흐름을 자유롭게 시험하는 PixiJS WebGL 세션입니다. 173개 계약의 정확 실행기는 화면 아래에 별도로 있습니다.</p>
      </div>
      <div class="manual-coverage-stamp">
        <strong>${PATCH_MAP_MANUAL_WORKFLOW_COUNT}</strong>
        <span>수동 조작 흐름</span>
        <small>전용 안내 ${PATCH_MAP_MANUAL_DEDICATED_CASE_COUNT} · 정확 자동화 ${PATCH_MAP_CONTRACT_CASE_COUNT}</small>
      </div>
    </header>
    <section class="manual-case-guide" aria-labelledby="manual-case-guide-title" data-manual-coverage-guide="${descriptor.coverage}">
      <div>
        <span class="manual-case-id">${escapeHtml(descriptor.caseId)}</span>
        <span class="manual-coverage-mode">${escapeHtml(descriptor.coverageLabel)}</span>
        <h3 id="manual-case-guide-title">${escapeHtml(descriptor.title)}</h3>
        <p>${escapeHtml(descriptor.coverageSummary)}</p>
      </div>
      <ol>${tasks}</ol>
    </section>
    ${renderManualOnboarding(descriptor, primaryTool)}
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
          <div class="manual-canvas-host" data-testid="manual-canvas-host" tabindex="0" aria-label="계속 유지되는 PatchMap 직접 조작 캔버스"></div>
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
    ${renderExactRunnerBoundary(descriptor)}
  </section>`;
}

function renderManualOnboarding(
  descriptor: PatchMapManualCaseDescriptor,
  primaryTool: PatchMapManualToolGroup,
): string {
  const automatedOnly = descriptor.coverage === 'automated-only';
  const title = automatedOnly
    ? '이 케이스는 자동 증거로 확인합니다'
    : '직접 조작은 세 단계로 확인합니다';
  const steps = automatedOnly
    ? [
        ['공통 작업대는 탐색용', `‘${PATCH_MAP_MANUAL_TOOL_LABELS[primaryTool]}’ 도구로 관련 제품 상태만 살펴봅니다.`],
        ['아래에서 정확 실행 시작', `${descriptor.exactActionCount}개 승인 작업을 정해진 순서로 자동 실행합니다.`],
        ['실제 관찰과 정리 확인', '자동 실행 결과에서 실패·revision·자원 정리를 확인합니다.'],
      ]
    : [
        [`오른쪽에서 ‘${PATCH_MAP_MANUAL_TOOL_LABELS[primaryTool]}’ 선택`, PATCH_MAP_MANUAL_TOOL_DESCRIPTIONS[primaryTool]],
        ['버튼을 누르거나 캔버스에서 직접 조작', descriptor.tasks[0] ?? '안내된 동작을 캔버스에서 실행하세요.'],
        ['화면과 상태 기록 비교', '선택·히스토리·프레임·애니메이션·마지막 작업이 즉시 바뀝니다.'],
      ];

  return `<section class="manual-onboarding" aria-labelledby="manual-onboarding-title">
    <div class="manual-onboarding-heading">
      <span class="contract-kicker">처음이라면 여기부터</span>
      <h3 id="manual-onboarding-title">${escapeHtml(title)}</h3>
    </div>
    <ol>${steps.map(([stepTitle, description], index) =>
      `<li><span>${index + 1}</span><div><strong>${escapeHtml(stepTitle ?? '')}</strong><p>${escapeHtml(description ?? '')}</p></div></li>`
    ).join('')}</ol>
    <details open>
      <summary>화면 구성과 검증 범위를 빠르게 이해하기</summary>
      <div class="manual-layout-help">
        <p><strong>캔버스 위 7개 모드</strong><span>공통 장면을 선택·이동·변형하거나 화면을 움직이는 자유 조작입니다.</span></p>
        <p><strong>오른쪽 조작 흐름</strong><span>현재 계약과 관련된 제품 기능을 모아 둔 공통 도구입니다.</span></p>
        <p><strong>캔버스 아래 상태</strong><span>자유 조작 결과를 확인하지만 계약의 독립 합격 판정은 만들지 않습니다.</span></p>
        <p><strong>맨 아래 정확 실행기</strong><span>이 케이스의 승인된 action trace와 실제 관찰·정리를 독립적으로 실행합니다.</span></p>
      </div>
    </details>
  </section>`;
}

function renderExactRunnerBoundary(descriptor: PatchMapManualCaseDescriptor): string {
  return `<aside class="manual-contract-boundary">
    <strong>수동 작업대와 정확 실행기의 책임을 분리했습니다.</strong>
    <p>현재 공통 캔버스는 자유 탐색용입니다. 이 경로의 ${descriptor.exactActionCount}개 승인 작업, 실제 관찰과 합격 판정은 바로 아래 ‘독립 정확 증거 실행기’만 담당합니다.</p>
  </aside>`;
}

export function defaultManualAnimationDuration(caseId: string): number {
  return caseId === 'REN-009' ? 5_000 : 200;
}

export function manualSceneSizeLabel(size: PatchMapManualSceneSize): string {
  if (size === 'production') return '운영 데이터 형태 · 생성';
  if (size === 'actual-production') return '실제 운영 데이터 · 605개 원본';
  const suffix = size === '10000' ? ' · 탐색용' : '';
  return `${Number(size).toLocaleString('ko-KR')}개${suffix}`;
}

export function advancedExample(method: string): string {
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

export function manualActionDisplay(value: string): string {
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
    <p>캔버스의 빈 곳을 ‘화면 이동’ 모드로 끌거나 휠로 확대·축소할 수 있습니다. 큰 장면도 전체를 볼 수 있도록 이 Lab은 2.5% 배율까지 축소됩니다. 아래 버튼은 같은 동작을 정확한 값으로 반복합니다.</p>
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
      ${commandButton('cell-presentation', '셀 배경·텍스트 바꾸기')}
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

function renderDataPanel(): string {
  return toolPanel('data', 'PATCH MAP JSON 직접 입력과 원자적 갱신', `
    <p>현재 장면과 같은 v0.10 JSON을 직접 편집해 다시 불러올 수 있습니다. 실패하면 일부만 반영하지 않고 기존 장면을 유지합니다.</p>
    <div class="manual-field-action">
      <label>예제 데이터 크기
        <select data-manual-scene-size aria-label="예제 데이터 크기">
          ${PATCH_MAP_MANUAL_SCENE_SIZE_OPTIONS.map((size) =>
            `<option value="${size}">${manualSceneSizeLabel(size)}</option>`).join('')}
        </select>
      </label>
      ${commandButton('scene-size', '선택 크기 불러오기')}
    </div>
    <p>10,000개는 브라우저 한계를 직접 살펴보는 탐색용 장면입니다. ‘실제 운영 데이터’는 605개 최상위 객체와 2,676개 활성 grid cell이 있는 원본 JSON을 시드 변환 없이 불러옵니다. 아래의 정확 계약 실행은 승인된 5,000개/production 측정 범위를 그대로 유지합니다.</p>
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
      <img data-manual-capture-image hidden alt="캡처한 PatchMap 장면">
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
      <p>별도 화면 조작이 필요 없는 케이스별 의미를 확인합니다. 공개 PatchMap 메서드만 호출하며 메서드명과 JSON 필드는 기술 식별자이므로 원문을 유지합니다.</p>
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
  group: PatchMapManualToolGroup,
  title: string,
  content: string,
): string {
  return `<section class="manual-tool-panel" data-manual-tool-panel="${group}"${group === 'selection' ? '' : ' hidden'}>
    <span class="contract-kicker">${escapeHtml(PATCH_MAP_MANUAL_TOOL_LABELS[group])}</span>
    <h3>${escapeHtml(title)}</h3>
    ${content}
  </section>`;
}

function modeButton(
  mode: ManualPointerMode,
  label: string,
  shortcut: string,
): string {
  return `<button type="button" data-manual-mode="${mode}" aria-pressed="${mode === 'select'}" title="${escapeHtml(manualModeTitleHelp(mode))}"><span>${escapeHtml(label)}</span><kbd>${escapeHtml(shortcut)}</kbd></button>`;
}

function commandButton(command: string, label: string): string {
  const help = MANUAL_COMMAND_HELP[command];
  return `<button type="button" data-manual-command="${escapeHtml(command)}"${help === undefined ? '' : ` title="${escapeHtml(help)}"`}><span data-manual-command-label>${escapeHtml(label)}</span>${help === undefined ? '' : `<small>${escapeHtml(help)}</small>`}</button>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
