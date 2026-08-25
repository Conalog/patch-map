import type { PatchMap } from '../../src/patch-map/index';

/** Execute the advanced console's deliberately narrow public product action set. */
export function runPatchMapManualAdvancedAction(
  engine: PatchMap,
  method: string,
  input: unknown,
): unknown {
  switch (method) {
    case 'author':
      return engine.author(input);
    case 'patch': {
      const record = requireRecord(input, '부분 갱신 입력');
      return engine.patch(
        record.target as Parameters<PatchMap['patch']>[0],
        record.patch,
      );
    }
    case 'transact':
      return engine.transact(input as Parameters<PatchMap['transact']>[0]);
    case 'selection':
      return engine.applySelection(
        input as Parameters<PatchMap['applySelection']>[0],
      );
    case 'viewport':
      return engine.setViewport(input as Parameters<PatchMap['setViewport']>[0]);
    case 'world-transform':
      return engine.setWorldTransform(
        input as Parameters<PatchMap['setWorldTransform']>[0],
      );
    case 'history-companion':
      return engine.setHistoryCompanion(
        input as Parameters<PatchMap['setHistoryCompanion']>[0],
      );
    case 'live-overlay':
      return engine.applyLiveOverlay(
        input as Parameters<PatchMap['applyLiveOverlay']>[0],
      );
    case 'viewport-policy':
      return engine.configureViewportPolicy(
        input as Parameters<PatchMap['configureViewportPolicy']>[0],
      );
    default:
      throw new Error(`지원하지 않는 고급 작업입니다: ${method}`);
  }
}

function requireRecord(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (!isRecord(value)) throw new TypeError(`${label} 값은 객체여야 합니다.`);
  return value;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
