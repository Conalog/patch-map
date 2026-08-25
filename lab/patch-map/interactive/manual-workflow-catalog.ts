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

export type PatchMapManualCoverageMode =
  | 'dedicated'
  | 'shared-workflow'
  | 'automated-only';

export interface PatchMapManualWorkflowDescriptor {
  readonly id: PatchMapManualToolGroup;
  readonly label: string;
  readonly description: string;
  readonly tasks: readonly string[];
}

export interface PatchMapManualCoverageDescriptor {
  readonly mode: PatchMapManualCoverageMode;
  readonly label: string;
  readonly summary: string;
  readonly tools: readonly PatchMapManualToolGroup[];
  readonly tasks: readonly string[];
}

export const PATCH_MAP_MANUAL_WORKFLOWS: Readonly<
  Record<PatchMapManualToolGroup, PatchMapManualWorkflowDescriptor>
> = Object.freeze({
  selection: workflow(
    'selection',
    '선택',
    '객체를 고르고 선택 목록을 확인합니다.',
    [
      '클릭·Shift 전환·영역·붓질 선택을 비교하세요.',
      '화면을 이동하거나 확대한 뒤 같은 대상을 다시 선택하세요.',
      '선택된 ID와 이벤트 기록이 함께 바뀌는지 확인하세요.',
    ],
  ),
  transform: workflow(
    'transform',
    '이동·크기·회전',
    '선택 객체를 이동·크기 조절·회전합니다.',
    [
      '객체 하나 이상을 선택하고 이동·크기 조절·회전을 실행하세요.',
      'Shift 보조키와 Escape 취소를 포함해 제스처 경계를 확인하세요.',
      '완료한 동작이 히스토리 한 단계로 기록되는지 확인하세요.',
    ],
  ),
  history: workflow(
    'history',
    '히스토리',
    '편집 기록을 실행 취소하거나 다시 실행합니다.',
    [
      '서로 다른 편집을 여러 번 실행해 실제 기록을 쌓으세요.',
      '버튼과 Ctrl/Cmd+Z·Shift+Z 단축키로 기록을 이동하세요.',
      '분기·용량·초기화 뒤 장면과 선택 상태를 비교하세요.',
    ],
  ),
  view: workflow(
    'view',
    '화면 이동·확대',
    '캔버스의 위치·배율·월드 방향을 바꿉니다.',
    [
      '화면 이동·확대·축소·fit을 반복하세요.',
      '월드 회전과 좌우·상하 반전 뒤 콘텐츠 배치를 확인하세요.',
      '화면 상태를 저장·복원하고 적중 검사가 유지되는지 확인하세요.',
    ],
  ),
  animation: workflow(
    'animation',
    '애니메이션·꾸미기',
    '막대·텍스트·스타일의 화면 변화를 실행합니다.',
    [
      '전체·일부·선택 막대 애니메이션을 반복하세요.',
      '애니메이션 중 화면을 이동·확대하며 프레임 상태를 확인하세요.',
      '텍스트·스타일·동작 줄이기 정책을 바꿔 결과를 비교하세요.',
    ],
  ),
  data: workflow(
    'data',
    '데이터셋·갱신',
    'PATCH MAP JSON을 불러오고 원자적으로 갱신합니다.',
    [
      '현재 장면을 JSON으로 내보내고 다시 불러오세요.',
      '유효한 갱신과 중복 ID가 있는 잘못된 입력을 비교하세요.',
      '실패 전후 장면·revision·입력 JSON이 보존되는지 확인하세요.',
    ],
  ),
  authoring: workflow(
    'authoring',
    '편집 작업',
    '객체를 생성·복제·정렬·그룹화·삭제합니다.',
    [
      '객체를 생성·복제하고 계층·앞뒤 순서를 바꾸세요.',
      '여러 객체를 정렬·분배하거나 그룹으로 묶고 해제하세요.',
      '삭제와 실행 취소 뒤 ID·선택·관계가 복원되는지 확인하세요.',
    ],
  ),
  assets: workflow(
    'assets',
    '에셋·이미지 추출',
    '에셋 수명과 현재 장면 이미지 추출을 확인합니다.',
    [
      '예제 에셋을 얻고 반납하며 자원 수를 확인하세요.',
      '현재 PixiJS 프레임을 PNG로 추출해 미리보기를 확인하세요.',
      '추출 뒤에도 같은 캔버스로 선택·이동·애니메이션을 계속하세요.',
    ],
  ),
  lifecycle: workflow(
    'lifecycle',
    '시작·종료',
    '세션을 교체·종료·재시작하고 크기를 바꿉니다.',
    [
      '장면 교체·호스트 크기 변경·페이지 숨김/복원을 실행하세요.',
      '세션을 종료해 캔버스와 자원이 제거되는지 확인하세요.',
      '재초기화 뒤 새 generation과 캔버스 한 개가 만들어지는지 확인하세요.',
    ],
  ),
  accessibility: workflow(
    'accessibility',
    '접근성',
    '논리 트리·포커스·키보드 동작을 확인합니다.',
    [
      '논리 접근성 트리를 만들고 대상 ID를 확인하세요.',
      '대상에 포커스를 옮긴 뒤 키보드와 같은 경로로 활성화하세요.',
      '선택 상태와 접근성 상태가 함께 바뀌는지 확인하세요.',
    ],
  ),
  diagnostics: workflow(
    'diagnostics',
    '진단·고급',
    '제품 상태·이벤트·공개 기능 결과를 자세히 봅니다.',
    [
      '제품 probe와 이벤트 기록을 새로 읽어 현재 상태를 확인하세요.',
      '같은 동작을 반복해 revision·자원·오류 정보가 누적되지 않는지 보세요.',
      '정확한 합격 판정은 화면 아래의 독립 자동 실행 결과를 확인하세요.',
    ],
  ),
});

export const PATCH_MAP_MANUAL_WORKFLOW_COUNT = Object.keys(
  PATCH_MAP_MANUAL_WORKFLOWS,
).length;

const DEDICATED_CASE_TASKS: Readonly<Record<string, readonly string[]>> = Object.freeze({
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

export const PATCH_MAP_DEDICATED_MANUAL_CASE_IDS = Object.freeze(
  Object.keys(DEDICATED_CASE_TASKS),
);

export const PATCH_MAP_AUTOMATED_ONLY_CASE_IDS = Object.freeze([
  'DET-001',
  'DET-002',
  'PRF-001',
  'PRF-002',
  'PRF-007',
  'PRF-009',
  'PIX-003',
  'PIX-005',
  'PKG-001',
  'PKG-002',
  'PKG-003',
  'PKG-004',
  'PKG-005',
  'SEC-001',
  'SEC-002',
  'SEC-003',
  'SEC-004',
  'OPS-002',
]);

const AUTOMATED_ONLY_CASES = new Set(PATCH_MAP_AUTOMATED_ONLY_CASE_IDS);

const PREFIX_WORKFLOWS: Readonly<
  Record<string, readonly PatchMapManualToolGroup[]>
> = Object.freeze({
  EVT: ['selection', 'diagnostics'],
  QRY: ['selection', 'data', 'diagnostics'],
  SEL: ['selection', 'diagnostics'],
  HIS: ['history', 'transform'],
  ERR: ['data', 'lifecycle', 'diagnostics'],
  DET: ['data', 'lifecycle', 'diagnostics'],
  PRF: ['diagnostics'],
  LIF: ['lifecycle', 'view'],
  DAT: ['data'],
  PIX: ['diagnostics', 'lifecycle', 'assets'],
  PKG: ['diagnostics'],
  REN: ['data'],
  LAY: ['authoring', 'view'],
  AST: ['assets'],
  SEC: ['assets', 'diagnostics'],
  ACC: ['accessibility'],
  OPS: ['diagnostics'],
  UPD: ['data', 'history'],
  ANI: ['animation', 'history'],
  VIE: ['view', 'selection'],
  TRN: ['transform', 'history'],
  CSM: ['diagnostics'],
});

const CASE_WORKFLOW_OVERRIDES: Readonly<
  Record<string, readonly PatchMapManualToolGroup[]>
> = Object.freeze({
  'EVT-006': ['accessibility', 'selection'],
  'LIF-004': ['lifecycle', 'view'],
  'DET-002': ['lifecycle', 'diagnostics'],
  'PRF-003': ['animation', 'view', 'diagnostics'],
  'PRF-004': ['animation', 'diagnostics'],
  'PRF-005': ['data', 'diagnostics'],
  'PRF-006': ['view', 'transform', 'diagnostics'],
  'PRF-007': ['lifecycle', 'diagnostics'],
  'PRF-008': ['assets', 'diagnostics'],
  'REN-005': ['assets'],
  'REN-007': ['selection', 'data'],
  'REN-008': ['assets'],
  'REN-009': ['animation', 'view'],
  'REN-010': ['assets'],
  'LAY-004': ['view', 'animation'],
  'VIE-007': ['view', 'lifecycle'],
  'ANI-002': ['animation', 'diagnostics'],
  'ACC-002': ['accessibility'],
  'PIX-003': ['diagnostics'],
  'PIX-004': ['assets', 'lifecycle'],
  'PIX-005': ['lifecycle', 'diagnostics'],
  'CSM-001': ['data', 'assets', 'lifecycle'],
  'CSM-002': ['data'],
  'CSM-003': ['data', 'lifecycle'],
  'CSM-004': ['data', 'lifecycle'],
  'CSM-005': ['data'],
  'CSM-006': ['animation', 'data'],
  'CSM-007': ['animation', 'lifecycle'],
  'CSM-008': ['animation', 'view'],
  'CSM-009': ['view'],
  'CSM-010': ['view'],
  'CSM-011': ['selection'],
  'CSM-012': ['selection'],
  'CSM-013': ['selection'],
  'CSM-014': ['animation', 'data'],
  'CSM-015': ['selection', 'accessibility'],
  'CSM-016': ['selection', 'data'],
  'CSM-017': ['lifecycle'],
  'CSM-018': ['authoring', 'view'],
  'CSM-019': ['authoring', 'history'],
  'CSM-020': ['selection'],
  'CSM-021': ['selection', 'authoring'],
  'CSM-022': ['transform', 'history'],
  'CSM-023': ['transform', 'history'],
  'CSM-024': ['view', 'selection'],
  'CSM-025': ['authoring', 'history'],
  'CSM-026': ['authoring', 'history'],
  'CSM-027': ['authoring', 'history'],
  'CSM-028': ['transform', 'authoring', 'history'],
  'CSM-029': ['authoring', 'data'],
  'CSM-030': ['authoring', 'history'],
  'CSM-031': ['authoring', 'history'],
  'CSM-032': ['assets', 'authoring'],
  'CSM-033': ['authoring', 'history'],
  'CSM-034': ['history', 'authoring'],
  'CSM-035': ['data'],
  'CSM-036': ['lifecycle'],
  'CSM-037': ['data', 'view'],
  'CSM-038': ['assets', 'lifecycle'],
});

export const PATCH_MAP_MANUAL_WORKFLOW_OVERRIDE_CASE_IDS = Object.freeze(
  Object.keys(CASE_WORKFLOW_OVERRIDES),
);

export function describePatchMapManualCoverage(
  caseId: string,
): PatchMapManualCoverageDescriptor {
  const tools = toolsForCase(caseId);
  const dedicatedTasks = DEDICATED_CASE_TASKS[caseId];
  if (dedicatedTasks !== undefined) {
    return coverage(
      'dedicated',
      '전용 수동 안내',
      '이 경로에는 해당 계약을 직접 탐색하기 위한 전용 조작 순서가 있습니다. 정확한 합격 판정은 아래 자동 실행 결과와 함께 확인합니다.',
      tools,
      dedicatedTasks,
    );
  }
  if (AUTOMATED_ONLY_CASES.has(caseId)) {
    return coverage(
      'automated-only',
      '자동 증거 전용',
      '이 계약은 fresh session, package, 보안, 성능 또는 lifecycle 계측이 필요해 공통 캔버스 조작만으로 합격을 판정할 수 없습니다.',
      tools,
      [
        '공통 작업대에서는 관련 제품 상태만 자유롭게 탐색하세요.',
        '화면 아래 ‘정확 실행 시작’으로 승인된 action trace를 실행하세요.',
        '실제 관찰·실패·정리 결과를 확인하고 수동 조작을 합격 증거로 대신하지 마세요.',
      ],
    );
  }

  const primary = PATCH_MAP_MANUAL_WORKFLOWS[tools[0] ?? 'diagnostics'];
  return coverage(
    'shared-workflow',
    '공통 조작 흐름으로 탐색',
    '이 계약에는 별도 수동 안내가 없습니다. 관련 제품 동작은 아래 공통 조작 흐름에서 탐색하고, 계약 고유 판정은 아래 자동 실행기가 담당합니다.',
    tools,
    [
      `‘${primary.label}’ 공통 조작 흐름에서 관련 동작을 자유롭게 실행하세요.`,
      ...primary.tasks.slice(0, 2),
      '이 탐색만으로 계약 통과를 주장하지 말고 아래 정확 실행 결과를 함께 확인하세요.',
    ],
  );
}

function workflow(
  id: PatchMapManualToolGroup,
  label: string,
  description: string,
  tasks: readonly string[],
): PatchMapManualWorkflowDescriptor {
  return Object.freeze({ id, label, description, tasks: Object.freeze([...tasks]) });
}

function coverage(
  mode: PatchMapManualCoverageMode,
  label: string,
  summary: string,
  tools: readonly PatchMapManualToolGroup[],
  tasks: readonly string[],
): PatchMapManualCoverageDescriptor {
  return Object.freeze({
    mode,
    label,
    summary,
    tools: Object.freeze([...tools]),
    tasks: Object.freeze([...tasks]),
  });
}

function toolsForCase(caseId: string): readonly PatchMapManualToolGroup[] {
  const explicit = CASE_WORKFLOW_OVERRIDES[caseId];
  if (explicit !== undefined) return explicit;
  const prefix = caseId.split('-', 1)[0] ?? '';
  return PREFIX_WORKFLOWS[prefix] ?? ['diagnostics'];
}
