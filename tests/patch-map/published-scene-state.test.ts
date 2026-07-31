import { describe, expect, it } from 'vitest';

import {
  PatchMapPublishedSceneAuthority,
  freezePatchMapPublishedSceneState,
  type PatchMapPublishedSceneState,
} from '../../src/patch-map/core/published-scene-state';
import { NoopRenderer } from '../../src/patch-map/dense/noop-renderer';
import { PatchMapScene } from '../../src/patch-map/scene';

describe('PatchMap published scene authority', () => {
  it('prepares privately and publishes all scene fields with one frozen reference swap', () => {
    const initial = emptyState(scene());
    const next = freezePatchMapPublishedSceneState({
      ...initial,
      scene: scene(),
      entityCount: 3,
    });
    const authority = new PatchMapPublishedSceneAuthority(initial);

    const candidate = authority.prepare(next);

    expect(authority.current()).toBe(initial);
    expect(Object.isFrozen(candidate)).toBe(true);
    expect(Object.isFrozen(candidate.state)).toBe(true);

    const previous = authority.publish(candidate);

    expect(authority.current()).toBe(candidate.state);
    expect(authority.current()).toMatchObject({
      entityCount: 3,
    });
    expect(authority.discard(previous.previous)).toBe(true);
    expect(previous.previous.scene.destroy()).toBe(false);
    expect(candidate.state.scene.destroy()).toBe(true);
  });

  it('restores the exact previous reference before discarding a failed candidate', () => {
    const initial = emptyState(scene());
    const authority = new PatchMapPublishedSceneAuthority(initial);
    const candidate = authority.prepare({
      ...initial,
      scene: scene(),
      entityCount: 8,
    });
    const previous = authority.publish(candidate);

    authority.restore(previous);

    expect(authority.current()).toBe(previous.previous);
    expect(authority.current()).toBe(initial);
    expect(authority.discard(candidate.state)).toBe(true);
    expect(candidate.state.scene.destroy()).toBe(false);
    expect(initial.scene.destroy()).toBe(true);
  });

  it('rejects a candidate when another publication supersedes its expected state', () => {
    const initial = emptyState(scene());
    const candidateScene = scene();
    const authority = new PatchMapPublishedSceneAuthority(initial);
    const stale = authority.prepare({
      ...initial,
      scene: candidateScene,
      entityCount: 1,
    });

    authority.update({ entityCount: 2 });

    expect(() => authority.publish(stale)).toThrowError(
      'PatchMap published scene candidate was superseded',
    );
    expect(authority.current().entityCount).toBe(2);
    expect(candidateScene.destroy()).toBe(true);
    expect(initial.scene.destroy()).toBe(true);
  });
});

function scene(): PatchMapScene {
  return new PatchMapScene({ renderer: new NoopRenderer() });
}

function emptyState(sceneValue: PatchMapScene): PatchMapPublishedSceneState {
  return freezePatchMapPublishedSceneState({
    scene: sceneValue,
    parse: null,
    projection: null,
    ownedInputDataset: null,
    ownedParseOptionsKey: null,
    transientIncrementalParse: null,
    componentTargets: new Map(),
    textTargets: new Map(),
    entityCount: 0,
  });
}
