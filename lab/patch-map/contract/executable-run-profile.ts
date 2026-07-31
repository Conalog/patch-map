import {
  PATCH_MAP_EXECUTABLE_CLOCK_PROFILE,
  PATCH_MAP_EXECUTABLE_PROFILE_ENVIRONMENT,
  type PatchMapExecutableCasePlan,
} from './executable-cases';
import { deepFreezePatchMapLabValue as deepFreeze } from './runtime-values';

const EXECUTABLE_RUNNER_REVISION = 'core-v2-executable-lab-runner/1';

export class ExecutableLabClock {
  private current = PATCH_MAP_EXECUTABLE_CLOCK_PROFILE.startMs;

  public now(): number {
    return this.current;
  }

  public advanceTo(timeMs: number): Promise<void> {
    invariant(Number.isFinite(timeMs) && timeMs >= this.current, 'manual clock cannot rewind');
    this.current = timeMs;
    return Promise.resolve();
  }

  public withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeout = globalThis.setTimeout(() => {
        reject(new Error(`PatchMap executable Lab timed out: ${label}`));
      }, timeoutMs);
      promise.then(
        (value) => {
          globalThis.clearTimeout(timeout);
          resolve(value);
        },
        (error: unknown) => {
          globalThis.clearTimeout(timeout);
          reject(error instanceof Error ? error : new Error(String(error)));
        },
      );
    });
  }
}

export function freshCasePlan(plan: PatchMapExecutableCasePlan): PatchMapExecutableCasePlan {
  return deepFreeze(structuredClone(plan));
}

export function defaultProvenance(
  plan: PatchMapExecutableCasePlan,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    source: 'focused-lab-product-source',
    codeCommit: 'unbound-worktree-source',
    packedPackageSha256: 'not-packed-source-lab',
    fixtureSha256: plan.fixtureSha256,
    runnerRevision: EXECUTABLE_RUNNER_REVISION,
    promotionEligible: false,
  });
}

export function defaultEnvironment(
  plan: PatchMapExecutableCasePlan,
): Readonly<Record<string, unknown>> {
  const userAgent = typeof navigator === 'undefined' ? 'unit-or-non-browser' : navigator.userAgent;
  return deepFreeze({
    ...structuredClone(PATCH_MAP_EXECUTABLE_PROFILE_ENVIRONMENT),
    backend: 'webgl2',
    browser: userAgent,
    browserVersion: userAgent,
    route: plan.route,
    datasetSize: plan.routeParams.size,
    seed: plan.routeParams.seed,
    canvasLifetime: 'transient-until-executor-cleanup',
  });
}

function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid PatchMap executable Lab bridge: ${message}`);
}
