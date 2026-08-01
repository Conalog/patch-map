import { renderRunObserver } from '../run-observer';
import type { PatchMapContractRoute } from '../route';
import {
  isRecord,
  observedValue,
  recordAt,
  setText,
} from './presentation-values';

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

export function renderTextInspector(route: PatchMapContractRoute): string {
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

export function refreshTextInspector(
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
