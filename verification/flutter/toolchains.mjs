import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = fileURLToPath(new URL('../../', import.meta.url));
const packagePath = (root, name) => resolve(root, 'packages/flutter', name);
const VERSION = /^\d+\.\d+\.\d+$/u;
const REVISION = /^[a-f0-9]{40}$/u;

export function readToolchains(root = workspaceRoot) {
  const toolchains = JSON.parse(readFileSync(packagePath(root, 'toolchains.json'), 'utf8'));
  for (const role of ['ci', 'service']) {
    const sdk = toolchains[role];
    if (!sdk || !VERSION.test(sdk.flutter) || !VERSION.test(sdk.dart)
        || sdk.channel !== 'stable' || !REVISION.test(sdk.frameworkRevision)) {
      throw new Error(`Invalid ${role} SDK: record stable Flutter/Dart versions and framework revision`);
    }
  }
  return toolchains;
}

export function assertFvmPin(root, toolchains) {
  const pin = JSON.parse(readFileSync(packagePath(root, '.fvmrc'), 'utf8'));
  if (pin.flutter !== toolchains.ci.flutter) {
    throw new Error('.fvmrc is stale; run node verification/flutter/toolchains.mjs sync-fvm');
  }
}

export function syncFvmPin(root, toolchains) {
  const path = packagePath(root, '.fvmrc');
  const pin = JSON.parse(readFileSync(path, 'utf8'));
  writeFileSync(path, `${JSON.stringify({ ...pin, flutter: toolchains.ci.flutter }, null, 2)}\n`);
}

export function identifyToolchain(sdk, toolchains, expectedRole) {
  const roles = expectedRole ? [expectedRole] : ['ci', 'service'];
  const role = roles.find((name) => {
    const expected = toolchains[name];
    return expected && expected.flutter === sdk.frameworkVersion && expected.dart === sdk.dartSdkVersion
      && expected.frameworkRevision === sdk.frameworkRevision;
  });
  if (!role || expectedRole && role !== expectedRole) {
    throw new Error(`Unqualified SDK ${sdk.frameworkVersion}/${sdk.dartSdkVersion}/${sdk.frameworkRevision}; expected ${expectedRole ?? 'a recorded CI or service SDK'}`);
  }
  return role;
}

function main() {
  const [command, role] = process.argv.slice(2);
  const toolchains = readToolchains();
  if (command === 'sync-fvm') {
    syncFvmPin(workspaceRoot, toolchains);
    return;
  }
  assertFvmPin(workspaceRoot, toolchains);
  if (command === 'check') {
    if (!['ci', 'service'].includes(role)) throw new Error('check requires ci or service');
    const sdk = JSON.parse(execFileSync(process.env.FLUTTER_BIN ?? 'flutter', ['--version', '--machine'], { encoding: 'utf8' }));
    identifyToolchain(sdk, toolchains, role);
    console.log(`Verified ${role} SDK ${sdk.frameworkVersion}/${sdk.dartSdkVersion}/${sdk.frameworkRevision}`);
    return;
  }
  if (!['ci', 'service'].includes(command)) throw new Error('usage: toolchains.mjs ci | service | check <role> | sync-fvm');
  const sdk = toolchains[command];
  console.log(`flutter-version=${sdk.flutter}\ndart-version=${sdk.dart}\nflutter-channel=${sdk.channel}\nframework-revision=${sdk.frameworkRevision}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
