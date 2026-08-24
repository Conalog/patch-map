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

const firewallNamespace: unknown = await import(
  /* @vite-ignore */ new URL(
    '../../../scripts/verification/core-v2-contract/verifier-import-firewall.mjs',
    import.meta.url,
  ).href
);
const { assertVerifierEntryImportFirewall } =
  firewallNamespace as VerifierImportFirewallModule;

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
