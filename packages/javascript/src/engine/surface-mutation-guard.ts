import type { PatchMapEngineSurface } from './contracts';
import type {
  PatchMapLifecycle,
  PatchMapRevisionStamp,
} from './contracts/lifecycle';
import type { PatchMapPublicationAuthority } from './publication-authority';

export interface PatchMapSurfaceMutationGuardPort {
  readonly lifecycle: () => PatchMapLifecycle;
  readonly liveSurface: () => PatchMapEngineSurface | null;
}

/**
 * Owns the freshness boundary for every surface mutation. A scene-current
 * check permits interaction-only changes before reconcile starts; a fully
 * mutation-current check requires the complete published revision tuple.
 */
export class PatchMapSurfaceMutationGuard {
  public constructor(
    private readonly publication: PatchMapPublicationAuthority,
    private readonly port: PatchMapSurfaceMutationGuardPort,
  ) {}

  public mutationCurrent(
    surface: PatchMapEngineSurface,
    revisions: PatchMapRevisionStamp,
  ): boolean {
    return this.lifecycleAcceptsMutations() &&
      this.port.liveSurface() === surface &&
      this.publication.lifecycleGeneration === revisions.lifecycleGeneration &&
      this.publication.sceneRevision === revisions.sceneRevision &&
      this.publication.interactionRevision === revisions.interactionRevision;
  }

  public sceneCurrent(
    surface: PatchMapEngineSurface,
    revisions: PatchMapRevisionStamp,
  ): boolean {
    return this.lifecycleAcceptsMutations() &&
      this.port.liveSurface() === surface &&
      this.publication.lifecycleGeneration === revisions.lifecycleGeneration &&
      this.publication.sceneRevision === revisions.sceneRevision;
  }

  private lifecycleAcceptsMutations(): boolean {
    const lifecycle = this.port.lifecycle();
    return lifecycle !== 'destroyed' && lifecycle !== 'destroying';
  }
}
