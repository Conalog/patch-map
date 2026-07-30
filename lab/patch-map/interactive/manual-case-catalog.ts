import {
  PATCH_MAP_CONTRACT_PRESENTERS,
  type PatchMapContractActionPresenter,
  type PatchMapContractPresenterDescriptor,
} from '../contract/presenters';
import {
  patchMapKoreanCaseTitle,
} from '../contract/korean-copy';

export const PATCH_MAP_MANUAL_LAB_REVISION = 'core-v2-manual-lab/1' as const;

export type PatchMapManualToolGroup =
  | 'selection'
  | 'transform'
  | 'history'
  | 'view'
  | 'animation'
  | 'data'
  | 'authoring'
  | 'assets'
  | 'lifecycle'
  | 'accessibility'
  | 'diagnostics';

export interface PatchMapManualActionDescriptor {
  readonly index: number;
  readonly type: string;
  readonly label: string;
  readonly group: PatchMapManualToolGroup;
  readonly instruction: string;
}

export interface PatchMapManualCaseDescriptor {
  readonly revision: typeof PATCH_MAP_MANUAL_LAB_REVISION;
  readonly caseId: string;
  readonly title: string;
  readonly tools: readonly PatchMapManualToolGroup[];
  readonly tasks: readonly string[];
  readonly actions: readonly PatchMapManualActionDescriptor[];
}

export const PATCH_MAP_MANUAL_TOOL_LABELS: Readonly<
  Record<PatchMapManualToolGroup, string>
> = Object.freeze({
  selection: '선택',
  transform: '이동·크기·회전',
  history: '히스토리',
  view: '화면 이동·확대',
  animation: '애니메이션·꾸미기',
  data: '데이터셋·갱신',
  authoring: '편집 작업',
  assets: '에셋·이미지 추출',
  lifecycle: '시작·종료',
  accessibility: '접근성',
  diagnostics: '진단·고급',
});

export const PATCH_MAP_MANUAL_TOOL_DESCRIPTIONS: Readonly<
  Record<PatchMapManualToolGroup, string>
> = Object.freeze({
  selection: '객체를 고르고 선택 목록을 확인합니다.',
  transform: '선택 객체를 이동·크기 조절·회전합니다.',
  history: '편집 기록을 실행 취소하거나 다시 실행합니다.',
  view: '캔버스의 위치·배율·월드 방향을 바꿉니다.',
  animation: '막대·텍스트·스타일의 화면 변화를 실행합니다.',
  data: 'PATCH MAP JSON을 불러오고 원자적으로 갱신합니다.',
  authoring: '객체를 생성·복제·정렬·그룹화·삭제합니다.',
  assets: '에셋 수명과 현재 장면 이미지 추출을 확인합니다.',
  lifecycle: '세션을 교체·종료·재시작하고 크기를 바꿉니다.',
  accessibility: '논리 트리·포커스·키보드 동작을 확인합니다.',
  diagnostics: '제품 상태·이벤트·공개 기능 결과를 자세히 봅니다.',
});

const PREFIX_TOOLS: Readonly<Record<string, readonly PatchMapManualToolGroup[]>> =
  Object.freeze({
    EVT: ['selection', 'transform', 'view', 'history', 'diagnostics'],
    QRY: ['data', 'selection', 'diagnostics'],
    SEL: ['selection', 'transform', 'view', 'diagnostics'],
    HIS: ['history', 'selection', 'transform', 'data'],
    ERR: ['data', 'assets', 'lifecycle', 'diagnostics'],
    DET: ['data', 'animation', 'lifecycle', 'diagnostics'],
    PRF: ['animation', 'view', 'transform', 'lifecycle', 'diagnostics'],
    LIF: ['lifecycle', 'data', 'view', 'selection', 'diagnostics'],
    DAT: ['data', 'authoring', 'diagnostics'],
    PIX: ['lifecycle', 'assets', 'view', 'diagnostics'],
    PKG: ['data', 'lifecycle', 'diagnostics'],
    REN: ['data', 'animation', 'assets', 'view', 'diagnostics'],
    LAY: ['authoring', 'transform', 'history', 'view', 'diagnostics'],
    AST: ['assets', 'lifecycle', 'diagnostics'],
    SEC: ['assets', 'data', 'lifecycle', 'diagnostics'],
    ACC: ['accessibility', 'selection', 'history', 'animation'],
    OPS: ['diagnostics', 'lifecycle', 'data'],
    MIG: ['data', 'authoring', 'lifecycle', 'diagnostics'],
    UPD: ['data', 'authoring', 'history', 'animation', 'diagnostics'],
    ANI: ['animation', 'history', 'lifecycle', 'diagnostics'],
    VIE: ['view', 'selection', 'transform', 'diagnostics'],
    TRN: ['transform', 'selection', 'history', 'view', 'diagnostics'],
    CSM: [
      'selection',
      'transform',
      'history',
      'view',
      'animation',
      'data',
      'authoring',
      'assets',
      'lifecycle',
      'accessibility',
      'diagnostics',
    ],
  });

const CASE_TASKS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'SEL-004': [
    '객체를 클릭한 뒤 다른 객체를 Shift+클릭해 선택에 추가하거나 빼보세요.',
    '‘처음 3개 선택’, ‘선택 해제’, ‘영역 선택’, ‘붓질 선택’을 차례로 비교하세요.',
    '동작할 때마다 선택된 ID와 이벤트 기록이 바뀌는지 확인하세요.',
  ],
  'SEL-005': [
    '‘영역 선택’을 고르고 객체 전체와 일부가 걸치도록 드래그하세요.',
    '마우스를 놓을 때 Shift를 누르면 기존 선택에 영역 결과가 추가됩니다.',
    '화면을 이동하거나 확대·축소한 뒤 같은 영역 선택을 반복하세요.',
  ],
  'SEL-006': [
    '‘붓질 선택’을 고르고 한 번의 연속 동작으로 여러 객체를 문질러 지나가세요.',
    'Shift를 누른 채 반복하면 기존 선택에 지나간 대상이 추가됩니다.',
    '한 번 그을 때마다 선택된 ID와 이벤트 기록을 확인하세요.',
  ],
  'HIS-001': [
    '객체를 이동·크기 조절·회전·꾸미거나 새로 만들어 실제 기록을 쌓으세요.',
    '‘실행 취소/다시 실행’ 버튼 또는 Ctrl/Cmd+Z와 Ctrl/Cmd+Shift+Z를 사용하세요.',
    '기록 목록, 현재 도형, 선택 상태와 게시된 화면이 함께 복원되는지 확인하세요.',
  ],
  'HIS-002': [
    '최대 기록 수를 작게 정하고 그보다 많은 편집을 해 오래된 기록이 빠지는지 보세요.',
    '한 번 실행 취소한 뒤 다른 편집을 해 이전 다시 실행 분기가 사라지는지 확인하세요.',
    '기록을 비운 뒤에도 현재 장면은 그대로이고 두 스택만 비는지 확인하세요.',
  ],
  'HIS-004': [
    '캔버스나 Lab 화면에 초점을 두고 Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl/Cmd+Y를 사용하세요.',
    '같은 기능의 버튼을 눌러 동일한 히스토리 결과가 나오는지 비교하세요.',
    '텍스트 입력란에서는 Lab이 기본 편집 단축키를 가로채지 않는지 확인하세요.',
  ],
  'REN-009': [
    '전체·10%·선택 막대 애니메이션을 여러 번 실행해 높이가 부드럽게 변하는지 보세요.',
    '막대가 움직이는 동안 화면을 이동·확대하고 프레임·애니메이션 수를 확인하세요.',
    '‘동작 줄이기’를 켜고 다시 실행해 표시 정책 차이를 비교하세요.',
  ],
  'ANI-001': [
    '선택·10%·전체 막대 갱신을 원하는 만큼 반복하세요.',
    '‘프레임 일시 정지’로 중간 높이를 멈춘 뒤 다시 재생하세요.',
    '움직이는 동안 실행 취소하거나 장면을 교체하고 애니메이션·자원 수를 확인하세요.',
  ],
  'PRF-003': [
    '전체 막대 애니메이션을 시작한 즉시 캔버스를 드래그하고 휠로 확대하세요.',
    '10%와 선택 막대도 반복하면서 FPS와 최대 프레임 간격을 관찰하세요.',
    '상단의 데이터셋 크기를 바꿔 같은 조작 부하를 비교하세요.',
  ],
  'TRN-004': [
    '독립 사각형 하나를 선택하고 보이는 모서리·변 핸들을 각각 드래그하세요.',
    '‘크기 조절’ 모드와 방향 버튼으로 같은 변화량을 반복해보세요.',
    '핸들을 드래그할 때 Shift를 누르면 현재 가로세로 비율이 고정됩니다.',
  ],
  'TRN-006': [
    '이동 가능한 객체 여러 개를 Shift로 선택하고 ‘회전’ 모드에서 선택 중심 둘레로 드래그하세요.',
    '±15° 버튼으로 정확한 그룹 회전을 반복하세요.',
    '전체 선택이 하나의 히스토리 작업으로 실행 취소·재실행되는지 확인하세요.',
  ],
  'TRN-008': [
    '객체를 선택해 ‘이동’으로 드래그하고 Shift를 눌러 축을 고정하세요.',
    '방향키는 1px, Shift+방향키는 10px씩 이동합니다.',
    '화면 가장자리 가까이 옮긴 뒤 화면 이동·확대 후에도 계속 변형해보세요.',
  ],
  'TRN-009': [
    '선택 객체를 여러 중간 위치로 드래그한 뒤 놓아 히스토리 한 단계를 만드세요.',
    '드래그 도중 Escape를 눌러 취소하고 시작 전 도형으로 돌아오는지 보세요.',
    '완료한 제스처를 실행 취소·재실행하며 화면과 기록 수를 확인하세요.',
  ],
  'CSM-011': [
    '클릭·Shift 전환·영역·붓질·관계 끝점 선택과 빈 공간 해제를 자유롭게 사용하세요.',
    '선택 사이에 화면 이동·확대를 넣어 변환된 좌표의 적중 검사를 확인하세요.',
    '이벤트 기록에서 캔버스 선택이 호스트로 전달되는지 확인하세요.',
  ],
  'CSM-022': [
    '객체 하나 또는 여러 개를 선택해 드래그하고 키보드로 미세 이동하세요.',
    '드래그 중 Shift로 축을 고정하고 Shift+방향키로 10px씩 이동하세요.',
    '실행 취소 한 번으로 중간 위치가 아니라 전체 제스처가 되돌아가는지 확인하세요.',
  ],
  'CSM-023': [
    '보이는 모든 핸들로 크기를 조절한 뒤 같은 객체 또는 여러 객체를 회전하세요.',
    'Shift로 비율 또는 15° 회전을 맞추고 Escape로 진행 중 동작을 취소하세요.',
    '완료된 변형이 한 작업으로 실행 취소·재실행되는지 확인하세요.',
  ],
  'CSM-034': [
    '변형·생성·꾸미기·그룹·복제·삭제 작업을 섞어 기록을 쌓으세요.',
    '가능한 기록을 모두 실행 취소한 뒤 다시 실행하며 선택과 조작 모드를 확인하세요.',
    '실행 취소 뒤 새 편집을 만들어 이전 다시 실행 기록이 제거되는지 보세요.',
  ],
  'CSM-038': [
    '현재 게시된 PixiJS 장면을 캡처하고 이미지 미리보기를 확인하세요.',
    '캡처 뒤에도 선택·화면 이동·애니메이션을 계속해 실제 캔버스가 유지되는지 보세요.',
    '캡처를 반복하며 캔버스 ID, 대기 작업과 자원 수를 비교하세요.',
  ],
});

const CASE_PRIMARY_TOOL: Readonly<Record<string, PatchMapManualToolGroup>> =
  Object.freeze({
    'SEL-004': 'selection',
    'SEL-005': 'selection',
    'SEL-006': 'selection',
    'HIS-001': 'history',
    'HIS-002': 'history',
    'HIS-004': 'history',
    'REN-009': 'animation',
    'ANI-001': 'animation',
    'PRF-003': 'animation',
    'TRN-004': 'transform',
    'TRN-006': 'transform',
    'TRN-008': 'transform',
    'TRN-009': 'transform',
    'CSM-011': 'selection',
    'CSM-022': 'transform',
    'CSM-023': 'transform',
    'CSM-034': 'history',
    'CSM-038': 'assets',
  });

export function createPatchMapManualCaseDescriptor(
  presenter: PatchMapContractPresenterDescriptor,
): PatchMapManualCaseDescriptor {
  const actionDescriptors = presenter.actions.map(manualActionDescriptor);
  const prefix = presenter.caseId.split('-', 1)[0] ?? '';
  const primaryTool = CASE_PRIMARY_TOOL[presenter.caseId];
  const tools = orderTools([
    ...(primaryTool === undefined ? [] : [primaryTool]),
    ...(PREFIX_TOOLS[prefix] ?? ['diagnostics']),
    ...actionDescriptors.map(({ group }) => group),
  ]);
  const tasks = CASE_TASKS[presenter.caseId] ?? defaultTasks(presenter, actionDescriptors);
  return Object.freeze({
    revision: PATCH_MAP_MANUAL_LAB_REVISION,
    caseId: presenter.caseId,
    title: patchMapKoreanCaseTitle(presenter.caseId),
    tools,
    tasks: Object.freeze([...tasks]),
    actions: Object.freeze(actionDescriptors),
  });
}

export const PATCH_MAP_MANUAL_CASE_CATALOG: readonly PatchMapManualCaseDescriptor[] =
  Object.freeze(PATCH_MAP_CONTRACT_PRESENTERS.map(createPatchMapManualCaseDescriptor));

export const PATCH_MAP_MANUAL_CASE_BY_ID: ReadonlyMap<
  string,
  PatchMapManualCaseDescriptor
> = new Map(PATCH_MAP_MANUAL_CASE_CATALOG.map((descriptor) => [
  descriptor.caseId,
  descriptor,
]));

export const PATCH_MAP_MANUAL_CASE_COUNT = PATCH_MAP_MANUAL_CASE_CATALOG.length;
export const PATCH_MAP_MANUAL_ACTION_COUNT = PATCH_MAP_MANUAL_CASE_CATALOG.reduce(
  (count, descriptor) => count + descriptor.actions.length,
  0,
);

if (PATCH_MAP_MANUAL_CASE_COUNT !== 173) {
  throw new Error(`PatchMap manual Lab must cover 173 cases, got ${PATCH_MAP_MANUAL_CASE_COUNT}`);
}
if (PATCH_MAP_MANUAL_ACTION_COUNT !== 646) {
  throw new Error(`PatchMap manual Lab must map 646 actions, got ${PATCH_MAP_MANUAL_ACTION_COUNT}`);
}

export function selectPatchMapManualCase(caseId: string): PatchMapManualCaseDescriptor {
  const descriptor = PATCH_MAP_MANUAL_CASE_BY_ID.get(caseId);
  if (descriptor === undefined) {
    throw new Error(`Unknown PatchMap manual Lab case: ${caseId}`);
  }
  return descriptor;
}

function manualActionDescriptor(
  action: PatchMapContractActionPresenter,
): PatchMapManualActionDescriptor {
  const group = manualGroupForAction(action.type);
  return Object.freeze({
    index: action.index,
    type: action.type,
    label: `${PATCH_MAP_MANUAL_TOOL_LABELS[group]} · 작업 ${action.index + 1}`,
    group,
    instruction: manualInstructionForAction(action.type, group),
  });
}

function manualGroupForAction(type: string): PatchMapManualToolGroup {
  const value = type.toLowerCase();
  if (hasAny(value, [
    'undo',
    'redo',
    'history',
    'compound-editor',
    'host-control',
  ])) return 'history';
  if (hasAny(value, [
    'transform',
    'resize',
    'rotate',
    'nudge',
    'move-target',
    'begin-move',
    'end-move',
    'axis-lock',
    'align',
    'distribute',
  ])) return 'transform';
  if (hasAny(value, [
    'select',
    'hit-test',
    'hit-matrix',
    'query',
    'pointer',
    'click',
    'hover',
    'context-menu',
    'gesture',
    'binding',
    'propagat',
    'state-stack',
  ])) return 'selection';
  if (hasAny(value, [
    'pan',
    'zoom',
    'fit',
    'focus-target',
    'view',
    'viewport',
    'world-rotation',
    'world-flip',
    'surface-resize',
    'resize-host',
    'resizehost',
    'convert-screen',
  ])) return 'view';
  if (hasAny(value, [
    'animation',
    'animate',
    'bar',
    'random-text',
    'render-random-text',
    'advance-clock',
    'presentation',
    'highlight',
    'layer-visibility',
    'column',
    'reduced-motion',
  ])) return 'animation';
  if (hasAny(value, [
    'asset',
    'image',
    'descriptor',
    'register',
    'acquire',
    'extract',
    'capture',
    'canvas',
    'source',
  ])) return 'assets';
  if (hasAny(value, [
    'accessibility',
    'keyboard-parity',
    'host-control-action',
    'focus-accessibility',
    'activate-accessibility',
  ])) return 'accessibility';
  if (hasAny(value, [
    'initialize',
    'destroy',
    'lifecycle',
    'mount',
    'remount',
    'suspend',
    'visibility',
    'navigate',
    'renderer-loss',
    'fresh-instance',
    'repeatlifecycle',
  ])) return 'lifecycle';
  if (hasAny(value, [
    'create',
    'author',
    'style',
    'group',
    'ungroup',
    'duplicate',
    'copy-paste',
    'paste',
    'drop',
    'hierarchy',
    'reorder',
    'grid-edit',
    'relation-edit',
    'text-edit',
    'delete',
    'rename',
    'reveal',
    'position-angle',
  ])) return 'authoring';
  if (hasAny(value, [
    'performance',
    'measure',
    'probe',
    'inspect',
    'diagnostic',
    'telemetry',
    'package',
    'build',
    'pack',
    'install',
    'audit',
    'documentation',
    'canary',
    'compare',
  ])) return 'diagnostics';
  return 'data';
}

function manualInstructionForAction(
  type: string,
  group: PatchMapManualToolGroup,
): string {
  const value = type.toLowerCase();
  if (value.includes('undo')) return '편집을 여러 번 한 뒤 ‘실행 취소’ 또는 Ctrl/Cmd+Z를 누르세요.';
  if (value.includes('redo')) return '먼저 실행 취소한 뒤 ‘다시 실행’, Ctrl/Cmd+Shift+Z 또는 Ctrl/Cmd+Y를 누르세요.';
  if (value.includes('box-select') || value.includes('box-selection')) {
    return '‘영역 선택’을 고르고 실제 캔버스 위에서 범위를 드래그하세요.';
  }
  if (value.includes('paint-select') || value.includes('paint-selection')) {
    return '‘붓질 선택’을 고르고 실제 객체들을 가로질러 연속으로 문지르세요.';
  }
  if (value.includes('animate') || value.includes('bar') || value.includes('advance-clock')) {
    return '‘애니메이션·꾸미기’ 도구를 반복 실행하고 프레임이 도는 동안 화면도 조작하세요.';
  }
  if (value.includes('resize')) {
    return '사각형을 선택하고 ‘크기 조절’에서 보이는 핸들을 끌거나 방향 버튼을 사용하세요.';
  }
  if (value.includes('rotate')) {
    return '객체 하나 이상을 선택하고 ‘회전’에서 직접 끌거나 각도 버튼을 사용하세요.';
  }
  if (value.includes('move') || value.includes('nudge')) {
    return '이동 가능한 대상을 선택하고 ‘이동’으로 끌거나 방향키 미세 이동을 사용하세요.';
  }
  if (value.includes('extract') || value.includes('capture')) {
    return '현재 프레임을 게시·캡처하고 미리보기를 확인한 뒤 같은 캔버스를 계속 사용하세요.';
  }
  if (value.includes('destroy') || value.includes('remount')) {
    return '실제 세션을 종료·재초기화하며 캔버스와 자원 수를 확인하세요.';
  }
  if (value.includes('load') || value.includes('replace')) {
    return 'PATCH MAP JSON을 편집하거나 다시 만든 뒤 전체 기준 장면으로 불러오세요.';
  }
  if (value.includes('patch') || value.includes('merge') || value.includes('update')) {
    return '대상을 선택하고 부분 갱신·스타일·텍스트 또는 고급 JSON 작업을 적용하세요.';
  }
  return `‘${PATCH_MAP_MANUAL_TOOL_LABELS[group]}’ 도구에서 실행한 뒤 실제 결과와 이벤트 기록을 확인하세요.`;
}

function defaultTasks(
  presenter: PatchMapContractPresenterDescriptor,
  actions: readonly PatchMapManualActionDescriptor[],
): readonly string[] {
  const unique = [...new Set(actions.map(({ instruction }) => instruction))];
  return Object.freeze([
    `‘${patchMapKoreanCaseTitle(presenter.caseId)}’ 동작을 실제 캔버스에서 직접 확인하는 케이스입니다.`,
    ...(unique.slice(0, 2)),
    '같은 동작을 여러 값으로 반복하고 실행 취소·다시 실행해보세요. 직접 종료하기 전까지 세션은 계속 유지됩니다.',
  ]);
}

function orderTools(values: readonly PatchMapManualToolGroup[]): readonly PatchMapManualToolGroup[] {
  return Object.freeze([...new Set(values)]);
}

function hasAny(value: string, needles: readonly string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}
