import {
  PATCH_MAP_EXTRACTION_SECURITY_REVISION,
  type PatchMapExtractionReadability,
  type PatchMapExtractionSecurityProbe,
} from './contracts';
import { boundedHash, controlledValue } from './redaction-values';

/**
 * Renderer-independent asset readability ledger. Asset loaders register only
 * logical ownership and readability; source URLs and bytes never enter it.
 */
export class PatchMapExtractionSecurityAuthority {
  private readonly assets = new Map<string, PatchMapExtractionReadability>();

  public setAssetReadability(
    logicalAssetId: string,
    readability: PatchMapExtractionReadability,
  ): void {
    const id = controlledValue(logicalAssetId, 'asset');
    if (!['readable', 'tainted', 'readback-failed'].includes(readability)) {
      throw new TypeError('Unknown PatchMap extraction readability');
    }
    this.assets.set(id, readability);
  }

  public deleteAsset(logicalAssetId: string): boolean {
    return this.assets.delete(controlledValue(logicalAssetId, 'asset'));
  }

  public clear(): void {
    this.assets.clear();
  }

  public preflight(): PatchMapExtractionSecurityProbe {
    let firstFailed: readonly [string, PatchMapExtractionReadability] | null = null;
    let unreadableAssetCount = 0;
    for (const entry of this.assets.entries()) {
      if (entry[1] === 'readable') continue;
      unreadableAssetCount += 1;
      if (firstFailed === null) firstFailed = entry;
    }
    const code = firstFailed === null
      ? null
      : firstFailed[1] === 'tainted'
        ? 'EXTRACTION_TAINTED'
        : 'EXTRACTION_READBACK_FAILED';
    return Object.freeze({
      revision: PATCH_MAP_EXTRACTION_SECURITY_REVISION,
      trackedAssetCount: this.assets.size,
      unreadableAssetCount,
      code,
      sanitizedAssetId: firstFailed === null
        ? null
        : `asset:${boundedHash(firstFailed[0])}`,
    });
  }
}
