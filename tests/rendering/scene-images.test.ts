import { describe, expect, it, vi } from 'vitest';

import { createTestProjectionIndex } from '../support/projection-index';

import type {
  PatchMapImageDimensionMode,
  PatchMapImageProjection,
  PatchMapImageSourceKind,
  PatchMapProjectionIndex,
} from '../../src/patch-map/contracts';
import type {
  LeafAssetBindingObservation,
  LeafAssetBindingProbe,
  LeafAssetBindingRequest,
  LeafAssetBindingState,
  LeafSceneImageProbe,
} from '../../src/patch-map/renderers/leaf-layer';
import {
  PATCH_MAP_SCENE_IMAGE_ATTEMPT_LIMIT,
  PatchMapSceneImageController,
  type PatchMapSceneImageRendererBridge,
} from '../../src/patch-map/scene-images';
import type { PatchMapAssetSource } from '../../src/patch-map/semantic/dataset';

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(reason?: unknown): void;
}

interface MockBinding {
  readonly key: string;
  readonly generation: number;
  readonly request: LeafAssetBindingRequest;
  readonly completion: Deferred<LeafAssetBindingObservation>;
  state: LeafAssetBindingState;
  retired: boolean;
  cacheIdentity: string | null;
  normalizedResourceIdentity: string | null;
  reusedResolvedResource: boolean;
  naturalSize: readonly [number, number] | null;
  staleAttachCount: number;
  staleCompletionCount: number;
}

class MockImageRenderer implements PatchMapSceneImageRendererBridge {
  public readonly operations: string[] = [];
  public readonly bridgeCalls: string[] = [];
  public readonly requests = new Map<string, LeafAssetBindingRequest>();
  public readonly imageProbes = new Map<string, LeafSceneImageProbe>();
  public finalizeCount = 0;
  public finalizeFailure: Error | null = null;
  public bindFailure: Error | null = null;
  public unbindFailure: Error | null = null;
  public bindingProbeFailures = 0;
  public imageProbeFailures = 0;

  private readonly live = new Map<string, MockBinding>();
  private readonly all = new Map<string, MockBinding[]>();

  public bindSceneAsset(
    key: string,
    request: LeafAssetBindingRequest,
  ): Promise<LeafAssetBindingObservation> {
    this.bridgeCalls.push(`bind:${key}`);
    if (this.bindFailure) {
      const failure = this.bindFailure;
      this.bindFailure = null;
      throw failure;
    }
    const generation = (this.all.get(key)?.length ?? 0) + 1;
    const binding: MockBinding = {
      key,
      generation,
      request,
      completion: deferred<LeafAssetBindingObservation>(),
      state: 'pending',
      retired: false,
      cacheIdentity: null,
      normalizedResourceIdentity: null,
      reusedResolvedResource: false,
      naturalSize: null,
      staleAttachCount: 0,
      staleCompletionCount: 0,
    };
    this.live.set(key, binding);
    this.all.set(key, [...(this.all.get(key) ?? []), binding]);
    this.requests.set(key, request);
    this.operations.push(`bind:${key}`);
    return binding.completion.promise;
  }

  public unbindSceneAsset(key: string): Promise<boolean> {
    this.bridgeCalls.push(`unbind:${key}`);
    if (this.unbindFailure) {
      const failure = this.unbindFailure;
      this.unbindFailure = null;
      throw failure;
    }
    const binding = this.live.get(key);
    this.operations.push(`unbind:${key}`);
    if (!binding) return Promise.resolve(false);
    binding.retired = true;
    this.live.delete(key);
    return Promise.resolve(true);
  }

  public sceneAssetBindingProbe(key: string): LeafAssetBindingProbe | null {
    this.bridgeCalls.push(`binding-probe:${key}`);
    if (this.bindingProbeFailures > 0) {
      this.bindingProbeFailures -= 1;
      throw new Error(`fixture binding probe failed: ${key}`);
    }
    const binding = this.live.get(key);
    if (!binding) return null;
    return Object.freeze({
      key,
      generation: binding.generation,
      request: binding.request,
      sourceKind: sourceKind(binding.request),
      state: binding.state,
      attached: binding.state === 'resolved',
      cacheIdentity: binding.cacheIdentity,
      normalizedResourceIdentity: binding.normalizedResourceIdentity,
      reusedResolvedResource: binding.reusedResolvedResource,
      naturalSize: binding.naturalSize,
      consumerCount: 0,
      renderObjectCount: 0,
      placeholderCount: binding.state === 'resolved' ? 0 : 1,
      renderRole: binding.state === 'resolved' ? 'image' : 'asset-placeholder',
      staleAttachCount: binding.staleAttachCount,
      staleCompletionCount: binding.staleCompletionCount,
    });
  }

  public sceneImageProbe(entityId: string): LeafSceneImageProbe | null {
    this.bridgeCalls.push(`image-probe:${entityId}`);
    if (this.imageProbeFailures > 0) {
      this.imageProbeFailures -= 1;
      throw new Error(`fixture image probe failed: ${entityId}`);
    }
    return this.imageProbes.get(entityId) ?? null;
  }

  public finalizeAssetUnloads(): Promise<void> {
    this.bridgeCalls.push('finalize');
    this.operations.push('finalize');
    this.finalizeCount += 1;
    if (this.finalizeFailure) return Promise.reject(this.finalizeFailure);
    return Promise.resolve();
  }

  public resolve(
    key: string,
    options: Readonly<{
      normalizedResourceIdentity?: string;
      cacheIdentity?: string;
      reusedResolvedResource?: boolean;
      naturalSize?: readonly [number, number];
      generation?: number;
    }> = {},
  ): void {
    const binding = this.binding(key, options.generation);
    binding.state = 'resolved';
    binding.normalizedResourceIdentity = options.normalizedResourceIdentity ?? `decoded:${key}`;
    binding.cacheIdentity = options.cacheIdentity ?? `cache:${key}`;
    binding.reusedResolvedResource = options.reusedResolvedResource ?? false;
    binding.naturalSize = options.naturalSize ?? [64, 32];
    binding.completion.resolve(Object.freeze({
      key,
      generation: binding.generation,
      status: binding.retired ? 'stale' : 'attached',
      cacheIdentity: binding.cacheIdentity,
      normalizedResourceIdentity: binding.normalizedResourceIdentity,
      reusedResolvedResource: binding.reusedResolvedResource,
      naturalSize: binding.naturalSize,
    }));
  }

  public fail(key: string, generation?: number): void {
    const binding = this.binding(key, generation);
    binding.state = 'failed';
    binding.completion.resolve(Object.freeze({
      key,
      generation: binding.generation,
      status: binding.retired ? 'stale' : 'attached',
      cacheIdentity: null,
      normalizedResourceIdentity: null,
      reusedResolvedResource: false,
      naturalSize: null,
    }));
  }

  public reject(key: string, error: unknown): void {
    this.binding(key).completion.reject(error);
  }

  public setBindingStaleCounts(
    key: string,
    counts: Readonly<{ attach?: number; completion?: number }>,
  ): void {
    const binding = this.binding(key);
    binding.staleAttachCount = counts.attach ?? binding.staleAttachCount;
    binding.staleCompletionCount = counts.completion ?? binding.staleCompletionCount;
  }

  public setImageStaleCounts(
    entityId: string,
    key: string,
    counts: Readonly<{ attach?: number; completion?: number }>,
  ): void {
    const binding = this.binding(key);
    this.imageProbes.set(entityId, Object.freeze({
      entityId,
      renderObjectCount: 1,
      role: binding.state === 'resolved' ? 'image' : 'asset-placeholder',
      bindingKey: key,
      bindingGeneration: binding.generation,
      staleAttachCount: counts.attach ?? 0,
      staleCompletionCount: counts.completion ?? 0,
    }));
  }

  private binding(key: string, generation?: number): MockBinding {
    const bindings = this.all.get(key) ?? [];
    const binding = generation === undefined
      ? bindings.at(-1)
      : bindings.find((entry) => entry.generation === generation);
    if (!binding) throw new Error(`missing mock binding ${key}`);
    return binding;
  }
}

describe('PatchMapSceneImageController', () => {
  it('routes alias/direct/data/descriptor sources once and never retains mutable input', async () => {
    const renderer = new MockImageRenderer();
    const invalidate = vi.fn();
    const controller = new PatchMapSceneImageController(renderer, { onInvalidate: invalidate });
    const descriptor = {
      src: 'https://assets.example.test/image.svg',
      data: { resolution: 2, nested: { exact: true } },
    };
    const index = imageIndex([
      image('alias', 'fixture-image', 'alias'),
      image('alias-copy', 'fixture-image', 'alias'),
      image('url', 'https://assets.example.test/image.png', 'url'),
      image('data', 'data:image/svg+xml,%3Csvg/%3E', 'data-uri'),
      image('descriptor', descriptor, 'descriptor'),
    ]);

    const result = controller.reconcile(index);

    expect(result.bindingsStarted).toHaveLength(4);
    expect(renderer.requests.get('alias:fixture-image')).toEqual({
      kind: 'alias',
      alias: 'fixture-image',
    });
    expect(renderer.requests.get('url:https://assets.example.test/image.png')).toEqual({
      kind: 'source',
      source: 'https://assets.example.test/image.png',
    });
    expect(renderer.requests.get('data:data-image')).toEqual({
      kind: 'source',
      source: 'data:image/svg+xml,%3Csvg/%3E',
    });
    expect(renderer.requests.get('descriptor:image-svg')).toEqual({
      kind: 'source',
      source: {
        src: 'https://assets.example.test/image.svg',
        data: { nested: { exact: true }, resolution: 2 },
      },
    });

    descriptor.data.resolution = 9;
    renderer.resolve('alias:fixture-image', { reusedResolvedResource: true });
    renderer.resolve('url:https://assets.example.test/image.png');
    renderer.resolve('data:data-image');
    renderer.resolve('descriptor:image-svg');
    await controller.settle();

    expect(controller.imageProbe('descriptor')).toMatchObject({
      state: 'resolved',
      attachmentState: 'current',
      authoredSource: {
        src: 'https://assets.example.test/image.svg',
        data: { nested: { exact: true }, resolution: 2 },
      },
    });
    expect(controller.imageProbe('alias-copy')).toMatchObject({
      state: 'resolved',
      reusedResolvedResource: true,
    });
    expect(Object.isFrozen(controller.probe())).toBe(true);
    expect(Object.isFrozen(controller.probe().images)).toBe(true);
    expect(invalidate).toHaveBeenCalledWith('scene-images:reconcile');
  });

  it('transfers a pending shared binding between targets without retiring the request', async () => {
    const renderer = new MockImageRenderer();
    const controller = new PatchMapSceneImageController(renderer);
    const key = 'alias:fixture-image';
    controller.reconcile(imageIndex([image('old-target', 'fixture-image', 'alias')]));

    const transfer = controller.reconcile(imageIndex([
      image('replacement-target', 'fixture-image', 'alias'),
    ]));

    expect(transfer).toMatchObject({
      added: ['replacement-target'],
      removed: ['old-target'],
      bindingsStarted: [],
      bindingsRetired: [],
    });
    expect(renderer.operations).toEqual([`bind:${key}`]);
    expect(controller.imageProbe('old-target')).toBeNull();
    expect(controller.imageProbe('replacement-target')).toMatchObject({
      generation: 1,
      rendererGeneration: 1,
      state: 'pending',
      attachmentState: 'current',
    });
    expect(controller.probe().abandonedRequests.pendingReleaseCount).toBe(0);

    renderer.resolve(key, { generation: 1 });
    await controller.settleBindings([key]);

    expect(controller.imageProbe('replacement-target')).toMatchObject({
      state: 'resolved',
      attachmentState: 'current',
      staleAttachCount: 0,
      staleCompletionCount: 0,
    });
    expect(renderer.operations).toEqual([`bind:${key}`]);
  });

  it('bounds pending shared-binding attempts while a second target churns', async () => {
    const renderer = new MockImageRenderer();
    const controller = new PatchMapSceneImageController(renderer);
    const key = 'alias:fixture-image';
    const stable = image('stable', 'fixture-image', 'alias');
    controller.reconcile(imageIndex([stable]));

    for (let index = 0; index < PATCH_MAP_SCENE_IMAGE_ATTEMPT_LIMIT * 4; index += 1) {
      controller.reconcile(imageIndex([
        stable,
        image(`churn-${index}`, 'fixture-image', 'alias'),
      ]));
      controller.reconcile(imageIndex([stable]));
      expect(retainedPendingAttemptCount(controller)).toBe(1);
    }

    expect(renderer.operations).toEqual([`bind:${key}`]);
    expect(controller.probe()).toMatchObject({ targetCount: 1, pendingBindingCount: 1 });
    renderer.resolve(key);
    await controller.settleBindings([key]);
    expect(controller.imageProbe('stable')).toMatchObject({
      state: 'resolved',
      staleCompletionCount: 0,
    });
  });

  it('invalidates the old binding before replacement and preserves a stale resolved attempt', async () => {
    const renderer = new MockImageRenderer();
    const controller = new PatchMapSceneImageController(renderer);
    const oldKey = 'descriptor:image-svg';
    const replacementKey = 'alias:fixture-image';

    controller.reconcile(imageIndex([
      image('descriptor', {
        src: 'https://assets.example.test/image.svg',
        data: { resolution: 2 },
      }, 'descriptor'),
    ]));
    const replacement = controller.reconcile(imageIndex([
      image('descriptor', 'fixture-image', 'alias'),
    ]));

    expect(replacement.bindingsRetired).toEqual([oldKey]);
    expect(renderer.operations).toEqual([
      `bind:${oldKey}`,
      `unbind:${oldKey}`,
      `bind:${replacementKey}`,
    ]);

    renderer.resolve(replacementKey, {
      normalizedResourceIdentity: 'fixture-image@1',
      cacheIdentity: 'alias:fixture-image',
    });
    await controller.settleBindings([replacementKey]);
    renderer.resolve(oldKey, {
      generation: 1,
      normalizedResourceIdentity: 'fixture-svg-image@resolution-2',
      cacheIdentity: 'descriptor:https://assets.example.test/image.svg?resolution=2',
    });
    await controller.settle();

    const probe = controller.imageProbe('descriptor');
    expect(probe).toMatchObject({
      authoredSource: 'fixture-image',
      sourceKind: 'alias',
      state: 'resolved',
      staleAttachCount: 0,
      staleCompletionCount: 1,
      diagnosticCount: 0,
    });
    expect(probe?.attempts).toEqual([
      expect.objectContaining({
        authoredSource: {
          src: 'https://assets.example.test/image.svg',
          data: { resolution: 2 },
        },
        resourceState: 'resolved',
        attachmentState: 'stale',
        normalizedResourceIdentity: 'fixture-svg-image@resolution-2',
      }),
      expect.objectContaining({
        authoredSource: 'fixture-image',
        resourceState: 'resolved',
        attachmentState: 'current',
        normalizedResourceIdentity: 'fixture-image@1',
      }),
    ]);
    expect(controller.probe().abandonedRequests).toEqual({
      pendingSettlementCount: 0,
      pendingReleaseCount: 1,
      staleAttachmentCount: 0,
    });

    expect(renderer.finalizeCount).toBe(0);
    await controller.finalizeAfterRenderedFrame();
    expect(renderer.finalizeCount).toBe(1);
    expect(controller.probe().abandonedRequests).toEqual({
      pendingSettlementCount: 0,
      pendingReleaseCount: 0,
      staleAttachmentCount: 0,
    });
  });

  it('preserves entity-addressable stale attachments across source replacement', async () => {
    const renderer = new MockImageRenderer();
    const controller = new PatchMapSceneImageController(renderer);
    const oldKey = 'alias:old-image';
    const replacementKey = 'alias:replacement-image';
    controller.reconcile(imageIndex([image('image', 'old-image', 'alias')]));
    renderer.resolve(oldKey);
    await controller.settle();
    renderer.setBindingStaleCounts(oldKey, { attach: 20, completion: 10 });
    renderer.setImageStaleCounts('image', oldKey, { attach: 2, completion: 1 });
    expect(controller.imageProbe('image')).toMatchObject({
      staleAttachCount: 2,
      staleCompletionCount: 0,
    });

    controller.reconcile(imageIndex([image('image', 'replacement-image', 'alias')]));
    renderer.resolve(replacementKey);
    await controller.settle();
    renderer.setImageStaleCounts('image', replacementKey, { attach: 5, completion: 3 });

    expect(controller.imageProbe('image')).toMatchObject({
      authoredSource: 'replacement-image',
      staleAttachCount: 5,
      staleCompletionCount: 0,
    });
  });

  it('does not attribute a previous Sprite to a replacement binding generation', async () => {
    const renderer = new MockImageRenderer();
    const controller = new PatchMapSceneImageController(renderer);
    const oldKey = 'alias:old-image';
    const replacementKey = 'alias:replacement-image';
    controller.reconcile(imageIndex([image('image', 'old-image', 'alias')]));
    renderer.resolve(oldKey);
    await controller.settle();
    renderer.setImageStaleCounts('image', oldKey, { attach: 4 });
    expect(controller.imageProbe('image')).toMatchObject({
      publication: { rendererFacts: 'current' },
      renderObjectCount: 1,
      role: 'image',
    });

    controller.reconcile(imageIndex([image('image', 'replacement-image', 'alias')]));
    expect(controller.imageProbe('image')).toMatchObject({
      authoredSource: 'replacement-image',
      bindingKey: replacementKey,
      publication: { rendererFacts: 'pending' },
      renderObjectCount: 0,
      placeholderCount: 0,
      role: 'none',
    });

    renderer.resolve(replacementKey);
    await controller.settle();
    renderer.setImageStaleCounts('image', replacementKey, { attach: 0 });
    expect(controller.imageProbe('image')).toMatchObject({
      publication: { rendererFacts: 'current' },
      renderObjectCount: 1,
      role: 'image',
    });
  });

  it('does not duplicate one binding stale event across shared consumers', async () => {
    const renderer = new MockImageRenderer();
    const controller = new PatchMapSceneImageController(renderer);
    const key = 'alias:shared-image';
    controller.reconcile(imageIndex([
      image('first', 'shared-image', 'alias'),
      image('second', 'shared-image', 'alias'),
    ]));
    renderer.resolve(key);
    await controller.settle();
    renderer.setBindingStaleCounts(key, { attach: 7, completion: 11 });
    renderer.setImageStaleCounts('first', key, { attach: 1 });
    renderer.setImageStaleCounts('second', key, { attach: 0 });

    expect(controller.probe()).toMatchObject({
      staleAttachCount: 1,
      staleCompletionCount: 0,
      images: {
        first: { staleAttachCount: 1, staleCompletionCount: 0 },
        second: { staleAttachCount: 0, staleCompletionCount: 0 },
      },
    });
  });

  it('emits exactly one target-addressable diagnostic per failed generation', async () => {
    const renderer = new MockImageRenderer();
    const controller = new PatchMapSceneImageController(renderer);
    const failedKey = 'url:https://assets.example.test/fail.png';
    const index = imageIndex([
      image('failed-a', 'https://assets.example.test/fail.png', 'url'),
      image('failed-b', 'https://assets.example.test/fail.png', 'url'),
      image('hidden', 'https://assets.example.test/hidden.png', 'url'),
    ]);
    const active = new Set(['failed-a', 'failed-b']);

    controller.reconcile(index, { activeEntityIds: active });
    renderer.fail(failedKey);
    await controller.settle();
    renderer.imageProbes.set('failed-a', Object.freeze({
      entityId: 'failed-a',
      renderObjectCount: 1,
      role: 'asset-placeholder',
      bindingKey: failedKey,
      bindingGeneration: 1,
    }));

    expect(controller.imageProbe('failed-a')).toMatchObject({
      state: 'failed',
      role: 'asset-placeholder',
      diagnosticCount: 1,
    });
    expect(controller.imageProbe('failed-b')).toMatchObject({
      state: 'failed',
      diagnosticCount: 1,
    });
    expect(controller.imageProbe('hidden')).toMatchObject({
      active: false,
      state: 'absent',
      renderObjectCount: 0,
      role: 'none',
      diagnosticCount: 0,
    });
    expect(controller.probe().diagnostics.map(({ targetId }) => targetId)).toEqual([
      'failed-a',
      'failed-b',
    ]);

    const second = controller.reconcile(index, { activeEntityIds: active });
    expect(second).toEqual({
      added: [],
      updated: [],
      removed: [],
      activated: [],
      deactivated: [],
      bindingsStarted: [],
      bindingsRetired: [],
    });
    expect(controller.probe().diagnosticCount).toBe(2);
    expect(renderer.operations.filter((value) => value === `bind:${failedKey}`)).toHaveLength(1);
  });

  it('retries one failed shared binding once and deduplicates concurrent retry', async () => {
    const renderer = new MockImageRenderer();
    const controller = new PatchMapSceneImageController(renderer);
    const key = 'url:https://assets.example.test/retry.png';
    controller.reconcile(imageIndex([
      image('retry-a', 'https://assets.example.test/retry.png', 'url'),
      image('retry-b', 'https://assets.example.test/retry.png', 'url'),
    ]));
    renderer.fail(key, 1);
    await controller.settleBindings([key]);

    expect(controller.imageProbe('retry-a')).toMatchObject({
      generation: 1,
      state: 'failed',
      diagnosticCount: 1,
    });
    expect(controller.retry('retry-a')).toEqual({
      status: 'started',
      entityId: 'retry-a',
      bindingKey: key,
      generation: 2,
    });
    expect(controller.retry('retry-b')).toEqual({
      status: 'deduplicated',
      entityId: 'retry-b',
      bindingKey: key,
      generation: 2,
    });
    expect(renderer.operations.filter((value) => value === `bind:${key}`)).toHaveLength(2);

    renderer.resolve(key, { generation: 2 });
    await controller.settleBindings([key]);
    expect(controller.imageProbe('retry-a')).toMatchObject({
      generation: 2,
      state: 'resolved',
      attachmentState: 'current',
      diagnosticCount: 1,
      attempts: [
        expect.objectContaining({ generation: 1, diagnosticCount: 1 }),
        expect.objectContaining({ generation: 2, diagnosticCount: 0 }),
      ],
    });
    expect(controller.imageProbe('retry-b')).toMatchObject({
      generation: 2,
      state: 'resolved',
      attachmentState: 'current',
      diagnosticCount: 1,
    });
    expect(controller.retry('retry-a').status).toBe('unavailable');
  });

  it('contains a retry probe failure as a lifecycle failure without a pending half-commit', async () => {
    const renderer = new MockImageRenderer();
    const controller = new PatchMapSceneImageController(renderer);
    const key = 'url:https://assets.example.test/retry-probe.png';
    controller.reconcile(imageIndex([
      image('retry-probe', 'https://assets.example.test/retry-probe.png', 'url'),
    ]));
    renderer.fail(key, 1);
    await controller.settleBindings([key]);
    renderer.bindingProbeFailures = 1;

    expect(controller.retry('retry-probe')).toMatchObject({
      status: 'started',
      generation: 2,
    });
    renderer.resolve(key, { generation: 2 });
    await expect(controller.settleBindings([key])).rejects.toThrow(
      'PatchMap scene image lifecycle failed',
    );
    expect(controller.imageProbe('retry-probe')).toMatchObject({
      generation: 2,
      state: 'resolved',
      attachmentState: 'current',
    });
  });

  it('does not request another frame for an unchanged image reconciliation', () => {
    const renderer = new MockImageRenderer();
    const invalidate = vi.fn();
    const controller = new PatchMapSceneImageController(renderer, { onInvalidate: invalidate });
    const index = imageIndex([image('image', 'fixture-image', 'alias')]);

    controller.reconcile(index);
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(controller.reconcile(index)).toEqual({
      added: [],
      updated: [],
      removed: [],
      activated: [],
      deactivated: [],
      bindingsStarted: [],
      bindingsRetired: [],
    });
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('bounds source-churn history and prunes removed target diagnostics', async () => {
    const renderer = new MockImageRenderer();
    const controller = new PatchMapSceneImageController(renderer);
    for (let index = 0; index < PATCH_MAP_SCENE_IMAGE_ATTEMPT_LIMIT + 5; index += 1) {
      const source = `fixture-image-${index}`;
      const key = `alias:${source}`;
      controller.reconcile(imageIndex([image('image', source, 'alias')]));
      renderer.resolve(key);
      await controller.settleBindings([key]);
    }

    const retainedAttempts = controller.imageProbe('image')?.attempts ?? [];
    expect(retainedAttempts).toHaveLength(PATCH_MAP_SCENE_IMAGE_ATTEMPT_LIMIT);
    expect(retainedAttempts[0]).toMatchObject({
      generation: 1,
      authoredSource: 'fixture-image-0',
    });
    expect(retainedAttempts.at(-1)).toMatchObject({
      generation: PATCH_MAP_SCENE_IMAGE_ATTEMPT_LIMIT + 5,
      authoredSource: `fixture-image-${PATCH_MAP_SCENE_IMAGE_ATTEMPT_LIMIT + 4}`,
    });

    const failedKey = 'url:https://assets.example.test/fail-after-churn.png';
    controller.reconcile(imageIndex([
      image('image', 'https://assets.example.test/fail-after-churn.png', 'url'),
    ]));
    renderer.fail(failedKey);
    await controller.settle();
    expect(controller.probe().diagnosticCount).toBe(1);

    controller.reconcile(imageIndex([]));
    expect(controller.probe()).toMatchObject({ targetCount: 0, diagnosticCount: 0 });
    expect(controller.probe().diagnostics).toEqual([]);
  });

  it('surfaces renderer lifecycle rejection through controller settlement', async () => {
    const renderer = new MockImageRenderer();
    const controller = new PatchMapSceneImageController(renderer);
    const key = 'alias:release-failure';
    controller.reconcile(imageIndex([image('image', 'release-failure', 'alias')]));

    renderer.reject(key, new Error('fixture stale release failed'));

    await expect(controller.settle()).rejects.toThrow('scene image lifecycle failed');
  });

  it('releases a hidden image only across the explicit rendered-frame boundary', async () => {
    const renderer = new MockImageRenderer();
    const controller = new PatchMapSceneImageController(renderer);
    const key = 'alias:fixture-image';
    const index = imageIndex([image('image', 'fixture-image', 'alias')]);

    controller.reconcile(index);
    renderer.resolve(key);
    await controller.settle();
    controller.reconcile(index, { activeEntityIds: new Set() });
    await Promise.resolve();

    expect(renderer.operations).toContain(`unbind:${key}`);
    expect(renderer.finalizeCount).toBe(0);
    expect(controller.imageProbe('image')).toMatchObject({
      active: false,
      state: 'absent',
      renderObjectCount: 0,
      role: 'none',
    });
    expect(controller.probe().abandonedRequests.pendingReleaseCount).toBe(1);

    await controller.finalizeAfterRenderedFrame();
    expect(renderer.finalizeCount).toBe(1);
    expect(controller.probe().abandonedRequests).toEqual({
      pendingSettlementCount: 0,
      pendingReleaseCount: 0,
      staleAttachmentCount: 0,
    });
  });

  it('does not wait for a deliberately pending decoder during destroy', async () => {
    const renderer = new MockImageRenderer();
    const invalidate = vi.fn();
    const controller = new PatchMapSceneImageController(renderer, { onInvalidate: invalidate });
    const key = 'descriptor:pending';
    controller.reconcile(imageIndex([
      projection('pending', {
        src: 'https://assets.example.test/pending.svg',
        data: { resolution: 2 },
      }, 'descriptor', key, 'descriptor:pending?resolution=2'),
    ]));

    await expect(controller.destroy()).resolves.toBeUndefined();
    expect(controller.destroyed).toBe(true);
    expect(renderer.operations).toContain(`unbind:${key}`);

    const callsBeforeLateCompletion = invalidate.mock.calls.length;
    renderer.resolve(key, { generation: 1 });
    await Promise.resolve();
    await Promise.resolve();
    expect(invalidate).toHaveBeenCalledTimes(callsBeforeLateCompletion);
  });

  it('completes every binding teardown before reporting a synchronous unbind failure', async () => {
    const renderer = new MockImageRenderer();
    const controller = new PatchMapSceneImageController(renderer);
    const firstKey = 'alias:first-image';
    const secondKey = 'alias:second-image';
    controller.reconcile(imageIndex([
      image('first', 'first-image', 'alias'),
      image('second', 'second-image', 'alias'),
    ]));
    renderer.unbindFailure = new Error('fixture synchronous unbind failed');

    await expect(controller.destroy()).rejects.toThrow('scene image lifecycle failed');

    expect(renderer.bridgeCalls.filter((call) => call.startsWith('unbind:'))).toEqual([
      `unbind:${firstKey}`,
      `unbind:${secondKey}`,
    ]);
    expect(controller.probe()).toMatchObject({
      destroyed: true,
      targetCount: 0,
      bindingCount: 0,
      pendingSettlementCount: 0,
      pendingReleaseCount: 0,
    });
    await expect(controller.destroy()).resolves.toBeUndefined();
  });

  it('publishes decoded size once only for a current intrinsic generation', async () => {
    const renderer = new MockImageRenderer();
    const onIntrinsicSize = vi.fn();
    const controller = new PatchMapSceneImageController(renderer, { onIntrinsicSize });
    const oldKey = 'descriptor:intrinsic-old';
    const replacementKey = 'alias:fixture-image';
    controller.reconcile(imageIndex([
      projection(
        'intrinsic',
        { src: 'https://assets.example.test/intrinsic.svg' },
        'descriptor',
        oldKey,
        'descriptor:intrinsic-old',
        'intrinsic',
      ),
    ]));
    controller.reconcile(imageIndex([
      projection(
        'intrinsic',
        'fixture-image',
        'alias',
        replacementKey,
        replacementKey,
        'intrinsic',
      ),
    ]));

    renderer.resolve(oldKey, { generation: 1, naturalSize: [88, 44] });
    renderer.resolve(replacementKey, { naturalSize: [32, 16] });
    await controller.settle();

    expect(onIntrinsicSize).toHaveBeenCalledTimes(1);
    expect(onIntrinsicSize).toHaveBeenCalledWith({
      entityId: 'intrinsic',
      bindingKey: replacementKey,
      generation: 2,
      naturalSize: [32, 16],
    });
    expect(controller.imageProbe('intrinsic')).toMatchObject({
      dimensionMode: 'intrinsic',
      naturalSize: [32, 16],
      staleCompletionCount: 1,
    });
  });

  it('advances target generation while reusing the same resolved intrinsic source', async () => {
    const renderer = new MockImageRenderer();
    const onIntrinsicSize = vi.fn();
    const controller = new PatchMapSceneImageController(renderer, { onIntrinsicSize });
    const key = 'alias:fixture-image';
    controller.reconcile(imageIndex([
      projection('image', 'fixture-image', 'alias', key, key, 'authored'),
    ]));
    renderer.resolve(key, { generation: 1, naturalSize: [80, 40] });
    await controller.settle();
    expect(onIntrinsicSize).not.toHaveBeenCalled();

    controller.reconcile(imageIndex([
      projection('image', 'fixture-image', 'alias', key, key, 'intrinsic'),
    ]));
    await controller.settle();

    expect(controller.imageProbe('image')).toMatchObject({
      generation: 2,
      rendererGeneration: 1,
      dimensionMode: 'intrinsic',
      naturalSize: [80, 40],
    });
    expect(renderer.operations).toEqual([`bind:${key}`]);
    expect(onIntrinsicSize).toHaveBeenCalledTimes(1);
    expect(onIntrinsicSize).toHaveBeenCalledWith({
      entityId: 'image',
      bindingKey: key,
      generation: 2,
      naturalSize: [80, 40],
    });
  });

  it('observes fire-and-track finalization failures through the cleanup chain', async () => {
    const renderer = new MockImageRenderer();
    const controller = new PatchMapSceneImageController(renderer);
    const key = 'alias:cleanup-failure';
    const index = imageIndex([image('image', 'cleanup-failure', 'alias')]);
    controller.reconcile(index);
    renderer.resolve(key);
    await controller.settle();
    controller.reconcile(index, { activeEntityIds: new Set() });
    renderer.finalizeFailure = new Error('fixture finalization failure');

    await expect(controller.finalizeAfterRenderedFrame()).resolves.toBeUndefined();
    await expect(controller.settle()).rejects.toThrow('scene image lifecycle failed');
    expect(controller.probe().abandonedRequests.pendingReleaseCount).toBe(1);
  });

  it('prepares a reconcile plan without mutating probes, generations, or the renderer bridge', async () => {
    const renderer = new MockImageRenderer();
    const controller = new PatchMapSceneImageController(renderer);
    const key = 'alias:fixture-image';
    controller.reconcile(imageIndex([image('image', 'fixture-image', 'alias')]));
    renderer.resolve(key);
    await controller.settle();

    const before = controller.probe();
    const operationsBefore = [...renderer.operations];
    renderer.bridgeCalls.length = 0;
    const plan = controller.prepareReconcile(imageIndex([
      image('image', 'replacement-image', 'alias'),
      image('second', 'replacement-image', 'alias'),
    ]));

    expect(plan).toEqual({
      kind: 'patch-map-scene-image-reconcile-plan',
      imageCount: 2,
      activeImageCount: 2,
    });
    expect(Object.isFrozen(plan)).toBe(true);
    expect(renderer.bridgeCalls).toEqual([]);
    expect(renderer.operations).toEqual(operationsBefore);
    expect(controller.probe()).toEqual(before);
  });

  it('leaves exact controller and renderer state after invalid or colliding preparation', async () => {
    const renderer = new MockImageRenderer();
    const controller = new PatchMapSceneImageController(renderer);
    const key = 'alias:fixture-image';
    controller.reconcile(imageIndex([image('image', 'fixture-image', 'alias')]));
    renderer.resolve(key);
    await controller.settle();
    const before = controller.probe();
    const operationsBefore = [...renderer.operations];

    const invalid: PatchMapProjectionIndex = createTestProjectionIndex({
      byEntityId: Object.freeze({}),
      imagesByEntityId: Object.freeze({
        wrong: image('right', 'fixture-image', 'alias'),
      }),
    });
    expect(() => controller.prepareReconcile(invalid)).toThrow(
      'image projection identity mismatch',
    );

    const collision = imageIndex([
      projection('one', 'first', 'alias', 'alias:collision', 'alias:first'),
      projection('two', 'second', 'alias', 'alias:collision', 'alias:second'),
    ]);
    expect(() => controller.prepareReconcile(collision)).toThrow(
      'image binding key collision',
    );
    expect(renderer.operations).toEqual(operationsBefore);
    expect(controller.probe()).toEqual(before);
  });

  it('commits a prepared plan with the same ownership result as reconcile', () => {
    const preparedRenderer = new MockImageRenderer();
    const directRenderer = new MockImageRenderer();
    const preparedController = new PatchMapSceneImageController(preparedRenderer);
    const directController = new PatchMapSceneImageController(directRenderer);
    const initial = imageIndex([image('old-target', 'fixture-image', 'alias')]);
    const next = imageIndex([
      image('replacement-target', 'fixture-image', 'alias'),
      image('second', 'replacement-image', 'alias'),
    ]);
    preparedController.reconcile(initial);
    directController.reconcile(initial);

    const plan = preparedController.prepareReconcile(next);
    expect(preparedRenderer.operations).toEqual(directRenderer.operations);
    const preparedResult = preparedController.commitReconcile(plan);
    const directResult = directController.reconcile(next);

    expect(preparedResult).toEqual(directResult);
    expect(preparedController.probe()).toEqual(directController.probe());
    expect(preparedRenderer.operations).toEqual(directRenderer.operations);
  });

  it('rejects a prepared plan made stale by retry before any reconcile mutation', async () => {
    const renderer = new MockImageRenderer();
    const controller = new PatchMapSceneImageController(renderer);
    const key = 'alias:fixture-image';
    const index = imageIndex([image('image', 'fixture-image', 'alias')]);
    controller.reconcile(index);
    renderer.fail(key);
    await controller.settle();

    const plan = controller.prepareReconcile(index);
    expect(controller.retry('image')).toMatchObject({ status: 'started', generation: 2 });
    expect(() => controller.commitReconcile(plan)).toThrow('scene image reconcile plan is stale');
    expect(controller.imageProbe('image')).toMatchObject({
      generation: 2,
      bindingKey: key,
      state: 'pending',
    });
    expect(renderer.operations.filter((operation) => operation === `bind:${key}`)).toHaveLength(2);
  });

  it('tracks synchronous bridge failures without leaving a synchronous half-commit', async () => {
    const renderer = new MockImageRenderer();
    const controller = new PatchMapSceneImageController(renderer);
    const oldKey = 'alias:old-image';
    const replacementKey = 'alias:replacement-image';
    controller.reconcile(imageIndex([image('image', 'old-image', 'alias')]));
    renderer.resolve(oldKey);
    await controller.settle();

    const plan = controller.prepareReconcile(imageIndex([
      image('image', 'replacement-image', 'alias'),
    ]));
    renderer.imageProbeFailures = 1;
    renderer.unbindFailure = new Error('fixture sync unbind failed');
    renderer.bindFailure = new Error('fixture sync bind failed');
    renderer.bindingProbeFailures = 3;

    let result: ReturnType<PatchMapSceneImageController['commitReconcile']> | undefined;
    expect(() => {
      result = controller.commitReconcile(plan);
    }).not.toThrow();
    expect(result).toMatchObject({
      updated: ['image'],
      bindingsStarted: [replacementKey],
      bindingsRetired: [oldKey],
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(controller.imageProbe('image')).toMatchObject({
      generation: 2,
      bindingKey: replacementKey,
      state: 'failed',
      attachmentState: 'current',
    });
    await expect(controller.settle()).rejects.toThrow('scene image lifecycle failed');
  });

  it('rejects binding-key collisions before mutating renderer or controller state', () => {
    const renderer = new MockImageRenderer();
    const controller = new PatchMapSceneImageController(renderer);
    const collision = imageIndex([
      projection('one', 'first', 'alias', 'alias:collision', 'alias:first'),
      projection('two', 'second', 'alias', 'alias:collision', 'alias:second'),
    ]);

    expect(() => controller.reconcile(collision)).toThrow('image binding key collision');
    expect(renderer.operations).toEqual([]);
    expect(controller.probe().targetCount).toBe(0);
  });
});

function image(
  entityId: string,
  authoredSource: PatchMapAssetSource,
  sourceKind: PatchMapImageSourceKind,
): PatchMapImageProjection {
  if (sourceKind === 'alias') {
    const source = stringAssetSource(authoredSource, sourceKind);
    return projection(entityId, source, sourceKind, `alias:${source}`, `alias:${source}`);
  }
  if (sourceKind === 'url') {
    const source = stringAssetSource(authoredSource, sourceKind);
    return projection(entityId, source, sourceKind, `url:${source}`, `url:${source}`);
  }
  if (sourceKind === 'data-uri') {
    return projection(entityId, authoredSource, sourceKind, 'data:data-image', 'data:data-image');
  }
  return projection(entityId, authoredSource, sourceKind, 'descriptor:image-svg', 'descriptor:image-svg?resolution=2');
}

function projection(
  entityId: string,
  authoredSource: PatchMapAssetSource,
  sourceKind: PatchMapImageSourceKind,
  bindingKey: string,
  cacheIdentity: string,
  dimensionMode: PatchMapImageDimensionMode = 'authored',
): PatchMapImageProjection {
  return {
    entityId,
    authoredSource,
    sourceKind,
    bindingKey,
    cacheIdentity,
    authoredSize: true,
    dimensionMode,
  };
}

function imageIndex(images: readonly PatchMapImageProjection[]): PatchMapProjectionIndex {
  return createTestProjectionIndex({
    imagesByEntityId: Object.fromEntries(images.map((entry) => [entry.entityId, entry])),
  });
}

function sourceKind(request: LeafAssetBindingRequest): PatchMapImageSourceKind {
  if (request.kind === 'alias') return 'alias';
  if (typeof request.source !== 'string') return 'descriptor';
  return request.source.startsWith('data:') ? 'data-uri' : 'url';
}

function stringAssetSource(source: PatchMapAssetSource, kind: string): string {
  if (typeof source !== 'string') throw new TypeError(`${kind} fixture source must be a string`);
  return source;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function retainedPendingAttemptCount(controller: PatchMapSceneImageController): number {
  const bindings = (controller as unknown as {
    readonly bindings: ReadonlyMap<string, Readonly<{ readonly attempts: ReadonlySet<unknown> }>>;
  }).bindings;
  return [...bindings.values()].reduce((total, binding) => total + binding.attempts.size, 0);
}
