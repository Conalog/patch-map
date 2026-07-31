import { renderRunObserver } from '../run-observer';
import type { PatchMapContractRoute } from '../route';
import {
  escapeHtml,
  isRecord,
  numberField,
  observedValue,
  recordAt,
  setText,
  stringField,
} from './presentation-values';

interface PatchMapComponentAssetPhase {
  readonly id: string;
  readonly label: string;
  readonly actionIndex: number;
  readonly productKey: 'product' | 'after';
}

const REN_008_PHASES: readonly PatchMapComponentAssetPhase[] = Object.freeze([
  Object.freeze({ id: 'initial', label: 'A0 사각형', actionIndex: 0, productKey: 'product' }),
  Object.freeze({ id: 'image', label: 'A1 이미지', actionIndex: 1, productKey: 'after' }),
  Object.freeze({ id: 'hidden', label: 'A2 숨김', actionIndex: 2, productKey: 'after' }),
  Object.freeze({ id: 'shown', label: 'A3 표시', actionIndex: 3, productKey: 'after' }),
]);

const REN_010_PHASES: readonly PatchMapComponentAssetPhase[] = Object.freeze([
  Object.freeze({ id: 'initial', label: 'A0 초기 별칭', actionIndex: 0, productKey: 'product' }),
  Object.freeze({ id: 'replacement', label: 'A1 교체 별칭', actionIndex: 1, productKey: 'after' }),
  Object.freeze({ id: 'tint', label: 'A2 색조 부분 갱신', actionIndex: 2, productKey: 'after' }),
]);

const COMPONENT_ASSET_RESOURCE_FIELDS = Object.freeze([
  Object.freeze({ suffix: 'canvas-count', key: 'canvasCount', label: '캔버스 수' }),
  Object.freeze({ suffix: 'subscription-count', key: 'subscriptionCount', label: '구독 수' }),
  Object.freeze({ suffix: 'pending-work-count', key: 'pendingWorkCount', label: '대기 작업 수' }),
  Object.freeze({ suffix: 'binding-count', key: 'bindingCount', label: '연결 수' }),
  Object.freeze({ suffix: 'resource-count', key: 'resourceCount', label: '자원 수' }),
  Object.freeze({ suffix: 'lease-count', key: 'leaseCount', label: '사용권 수' }),
  Object.freeze({ suffix: 'pending-settlement-count', key: 'pendingSettlementCount', label: '완료 대기 수' }),
  Object.freeze({ suffix: 'pending-release-count', key: 'pendingReleaseCount', label: '반납 대기 수' }),
  Object.freeze({ suffix: 'stale-attachment-resource-count', key: 'staleAttachmentCount', label: '오래된 연결 수' }),
  Object.freeze({ suffix: 'renderer-object-resource-count', key: 'rendererObjectCount', label: '렌더러 객체 수' }),
  Object.freeze({ suffix: 'cleanup-failure-count', key: 'cleanupFailureCount', label: '정리 실패 수' }),
]);

export function renderComponentAssetInspector(route: PatchMapContractRoute): string {
  return `${renderRen008Inspector(route)}${renderRen010Inspector(route)}`;
}

export function refreshComponentAssetInspector(
  root: HTMLElement,
  scenario: string,
  execution: Readonly<Record<string, unknown>> | null,
): void {
  const configuration = scenario === 'REN-008'
    ? {
        prefix: 'ren-008' as const,
        selector: '[data-testid="ren-008-background-inspector"]',
        phases: REN_008_PHASES,
      }
    : scenario === 'REN-010'
      ? {
          prefix: 'ren-010' as const,
          selector: '[data-testid="ren-010-icon-inspector"]',
          phases: REN_010_PHASES,
        }
      : null;
  if (!configuration) return;
  const inspector = root.querySelector<HTMLElement>(configuration.selector);
  if (!inspector) return;

  const products = configuration.phases.map((phase) => (
    componentAssetProductAt(execution, phase)
  ));
  const observedCount = products.filter((product) => product !== null).length;
  inspector.dataset.observedPhaseCount = String(observedCount);
  setText(
    inspector.querySelector(`[data-testid="${configuration.prefix}-observed-phase-count"]`),
    `${observedCount} / ${configuration.phases.length}개 관찰`,
  );

  const chooser = inspector.querySelector<HTMLSelectElement>(
    `[data-testid="${configuration.prefix}-phase-select"]`,
  );
  if (chooser) {
    chooser.disabled = observedCount === 0;
    for (const option of chooser.options) {
      const phaseIndex = configuration.phases.findIndex(({ id }) => id === option.value);
      const observed = phaseIndex >= 0 && products[phaseIndex] !== null;
      option.disabled = !observed;
      option.dataset.observationStatus = observed ? 'observed' : 'queued';
    }
  }

  let selectedIndex = configuration.phases.findIndex(({ id }) => id === chooser?.value);
  if (selectedIndex < 0 || products[selectedIndex] === null) {
    selectedIndex = -1;
    for (let index = products.length - 1; index >= 0; index -= 1) {
      if (products[index] !== null) {
        selectedIndex = index;
        break;
      }
    }
    if (chooser && selectedIndex >= 0) chooser.value = configuration.phases[selectedIndex]!.id;
  }
  const selectedPhase = selectedIndex >= 0 ? configuration.phases[selectedIndex] : null;
  const product = selectedIndex >= 0 ? products[selectedIndex] : null;
  if (!selectedPhase || !product) {
    inspector.dataset.observationStatus = 'queued';
    delete inspector.dataset.selectedPhase;
    resetComponentAssetFields(inspector);
    renderComponentAssetResourceJournal(inspector, configuration.prefix, []);
    return;
  }

  inspector.dataset.observationStatus = 'observed';
  inspector.dataset.selectedPhase = selectedPhase.id;
  const component = recordAt(product, 'component');
  const semantic = component ? recordAt(component, 'semantic') : null;
  const geometry = component ? recordAt(component, 'geometry') : null;
  const sceneImage = component ? recordAt(component, 'sceneImage') : null;
  const rendererPaint = component ? recordAt(component, 'rendererPaint') : null;
  const resources = recordAt(product, 'resources');
  const counts = resources ? recordAt(resources, 'counts') : null;

  setComponentAssetField(inspector, configuration.prefix, 'phase', selectedPhase.label);
  setComponentAssetField(
    inspector,
    configuration.prefix,
    'owner-id',
    stringField(semantic, 'ownerId'),
  );
  setComponentAssetField(
    inspector,
    configuration.prefix,
    'component-id',
    stringField(semantic, 'componentId'),
  );
  setComponentAssetField(
    inspector,
    configuration.prefix,
    'entity-id',
    stringField(component, 'entityId'),
  );
  setComponentAssetField(
    inspector,
    configuration.prefix,
    'logical-identity',
    stringField(component, 'logicalIdentity'),
  );
  setComponentAssetField(
    inspector,
    configuration.prefix,
    'authored-size',
    observedValue(semantic?.authoredSize),
  );
  setComponentAssetField(
    inspector,
    configuration.prefix,
    'source',
    observedValue(semantic?.source),
  );
  setComponentAssetField(
    inspector,
    configuration.prefix,
    'resource-state',
    sceneImage ? stringField(sceneImage, 'state') : '해당 없음 · 집계 도형',
  );
  setComponentAssetField(
    inspector,
    configuration.prefix,
    'render-role',
    stringField(component, 'renderRole'),
  );
  setComponentAssetField(
    inspector,
    configuration.prefix,
    'binding-key',
    sceneImage ? stringField(sceneImage, 'bindingKey') : '해당 없음',
  );
  setComponentAssetField(
    inspector,
    configuration.prefix,
    'generation',
    sceneImage ? numberField(sceneImage, 'generation') : '해당 없음',
  );
  setComponentAssetField(
    inspector,
    configuration.prefix,
    'render-object-count',
    numberField(rendererPaint, 'renderObjectCount'),
  );
  setComponentAssetField(
    inspector,
    configuration.prefix,
    'stale-count',
    sceneImage ? numberField(sceneImage, 'staleAttachCount') : '해당 없음',
  );

  for (const { suffix, key } of COMPONENT_ASSET_RESOURCE_FIELDS) {
    setComponentAssetField(
      inspector,
      configuration.prefix,
      suffix,
      numberField(counts, key),
    );
  }
  const journal = resources && Array.isArray(resources.journal) ? resources.journal : [];
  renderComponentAssetResourceJournal(inspector, configuration.prefix, journal);

  if (configuration.prefix === 'ren-008') {
    setComponentAssetField(
      inspector,
      'ren-008',
      'full-bounds',
      observedValue(geometry?.worldBounds),
    );
    setComponentAssetField(
      inspector,
      'ren-008',
      'visible-bounds',
      observedValue(geometry?.visibleBounds),
    );
    setComponentAssetField(
      inspector,
      'ren-008',
      'capture-id',
      ren008CaptureId(execution),
    );
    return;
  }

  const ownerId = semantic && typeof semantic.ownerId === 'string' ? semantic.ownerId : null;
  const componentId = semantic && typeof semantic.componentId === 'string'
    ? semantic.componentId
    : null;
  const exportedOwner = ownerId ? observedDatasetOwner(product, ownerId) : null;
  const exportedComponent = exportedOwner && componentId
    ? observedDatasetComponent(exportedOwner, componentId)
    : null;
  setComponentAssetField(
    inspector,
    'ren-010',
    'content-box',
    observedValue(observedContentBox(exportedOwner)),
  );
  setComponentAssetField(
    inspector,
    'ren-010',
    'icon-bounds',
    observedValue(geometry?.worldBounds),
  );
  setComponentAssetField(
    inspector,
    'ren-010',
    'placement',
    observedValue(exportedComponent?.placement),
  );
  setComponentAssetField(
    inspector,
    'ren-010',
    'margins',
    observedValue(exportedComponent?.margin),
  );
  setComponentAssetField(
    inspector,
    'ren-010',
    'semantic-tint',
    observedValue(semantic?.tint),
  );
  setComponentAssetField(
    inspector,
    'ren-010',
    'renderer-tint',
    rendererTintLabel(rendererPaint),
  );
}

function renderComponentAssetPhaseOptions(
  phases: readonly PatchMapComponentAssetPhase[],
  initiallySelectedId: string,
): string {
  return phases.map(({ id, label, actionIndex }) => (
    `<option value="${id}" data-action-index="${actionIndex}" data-observation-status="queued"${id === initiallySelectedId ? ' selected' : ''} disabled>${label}</option>`
  )).join('');
}

function renderComponentAssetResourceLedger(prefix: 'ren-008' | 'ren-010'): string {
  const counters = COMPONENT_ASSET_RESOURCE_FIELDS.map(({ suffix, label }) => (
    `<div><dt>${label}</dt><dd data-testid="${prefix}-${suffix}" data-component-asset-field>관찰 전</dd></div>`
  )).join('');
  return `<div class="contract-image-ledger" aria-label="관찰된 컴포넌트 자원 수">
    <dl>${counters}</dl>
    <div class="contract-component-resource-journal">
      <h4>관찰된 자원 기록</h4>
      <ol data-testid="${prefix}-resource-journal"><li data-testid="${prefix}-resource-journal-empty">정확 실행을 시작하면 관찰된 자원을 확인할 수 있습니다.</li></ol>
    </div>
  </div>`;
}

function renderRen008Inspector(route: PatchMapContractRoute): string {
  if (route.scenario !== 'REN-008') return '';
  const options = renderComponentAssetPhaseOptions(REN_008_PHASES, 'shown');
  return `<section class="contract-image-inspector contract-component-inspector" data-testid="ren-008-background-inspector" data-observation-status="queued" data-observed-phase-count="0" aria-labelledby="ren-008-inspector-title">
    <div class="contract-image-inspector-heading">
      <div><span class="contract-kicker">REN-008 실제 관찰기</span><h3 id="ren-008-inspector-title">배경 컴포넌트 단계</h3></div>
      <label>관찰 단계<select data-testid="ren-008-phase-select" disabled>${options}</select><output class="contract-phase-observation-count" data-testid="ren-008-observed-phase-count">0 / 4개 관찰</output></label>
    </div>
    <p class="contract-image-observer-note">이 선택기는 완료된 작업 결과만 표시합니다. 기준 네 작업을 추가·삭제·재정렬·반복·변경할 수 없습니다.</p>
    <div class="contract-image-facts" data-testid="ren-008-selected-facts">
      <dl>
        <div><dt>단계</dt><dd data-testid="ren-008-phase" data-component-asset-field>관찰 전</dd></div>
        <div><dt>소유자 ID</dt><dd data-testid="ren-008-owner-id" data-component-asset-field>관찰 전</dd></div>
        <div><dt>컴포넌트 ID</dt><dd data-testid="ren-008-component-id" data-component-asset-field>관찰 전</dd></div>
        <div><dt>밀집 엔티티 ID</dt><dd data-testid="ren-008-entity-id" data-component-asset-field>관찰 전</dd></div>
        <div><dt>논리 ID</dt><dd data-testid="ren-008-logical-identity" data-component-asset-field>관찰 전</dd></div>
        <div><dt>입력 비활성 크기</dt><dd data-testid="ren-008-authored-size" data-component-asset-field>관찰 전</dd></div>
        <div><dt>전체 항목 영역</dt><dd data-testid="ren-008-full-bounds" data-component-asset-field>관찰 전</dd></div>
        <div><dt>보이는 영역</dt><dd data-testid="ren-008-visible-bounds" data-component-asset-field>관찰 전</dd></div>
        <div><dt>원본</dt><dd data-testid="ren-008-source" data-component-asset-field>관찰 전</dd></div>
        <div><dt>자원 상태</dt><dd data-testid="ren-008-resource-state" data-component-asset-field>관찰 전</dd></div>
        <div><dt>렌더 역할</dt><dd data-testid="ren-008-render-role" data-component-asset-field>관찰 전</dd></div>
        <div><dt>연결</dt><dd data-testid="ren-008-binding-key" data-component-asset-field>관찰 전</dd></div>
        <div><dt>세대</dt><dd data-testid="ren-008-generation" data-component-asset-field>관찰 전</dd></div>
        <div><dt>렌더 객체 수</dt><dd data-testid="ren-008-render-object-count" data-component-asset-field>관찰 전</dd></div>
        <div><dt>오래된 연결 수</dt><dd data-testid="ren-008-stale-count" data-component-asset-field>관찰 전</dd></div>
      </dl>
    </div>
    <div class="contract-component-capture" aria-label="선언된 관찰 캡처">
      <h4>선언된 캡처</h4>
      <dl><div data-testid="ren-008-capture-row"><dt>초기/ID</dt><dd data-testid="ren-008-capture-id" data-component-asset-field>관찰 전</dd></div></dl>
    </div>
    ${renderComponentAssetResourceLedger('ren-008')}
    ${renderRunObserver('ren-008')}
  </section>`;
}

function renderRen010Inspector(route: PatchMapContractRoute): string {
  if (route.scenario !== 'REN-010') return '';
  const options = renderComponentAssetPhaseOptions(REN_010_PHASES, 'tint');
  return `<section class="contract-image-inspector contract-component-inspector" data-testid="ren-010-icon-inspector" data-observation-status="queued" data-observed-phase-count="0" aria-labelledby="ren-010-inspector-title">
    <div class="contract-image-inspector-heading">
      <div><span class="contract-kicker">REN-010 실제 관찰기</span><h3 id="ren-010-inspector-title">아이콘 원본과 색조 단계</h3></div>
      <label>관찰 단계<select data-testid="ren-010-phase-select" disabled>${options}</select><output class="contract-phase-observation-count" data-testid="ren-010-observed-phase-count">0 / 3개 관찰</output></label>
    </div>
    <p class="contract-image-observer-note">이 선택기는 완료된 작업 결과만 표시합니다. 기준 세 작업을 추가·삭제·재정렬·반복·변경할 수 없습니다.</p>
    <div class="contract-image-facts" data-testid="ren-010-selected-facts">
      <dl>
        <div><dt>단계</dt><dd data-testid="ren-010-phase" data-component-asset-field>관찰 전</dd></div>
        <div><dt>소유자 ID</dt><dd data-testid="ren-010-owner-id" data-component-asset-field>관찰 전</dd></div>
        <div><dt>컴포넌트 ID</dt><dd data-testid="ren-010-component-id" data-component-asset-field>관찰 전</dd></div>
        <div><dt>밀집 엔티티 ID</dt><dd data-testid="ren-010-entity-id" data-component-asset-field>관찰 전</dd></div>
        <div><dt>논리 ID</dt><dd data-testid="ren-010-logical-identity" data-component-asset-field>관찰 전</dd></div>
        <div><dt>관찰 내보내기의 콘텐츠 영역</dt><dd data-testid="ren-010-content-box" data-component-asset-field>관찰 전</dd></div>
        <div><dt>실제 아이콘 영역</dt><dd data-testid="ren-010-icon-bounds" data-component-asset-field>관찰 전</dd></div>
        <div><dt>입력 비율 크기</dt><dd data-testid="ren-010-authored-size" data-component-asset-field>관찰 전</dd></div>
        <div><dt>배치</dt><dd data-testid="ren-010-placement" data-component-asset-field>관찰 전</dd></div>
        <div><dt>여백</dt><dd data-testid="ren-010-margins" data-component-asset-field>관찰 전</dd></div>
        <div><dt>원본</dt><dd data-testid="ren-010-source" data-component-asset-field>관찰 전</dd></div>
        <div><dt>자원 상태</dt><dd data-testid="ren-010-resource-state" data-component-asset-field>관찰 전</dd></div>
        <div><dt>렌더 역할</dt><dd data-testid="ren-010-render-role" data-component-asset-field>관찰 전</dd></div>
        <div><dt>연결</dt><dd data-testid="ren-010-binding-key" data-component-asset-field>관찰 전</dd></div>
        <div><dt>세대</dt><dd data-testid="ren-010-generation" data-component-asset-field>관찰 전</dd></div>
        <div><dt>의미 색조</dt><dd data-testid="ren-010-semantic-tint" data-component-asset-field>관찰 전</dd></div>
        <div><dt>렌더러 색조</dt><dd data-testid="ren-010-renderer-tint" data-component-asset-field>관찰 전</dd></div>
        <div><dt>렌더 객체 수</dt><dd data-testid="ren-010-render-object-count" data-component-asset-field>관찰 전</dd></div>
        <div><dt>오래된 연결 수</dt><dd data-testid="ren-010-stale-count" data-component-asset-field>관찰 전</dd></div>
      </dl>
    </div>
    ${renderComponentAssetResourceLedger('ren-010')}
    ${renderRunObserver('ren-010')}
  </section>`;
}

function componentAssetProductAt(
  execution: Readonly<Record<string, unknown>> | null,
  phase: PatchMapComponentAssetPhase,
): Readonly<Record<string, unknown>> | null {
  if (!execution || !Array.isArray(execution.actionResults)) return null;
  const result: unknown = execution.actionResults[phase.actionIndex];
  if (!isRecord(result) || result.status !== 'completed') return null;
  const delta = recordAt(result, 'delta');
  const actual = delta ? recordAt(delta, 'actual') : null;
  return actual ? recordAt(actual, phase.productKey) : null;
}

function resetComponentAssetFields(inspector: HTMLElement): void {
  for (const field of inspector.querySelectorAll<HTMLElement>('[data-component-asset-field]')) {
    field.textContent = '관찰 전';
  }
}

function setComponentAssetField(
  inspector: HTMLElement,
  prefix: 'ren-008' | 'ren-010',
  suffix: string,
  value: string,
): void {
  setText(inspector.querySelector(`[data-testid="${prefix}-${suffix}"]`), value);
}

function ren008CaptureId(
  execution: Readonly<Record<string, unknown>> | null,
): string {
  if (!execution || !Array.isArray(execution.captures)) return '관찰 전';
  const capture: unknown = execution.captures.find((candidate: unknown) => (
    isRecord(candidate)
    && candidate.id === 'initial'
    && candidate.afterActionIndex === 0
  ));
  const values = isRecord(capture) ? recordAt(capture, 'values') : null;
  return stringField(values, 'id');
}

function observedDatasetOwner(
  product: Readonly<Record<string, unknown>>,
  ownerId: string,
): Readonly<Record<string, unknown>> | null {
  if (!Array.isArray(product.dataset)) return null;
  return findObservedElement(product.dataset, ownerId);
}

function findObservedElement(
  elements: readonly unknown[],
  id: string,
): Readonly<Record<string, unknown>> | null {
  for (const elementValue of elements) {
    if (!isRecord(elementValue)) continue;
    if (elementValue.id === id) return elementValue;
    if (Array.isArray(elementValue.children)) {
      const nested = findObservedElement(elementValue.children, id);
      if (nested) return nested;
    }
  }
  return null;
}

function observedDatasetComponent(
  owner: Readonly<Record<string, unknown>>,
  componentId: string,
): Readonly<Record<string, unknown>> | null {
  if (!Array.isArray(owner.components)) return null;
  const component: unknown = owner.components.find((candidate: unknown) => (
    isRecord(candidate) && candidate.id === componentId
  ));
  return isRecord(component) ? component : null;
}

function observedContentBox(
  owner: Readonly<Record<string, unknown>> | null,
): readonly number[] | null {
  if (!owner) return null;
  const size = observedSize(owner.size);
  const padding = observedEdges(owner.padding);
  if (!size || !padding) return null;
  return [
    padding.left,
    padding.top,
    Math.max(0, size.width - padding.left - padding.right),
    Math.max(0, size.height - padding.top - padding.bottom),
  ];
}

function observedSize(
  value: unknown,
): Readonly<{ width: number; height: number }> | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { width: value, height: value };
  }
  if (Array.isArray(value) && value.length === 2) {
    const width: unknown = value[0];
    const height: unknown = value[1];
    return typeof width === 'number' && Number.isFinite(width)
      && typeof height === 'number' && Number.isFinite(height)
      ? { width, height }
      : null;
  }
  if (!isRecord(value)) return null;
  return typeof value.width === 'number' && Number.isFinite(value.width)
    && typeof value.height === 'number' && Number.isFinite(value.height)
    ? { width: value.width, height: value.height }
    : null;
}

function observedEdges(
  value: unknown,
): Readonly<{ top: number; right: number; bottom: number; left: number }> | null {
  if (value === undefined || value === null) {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { top: value, right: value, bottom: value, left: value };
  }
  if (!isRecord(value)) return null;
  const top = finiteNumberOrZero(value.top);
  const right = finiteNumberOrZero(value.right);
  const bottom = finiteNumberOrZero(value.bottom);
  const left = finiteNumberOrZero(value.left);
  return top === null || right === null || bottom === null || left === null
    ? null
    : { top, right, bottom, left };
}

function finiteNumberOrZero(value: unknown): number | null {
  if (value === undefined) return 0;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function rendererTintLabel(value: Readonly<Record<string, unknown>> | null): string {
  if (!value) return '정보 없음';
  const packed = finiteUnsignedInteger(value.packedTint);
  const rgb = finiteUnsignedInteger(value.rgbTint);
  const alpha = typeof value.alpha === 'number' && Number.isFinite(value.alpha)
    ? value.alpha
    : null;
  if (packed === null || rgb === null || alpha === null) return '정보 없음';
  return `패킹 0x${packed.toString(16).padStart(8, '0')} · RGB 0x${rgb.toString(16).padStart(6, '0')} · 투명도 ${alpha.toFixed(3)}`;
}

function finiteUnsignedInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value >>> 0
    : null;
}

function renderComponentAssetResourceJournal(
  inspector: HTMLElement,
  prefix: 'ren-008' | 'ren-010',
  journal: readonly unknown[],
): void {
  const list = inspector.querySelector<HTMLOListElement>(
    `[data-testid="${prefix}-resource-journal"]`,
  );
  if (!list) return;
  if (journal.length === 0) {
    list.innerHTML = `<li data-testid="${prefix}-resource-journal-empty">이 단계에서 관찰된 자원 이벤트가 없습니다.</li>`;
    return;
  }
  list.innerHTML = journal.map((entry) => {
    const record = isRecord(entry) ? entry : null;
    const sequence = numberField(record, 'sequence');
    const event = stringField(record, 'event');
    return `<li data-testid="${prefix}-resource-journal-row" data-resource-sequence="${escapeHtml(sequence)}" data-resource-event="${escapeHtml(event)}"><span>${escapeHtml(sequence)}</span><strong>${escapeHtml(event)}</strong><code>${escapeHtml(observedValue(record))}</code></li>`;
  }).join('');
}
