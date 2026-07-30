import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const scriptPath = fileURLToPath(
  new URL(
    '../../scripts/verification/patch-map-native-release-negative-probes.mjs',
    import.meta.url,
  ),
);

describe('PatchMap native release readiness', () => {
  it('accepts a complete digest-bound manifest and rejects release drift', () => {
    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: process.cwd(),
      encoding: 'utf8',
      timeout: 30_000,
    });

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain(
      'PASS: local commit binding + native release positive proof + 15 negative drift probes',
    );
  }, 35_000);
});
