import { normalizePatchMapAssetDescriptor } from './assets';
import type {
  PatchMapAssetSource,
  MaterializedPatchMapDataset,
} from './semantic/dataset';
import {
  detachPatchMapMutationJsonValue,
  type PatchMapMutationJsonValue,
  type PatchMapMutationOperation,
  type PatchMapMutationTransactionRequest,
} from './semantic/transaction';
import { isPlainRecord } from './shared/plain-record';

export const PATCH_MAP_HOST_ASSET_INGESTION_REVISION =
  'patch-map-host-asset-ingestion/1' as const;

export interface PatchMapHostPreparedImage {
  readonly name: string;
  readonly mime: string;
  readonly bytes: number;
  /** Host-decoded/compressed source. Omit to use the package `object` alias. */
  readonly source?: PatchMapAssetSource;
}

export type PatchMapHostAssetIngestionInput =
  | Readonly<{
      readonly kind: 'text';
      readonly idPrefix: string;
      readonly text: string;
      readonly targetWorld: readonly [number, number];
      readonly activeEditor: boolean;
      readonly actionId?: string;
    }>
  | Readonly<{
      readonly kind: 'images';
      readonly idPrefix: string;
      readonly source: 'paste' | 'drop';
      readonly files: readonly PatchMapHostPreparedImage[];
      readonly targetWorld: readonly [number, number];
      readonly insideCanvas: boolean;
      readonly actionId?: string;
    }>
  | Readonly<{
      readonly kind: 'failure';
      readonly code: 'ASSET_DECODE_FAILED';
      readonly compressionFailureTargetScoped: true;
      readonly activeEditorClipboardNotStolen: true;
      readonly outsideDropNotStolen: true;
    }>;

export interface PatchMapHostAssetIngestionProbe {
  readonly textSequence: number;
  readonly imageSequence: number;
  readonly ignoredOutsideDropCount: number;
  readonly failedAssetTemporaryResources: number;
}

interface PlannedIntake {
  readonly status: 'planned';
  readonly transaction: PatchMapMutationTransactionRequest;
  readonly createdTextId: string | null;
  readonly createdImageIds: readonly string[];
  readonly nextTextSequence: number;
  readonly nextImageSequence: number;
}

export type PatchMapHostAssetIngestionPlan =
  | PlannedIntake
  | Readonly<{
      readonly status: 'ignored';
      readonly reason: 'active-editor' | 'outside-canvas';
      readonly transaction: null;
      readonly createdTextId: null;
      readonly createdImageIds: readonly string[];
    }>
  | Readonly<{
      readonly status: 'failed';
      readonly code: 'ASSET_DECODE_FAILED';
      readonly transaction: null;
      readonly createdTextId: null;
      readonly createdImageIds: readonly string[];
      readonly rollback: Readonly<{
        readonly compressionFailureTargetScoped: true;
        readonly activeEditorClipboardNotStolen: true;
        readonly outsideDropNotStolen: true;
      }>;
    }>;

/**
 * Engine-local authority for host-prepared clipboard/drop payloads.
 *
 * DOM events, File objects, compression, and decoding remain host-owned. Core
 * receives detached logical payloads and produces one semantic transaction,
 * one selection replacement, and one reversible history companion.
 */
export class PatchMapHostAssetIngestionAuthority {
  private textSequence = 0;
  private imageSequence = 0;
  private ignoredOutsideDropCount = 0;

  public plan(
    materialized: MaterializedPatchMapDataset,
    inputValue: PatchMapHostAssetIngestionInput,
  ): PatchMapHostAssetIngestionPlan {
    const input = normalizeInput(inputValue);
    if (input.kind === 'failure') {
      return Object.freeze({
        status: 'failed',
        code: input.code,
        transaction: null,
        createdTextId: null,
        createdImageIds: Object.freeze([]),
        rollback: Object.freeze({
          compressionFailureTargetScoped: true,
          activeEditorClipboardNotStolen: true,
          outsideDropNotStolen: true,
        }),
      });
    }
    if (input.kind === 'text' && input.activeEditor) {
      return ignoredPlan('active-editor');
    }
    if (
      input.kind === 'images' &&
      input.source === 'drop' &&
      !input.insideCanvas
    ) {
      this.ignoredOutsideDropCount += 1;
      return ignoredPlan('outside-canvas');
    }

    const rootIndex = materialized.dataset.length;
    if (input.kind === 'text') {
      const nextTextSequence = this.textSequence + 1;
      const id = `${input.idPrefix}-text-${nextTextSequence}`;
      const value = textElement(id, input.text, input.targetWorld);
      return Object.freeze({
        status: 'planned',
        transaction: transaction(
          input.actionId ?? `host-intake:text:${nextTextSequence}`,
          [addRoot(rootIndex, value)],
          [id],
          'text',
        ),
        createdTextId: id,
        createdImageIds: Object.freeze([]),
        nextTextSequence,
        nextImageSequence: this.imageSequence,
      });
    }

    const ids = input.files.map(
      (_file, index) => `${input.idPrefix}-image-${this.imageSequence + index + 1}`,
    );
    const operations = input.files.map((file, index) => addRoot(
      rootIndex + index,
      imageElement(ids[index]!, file, offsetPoint(input.targetWorld, index)),
    ));
    return Object.freeze({
      status: 'planned',
      transaction: transaction(
        input.actionId ?? `host-intake:${input.source}:${this.imageSequence + 1}`,
        operations,
        ids,
        input.source,
      ),
      createdTextId: null,
      createdImageIds: Object.freeze(ids),
      nextTextSequence: this.textSequence,
      nextImageSequence: this.imageSequence + ids.length,
    });
  }

  public commit(plan: PatchMapHostAssetIngestionPlan): void {
    if (plan.status !== 'planned') return;
    this.textSequence = plan.nextTextSequence;
    this.imageSequence = plan.nextImageSequence;
  }

  public probe(): PatchMapHostAssetIngestionProbe {
    return Object.freeze({
      textSequence: this.textSequence,
      imageSequence: this.imageSequence,
      ignoredOutsideDropCount: this.ignoredOutsideDropCount,
      // Core never receives temporary DOM images or decode surfaces.
      failedAssetTemporaryResources: 0,
    });
  }
}

function transaction(
  actionId: string,
  operations: readonly PatchMapMutationOperation[],
  selectedIds: readonly string[],
  source: string,
): PatchMapMutationTransactionRequest {
  return Object.freeze({
    operations: Object.freeze([...operations]),
    strict: true,
    conflictPolicy: 'reject',
    recordHistory: true,
    actionId,
    history: Object.freeze({
      selectedIds: Object.freeze([...selectedIds]),
      mode: 'select',
      hostAssetIngestion: Object.freeze({
        revision: PATCH_MAP_HOST_ASSET_INGESTION_REVISION,
        source,
      }),
    }),
  });
}

function addRoot(
  index: number,
  value: Readonly<Record<string, PatchMapMutationJsonValue>>,
): PatchMapMutationOperation {
  return Object.freeze({
    op: 'add',
    parent: null,
    collection: 'children',
    index,
    value,
  });
}

function textElement(
  id: string,
  text: string,
  point: readonly [number, number],
): Readonly<Record<string, PatchMapMutationJsonValue>> {
  return Object.freeze({
    type: 'text',
    id,
    text,
    style: Object.freeze({
      fontFamily: 'FiraCode',
      fontSize: 16,
      fill: '#111827',
    }),
    size: Object.freeze({ width: 160, height: 40 }),
    attrs: Object.freeze({
      x: roundSix(point[0] - 80),
      y: roundSix(point[1] - 20),
      hostAssetIngestion: true,
    }),
  });
}

function imageElement(
  id: string,
  file: PatchMapHostPreparedImage,
  point: readonly [number, number],
): Readonly<Record<string, PatchMapMutationJsonValue>> {
  const source = file.source === undefined
    ? 'object'
    : typeof file.source === 'string'
      ? file.source
      : normalizePatchMapAssetDescriptor(file.source);
  return Object.freeze({
    type: 'image',
    id,
    source: detachPatchMapMutationJsonValue(source),
    size: Object.freeze({ width: 80, height: 48 }),
    attrs: Object.freeze({
      x: roundSix(point[0] - 40),
      y: roundSix(point[1] - 24),
      hostAssetName: file.name,
      hostAssetMime: file.mime,
      hostAssetBytes: file.bytes,
    }),
  });
}

function offsetPoint(
  point: readonly [number, number],
  index: number,
): readonly [number, number] {
  return Object.freeze([
    roundSix(point[0] + index * 16),
    roundSix(point[1] + index * 16),
  ]);
}

function normalizeInput(
  value: PatchMapHostAssetIngestionInput,
): PatchMapHostAssetIngestionInput {
  if (!isPlainRecord(value)) throw new TypeError('host asset ingestion input must be an object');
  if (value.kind === 'failure') {
    if (
      value.code !== 'ASSET_DECODE_FAILED' ||
      value.compressionFailureTargetScoped !== true ||
      value.activeEditorClipboardNotStolen !== true ||
      value.outsideDropNotStolen !== true
    ) {
      throw new TypeError('host asset failure input is invalid');
    }
    return Object.freeze({
      kind: 'failure',
      code: value.code,
      compressionFailureTargetScoped: true,
      activeEditorClipboardNotStolen: true,
      outsideDropNotStolen: true,
    });
  }
  const idPrefix = safePrefix(value.idPrefix);
  const targetWorld = point(value.targetWorld);
  const actionId = value.actionId === undefined
    ? undefined
    : nonempty(value.actionId, 'host asset actionId');
  if (value.kind === 'text') {
    if (typeof value.text !== 'string') throw new TypeError('host text must be a string');
    if (typeof value.activeEditor !== 'boolean') {
      throw new TypeError('host activeEditor must be a boolean');
    }
    return Object.freeze({
      kind: 'text',
      idPrefix,
      text: value.text,
      targetWorld,
      activeEditor: value.activeEditor,
      ...(actionId === undefined ? {} : { actionId }),
    });
  }
  if (value.kind !== 'images') throw new TypeError('host asset ingestion kind is unsupported');
  if (value.source !== 'paste' && value.source !== 'drop') {
    throw new TypeError('host image intake source is invalid');
  }
  if (typeof value.insideCanvas !== 'boolean') {
    throw new TypeError('host insideCanvas must be a boolean');
  }
  if (!Array.isArray(value.files) || value.files.length === 0) {
    throw new TypeError('host image files must be a non-empty array');
  }
  const files = value.files.map((file, index) => normalizeFile(file, index));
  return Object.freeze({
    kind: 'images',
    idPrefix,
    source: value.source,
    files: Object.freeze(files),
    targetWorld,
    insideCanvas: value.insideCanvas,
    ...(actionId === undefined ? {} : { actionId }),
  });
}

function normalizeFile(value: unknown, index: number): PatchMapHostPreparedImage {
  if (!isPlainRecord(value)) throw new TypeError(`host image file ${index} must be an object`);
  const name = nonempty(value.name, `host image file ${index} name`);
  const mime = nonempty(value.mime, `host image file ${index} mime`).toLowerCase();
  if (!mime.startsWith('image/')) throw new TypeError(`host image file ${index} mime is invalid`);
  if (!Number.isSafeInteger(value.bytes) || (value.bytes as number) <= 0) {
    throw new TypeError(`host image file ${index} bytes is invalid`);
  }
  const source = value.source as PatchMapAssetSource | undefined;
  if (source !== undefined) {
    if (typeof source === 'string') nonempty(source, `host image file ${index} source`);
    else normalizePatchMapAssetDescriptor(source);
  }
  return Object.freeze({
    name,
    mime,
    bytes: value.bytes as number,
    ...(source === undefined
      ? {}
      : {
          source: typeof source === 'string'
            ? source
            : normalizePatchMapAssetDescriptor(source),
        }),
  });
}

function ignoredPlan(
  reason: 'active-editor' | 'outside-canvas',
): PatchMapHostAssetIngestionPlan {
  return Object.freeze({
    status: 'ignored',
    reason,
    transaction: null,
    createdTextId: null,
    createdImageIds: Object.freeze([]),
  });
}

function point(value: unknown): readonly [number, number] {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    value.some((entry) => typeof entry !== 'number' || !Number.isFinite(entry))
  ) {
    throw new TypeError('host targetWorld must be a finite pair');
  }
  return Object.freeze([value[0] as number, value[1] as number]);
}

function safePrefix(value: unknown): string {
  const prefix = nonempty(value, 'host idPrefix');
  if (!/^[A-Za-z0-9_-]+$/u.test(prefix)) throw new TypeError('host idPrefix is invalid');
  return prefix;
}

function nonempty(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

function roundSix(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
