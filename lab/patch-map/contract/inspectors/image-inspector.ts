import type { PatchMapContractRoute } from '../route';
import {
  escapeHtml,
  isRecord,
  numberField,
  recordAt,
  setText,
  stringField,
} from './presentation-values';

const REN_005_SPECIMENS = Object.freeze([
  Object.freeze({ id: 'alias', label: '에셋 별칭' }),
  Object.freeze({ id: 'url', label: '직접 URL' }),
  Object.freeze({ id: 'descriptor', label: '설명자 교체' }),
  Object.freeze({ id: 'data-uri', label: '데이터 URI' }),
  Object.freeze({ id: 'transformed', label: '변환된 공유 원본' }),
  Object.freeze({ id: 'hidden-image', label: '숨겨진 이미지' }),
  Object.freeze({ id: 'failed-image', label: '실패 자리표시자' }),
]);

export function renderRen005Inspector(route: PatchMapContractRoute): string {
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

export function refreshRen005Inspector(
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
