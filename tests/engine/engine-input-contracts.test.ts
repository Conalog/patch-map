import { describe, expect, it } from 'vitest';

import {
  normalizePatchMapComponentVisualTarget,
} from '../../src/core/contracts';
import {
  assertTransformerHandleKind,
  finiteTuple,
  isPatchMapHistoryCompanionRecord,
  isPatchMapInteractionMode,
  nonEmptyValue,
  normalizeBackground,
  normalizeEngineMutationTarget,
  normalizeOptionalSourceRevision,
  normalizeSnapshotTarget,
  positiveSafeInteger,
  resolvePatchMapHistoryShortcut,
  validateExtractionRequest,
  validateInitializeOptions,
  validateNonNegativeFinite,
  validatePoint,
  validatePositiveFinite,
} from '../../src/engine/input-contracts';
import type {
  RectangleTextureStyle,
  TextStyleInput,
} from '../../src/public/input';

describe('PatchMap Engine input contracts', () => {
  it('exposes justify and exact component corner radii in the public input types', () => {
    const textStyle = { align: 'justify' } satisfies TextStyleInput;
    const tupleTexture = {
      type: 'rect',
      radius: [1, 2, 3, 4],
    } as const satisfies RectangleTextureStyle;
    const namedTexture = {
      type: 'rect',
      radius: { topLeft: 1, topRight: 2, bottomRight: 3, bottomLeft: 4 },
    } as const satisfies RectangleTextureStyle;

    expect(textStyle.align).toBe('justify');
    expect(tupleTexture.radius).toEqual([1, 2, 3, 4]);
    expect(namedTexture.radius.bottomLeft).toBe(4);
  });

  it('normalizes submission scalars without weakening their exact failures', () => {
    expect(normalizeOptionalSourceRevision(undefined)).toBeUndefined();
    expect(normalizeOptionalSourceRevision(4)).toBe(4);
    expect(positiveSafeInteger(2, 'revision')).toBe(2);
    expect(nonEmptyValue('digest', 'payloadHash')).toBe('digest');

    expect(() => normalizeOptionalSourceRevision(0)).toThrow(
      'sourceRevision must be a positive safe integer',
    );
    expect(() => positiveSafeInteger(1.5, 'revision')).toThrow(
      'revision must be a positive safe integer',
    );
    expect(() => nonEmptyValue('', 'payloadHash')).toThrow(
      'payloadHash must be a non-empty string',
    );
  });

  it('validates initialize fields in contract order and canonicalizes background colors', () => {
    validateInitializeOptions({ instanceId: 'engine-a', width: 320, height: 240 });
    expect(normalizeBackground('#123456')).toBe(0x123456ff);
    expect(normalizeBackground('#12345678')).toBe(0x12345678);
    expect(normalizeBackground(0x12345678)).toBe(0x12345678);

    expect(() => validateInitializeOptions({
      instanceId: '',
      width: 0,
      height: 0,
    })).toThrow('instanceId must be a non-empty string');
    expect(() => validateInitializeOptions({
      instanceId: 'engine-a',
      width: 0,
      height: 0,
    })).toThrow('width must be positive and finite');
    expect(() => normalizeBackground('#123')).toThrow(
      'background must be #rrggbb or #rrggbbaa',
    );
    expect(() => normalizeBackground(-1)).toThrow('invalid background color');
  });

  it('preserves extraction request validation precedence', () => {
    validateExtractionRequest({
      mime: 'image/png',
      cssSize: [320, 240],
      targetTuple: { scene: 1, view: 2, interaction: 3 },
    });

    expect(() => validateExtractionRequest({
      mime: 'image/jpeg',
      cssSize: [0, 0],
      targetTuple: { scene: -1, view: -1, interaction: -1 },
    } as never)).toThrow('extractPublishedScene mime must be image/png');
    expect(() => validateExtractionRequest({
      mime: 'image/png',
      cssSize: [320, 0],
      targetTuple: { scene: -1, view: 0, interaction: 0 },
    })).toThrow('extractPublishedScene cssSize must contain two positive finite values');
    expect(() => validateExtractionRequest({
      mime: 'image/png',
      cssSize: [320, 240],
      targetTuple: { scene: 0, view: -1, interaction: -1 },
    })).toThrow('extractPublishedScene targetTuple.view must be non-negative');
  });

  it('normalizes finite geometry inputs without retaining caller tuples', () => {
    validatePositiveFinite('width', 1);
    validateNonNegativeFinite('storeSyncMs', 0);
    validatePoint({ x: 0, y: -1 }, 'hitTest');
    const source = [3, 4] as const;
    const normalized = finiteTuple(source, 'deltaCss');

    expect(normalized).toEqual(source);
    expect(normalized).not.toBe(source);
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(() => validatePositiveFinite('width', 0)).toThrow(
      'width must be positive and finite',
    );
    expect(() => validateNonNegativeFinite('storeSyncMs', -1)).toThrow(
      'storeSyncMs must be non-negative and finite',
    );
    expect(() => validatePoint({ x: Number.NaN, y: 0 }, 'hitTest')).toThrow(
      'hitTest point must contain finite coordinates',
    );
    expect(() => finiteTuple([0, Number.POSITIVE_INFINITY], 'deltaCss')).toThrow(
      'deltaCss must contain two finite coordinates',
    );
  });

  it('normalizes owner-qualified component visual targets', () => {
    const target = { ownerId: 'item-a', componentId: 'label' };
    const normalized = normalizePatchMapComponentVisualTarget(target);

    expect(normalized).toEqual(target);
    expect(normalized).not.toBe(target);
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(() => normalizePatchMapComponentVisualTarget({
      ownerId: '',
      componentId: 'label',
    })).toThrow('component visual target ownerId must be a non-empty string');
  });

  it('validates and resolves owned history shortcuts', () => {
    const shortcut = (key: string, input: Partial<{
      ctrlKey: boolean;
      metaKey: boolean;
      shiftKey: boolean;
    }> = {}) => resolvePatchMapHistoryShortcut({
      key,
      ctrlKey: input.ctrlKey ?? true,
      metaKey: input.metaKey ?? false,
      shiftKey: input.shiftKey ?? false,
      pathKind: 'canvas',
    });

    expect(shortcut('Z')).toBe('undo');
    expect(shortcut('z', { shiftKey: true })).toBe('redo');
    expect(shortcut('y')).toBe('redo');
    expect(shortcut('y', { shiftKey: true })).toBeNull();
    expect(shortcut('z', { ctrlKey: true, metaKey: true })).toBeNull();
    expect(() => resolvePatchMapHistoryShortcut(null as never)).toThrow(
      'history shortcut input must be an object',
    );
    expect(() => resolvePatchMapHistoryShortcut({
      key: 'z',
      ctrlKey: 1,
      metaKey: false,
      shiftKey: false,
      pathKind: 'canvas',
    } as never)).toThrow('history shortcut modifiers must be booleans');
  });

  it('keeps transformer and interaction mode validation explicit', () => {
    expect(() => assertTransformerHandleKind('frame', 'move')).not.toThrow();
    expect(() => assertTransformerHandleKind('rotate', 'rotate')).not.toThrow();
    expect(() => assertTransformerHandleKind('n', 'resize')).not.toThrow();
    expect(() => assertTransformerHandleKind('frame', 'resize')).toThrow(
      'transformer frame handle cannot begin a resize edit',
    );
    expect(isPatchMapInteractionMode('relation-paint')).toBe(true);
    expect(isPatchMapInteractionMode('unsupported')).toBe(false);
    expect(isPatchMapHistoryCompanionRecord({ selectedIds: ['item-a'] })).toBe(true);
    expect(isPatchMapHistoryCompanionRecord([])).toBe(false);
  });

  it('canonicalizes exact mutation targets and treats invalid snapshots as absent', () => {
    const element = normalizeEngineMutationTarget({ kind: 'element', id: 'item-a' });
    const component = normalizeEngineMutationTarget({
      kind: 'component',
      ownerId: 'item-a',
      id: 'label',
    });

    expect(element).toEqual({ kind: 'element', id: 'item-a' });
    expect(component).toEqual({ kind: 'component', ownerId: 'item-a', id: 'label' });
    expect(Object.isFrozen(element)).toBe(true);
    expect(Object.isFrozen(component)).toBe(true);
    expect(() => normalizeEngineMutationTarget({
      kind: 'element',
      id: 'item-a',
      ownerId: 'unexpected',
    })).toThrow('element target contains an unknown field');
    expect(() => normalizeEngineMutationTarget({ kind: 'component', id: 'label' })).toThrow(
      'target must be an element or owner-qualified component',
    );
    expect(normalizeSnapshotTarget({ target: { kind: 'element', id: 'item-a' } }))
      .toEqual(element);
    expect(normalizeSnapshotTarget({ target: { kind: 'element', id: '' } })).toBeNull();
    expect(normalizeSnapshotTarget(null)).toBeNull();
  });
});
