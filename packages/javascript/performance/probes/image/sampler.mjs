import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { hashText } from '../../benchmark/report.mjs';

/** Include shared measurement code in both runners' frozen provenance. */
export async function measurementHelperDigests() {
  return Object.fromEntries(await Promise.all([
    './sampler.mjs', './sample.py', './webgl-observation.mjs', '../../benchmark/report.mjs',
  ].map(async name => [name, hashText(await readFile(new URL(name, import.meta.url)))])));
}

/** Own the native sampler's stream, bounded startup, and process cleanup. */
export function startFootprintSampler(rootPid, {
  executable = 'python3',
  args = [fileURLToPath(new URL('./sample.py', import.meta.url)), String(rootPid)],
  startupTimeoutMs = 10_000,
  stopTimeoutMs = 1_000,
} = {}) {
  const child = spawn(executable, args);
  const samples = [];
  let buffer = '';
  let stderr = '';
  let failure = null;
  let ended = false;
  const closed = new Promise(resolve => child.once('close', () => {
    ended = true;
    resolve();
  }));
  child.on('error', error => { failure = error; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  child.stdout.on('data', chunk => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop();
    try {
      for (const line of lines) if (line) samples.push(JSON.parse(line));
    } catch (error) {
      failure = error;
      child.kill('SIGTERM');
    }
  });
  const assertRunning = () => {
    if (failure || ended) {
      throw new Error(`sampler failed: ${failure?.message ?? `exited ${child.exitCode}`} ${stderr}`);
    }
  };
  return {
    samples,
    assertRunning,
    async ready() {
      const started = Date.now();
      for (;;) {
        assertRunning();
        if (samples.length) return;
        if (Date.now() - started >= startupTimeoutMs) {
          throw new Error(`sampler startup timed out: ${stderr}`);
        }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    },
    async stop() {
      if (ended) return;
      child.kill('SIGTERM');
      const timer = setTimeout(() => child.kill('SIGKILL'), stopTimeoutMs);
      try { await closed; } finally { clearTimeout(timer); }
    },
  };
}
