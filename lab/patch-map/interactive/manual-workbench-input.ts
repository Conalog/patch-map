export type ManualPointerMode =
  | 'select'
  | 'box'
  | 'paint'
  | 'move'
  | 'resize'
  | 'rotate'
  | 'pan';

export type ManualResizeHandle =
  | 'nw'
  | 'ne'
  | 'sw'
  | 'se'
  | 'n'
  | 'e'
  | 's'
  | 'w';

export interface ManualPointerGesture {
  readonly pointerId: number;
  readonly kind: 'box' | 'paint' | 'transform';
  readonly startScreen: readonly [number, number];
  readonly startWorld: readonly [number, number];
  readonly selectionBefore: readonly string[];
  readonly transformKind?: 'move' | 'resize' | 'rotate';
  readonly resizeHandle?: ManualResizeHandle;
  readonly rotationCenterScreen?: readonly [number, number];
  readonly rotationStartDegrees?: number;
  segments: Array<readonly [
    readonly [number, number],
    readonly [number, number],
  ]>;
  moved: boolean;
}

const MANUAL_POINTER_MODES = Object.freeze([
  'select',
  'box',
  'paint',
  'move',
  'resize',
  'rotate',
  'pan',
] as const);

const MANUAL_RESIZE_HANDLES = Object.freeze([
  'nw',
  'ne',
  'sw',
  'se',
  'n',
  'e',
  's',
  'w',
] as const);

const MANUAL_MODE_BY_SHORTCUT: Readonly<Record<string, ManualPointerMode>> =
  Object.freeze({
    v: 'select',
    b: 'box',
    p: 'paint',
    m: 'move',
    r: 'resize',
    o: 'rotate',
    h: 'pan',
  });

const MANUAL_MODE_LABELS: Readonly<Record<ManualPointerMode, string>> =
  Object.freeze({
    select: '선택',
    box: '영역 선택',
    paint: '붓질 선택',
    move: '이동',
    resize: '크기 조절',
    rotate: '회전',
    pan: '화면 이동',
  });

const MANUAL_MODE_TITLE_HELP: Readonly<Record<ManualPointerMode, string>> =
  Object.freeze({
    select: '객체를 클릭하고 Shift로 선택을 추가·해제합니다.',
    box: '범위를 드래그하고 Shift로 기존 선택에 추가합니다.',
    paint: '객체 위를 문지르고 Shift로 기존 선택에 추가합니다.',
    move: '선택 객체를 끌고 Shift로 이동 축을 고정합니다.',
    resize: '선택 핸들을 끌고 Shift로 가로세로 비율을 고정합니다.',
    rotate: '회전 핸들을 끌고 Shift로 15° 단위에 맞춥니다.',
    pan: '빈 캔버스를 끌고 휠로 확대·축소합니다.',
  });

const MANUAL_MODE_STATUS_HELP: Readonly<Record<ManualPointerMode, string>> =
  Object.freeze({
    select: '객체를 클릭하고 Shift로 선택을 추가·해제합니다.',
    box: '범위를 드래그합니다. Shift를 누르면 기존 선택에 추가합니다.',
    paint: '객체 위를 연속으로 문지릅니다. Shift를 누르면 기존 선택에 추가합니다.',
    move: '선택 객체를 드래그합니다. Shift를 누르면 한 축으로 고정합니다.',
    resize: '선택 핸들을 드래그합니다. Shift를 누르면 가로세로 비율을 고정합니다.',
    rotate: '회전 핸들을 드래그합니다. Shift를 누르면 15° 단위로 맞춥니다.',
    pan: '빈 캔버스를 드래그하고 휠로 확대·축소합니다.',
  });

const MANUAL_MODE_CURSORS: Readonly<Record<ManualPointerMode, string>> =
  Object.freeze({
    select: 'default',
    box: 'crosshair',
    paint: 'cell',
    move: 'move',
    resize: 'nwse-resize',
    rotate: 'crosshair',
    pan: 'grab',
  });

export function manualModeForShortcutKey(key: string): ManualPointerMode | undefined {
  return MANUAL_MODE_BY_SHORTCUT[key];
}

export function manualModeLabel(mode: ManualPointerMode): string {
  return MANUAL_MODE_LABELS[mode];
}

export function manualModeTitleHelp(mode: ManualPointerMode): string {
  return MANUAL_MODE_TITLE_HELP[mode];
}

export function manualModeStatusHelp(mode: ManualPointerMode): string {
  return MANUAL_MODE_STATUS_HELP[mode];
}

export function cursorForMode(mode: ManualPointerMode): string {
  return MANUAL_MODE_CURSORS[mode];
}

export function interactionModeForManualMode(
  mode: ManualPointerMode,
): 'pan' | 'transform' | 'relation-paint' | 'select' {
  if (mode === 'pan') return 'pan';
  if (mode === 'move' || mode === 'resize' || mode === 'rotate') return 'transform';
  return mode === 'paint' ? 'relation-paint' : 'select';
}

export function viewportPanOperationForManualMode(
  mode: ManualPointerMode,
): 'start' | 'stop' {
  return mode === 'pan' ? 'start' : 'stop';
}

export function selectionVisualModeForManualMode(
  mode: ManualPointerMode,
): 'hidden' | 'all' {
  return mode === 'pan' ? 'hidden' : 'all';
}

export function canvasPoint(
  event: Pick<PointerEvent | MouseEvent, 'clientX' | 'clientY'>,
  canvas: Pick<HTMLCanvasElement, 'getBoundingClientRect' | 'style'>,
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

export function midpoint(
  left: readonly [number, number],
  right: readonly [number, number],
): readonly [number, number] {
  return Object.freeze([(left[0] + right[0]) / 2, (left[1] + right[1]) / 2]);
}

export function angleDegrees(
  center: readonly [number, number],
  point: readonly [number, number],
): number {
  return Math.atan2(point[1] - center[1], point[0] - center[0]) * 180 / Math.PI;
}

export function normalizeDeltaDegrees(value: number): number {
  let result = value % 360;
  if (result > 180) result -= 360;
  if (result < -180) result += 360;
  return result;
}

export function isResizeHandle(value: unknown): value is ManualResizeHandle {
  return typeof value === 'string' && MANUAL_RESIZE_HANDLES.includes(value as ManualResizeHandle);
}

export function isManualPointerMode(value: unknown): value is ManualPointerMode {
  return typeof value === 'string' && MANUAL_POINTER_MODES.includes(value as ManualPointerMode);
}
