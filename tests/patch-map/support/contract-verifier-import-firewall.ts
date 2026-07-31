interface VerifierImportFirewallModule {
  assertVerifierEntryImportFirewall(options: Readonly<{
    contractRoot: string | URL;
    entryFile: string | URL;
    role: 'handler' | 'fold';
  }>): Promise<void>;
}

const contractRoot = new URL(
  '../../../scripts/verification/core-v2-contract/',
  import.meta.url,
);

const { assertVerifierEntryImportFirewall } = await import(
  '../../../scripts/verification/core-v2-contract/verifier-import-firewall.mjs'
) as unknown as VerifierImportFirewallModule;

export async function assertCommittedVerifierEntryImportFirewall(
  relativePath: string,
  role: 'handler' | 'fold',
): Promise<void> {
  await assertVerifierEntryImportFirewall({
    contractRoot,
    entryFile: new URL(relativePath, contractRoot),
    role,
  });
}
