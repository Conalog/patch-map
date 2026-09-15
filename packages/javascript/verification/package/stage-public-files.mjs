import { copyFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PUBLIC_DOCS } from './artifact-policy.mjs';

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
const workspaceRoot = path.resolve(packageRoot, '../..');

// The workspace owns editable contracts; this allowlisted copy is pack input only.
await rm(path.join(packageRoot, 'docs'), { recursive: true, force: true });
for (const relativePath of [...PUBLIC_DOCS, 'LICENSE']) {
  const destination = path.join(packageRoot, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(path.join(workspaceRoot, relativePath), destination);
}
