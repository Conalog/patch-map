export type PatchMapManualCleanupStep = () => void | Promise<void>;

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

function cleanupError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}
