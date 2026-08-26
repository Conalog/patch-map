import type {
  PatchMapHostTransformerEditOptions,
  PatchMapHostTransformerEditResult,
  PatchMapHostTransformerSessionBeginInput,
  PatchMapHostTransformerSessionToken,
} from './host-contracts';
import type {
  PatchMapApi,
  PatchMapTargetsInput,
  PatchMapTransformOptions,
  PatchMapTransformSessionCancelResult,
  PatchMapTransformSessionCompletionResult,
  PatchMapTransformSessionPreview,
  PatchMapTransformSessionPreviewResult,
} from './contracts';
import type {
  PatchMapEdgeAutoPanResult,
  PatchMapTransformerEditKind,
  PatchMapTransformerEditRequest,
} from '../selection-transformer/edit';

export interface PatchMapTransformHost {
  applyTransformerEdit(
    request: PatchMapTransformerEditRequest,
    options?: PatchMapHostTransformerEditOptions,
  ): PatchMapHostTransformerEditResult;
  beginPublicTransformerEdit(
    input: PatchMapHostTransformerSessionBeginInput,
  ): PatchMapHostTransformerSessionToken;
  previewPublicTransformerEdit(
    token: PatchMapHostTransformerSessionToken,
    request: PatchMapTransformerEditRequest,
  ): PatchMapTransformSessionPreviewResult;
  edgeAutoPanPublicTransformer(
    token: PatchMapHostTransformerSessionToken,
    pointerScreen: readonly [number, number],
    deltaCss: readonly [number, number],
  ): PatchMapEdgeAutoPanResult;
  completePublicTransformerEdit(
    token: PatchMapHostTransformerSessionToken,
  ): PatchMapTransformSessionCompletionResult;
  cancelPublicTransformerEdit(
    token: PatchMapHostTransformerSessionToken,
  ): PatchMapTransformSessionCancelResult;
}

export function createPatchMapTransformApi(
  host: PatchMapTransformHost,
  resolveIds: (targets: PatchMapTargetsInput) => readonly string[],
): PatchMapApi['transform'] {
  const options = (
    value: PatchMapTransformOptions,
  ): PatchMapHostTransformerEditOptions => Object.freeze({
    ...(value.actionId === undefined ? {} : { actionId: value.actionId }),
    ...(value.recordHistory === undefined ? {} : { recordHistory: value.recordHistory }),
  });
  const projectResult = (
    result: PatchMapHostTransformerEditResult,
  ): PatchMapHostTransformerEditResult => Object.freeze({
    status: result.status,
    changed: result.changed,
    historyDepthDelta: result.historyDepthDelta,
  });

  return Object.freeze({
    moveBy(
      targets: PatchMapTargetsInput,
      delta: readonly [number, number],
      value: PatchMapTransformOptions = {},
    ): PatchMapHostTransformerEditResult {
      return projectResult(host.applyTransformerEdit({
        kind: 'move',
        selectionIds: resolveIds(targets),
        deltaWorld: delta,
      }, options(value)));
    },
    resizeBy(
      targets: PatchMapTargetsInput,
      resize: Parameters<PatchMapApi['transform']['resizeBy']>[1],
      value: PatchMapTransformOptions = {},
    ): PatchMapHostTransformerEditResult {
      return projectResult(host.applyTransformerEdit({
        kind: 'resize',
        selectionIds: resolveIds(targets),
        handle: resize.handle,
        deltaWorld: resize.delta,
        ...(resize.lockAspectRatio === undefined
          ? {}
          : { lockAspectRatio: resize.lockAspectRatio }),
        ...(resize.minSize === undefined ? {} : { minSize: resize.minSize }),
      }, options(value)));
    },
    rotateBy(
      targets: PatchMapTargetsInput,
      degrees: number,
      value: PatchMapTransformOptions = {},
    ): PatchMapHostTransformerEditResult {
      return projectResult(host.applyTransformerEdit({
        kind: 'rotate',
        selectionIds: resolveIds(targets),
        deltaDegrees: degrees,
      }, options(value)));
    },
    beginSession(input: Parameters<PatchMapApi['transform']['beginSession']>[0]) {
      if (input === null || typeof input !== 'object' || Array.isArray(input)) {
        throw new TypeError('transform session input must be an object');
      }
      const selectionIds = resolveIds(input.targets);
      const token = host.beginPublicTransformerEdit({
        actionId: input.actionId,
        kind: input.kind,
        handle: sessionHandle(input.kind, input.handle),
        selectionIds,
      });
      let settled = false;
      const assertActive = (): void => {
        if (settled) throw new Error('transform session is already settled');
      };
      return Object.freeze({
        preview(change: PatchMapTransformSessionPreview) {
          assertActive();
          if (change.kind !== input.kind) {
            throw new TypeError('transform preview kind must match the active session');
          }
          const request = previewRequest(selectionIds, input.handle, change);
          const result = host.previewPublicTransformerEdit(token, request);
          return Object.freeze({ status: result.status, changed: result.changed });
        },
        edgePan(
          pointerScreen: readonly [number, number],
          deltaCss: readonly [number, number],
        ) {
          assertActive();
          const result = host.edgeAutoPanPublicTransformer(token, pointerScreen, deltaCss);
          return Object.freeze({
            pointerWorldBefore: result.pointerWorldBefore,
            pointerWorldAfter: result.pointerWorldAfter,
            adjustedPointerScreen: result.adjustedPointerScreen,
            centerWorld: result.centerWorld,
          });
        },
        commit() {
          assertActive();
          const result = host.completePublicTransformerEdit(token);
          settled = true;
          return Object.freeze({
            status: result.status,
            changed: result.changed,
            mutationCount: result.mutationCount,
            historyDepthDelta: result.historyDepthDelta,
          });
        },
        cancel() {
          assertActive();
          const result = host.cancelPublicTransformerEdit(token);
          settled = true;
          return Object.freeze({
            status: result.status,
            cancelled: result.cancelled,
            historyDepthDelta: result.historyDepthDelta,
          });
        },
      });
    },
  });
}

function sessionHandle(
  kind: PatchMapTransformerEditKind,
  handle: Parameters<PatchMapApi['transform']['beginSession']>[0]['handle'],
) {
  if (kind === 'move') {
    if (handle !== undefined) throw new TypeError('move sessions use the frame handle');
    return 'frame' as const;
  }
  if (kind === 'rotate') {
    if (handle !== undefined) throw new TypeError('rotate sessions use the rotate handle');
    return 'rotate' as const;
  }
  if (handle === undefined) throw new TypeError('resize sessions require a resize handle');
  return handle;
}

function previewRequest(
  selectionIds: readonly string[],
  handle: Parameters<PatchMapApi['transform']['beginSession']>[0]['handle'],
  change: PatchMapTransformSessionPreview,
): PatchMapTransformerEditRequest {
  if (change.kind === 'move') {
    return Object.freeze({
      kind: 'move',
      selectionIds,
      deltaWorld: change.delta,
      ...(change.axisLock === undefined ? {} : { axisLock: change.axisLock }),
    });
  }
  if (change.kind === 'resize') {
    return Object.freeze({
      kind: 'resize',
      selectionIds,
      handle: handle!,
      deltaWorld: change.delta,
      ...(change.lockAspectRatio === undefined
        ? {}
        : { lockAspectRatio: change.lockAspectRatio }),
      ...(change.minSize === undefined ? {} : { minSize: change.minSize }),
    });
  }
  return Object.freeze({
    kind: 'rotate',
    selectionIds,
    deltaDegrees: change.degrees,
    ...(change.center === undefined ? {} : { centerWorld: change.center }),
  });
}
