import { describe, expect, it } from 'vitest';

import type { PatchMapEngineSurface } from '../../src/engine/contracts';
import { PatchMapPublicationAuthority } from '../../src/engine/publication-authority';
import { PatchMapSurfaceMutationGuard } from '../../src/engine/surface-mutation-guard';
import type { PatchMapLifecycle } from '../../src/engine/contracts/lifecycle';

describe('PatchMapSurfaceMutationGuard', () => {
  it('permits an interaction-only revision change for scene freshness only', () => {
    const publication = new PatchMapPublicationAuthority();
    const surface = Object.freeze({}) as PatchMapEngineSurface;
    const guard = new PatchMapSurfaceMutationGuard(publication, {
      lifecycle: () => 'scene-ready',
      liveSurface: () => surface,
    });
    const revisions = publication.revisionStamp();

    publication.advanceInteraction();

    expect(guard.sceneCurrent(surface, revisions)).toBe(true);
    expect(guard.mutationCurrent(surface, revisions)).toBe(false);
  });

  it('rejects lifecycle-generation mismatch for both freshness levels', () => {
    const publication = new PatchMapPublicationAuthority();
    const surface = Object.freeze({}) as PatchMapEngineSurface;
    const guard = new PatchMapSurfaceMutationGuard(publication, {
      lifecycle: () => 'scene-ready',
      liveSurface: () => surface,
    });
    const revisions = publication.revisionStamp();

    publication.advanceLifecycle();

    expect(guard.sceneCurrent(surface, revisions)).toBe(false);
    expect(guard.mutationCurrent(surface, revisions)).toBe(false);
  });

  it('rejects scene-revision mismatch for both freshness levels', () => {
    const publication = new PatchMapPublicationAuthority();
    const surface = Object.freeze({}) as PatchMapEngineSurface;
    const guard = new PatchMapSurfaceMutationGuard(publication, {
      lifecycle: () => 'scene-ready',
      liveSurface: () => surface,
    });
    const revisions = publication.revisionStamp();

    publication.advanceScene();

    expect(guard.sceneCurrent(surface, revisions)).toBe(false);
    expect(guard.mutationCurrent(surface, revisions)).toBe(false);
  });

  it('rejects a replaced surface and terminal lifecycle states', () => {
    const publication = new PatchMapPublicationAuthority();
    const surface = Object.freeze({}) as PatchMapEngineSurface;
    let lifecycle: PatchMapLifecycle = 'scene-ready';
    let liveSurface: PatchMapEngineSurface | null = surface;
    const guard = new PatchMapSurfaceMutationGuard(publication, {
      lifecycle: () => lifecycle,
      liveSurface: () => liveSurface,
    });

    liveSurface = Object.freeze({}) as PatchMapEngineSurface;
    expect(guard.sceneCurrent(surface, publication.revisionStamp())).toBe(false);

    liveSurface = surface;
    lifecycle = 'destroying';
    expect(guard.sceneCurrent(surface, publication.revisionStamp())).toBe(false);
    expect(guard.mutationCurrent(surface, publication.revisionStamp())).toBe(false);
  });
});
