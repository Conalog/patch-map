import {
  PATCH_MAP_ASSET_RUNTIME,
  type PatchMapAssetAcquisition,
  type PatchMapAssetPolicy,
  type PatchMapAssetRuntime,
  type PatchMapAssetRuntimeProbe,
  type PatchMapAssetSession,
  type PatchMapAssetSessionProbe,
} from '../assets';

/**
 * Owns the engine asset runtime, policy, session, and durable required leases.
 * PatchMap remains the lifecycle and public-error coordinator, while surfaces
 * receive the exact session identity owned here.
 */
export class PatchMapAssetSessionAuthority {
  private readonly requiredAcquisitions: PatchMapAssetAcquisition[] = [];
  private sessionValue: PatchMapAssetSession | null = null;

  public constructor(
    private readonly runtime: PatchMapAssetRuntime = PATCH_MAP_ASSET_RUNTIME,
    private readonly policy: PatchMapAssetPolicy | undefined = undefined,
  ) {}

  public ensureSession(
    instanceId: string,
    initializedInstanceId: string | null,
  ): PatchMapAssetSession | null {
    const session = this.sessionValue;
    if (session !== null) {
      return session.instanceId === instanceId ? session : null;
    }
    if (initializedInstanceId !== null && initializedInstanceId !== instanceId) {
      return null;
    }
    this.sessionValue = this.runtime.createSession({
      instanceId,
      ...(this.policy === undefined ? {} : { policy: this.policy }),
    });
    return this.sessionValue;
  }

  public acquire(alias: string): Promise<PatchMapAssetAcquisition> | null {
    return this.sessionValue?.acquire(alias) ?? null;
  }

  public sessionProbe(): PatchMapAssetSessionProbe | null {
    return this.sessionValue?.probe() ?? null;
  }

  public probe(alias?: string): Readonly<{
    session: PatchMapAssetSessionProbe | null;
    runtime: PatchMapAssetRuntimeProbe;
  }> {
    return Object.freeze({
      session: this.sessionProbe(),
      runtime: this.runtime.probe(alias),
    });
  }

  public adoptRequiredAcquisitions(
    acquisitions: readonly PatchMapAssetAcquisition[],
  ): void {
    this.requiredAcquisitions.push(...acquisitions);
  }

  public releaseInitializationAcquisitions(
    acquisitions: readonly PatchMapAssetAcquisition[],
  ): Promise<PromiseSettledResult<void>[]> {
    return Promise.allSettled(
      acquisitions.map(async (acquisition) => acquisition.release()),
    );
  }

  public async destroy(): Promise<void> {
    const session = this.sessionValue;
    const requiredAcquisitions = this.requiredAcquisitions.splice(0);
    if (session !== null) {
      await session.destroy();
    } else {
      const settlements = await this.releaseInitializationAcquisitions(
        requiredAcquisitions,
      );
      if (hasRejectedSettlement(settlements)) {
        throw new Error('PatchMap required asset cleanup failed');
      }
    }
  }

  public completeDestroy(cleanupSucceeded: boolean): void {
    if (cleanupSucceeded) this.sessionValue = null;
  }

  public async retryCleanup(): Promise<void> {
    const session = this.sessionValue;
    if (session === null) return;
    if (session.probe().destroyed) await session.retryCleanup();
    else await session.destroy();
    if (this.sessionValue === session) this.sessionValue = null;
  }
}

function hasRejectedSettlement(
  settlements: readonly PromiseSettledResult<unknown>[],
): boolean {
  for (const settlement of settlements) {
    if (settlement.status === 'rejected') return true;
  }
  return false;
}
