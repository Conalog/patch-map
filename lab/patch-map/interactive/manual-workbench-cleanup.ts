export type PatchMapManualCleanupStep = () => void | Promise<void>;

/** Serialize async Lab ownership changes while allowing a failed action to release the queue. */
export function createPatchMapManualOperationQueue(): <T>(
  operation: () => T | Promise<T>,
) => Promise<T> {
  let tail: Promise<void> = Promise.resolve();
  return <T>(operation: () => T | Promise<T>): Promise<T> => {
    const pending = tail.then(operation, operation);
    tail = pending.then(
      () => undefined,
      () => undefined,
    );
    return pending;
  };
}

export async function settlePatchMapManualCleanup(
  steps: readonly PatchMapManualCleanupStep[],
): Promise<void> {
  let failure: Error | null = null;
  for (const step of steps) {
    try {
      await step();
    } catch (error) {
      failure ??= cleanupError(error);
    }
  }
  if (failure !== null) throw failure;
}

/** Release every owned resource, retaining only failures for a later cleanup retry. */
export async function releasePatchMapManualOwnedResources<T>(
  resources: T[],
  release: (resource: T) => void | Promise<void>,
): Promise<void> {
  let failure: Error | null = null;
  for (let index = resources.length - 1; index >= 0; index -= 1) {
    try {
      await release(resources[index]!);
      resources.splice(index, 1);
    } catch (error) {
      failure ??= cleanupError(error);
    }
  }
  if (failure !== null) throw failure;
}

export function patchMapManualKeyboardMutationAllowed(
  status: string,
  destroyRequested: boolean,
): boolean {
  return !destroyRequested && status !== 'booting' && status !== 'busy' && status !== 'destroyed';
}

function cleanupError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}
