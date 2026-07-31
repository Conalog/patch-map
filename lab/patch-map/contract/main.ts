import {
  createNotImplementedPatchMapContractLabBridge,
  type PatchMapContractLabBridgeV1,
} from './bridge';
import { createPatchMapExecutableLabBridge } from './executable-bridge';
import { isPatchMapExecutableCaseId } from './executable-cases';
import {
  refreshComponentAssetInspector,
  renderComponentAssetInspector,
} from './inspectors/component-asset-inspector';
import {
  escapeHtml,
  isRecord,
  numberField,
  observedValue,
  recordAt,
  setText,
  stringField,
} from './inspectors/presentation-values';
import {
  patchMapKoreanActionLabel,
  patchMapKoreanCaseInstruction,
  patchMapKoreanCaseTitle,
  patchMapKoreanCaseType,
  patchMapKoreanStatus,
} from './korean-copy';
import { PATCH_MAP_CONTRACT_PRESENTERS } from './presenters';
import {
  buildPatchMapContractRoute,
  PATCH_MAP_CONTRACT_DATASET_SIZES,
  PatchMapContractRouteError,
  parsePatchMapContractSeed,
  parsePatchMapContractRoute,
  type PatchMapContractRoute,
} from './route';
import {
  appendRunPerformance,
  renderRunObserver,
  resetRunPerformance,
  runObserverPrefix,
  startUiRunObservation,
  type PatchMapContractUiRunMetrics,
} from './run-observer';
import {
  mountPatchMapManualWorkbench,
  renderPatchMapManualWorkbench,
  type PatchMapManualLabBridge,
} from '../interactive/manual-workbench';
import {
  PATCH_MAP_MANUAL_SCENE_SIZE_OPTIONS,
  type PatchMapManualSceneSize,
} from '../interactive/manual-scene';

declare global {
  interface Window {
    __PATCH_MAP_CONTRACT_LAB__?: PatchMapContractLabBridgeV1;
  }
}

export interface PatchMapContractLabMount {
  readonly route: PatchMapContractRoute | null;
  readonly bridge: PatchMapContractLabBridgeV1 | null;
  readonly manual: PatchMapManualLabBridge | null;
  readonly routeError: PatchMapContractRouteError | null;
  destroy(): Promise<void>;
}

const REN_005_SPECIMENS = Object.freeze([
  Object.freeze({ id: 'alias', label: '에셋 별칭' }),
  Object.freeze({ id: 'url', label: '직접 URL' }),
  Object.freeze({ id: 'descriptor', label: '설명자 교체' }),
  Object.freeze({ id: 'data-uri', label: '데이터 URI' }),
  Object.freeze({ id: 'transformed', label: '변환된 공유 원본' }),
  Object.freeze({ id: 'hidden-image', label: '숨겨진 이미지' }),
  Object.freeze({ id: 'failed-image', label: '실패 자리표시자' }),
]);

interface PatchMapTextInspectorChoice {
  readonly id: string;
  readonly label: string;
}

const REN_006_TEXT_CHOICES: readonly PatchMapTextInspectorChoice[] = Object.freeze([
  Object.freeze({ id: 'initial', label: '초기 유니코드' }),
  Object.freeze({ id: 'empty', label: '빈 텍스트' }),
  Object.freeze({ id: 'long', label: '긴 줄바꿈 텍스트' }),
  Object.freeze({ id: 'missing-font', label: '폰트 누락 대체' }),
  Object.freeze({ id: 'rapid', label: '빠른 최종 게시' }),
  Object.freeze({ id: 'terminal', label: '최종 아랍어 텍스트' }),
]);

const REN_011_TEXT_CHOICES: readonly PatchMapTextInspectorChoice[] = Object.freeze([
  Object.freeze({ id: 'placed', label: '배치·색조 적용' }),
  Object.freeze({ id: 'auto', label: '자동 글꼴' }),
  Object.freeze({ id: 'wrap', label: '줄바꿈' }),
  Object.freeze({ id: 'overflow-visible', label: '넘침 표시' }),
  Object.freeze({ id: 'overflow-hidden', label: '넘침 숨김' }),
  Object.freeze({ id: 'overflow-ellipsis', label: '넘침 말줄임표' }),
  Object.freeze({
    id: 'upright',
    label: '항목 회전을 따르고 거꾸로 보일 때만 180° 보정',
  }),
]);

const REN_006_TEXT_FIELDS = Object.freeze([
  Object.freeze({ suffix: 'phase', label: '단계' }),
  Object.freeze({ suffix: 'source', label: '원본' }),
  Object.freeze({ suffix: 'visible-text', label: '보이는 텍스트' }),
  Object.freeze({ suffix: 'lines', label: '줄' }),
  Object.freeze({ suffix: 'font-runs', label: '글꼴 구간' }),
  Object.freeze({ suffix: 'layout-bounds', label: '배치 영역' }),
  Object.freeze({ suffix: 'world-bounds', label: '월드 영역' }),
  Object.freeze({ suffix: 'hit-bounds', label: '적중 영역' }),
  Object.freeze({ suffix: 'publication', label: '게시 정보' }),
  Object.freeze({ suffix: 'intermediate-publication-count', label: '중간 게시 수' }),
  Object.freeze({ suffix: 'stale-glyph-count', label: '오래된 글리프 수' }),
  Object.freeze({ suffix: 'renderer-route', label: '렌더러 경로' }),
  Object.freeze({ suffix: 'style', label: '그리기 스타일' }),
  Object.freeze({ suffix: 'geometry', label: '월드 변환' }),
]);

const REN_011_TEXT_FIELDS = Object.freeze([
  Object.freeze({ suffix: 'specimen', label: '예제' }),
  Object.freeze({ suffix: 'source', label: '원본' }),
  Object.freeze({ suffix: 'placement', label: '배치' }),
  Object.freeze({ suffix: 'margin', label: '여백' }),
  Object.freeze({ suffix: 'tint', label: '입력 색조' }),
  Object.freeze({ suffix: 'rgba', label: '계산된 RGBA' }),
  Object.freeze({ suffix: 'frame', label: '프레임' }),
  Object.freeze({ suffix: 'auto-font', label: '자동 글꼴' }),
  Object.freeze({ suffix: 'wrap-width', label: '줄바꿈 너비' }),
  Object.freeze({ suffix: 'overflow', label: '넘침 처리' }),
  Object.freeze({ suffix: 'visible-text', label: '보이는 텍스트' }),
  Object.freeze({ suffix: 'lines', label: '줄' }),
  Object.freeze({ suffix: 'layout-bounds', label: '배치 영역' }),
  Object.freeze({ suffix: 'item-angle', label: '항목 각도' }),
  Object.freeze({ suffix: 'orientation', label: '방향' }),
  Object.freeze({ suffix: 'screen-angle', label: '화면 각도' }),
  Object.freeze({ suffix: 'local-bounds', label: '배치된 로컬 영역' }),
  Object.freeze({ suffix: 'paint-tint', label: '렌더러 그리기 색조' }),
  Object.freeze({ suffix: 'publication', label: '게시 정보' }),
  Object.freeze({ suffix: 'all-rows-exact', label: '모든 행의 의미 일치' }),
]);

function scenarioList(route: PatchMapContractRoute): string {
  return PATCH_MAP_CONTRACT_PRESENTERS.map((presenter) => {
    const href = buildPatchMapContractRoute(presenter.caseId, route.size, route.seed);
    const selected = presenter.caseId === route.scenario;
    const koreanTitle = patchMapKoreanCaseTitle(presenter.caseId);
    const searchText = `${presenter.caseId} ${koreanTitle} ${presenter.title} ${presenter.priority}`.toLowerCase();
    return `<a class="contract-scenario-link${selected ? ' is-selected' : ''}" href="${href}" data-scenario-index="${escapeHtml(searchText)}"${selected ? ' aria-current="page"' : ''}><span>${presenter.caseId}</span><strong>${escapeHtml(koreanTitle)}</strong><small title="계약 우선순위">우선순위 ${presenter.priority}</small></a>`;
  }).join('');
}

function manualDatasetSizeLabel(size: PatchMapManualSceneSize): string {
  if (size === 'production') return '운영 데이터 형태';
  if (size === 'actual-production') return '실제 운영 데이터 · 605개 원본';
  const exploratory = size === '10000' ? ' · 탐색용' : '';
  return `${Number(size).toLocaleString('ko-KR')}개 객체${exploratory}`;
}

function actionControls(route: PatchMapContractRoute, executable: boolean): string {
  return route.presenter.actions.map((action) => {
    const primary = action.primaryTestId === null
      ? ''
      : ` data-testid="${action.primaryTestId}"`;
    const actionStatus = executable ? 'queued' : 'not-implemented';
    return `<div class="contract-case-action" data-testid="${action.actionTestId}" data-action-index="${action.index}" data-action-status="${actionStatus}"><span>${String(action.index + 1).padStart(2, '0')}</span><button type="button"${primary} disabled aria-disabled="true">${escapeHtml(patchMapKoreanActionLabel(action.index))}</button><code title="자동 실행기의 내부 작업 식별자">기술 ID · ${escapeHtml(action.handlerId)}</code><output data-action-result>${patchMapKoreanStatus(actionStatus)}</output></div>`;
  }).join('');
}

function renderRen005Inspector(route: PatchMapContractRoute): string {
  if (route.scenario !== 'REN-005') return '';
  const options = REN_005_SPECIMENS.map(({ id, label }) => (
    `<option value="${id}"${id === 'descriptor' ? ' selected' : ''}>${label}</option>`
  )).join('');
  return `<section class="contract-image-inspector" data-testid="ren-005-image-inspector" data-observation-status="queued" aria-labelledby="ren-005-inspector-title">
    <div class="contract-image-inspector-heading">
      <div><span class="contract-kicker">REN-005 실제 관찰기</span><h3 id="ren-005-inspector-title">이미지 원본과 수명 주기 정보</h3></div>
      <label>예제<select data-testid="ren-005-specimen-select">${options}</select></label>
    </div>
    <p class="contract-image-observer-note">이 선택기는 이미 수집된 실제 정보의 표시만 바꿉니다. 승인된 네 작업을 추가·삭제·재정렬·반복하지 않습니다.</p>
    <div class="contract-image-facts" data-testid="ren-005-selected-facts">
      <dl>
        <div><dt>원본</dt><dd data-testid="ren-005-selected-source">관찰 전</dd></div>
        <div><dt>원본 종류</dt><dd data-testid="ren-005-selected-source-kind">관찰 전</dd></div>
        <div><dt>상태</dt><dd data-testid="ren-005-selected-state">관찰 전</dd></div>
        <div><dt>역할</dt><dd data-testid="ren-005-selected-role">관찰 전</dd></div>
        <div><dt>월드 영역</dt><dd data-testid="ren-005-selected-bounds">관찰 전</dd></div>
        <div><dt>초기 원본</dt><dd data-testid="ren-005-selected-initial-source">관찰 전</dd></div>
        <div><dt>초기 상태</dt><dd data-testid="ren-005-selected-initial-state">관찰 전</dd></div>
        <div><dt>오래된 연결</dt><dd data-testid="ren-005-selected-stale-attach">관찰 전</dd></div>
        <div><dt>오래된 완료</dt><dd data-testid="ren-005-selected-stale-completion">관찰 전</dd></div>
        <div><dt>진단</dt><dd data-testid="ren-005-selected-diagnostics">관찰 전</dd></div>
      </dl>
    </div>
    <div class="contract-image-ledger" aria-label="이미지 에셋 수">
      <dl>
        <div><dt>요청</dt><dd data-testid="ren-005-request-count">관찰 전</dd></div>
        <div><dt>백엔드</dt><dd data-testid="ren-005-backend-counts">관찰 전</dd></div>
        <div><dt>자원</dt><dd data-testid="ren-005-resource-count">관찰 전</dd></div>
        <div><dt>사용권</dt><dd data-testid="ren-005-lease-count">관찰 전</dd></div>
        <div><dt>오래된 항목</dt><dd data-testid="ren-005-stale-count">관찰 전</dd></div>
        <div><dt>반납 대기</dt><dd data-testid="ren-005-pending-release-count">관찰 전</dd></div>
      </dl>
      <div class="contract-request-journal">
        <h4>요청 기록</h4>
        <ol data-testid="ren-005-request-journal"><li data-testid="ren-005-request-journal-empty">정확 실행을 시작하면 요청을 확인할 수 있습니다.</li></ol>
      </div>
    </div>
    <div class="contract-run-observer" data-testid="ren-005-run-observation">
      <div><span class="contract-kicker">실행별 메인 스레드 관찰</span><p>FPS와 프레임 간격은 requestAnimationFrame으로, 긴 작업은 지원되는 경우 브라우저 Long Tasks API로 측정합니다.</p></div>
      <dl>
        <div><dt>실행</dt><dd data-testid="ren-005-run-index">관찰 전</dd></div>
        <div><dt>FPS</dt><dd data-testid="ren-005-run-fps">관찰 전</dd></div>
        <div><dt>프레임 수</dt><dd data-testid="ren-005-run-frame-count">관찰 전</dd></div>
        <div><dt>최대 프레임 간격</dt><dd data-testid="ren-005-run-max-frame-gap">관찰 전</dd></div>
        <div><dt>긴 작업 수</dt><dd data-testid="ren-005-run-long-task-count">관찰 전</dd></div>
        <div><dt>걸린 시간</dt><dd data-testid="ren-005-run-duration">관찰 전</dd></div>
      </dl>
      <ol class="contract-performance-journal" data-testid="ren-005-performance-journal"></ol>
    </div>
  </section>`;
}

function renderTextInspectorOptions(
  choices: readonly PatchMapTextInspectorChoice[],
  initiallySelectedId: string,
): string {
  return choices.map(({ id, label }) => (
    `<option value="${id}" data-observation-status="queued"${id === initiallySelectedId ? ' selected' : ''} disabled>${label}</option>`
  )).join('');
}

function renderTextInspectorFacts(
  prefix: 'ren-006' | 'ren-011',
  fields: readonly Readonly<{ suffix: string; label: string }>[],
): string {
  const rows = fields.map(({ suffix, label }) => (
    `<div><dt>${label}</dt><dd data-testid="${prefix}-${suffix}" data-text-observation-field>관찰 전</dd></div>`
  )).join('');
  return `<div class="contract-image-facts contract-text-facts" data-testid="${prefix}-selected-facts"><dl>${rows}</dl></div>`;
}

function seededTextChoiceId(
  choices: readonly PatchMapTextInspectorChoice[],
  seed: number,
): string {
  return choices[seed % choices.length]?.id ?? choices[0]?.id ?? '';
}

function renderTextInspector(route: PatchMapContractRoute): string {
  const configuration = route.scenario === 'REN-006'
    ? {
        prefix: 'ren-006' as const,
        title: '유니코드 텍스트 단계와 게시',
        selectorLabel: '관찰 단계',
        choices: REN_006_TEXT_CHOICES,
        fields: REN_006_TEXT_FIELDS,
      }
    : route.scenario === 'REN-011'
      ? {
          prefix: 'ren-011' as const,
          title: '항목 텍스트 계약 행렬',
          selectorLabel: '관찰 예제',
          choices: REN_011_TEXT_CHOICES,
          fields: REN_011_TEXT_FIELDS,
        }
      : null;
  if (!configuration) return '';
  const seededChoice = seededTextChoiceId(configuration.choices, route.seed);
  const options = renderTextInspectorOptions(configuration.choices, seededChoice);
  return `<section class="contract-image-inspector contract-text-inspector" data-testid="${configuration.prefix}-text-inspector" data-observation-status="queued" data-observed-choice-count="0" data-seeded-choice="${seededChoice}" aria-labelledby="${configuration.prefix}-inspector-title">
    <div class="contract-image-inspector-heading">
      <div><span class="contract-kicker">${configuration.prefix.toUpperCase()} 실제 관찰 결과</span><h3 id="${configuration.prefix}-inspector-title">${configuration.title}</h3></div>
      <label>${configuration.selectorLabel}<select data-testid="${configuration.prefix}-text-choice-select" disabled>${options}</select><output class="contract-phase-observation-count" data-testid="${configuration.prefix}-observed-choice-count">0 / ${configuration.choices.length}개 관찰</output></label>
    </div>
    <p class="contract-image-observer-note" data-testid="${configuration.prefix}-display-only-note">표시 전용 탐색입니다. 이 선택기는 완료된 실제 관찰 결과만 읽으며 기준 작업 순서를 추가·삭제·재정렬·반복·변경하지 않습니다. 처음 보일 항목은 주소의 시드로 결정됩니다.</p>
    ${renderTextInspectorFacts(configuration.prefix, configuration.fields)}
    ${renderRunObserver(configuration.prefix)}
  </section>`;
}

export function renderPatchMapContractLab(route: PatchMapContractRoute): string {
  const presenter = route.presenter;
  const executable = presenter.executionStatus === 'actual-observable';
  const initialStatus = executable ? 'armed' : 'not-implemented';
  const statusLabel = executable ? '실행 준비' : '미구현';
  const koreanTitle = patchMapKoreanCaseTitle(presenter.caseId);
  const sizeOptions = PATCH_MAP_CONTRACT_DATASET_SIZES.map((size) =>
    `<option value="${size}"${size === route.size ? ' selected' : ''}>${size === 'production' ? '운영 데이터 형태' : `${size}개 객체`}</option>`,
  ).join('');
  const manualSizeOptions = PATCH_MAP_MANUAL_SCENE_SIZE_OPTIONS.map((size) =>
    `<option value="${size}"${size === route.size ? ' selected' : ''}>${manualDatasetSizeLabel(size)}</option>`,
  ).join('');

  return `<main class="contract-lab-shell" data-testid="${presenter.rootTestId}" data-contract-status="${initialStatus}">
  <header class="contract-lab-header">
    <div><span class="contract-kicker">PatchMap 기능 계약</span><h1>${presenter.caseId} · ${escapeHtml(koreanTitle)}</h1><p>${patchMapKoreanCaseType(presenter.caseType)} · 우선순위 ${presenter.priority} · 현재 케이스만 표시</p></div>
    <strong class="contract-status" data-contract-status-label>${statusLabel}</strong>
  </header>
  <div class="contract-lab-layout">
    <aside class="contract-catalog" aria-label="승인된 PatchMap 케이스">
      <label for="patch-map-contract-search">173개 케이스 찾기</label>
      <input id="patch-map-contract-search" type="search" data-testid="scenario-search" autocomplete="off" placeholder="ID 또는 한국어 제목">
      <nav data-testid="scenario-list">${scenarioList(route)}</nav>
    </aside>
    <section class="contract-focus">
      <div class="contract-route-controls">
        <label>직접 조작 크기<select data-testid="manual-dataset-size">${manualSizeOptions}</select></label>
        <label>정확 실행 크기<select data-testid="dataset-size">${sizeOptions}</select></label>
        <label>무작위 시드<input data-testid="seed" inputmode="numeric" value="${route.seed}" pattern="(?:0|[1-9][0-9]*)"></label>
        <button type="button" data-testid="load-dataset"${executable ? '' : ' disabled'} title="승인된 작업을 정확한 순서로 한 번 자동 실행합니다.">정확 실행 시작</button>
        <button type="button" data-testid="reset-case" disabled title="자동 실행 결과를 지우고 처음 상태로 되돌립니다.">자동 실행 초기화</button>
        <button type="button" data-testid="repeat-action" disabled title="같은 케이스를 같은 입력으로 한 번 더 실행합니다.">같은 실행 반복</button>
        <button type="button" data-testid="destroy-case" disabled title="자동 실행기의 임시 런타임을 종료하고 자원을 정리합니다.">자동 런타임 종료</button>
        <button type="button" data-testid="copy-url" title="현재 케이스·크기·시드 주소를 클립보드에 복사합니다.">현재 주소 복사</button>
      </div>
      <p class="contract-stub-notice">직접 조작 크기의 10,000개는 자유 실험용이고, 실제 운영 데이터는 등록된 605개 원본 JSON을 그대로 사용합니다. 아래 독립 정확 실행기는 승인된 정확 실행 크기를 별도로 유지합니다. ${executable
        ? 'PixiJS WebGL 기준선에서 실제 제품만 실행합니다. 자동 실행기의 캔버스는 임시이며 정리 단계에서 제거됩니다. 이 화면은 예상값과 비교하지 않고 실제 관찰 또는 실패 정보만 보여줍니다.'
        : '이 승인 경로는 명시적으로 미구현 상태입니다. 엔진 작업·의미 관찰·승격 결과를 만들지 않습니다.'}</p>
      ${renderPatchMapManualWorkbench(presenter)}
      <section class="contract-case-card" aria-labelledby="contract-case-title">
        <span class="contract-kicker">독립 정확 증거 실행기</span>
        <h2 id="contract-case-title">${escapeHtml(koreanTitle)}</h2>
        <p class="contract-instruction">${escapeHtml(patchMapKoreanCaseInstruction(presenter.caseId))}</p>
        <div class="contract-canvas" data-testid="canvas-host">
          <div data-testid="${presenter.gestureSurfaceTestId}" data-contract-surface aria-label="PatchMap 계약 케이스 자동 실행 화면">
            <p data-canvas-lifetime>${executable
              ? '정확 실행기가 실제 엔진을 소유한 동안에만 PixiJS WebGL 캔버스가 붙습니다.'
              : '미구현 경로에는 캔버스를 만들지 않습니다.'}</p>
          </div>
        </div>
        <p class="contract-action-note">회색의 ‘기술 ID’는 자동 실행기가 사용하는 내부 작업 이름입니다. 직접 조작할 때는 위의 한국어 도구와 안내만 따라가면 됩니다.</p>
        <div class="contract-actions" aria-label="현재 케이스의 승인 작업">${actionControls(route, executable)}</div>
        ${renderRen005Inspector(route)}
        ${renderTextInspector(route)}
        ${renderComponentAssetInspector(route)}
      </section>
      <section class="contract-result-strip" data-testid="${presenter.resultTestId}" aria-live="polite">
        <dl><div><dt>작업</dt><dd data-result-actions>${executable ? '대기 중' : '실행 전'}</dd></div><div><dt>이벤트</dt><dd data-result-events>관찰 전</dd></div><div><dt>정리</dt><dd data-result-cleanup>실행 전</dd></div><div><dt>관찰</dt><dd data-result-observation>${patchMapKoreanStatus(initialStatus)}</dd></div></dl>
        <p data-testid="${presenter.firstFailureTestId}">${executable
          ? '정확 실행을 시작하면 제품·이벤트·의미·자원 정리 정보를 확인할 수 있습니다.'
          : '작업 실행기가 미구현이라 실제 관찰 결과가 없습니다.'}</p>
        <pre data-testid="${presenter.traceTestId}" hidden>${initialStatus}</pre>
      </section>
    </section>
  </div>
</main>`;
}

export function renderPatchMapContractRouteError(error: PatchMapContractRouteError): string {
  return `<main class="contract-lab-shell contract-route-error" data-testid="patch-map-contract-route-error" data-contract-status="invalid-route"><span class="contract-kicker">PatchMap 기능 계약</span><h1>이 주소는 실행할 수 없습니다</h1><p><strong>${error.code}</strong>: ${escapeHtml(error.message)}</p><p>주소의 케이스, 데이터셋 크기, 0~4,294,967,295 범위 무작위 시드 값을 확인하세요.</p></main>`;
}

function bindShell(
  target: HTMLElement,
  route: PatchMapContractRoute,
  abortController: AbortController,
  bridge: PatchMapContractLabBridgeV1,
  manual: PatchMapManualLabBridge,
  executable: boolean,
): void {
  const signal = abortController.signal;
  let navigationRequested = false;
  let uiRunSequence = 0;

  async function navigate(href: string): Promise<void> {
    if (navigationRequested) return;
    navigationRequested = true;
    try {
      await bridge.destroyCase();
    } finally {
      window.location.assign(href);
    }
  }

  const search = target.querySelector<HTMLInputElement>('[data-testid="scenario-search"]');
  search?.addEventListener('input', () => {
    const query = search.value.trim().toLowerCase();
    for (const link of target.querySelectorAll<HTMLElement>('[data-scenario-index]')) {
      link.hidden = query.length > 0 && !(link.dataset.scenarioIndex ?? '').includes(query);
    }
  }, { signal });

  const copyUrl = target.querySelector<HTMLButtonElement>('[data-testid="copy-url"]');
  copyUrl?.addEventListener('click', () => {
    if (navigator.clipboard) {
      void navigator.clipboard
        .writeText(new URL(route.canonicalUrl, window.location.origin).href)
        .catch(() => undefined);
    }
  }, { signal });

  for (const link of target.querySelectorAll<HTMLAnchorElement>('[data-scenario-index]')) {
    link.addEventListener('click', (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      void navigate(link.getAttribute('href') ?? link.href);
    }, { signal });
  }

  const size = target.querySelector<HTMLSelectElement>('[data-testid="dataset-size"]');
  size?.addEventListener('change', () => {
    const next = PATCH_MAP_CONTRACT_DATASET_SIZES.find((candidate) => candidate === size.value);
    if (next) void navigate(buildPatchMapContractRoute(route.scenario, next, route.seed));
  }, { signal });

  const manualSize = target.querySelector<HTMLSelectElement>(
    '[data-testid="manual-dataset-size"]',
  );
  manualSize?.addEventListener('change', () => {
    const next = PATCH_MAP_MANUAL_SCENE_SIZE_OPTIONS.find(
      (candidate) => candidate === manualSize.value,
    );
    const workbenchSize = target.querySelector<HTMLSelectElement>(
      '[data-manual-scene-size]',
    );
    if (next === undefined || workbenchSize === null) return;
    workbenchSize.value = next;
    manualSize.disabled = true;
    void manual.ready
      .then(() => manual.run('scene-size'))
      .catch(() => {
        manualSize.value = manual.state().sceneSize;
      })
      .finally(() => {
        manualSize.disabled = false;
      });
  }, { signal });
  target.addEventListener('patch-map-manual-scene-size-change', (event) => {
    if (!(event instanceof CustomEvent) || manualSize === null) return;
    const detail: unknown = (event as CustomEvent<unknown>).detail;
    const next = isRecord(detail) ? detail.size : undefined;
    if (typeof next === 'string') manualSize.value = next;
  }, { signal });

  const seed = target.querySelector<HTMLInputElement>('[data-testid="seed"]');
  seed?.addEventListener('change', () => {
    try {
      const nextSeed = parsePatchMapContractSeed(seed.value);
      seed.setCustomValidity('');
      void navigate(buildPatchMapContractRoute(route.scenario, route.size, nextSeed));
    } catch {
      seed.setCustomValidity('무작위 시드는 0~4,294,967,295 범위의 정수로 입력하세요.');
      seed.reportValidity();
    }
  }, { signal });

  window.addEventListener('pagehide', () => {
    void bridge.destroyCase().catch(() => undefined);
  }, { signal });

  if (!executable) return;
  const run = target.querySelector<HTMLButtonElement>('[data-testid="load-dataset"]');
  const reset = target.querySelector<HTMLButtonElement>('[data-testid="reset-case"]');
  const repeat = target.querySelector<HTMLButtonElement>('[data-testid="repeat-action"]');
  const destroy = target.querySelector<HTMLButtonElement>('[data-testid="destroy-case"]');

  const imageChooser = target.querySelector<HTMLSelectElement>(
    '[data-testid="ren-005-specimen-select"]',
  );
  imageChooser?.addEventListener('change', () => {
    refreshRen005Inspector(target, bridge.execution());
  }, { signal });

  const textChooser = target.querySelector<HTMLSelectElement>(
    '[data-testid="ren-006-text-choice-select"], [data-testid="ren-011-text-choice-select"]',
  );
  textChooser?.addEventListener('change', () => {
    const status = bridge.state().status;
    if (status !== 'observed' && status !== 'failed' && status !== 'destroyed') return;
    void bridge.actualObservation().then((observation) => {
      if (!signal.aborted) {
        refreshTextInspector(target, route.scenario, observation, route.seed, false);
      }
    }).catch(() => undefined);
  }, { signal });

  const componentAssetChooser = target.querySelector<HTMLSelectElement>(
    '[data-testid="ren-008-phase-select"], [data-testid="ren-010-phase-select"]',
  );
  componentAssetChooser?.addEventListener('change', () => {
    refreshComponentAssetInspector(target, route.scenario, bridge.execution());
  }, { signal });

  async function perform(
    operationKind: 'run' | 'reset' | 'repeat' | 'destroy',
    operation: () => Promise<unknown>,
  ): Promise<void> {
    const performancePrefix = runObserverPrefix(route.scenario);
    const performanceObservation = (
      (operationKind !== 'run' && operationKind !== 'repeat')
      || performancePrefix === null
    )
      ? null
      : startUiRunObservation();
    const pending = operation();
    await refreshBridgeUi(target, route, bridge);
    const operationResult: unknown = await pending.catch(() => null);
    const runMetrics = performanceObservation
      ? await performanceObservation.finish()
      : null;
    if (runMetrics) uiRunSequence += 1;
    if (operationKind === 'reset') {
      uiRunSequence = 0;
      if (performancePrefix) resetRunPerformance(target, performancePrefix);
    }
    await refreshBridgeUi(target, route, bridge, runMetrics
      ? {
          runIndex: uiRunSequence,
          runKind: operationKind === 'repeat' ? 'repeat' : 'run',
          metrics: runMetrics,
          runResult: operationResult,
        }
      : null);
    const root = target.querySelector<HTMLElement>(
      `[data-testid="${route.presenter.rootTestId}"]`,
    );
    if (root && (operationKind === 'run' || operationKind === 'repeat')) {
      dispatchPatchMapContractRunComplete(root, operationKind, operationResult);
    }
    if (root && operationKind === 'destroy') {
      dispatchPatchMapContractDestroyComplete(root, operationResult);
    }
  }

  run?.addEventListener('click', () => {
    void perform('run', () => bridge.runCase());
  }, { signal });
  reset?.addEventListener('click', () => {
    void perform('reset', () => bridge.resetCase());
  }, { signal });
  repeat?.addEventListener('click', () => {
    void perform('repeat', () => bridge.repeatCase());
  }, { signal });
  destroy?.addEventListener('click', () => {
    void perform('destroy', () => bridge.destroyCase());
  }, { signal });
  void refreshBridgeUi(target, route, bridge);
}

async function refreshBridgeUi(
  target: HTMLElement,
  route: PatchMapContractRoute,
  bridge: PatchMapContractLabBridgeV1,
  runObservation: Readonly<{
    readonly runIndex: number;
    readonly runKind: 'run' | 'repeat';
    readonly metrics: PatchMapContractUiRunMetrics;
    readonly runResult: unknown;
  }> | null = null,
): Promise<void> {
  const state = bridge.state();
  const root = target.querySelector<HTMLElement>(`[data-testid="${route.presenter.rootTestId}"]`);
  if (!root) return;
  root.dataset.contractStatus = state.status;
  setText(root.querySelector('[data-contract-status-label]'), statusLabel(state.status));

  const run = root.querySelector<HTMLButtonElement>('[data-testid="load-dataset"]');
  const reset = root.querySelector<HTMLButtonElement>('[data-testid="reset-case"]');
  const repeat = root.querySelector<HTMLButtonElement>('[data-testid="repeat-action"]');
  const destroy = root.querySelector<HTMLButtonElement>('[data-testid="destroy-case"]');
  if (run) run.disabled = state.status === 'running' || state.status === 'observed' || state.status === 'destroyed';
  if (reset) reset.disabled = state.status === 'armed' || state.status === 'running' || state.status === 'destroyed';
  if (repeat) {
    repeat.disabled = state.status === 'armed'
      || state.status === 'running'
      || state.status === 'destroyed';
  }
  if (destroy) {
    destroy.disabled = state.status === 'armed'
      || state.status === 'running'
      || state.status === 'destroyed';
  }

  const execution = bridge.execution();
  const results = execution && Array.isArray(execution.actionResults)
    ? execution.actionResults as unknown as readonly unknown[]
    : [];
  for (const row of root.querySelectorAll<HTMLElement>(
    '.contract-case-action[data-action-index]',
  )) {
    const index = Number(row.dataset.actionIndex);
    const result = Number.isInteger(index) ? results[index] : undefined;
    const resultStatus = isRecord(result) && typeof result.status === 'string'
      ? result.status
      : state.status === 'running'
      ? 'executing-in-order'
      : state.status === 'armed'
        ? 'queued'
        : state.status === 'failed'
          ? 'not-run'
        : state.status;
    row.dataset.actionStatus = resultStatus;
    setText(row.querySelector('[data-action-result]'), actionResultLabel(result, resultStatus));
  }

  const eventCount = execution && Array.isArray(execution.eventJournal)
    ? execution.eventJournal.length
    : 0;
  const completedCount = results.filter((result) => isRecord(result) && result.status === 'completed').length;
  const cleanup = bridge.cleanup();
  setText(root.querySelector('[data-result-actions]'), `${completedCount}/${route.presenter.actions.length}개 완료`);
  setText(root.querySelector('[data-result-events]'), `공개 이벤트 ${eventCount}개`);
  setText(
    root.querySelector('[data-result-cleanup]'),
    typeof cleanup?.status === 'string' ? patchMapKoreanStatus(cleanup.status) : '실행 전',
  );
  setText(root.querySelector('[data-result-observation]'), patchMapKoreanStatus(state.status));

  const resultMessage = root.querySelector<HTMLElement>(
    `[data-testid="${route.presenter.firstFailureTestId}"]`,
  );
  setText(resultMessage, resultMessageFor(state.status, execution));

  const lifetime = root.querySelector<HTMLElement>('[data-canvas-lifetime]');
  setText(lifetime, canvasLifetimeFor(state.status));

  const terminal = state.status === 'observed' || state.status === 'failed' || state.status === 'destroyed';
  const observation = terminal ? await bridge.actualObservation() : null;
  const trace = root.querySelector<HTMLPreElement>(`[data-testid="${route.presenter.traceTestId}"]`);
  if (trace) {
    trace.hidden = state.status !== 'failed';
    trace.textContent = terminal
      ? JSON.stringify(compactContractTrace(state, execution, observation, cleanup), null, 2)
      : state.status;
  }

  refreshRen005Inspector(root, execution);
  refreshTextInspector(root, route.scenario, observation, route.seed, runObservation !== null);
  refreshComponentAssetInspector(root, route.scenario, execution);
  const performancePrefix = runObserverPrefix(route.scenario);
  if (runObservation && performancePrefix) {
    appendRunPerformance(root, performancePrefix, runObservation);
  }
}

function compactContractTrace(
  state: ReturnType<PatchMapContractLabBridgeV1['state']>,
  execution: Readonly<Record<string, unknown>> | null,
  observation: Readonly<Record<string, unknown>> | null,
  cleanup: Readonly<Record<string, unknown>> | null,
): Readonly<Record<string, unknown>> {
  const actionResults = execution && Array.isArray(execution.actionResults)
    ? execution.actionResults
    : [];
  const eventCount = execution && Array.isArray(execution.eventJournal)
    ? execution.eventJournal.length
    : 0;
  const error = execution && isRecord(execution.error) ? execution.error : null;
  return Object.freeze({
    state: Object.freeze({
      caseId: state.caseId,
      status: state.status,
      actionIndex: state.actionIndex,
      repeatIndex: state.repeatIndex,
    }),
    actions: Object.freeze(actionResults.map((result, index) => Object.freeze({
      index,
      status: isRecord(result) && typeof result.status === 'string'
        ? result.status
        : 'not-run',
    }))),
    eventCount,
    observation: observation
      ? Object.freeze({
          schema: typeof observation.$schema === 'string' ? observation.$schema : null,
          status: isRecord(observation.execution)
            && typeof observation.execution.status === 'string'
            ? observation.execution.status
            : state.status,
        })
      : null,
    error: error
      ? Object.freeze({
          name: typeof error.name === 'string' ? error.name : null,
          code: typeof error.code === 'string' ? error.code : null,
          message: typeof error.message === 'string' ? error.message : null,
        })
      : null,
    cleanup: cleanup
      ? Object.freeze({
          status: typeof cleanup.status === 'string' ? cleanup.status : null,
        })
      : null,
  });
}

function refreshRen005Inspector(
  root: HTMLElement,
  execution: Readonly<Record<string, unknown>> | null,
): void {
  const inspector = root.querySelector<HTMLElement>('[data-testid="ren-005-image-inspector"]');
  if (!inspector) return;
  const product = terminalRen005Product(execution);
  if (!product) {
    inspector.dataset.observationStatus = 'queued';
    for (const field of inspector.querySelectorAll<HTMLElement>('dd[data-testid^="ren-005-selected-"]')) {
      field.textContent = '관찰 전';
    }
    for (const field of inspector.querySelectorAll<HTMLElement>(
      '[data-testid="ren-005-request-count"], [data-testid="ren-005-backend-counts"], [data-testid="ren-005-resource-count"], [data-testid="ren-005-lease-count"], [data-testid="ren-005-stale-count"], [data-testid="ren-005-pending-release-count"]',
    )) {
      field.textContent = '관찰 전';
    }
    renderRen005RequestJournal(inspector, []);
    return;
  }

  const imageProbe = recordAt(product, 'imageProbe');
  const images = imageProbe ? recordAt(imageProbe, 'images') : null;
  const chooser = inspector.querySelector<HTMLSelectElement>(
    '[data-testid="ren-005-specimen-select"]',
  );
  const selectedId = chooser?.value ?? 'descriptor';
  const image = images ? recordAt(images, selectedId) : null;
  const geometry = recordAt(product, 'geometry');
  const bounds = geometry ? ren005WorldBounds(geometry, selectedId) : null;
  const initial = image ? recordAt(image, 'initial') : null;
  const requests = recordAt(product, 'requests');
  const backend = requests ? recordAt(requests, 'backend') : null;
  const snapshot = recordAt(product, 'snapshot');
  const resources = snapshot ? recordAt(snapshot, 'resources') : null;
  const assets = resources ? recordAt(resources, 'assets') : null;

  inspector.dataset.observationStatus = image ? 'observed' : 'missing';
  setText(inspector.querySelector('[data-testid="ren-005-selected-source"]'), sourceLabel(image));
  setText(
    inspector.querySelector('[data-testid="ren-005-selected-source-kind"]'),
    stringField(image, 'sourceKind'),
  );
  setText(inspector.querySelector('[data-testid="ren-005-selected-state"]'), stringField(image, 'state'));
  setText(inspector.querySelector('[data-testid="ren-005-selected-role"]'), stringField(image, 'role'));
  setText(
    inspector.querySelector('[data-testid="ren-005-selected-bounds"]'),
    bounds ? JSON.stringify(bounds) : '정보 없음',
  );
  setText(
    inspector.querySelector('[data-testid="ren-005-selected-initial-source"]'),
    sourceLabel(initial),
  );
  setText(
    inspector.querySelector('[data-testid="ren-005-selected-initial-state"]'),
    stringField(initial, 'state'),
  );
  setText(
    inspector.querySelector('[data-testid="ren-005-selected-stale-attach"]'),
    numberField(image, 'staleAttachCount'),
  );
  setText(
    inspector.querySelector('[data-testid="ren-005-selected-stale-completion"]'),
    numberField(image, 'staleCompletionCount'),
  );
  setText(
    inspector.querySelector('[data-testid="ren-005-selected-diagnostics"]'),
    numberField(image, 'diagnosticCount'),
  );
  setText(
    inspector.querySelector('[data-testid="ren-005-request-count"]'),
    numberField(backend, 'requestCount'),
  );
  setText(
    inspector.querySelector('[data-testid="ren-005-backend-counts"]'),
    backendCountsLabel(backend),
  );
  setText(
    inspector.querySelector('[data-testid="ren-005-resource-count"]'),
    numberField(imageProbe, 'bindingCount'),
  );
  setText(
    inspector.querySelector('[data-testid="ren-005-lease-count"]'),
    numberField(assets, 'leaseCount'),
  );
  setText(
    inspector.querySelector('[data-testid="ren-005-stale-count"]'),
    numberField(imageProbe, 'staleCompletionCount'),
  );
  setText(
    inspector.querySelector('[data-testid="ren-005-pending-release-count"]'),
    numberField(imageProbe, 'pendingReleaseCount'),
  );
  renderRen005RequestJournal(
    inspector,
    backend && Array.isArray(backend.journal) ? backend.journal : [],
  );
}

function refreshTextInspector(
  root: HTMLElement,
  scenario: string,
  observation: Readonly<Record<string, unknown>> | null,
  routeSeed: number,
  resetSelection: boolean,
): void {
  const configuration = scenario === 'REN-006'
    ? {
        prefix: 'ren-006' as const,
        inspectorTestId: 'ren-006-text-inspector',
        choices: REN_006_TEXT_CHOICES,
        fields: REN_006_TEXT_FIELDS,
      }
    : scenario === 'REN-011'
      ? {
          prefix: 'ren-011' as const,
          inspectorTestId: 'ren-011-text-inspector',
          choices: REN_011_TEXT_CHOICES,
          fields: REN_011_TEXT_FIELDS,
        }
      : null;
  if (!configuration) return;
  const inspector = root.querySelector<HTMLElement>(
    `[data-testid="${configuration.inspectorTestId}"]`,
  );
  if (!inspector) return;

  const observationCase = observation ? recordAt(observation, 'case') : null;
  const validObservation = observationCase?.id === scenario ? observation : null;
  const factsByChoice = new Map<string, Readonly<Record<string, string>> | null>(
    configuration.choices.map(({ id }) => [
      id,
      validObservation
        ? textChoiceFacts(scenario, validObservation, id)
        : null,
    ]),
  );
  const observedCount = [...factsByChoice.values()].filter((facts) => facts !== null).length;
  inspector.dataset.observedChoiceCount = String(observedCount);
  setText(
    inspector.querySelector(`[data-testid="${configuration.prefix}-observed-choice-count"]`),
    `${observedCount} / ${configuration.choices.length}개 관찰`,
  );

  const chooser = inspector.querySelector<HTMLSelectElement>(
    `[data-testid="${configuration.prefix}-text-choice-select"]`,
  );
  if (chooser) {
    chooser.disabled = observedCount === 0;
    for (const option of chooser.options) {
      const observed = (factsByChoice.get(option.value) ?? null) !== null;
      option.disabled = !observed;
      option.dataset.observationStatus = observed ? 'observed' : 'queued';
    }
  }

  const seededChoice = seededTextChoiceId(configuration.choices, routeSeed);
  let selectedChoice = chooser?.value ?? seededChoice;
  if (resetSelection || !factsByChoice.get(selectedChoice)) {
    selectedChoice = factsByChoice.get(seededChoice)
      ? seededChoice
      : configuration.choices.find(({ id }) => factsByChoice.get(id) !== null)?.id ?? '';
    if (chooser && selectedChoice) chooser.value = selectedChoice;
  }
  const selectedFacts = factsByChoice.get(selectedChoice) ?? null;
  resetTextInspectorFields(inspector);
  if (!selectedFacts) {
    inspector.dataset.observationStatus = 'queued';
    delete inspector.dataset.selectedChoice;
    return;
  }

  inspector.dataset.observationStatus = 'observed';
  inspector.dataset.selectedChoice = selectedChoice;
  for (const [suffix, value] of Object.entries(selectedFacts)) {
    setText(
      inspector.querySelector(`[data-testid="${configuration.prefix}-${suffix}"]`),
      value,
    );
  }
}

function textChoiceFacts(
  scenario: string,
  observation: Readonly<Record<string, unknown>>,
  choiceId: string,
): Readonly<Record<string, string>> | null {
  if (scenario === 'REN-006') return ren006TextChoiceFacts(observation, choiceId);
  if (scenario === 'REN-011') return ren011TextChoiceFacts(observation, choiceId);
  return null;
}

function ren006TextChoiceFacts(
  observation: Readonly<Record<string, unknown>>,
  choiceId: string,
): Readonly<Record<string, string>> | null {
  const text = recordAt(observation, 'text');
  if (!text) return null;
  const scene = recordAt(observation, 'scene');
  const textScene = scene ? recordAt(scene, 'text') : null;
  const geometry = recordAt(observation, 'geometry');
  const textGeometry = geometry ? recordAt(geometry, 'text') : null;
  const paint = recordAt(observation, 'paint');
  const textPaint = paint ? recordAt(paint, 'text') : null;
  const publication = observedValue(textScene?.publication);
  const facts = unavailableTextFacts(REN_006_TEXT_FIELDS);
  facts.phase = choiceId;
  facts.publication = publication;

  if (choiceId === 'initial') {
    const phases = recordAt(text, 'phases');
    const initial = phases ? recordAt(phases, 'initial-text') : null;
    if (!initial) return null;
    facts.source = observedTextLiteral(initial.source);
    facts.lines = observedValue(initial.lines);
    facts['layout-bounds'] = observedValue(initial.layoutBounds);
    return facts;
  }
  if (choiceId === 'empty') {
    const empty = recordAt(text, 'empty');
    if (!empty) return null;
    facts['visible-text'] = observedTextLiteral(empty.visibleText);
    facts['layout-bounds'] = observedValue(empty.layoutBounds);
    return facts;
  }
  if (choiceId === 'long') {
    const long = recordAt(text, 'long');
    if (!long) return null;
    facts.lines = observedValue(long.lines);
    facts['layout-bounds'] = observedValue(long.layoutBounds);
    return facts;
  }
  if (choiceId === 'missing-font') {
    const missingFont = recordAt(text, 'missingFont');
    if (!missingFont) return null;
    facts['font-runs'] = observedValue(missingFont.fontRuns);
    facts['layout-bounds'] = observedValue(missingFont.layoutBounds);
    return facts;
  }
  if (choiceId === 'rapid') {
    const rapid = recordAt(text, 'rapid');
    if (!rapid) return null;
    facts['visible-text'] = observedTextLiteral(rapid.visibleText);
    facts['layout-bounds'] = observedValue(rapid.layoutBounds);
    facts['intermediate-publication-count'] = observedValue(rapid.intermediatePublicationCount);
    facts['stale-glyph-count'] = observedValue(rapid.staleGlyphCount);
    return facts;
  }
  if (choiceId !== 'terminal' || typeof text.content !== 'string') return null;
  facts.source = observedTextLiteral(text.content);
  facts.lines = observedValue(text.lines);
  facts['font-runs'] = observedValue(text.fontRuns);
  facts['layout-bounds'] = observedValue(text.layoutBounds);
  facts['world-bounds'] = observedValue(text.worldBounds);
  facts['hit-bounds'] = observedValue(text.hitBounds);
  facts['stale-glyph-count'] = observedValue(text.staleGlyphCount);
  facts['renderer-route'] = observedValue(textScene?.route);
  facts.style = observedValue(textPaint?.style);
  facts.geometry = observedValue(textGeometry);
  return facts;
}

function ren011TextChoiceFacts(
  observation: Readonly<Record<string, unknown>>,
  choiceId: string,
): Readonly<Record<string, string>> | null {
  const text = recordAt(observation, 'text');
  if (!text || !Array.isArray(text.contractMatrix)) return null;
  const rowValue: unknown = text.contractMatrix.find((entry: unknown) => (
    isRecord(entry) && entry.id === choiceId
  ));
  if (!isRecord(rowValue)) return null;
  const scene = recordAt(observation, 'scene');
  const itemTextScene = scene ? recordAt(scene, 'itemText') : null;
  const geometry = recordAt(observation, 'geometry');
  const geometryTexts = geometry ? recordAt(geometry, 'texts') : null;
  const paint = recordAt(observation, 'paint');
  const paintTexts = paint ? recordAt(paint, 'texts') : null;
  const outcome = recordAt(observation, 'outcome');
  const matrixOutcome = outcome ? recordAt(outcome, 'textContractMatrix') : null;
  const placedGeometry = geometryTexts ? recordAt(geometryTexts, 'placed') : null;
  const uprightGeometry = geometryTexts ? recordAt(geometryTexts, 'upright') : null;
  const placedPaint = paintTexts ? recordAt(paintTexts, 'placed') : null;
  const facts = unavailableTextFacts(REN_011_TEXT_FIELDS);

  facts.specimen = observedValue(rowValue.id);
  facts.source = observedTextLiteral(rowValue.source);
  facts.placement = observedValue(rowValue.placement);
  facts.margin = observedValue(rowValue.margin);
  facts.tint = observedValue(rowValue.tint);
  facts.rgba = observedValue(rowValue.rgba);
  facts.frame = observedValue(rowValue.frame);
  facts['auto-font'] = observedValue(rowValue.autoFont);
  facts['wrap-width'] = observedValue(rowValue.wrapWidth);
  facts.overflow = observedValue(rowValue.overflow);
  facts['visible-text'] = observedTextLiteral(rowValue.visibleText);
  facts.lines = observedValue(rowValue.lines);
  facts['layout-bounds'] = observedValue(rowValue.layoutBounds);
  facts['item-angle'] = observedValue(rowValue.itemAngle);
  facts.orientation = observedValue(rowValue.orientation);
  facts['screen-angle'] = choiceId === 'upright'
    ? observedValue(uprightGeometry?.screenAngle)
    : observedValue(rowValue.screenAngle);
  facts['local-bounds'] = choiceId === 'placed'
    ? observedValue(placedGeometry?.localBounds)
    : observedValue(rowValue.localBounds);
  facts['paint-tint'] = choiceId === 'placed'
    ? observedValue(placedPaint?.tint)
    : '정보 없음';
  facts.publication = observedValue(itemTextScene?.publication);
  facts['all-rows-exact'] = observedValue(matrixOutcome?.allRowsExact);
  return facts;
}

function unavailableTextFacts(
  fields: readonly Readonly<{ suffix: string }>[],
): Record<string, string> {
  return Object.fromEntries(fields.map(({ suffix }) => [suffix, '정보 없음']));
}

function observedTextLiteral(value: unknown): string {
  return typeof value === 'string' ? JSON.stringify(value) : observedValue(value);
}

function resetTextInspectorFields(inspector: HTMLElement): void {
  for (const field of inspector.querySelectorAll<HTMLElement>('[data-text-observation-field]')) {
    field.textContent = '관찰 전';
  }
}

function terminalRen005Product(
  execution: Readonly<Record<string, unknown>> | null,
): Readonly<Record<string, unknown>> | null {
  if (!execution || !Array.isArray(execution.actionResults)) return null;
  const actionResults = execution.actionResults as readonly unknown[];
  for (let index = actionResults.length - 1; index >= 0; index -= 1) {
    const result: unknown = actionResults[index];
    if (!isRecord(result)) continue;
    const delta = recordAt(result, 'delta');
    const actual = delta ? recordAt(delta, 'actual') : null;
    const product = actual ? recordAt(actual, 'product') : null;
    if (product) return product;
  }
  return null;
}

function ren005WorldBounds(
  geometry: Readonly<Record<string, unknown>>,
  entityId: string,
): readonly number[] | null {
  if (!Array.isArray(geometry.entities)) return null;
  const entities = geometry.entities as readonly unknown[];
  const entity: unknown = entities.find((candidate) => (
    isRecord(candidate) && candidate.id === entityId
  ));
  if (!isRecord(entity) || !Array.isArray(entity.worldBounds)) return null;
  const bounds = entity.worldBounds.filter((value): value is number => (
    typeof value === 'number' && Number.isFinite(value)
  ));
  return bounds.length === 4 ? bounds : null;
}

function sourceLabel(value: Readonly<Record<string, unknown>> | null): string {
  if (!value) return '정보 없음';
  if (typeof value.authoredSource === 'string') return value.authoredSource;
  if (isRecord(value.authoredSource)) return JSON.stringify(value.authoredSource);
  if (typeof value.authoredSourceKind === 'string') return `[${value.authoredSourceKind} 데이터]`;
  return '정보 없음';
}

function backendCountsLabel(value: Readonly<Record<string, unknown>> | null): string {
  return [
    ['pending', '대기'],
    ['resolved', '완료'],
    ['rejected', '거부'],
    ['unloaded', '해제'],
  ].map(([key, label]) => (
    `${label} ${numberField(value, `${key}Count`)}`
  )).join(' · ');
}

function renderRen005RequestJournal(
  inspector: HTMLElement,
  journal: readonly unknown[],
): void {
  const list = inspector.querySelector<HTMLOListElement>('[data-testid="ren-005-request-journal"]');
  if (!list) return;
  if (journal.length === 0) {
    list.innerHTML = '<li data-testid="ren-005-request-journal-empty">정확 실행을 시작하면 요청을 확인할 수 있습니다.</li>';
    return;
  }
  list.innerHTML = journal.map((entry) => {
    const record = isRecord(entry) ? entry : null;
    const sequence = numberField(record, 'sequence');
    const event = stringField(record, 'event');
    const kind = stringField(record, 'kind');
    const state = stringField(record, 'state');
    const token = stringField(record, 'requestToken');
    return `<li data-testid="ren-005-request-journal-row" data-request-event="${escapeHtml(event)}" data-request-kind="${escapeHtml(kind)}"><span>${escapeHtml(sequence)}</span><code>${escapeHtml(token)}</code><strong>${escapeHtml(kind)}</strong><span>${escapeHtml(event)}</span><small>${escapeHtml(state)}</small></li>`;
  }).join('');
}

function dispatchPatchMapContractRunComplete(
  root: HTMLElement,
  runKind: 'run' | 'repeat',
  runResult: unknown,
): void {
  root.dispatchEvent(new CustomEvent('patch-map-contract-run-complete', {
    bubbles: true,
    detail: Object.freeze({
      operation: runKind === 'repeat' ? 'repeatCase' : 'runCase',
      run: runResult,
    }),
  }));
}

function dispatchPatchMapContractDestroyComplete(
  root: HTMLElement,
  cleanup: unknown,
): void {
  root.dispatchEvent(new CustomEvent('patch-map-contract-destroy-complete', {
    bubbles: true,
    detail: Object.freeze({
      operation: 'destroyCase',
      cleanup,
    }),
  }));
}

function actionResultLabel(result: unknown, fallback: string): string {
  if (!isRecord(result)) return patchMapKoreanStatus(fallback);
  const actual = isRecord(result.delta) && isRecord(result.delta.actual)
    ? result.delta.actual
    : null;
  const error = actual && isRecord(actual.error) ? actual.error : null;
  if (typeof error?.code === 'string') return `실패 · ${error.code}`;
  return typeof result.status === 'string'
    ? patchMapKoreanStatus(result.status)
    : patchMapKoreanStatus(fallback);
}

function resultMessageFor(
  status: ReturnType<PatchMapContractLabBridgeV1['state']>['status'],
  execution: Readonly<Record<string, unknown>> | null,
): string {
  if (status === 'observed') {
    return '제품 실행에서 실제 관찰 결과를 수집했습니다. 예상값 비교와 승격은 의도적으로 이 집중 Lab 실행과 분리되어 있습니다.';
  }
  if (status === 'failed') {
    const error = execution && isRecord(execution.error) ? execution.error : null;
    return `실행에 실패했으며 정리 기록은 보존했습니다${typeof error?.message === 'string' ? `: ${error.message}` : '.'}`;
  }
  if (status === 'running') return '임시 PixiJS WebGL 화면에서 승인된 작업을 정확한 순서로 실행하고 있습니다.';
  if (status === 'destroyed') return '자동 실행기는 종료됐지만 마지막 실제 결과와 정리 기록은 계속 확인할 수 있습니다.';
  return '정확 실행을 시작하면 제품·이벤트·의미·자원 정리 정보를 확인할 수 있습니다.';
}

function canvasLifetimeFor(status: ReturnType<PatchMapContractLabBridgeV1['state']>['status']): string {
  if (status === 'running') return '현재 실행 세대가 임시 PixiJS WebGL 캔버스를 소유하고 있습니다.';
  if (status === 'observed') return '실행기 정리로 캔버스를 제거했으며 의미·이벤트·자원 정보는 기록에 남아 있습니다.';
  if (status === 'failed') return '실행에 실패했으며 실행기 정리 경계가 추적 중인 모든 캔버스를 제거했습니다.';
  return '정확 실행기가 실제 엔진을 소유한 동안에만 PixiJS WebGL 캔버스가 붙습니다.';
}

function statusLabel(status: ReturnType<PatchMapContractLabBridgeV1['state']>['status']): string {
  const labels = {
    loading: '불러오는 중',
    ready: '준비됨',
    armed: '실행 준비',
    running: '실행 중',
    observed: '관찰 완료',
    'not-implemented': '미구현',
    failed: '실패',
    destroyed: '종료됨',
  } as const;
  return labels[status];
}

export function mountPatchMapContractLab(
  target: HTMLElement,
  input: string | URL = window.location.href,
): PatchMapContractLabMount {
  let route: PatchMapContractRoute;
  try {
    route = parsePatchMapContractRoute(input);
  } catch (error) {
    const routeError = error instanceof PatchMapContractRouteError
      ? error
      : new PatchMapContractRouteError('INVALID_QUERY', String(error));
    target.innerHTML = renderPatchMapContractRouteError(routeError);
    return Object.freeze({
      route: null,
      bridge: null,
      manual: null,
      routeError,
      destroy(): Promise<void> {
        target.replaceChildren();
        return Promise.resolve();
      },
    });
  }

  target.innerHTML = renderPatchMapContractLab(route);
  const manual = mountPatchMapManualWorkbench(target, {
    caseId: route.scenario,
    title: route.presenter.title,
    size: route.size,
    seed: route.seed,
  });
  const surfaceHost = target.querySelector<HTMLElement>('[data-contract-surface]');
  if (!surfaceHost) throw new Error(`PatchMap contract Lab surface is missing: ${route.scenario}`);
  let executable = false;
  let bridge: PatchMapContractLabBridgeV1;
  if (isPatchMapExecutableCaseId(route.scenario)) {
    if (route.presenter.executionStatus !== 'actual-observable') {
      throw new Error(`PatchMap contract Lab execution-status drift: ${route.scenario}`);
    }
    executable = true;
    bridge = createPatchMapExecutableLabBridge({
        caseId: route.scenario,
        rootTestId: route.presenter.rootTestId,
        size: route.size,
        seed: route.seed,
        surfaceHost,
      });
  } else {
    if (route.presenter.executionStatus !== 'not-implemented') {
      throw new Error(`PatchMap contract Lab stub-status drift: ${route.scenario}`);
    }
    bridge = createNotImplementedPatchMapContractLabBridge({
        caseId: route.scenario,
        rootTestId: route.presenter.rootTestId,
        actionCount: route.presenter.actions.length,
      });
  }
  const abortController = new AbortController();
  bindShell(target, route, abortController, bridge, manual, executable);
  window.__PATCH_MAP_CONTRACT_LAB__ = bridge;

  return Object.freeze({
    route,
    bridge,
    manual,
    routeError: null,
    async destroy(): Promise<void> {
      abortController.abort();
      await Promise.all([
        bridge.destroyCase(),
        manual.destroy(),
      ]);
      if (window.__PATCH_MAP_CONTRACT_LAB__ === bridge) {
        delete window.__PATCH_MAP_CONTRACT_LAB__;
      }
      target.replaceChildren();
    },
  });
}

if (typeof document !== 'undefined') {
  const host = document.querySelector<HTMLElement>('[data-patch-map-contract-lab]');
  if (host) mountPatchMapContractLab(host);
}
