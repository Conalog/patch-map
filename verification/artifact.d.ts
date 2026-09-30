/** Repository-only installed consumer evidence; this is not a product API. */
export interface InstalledConsumerReport {
  schemaRevision: string;
  artifactSha256: string;
  artifactPath: string;
  installedConsumer: boolean;
  contractFingerprint: string;
  assertions: string[];
  files: { path: string; bytes: number; sha256: string }[];
}
