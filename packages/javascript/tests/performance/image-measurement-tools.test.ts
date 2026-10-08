import { describe, expect, it, vi } from 'vitest';

interface Sampler {
  readonly samples: readonly unknown[];
  assertRunning(this: void): void;
  ready(this: void): Promise<void>;
  stop(this: void): Promise<void>;
}
interface SamplerRuntime {
  startFootprintSampler(this: void, rootPid: number, options: {
    executable: string;
    args: readonly string[];
    startupTimeoutMs?: number;
    stopTimeoutMs?: number;
  }): Sampler;
}
interface ReportRuntime {
  summarizeSamples(this: void, values: readonly number[], label: string, options?: {
    upperMedian?: boolean;
  }): { samples: readonly number[]; min: number; median: number; p95: number; max: number };
  hashText(this: void, bytes: string | Uint8Array): string;
}
const samplerRuntime = await import(/* @vite-ignore */ new URL(
  '../../performance/probes/image/sampler.mjs', import.meta.url,
).href) as SamplerRuntime;
const report = await import(/* @vite-ignore */ new URL(
  '../../performance/benchmark/report.mjs', import.meta.url,
).href) as ReportRuntime;
interface ObservationRuntime {
  observeImageWebGL(this: void): {
    readonly canvas: unknown;
    readonly readback: {
      calls: number; buffers: number; requestedBytes: number;
      minCapacityBytes: number | null; maxCapacityBytes: number;
    };
    readonly tileAllocations: readonly unknown[];
    restore(this: void): void;
  };
}
const observationRuntime = await import(/* @vite-ignore */ new URL(
  '../../performance/probes/image/webgl-observation.mjs', import.meta.url,
).href) as ObservationRuntime;

function sampler(script: string, startupTimeoutMs = 2_000): Sampler {
  return samplerRuntime.startFootprintSampler(process.pid, {
    executable: process.execPath, args: ['-e', script], startupTimeoutMs, stopTimeoutMs: 50,
  });
}

describe('shared image measurement tools', () => {
  it('counts reused edge views once and restores the canvas prototype after observation', () => {
    const nativeRead = vi.fn();
    const allocate = vi.fn();
    const gl = {
      readPixels: nativeRead, renderbufferStorageMultisample: allocate,
      getRenderbufferParameter: vi.fn(() => 4), RENDERBUFFER_SAMPLES: 0x8cab,
    };
    class Canvas {
      getContext(_kind: string, _options?: object) { return gl; }
    }
    const original = Canvas.prototype.getContext;
    vi.stubGlobal('HTMLCanvasElement', Canvas);
    const probe = observationRuntime.observeImageWebGL();
    try {
      const canvas = new Canvas();
      const context = canvas.getContext('webgl2', { depth: false });
      const pixels = new Uint8Array(16);
      context.readPixels(0, 0, 2, 2, 0, 0, pixels);
      context.readPixels(0, 0, 1, 1, 0, 0, pixels.subarray(0, 4));
      context.renderbufferStorageMultisample(0, 4, 0, 2, 2);
      expect(probe.canvas).toBe(canvas);
      expect(probe.readback).toEqual({
        calls: 2, buffers: 1, requestedBytes: 20, minCapacityBytes: 4, maxCapacityBytes: 16,
      });
      expect(probe.tileAllocations).toEqual([{ requestedSamples: 4, samples: 4, width: 2, height: 2 }]);
      expect(nativeRead).toHaveBeenCalledTimes(2);
      expect(allocate).toHaveBeenCalledWith(0, 4, 0, 2, 2);
    } finally {
      probe.restore();
      expect(Canvas.prototype.getContext).toBe(original);
      vi.unstubAllGlobals();
    }
  });

  it('preserves report and image median conventions, signed samples, and input order', () => {
    const values = [7, -2, 3, 1];
    expect(report.summarizeSamples(values, 'heap delta')).toEqual({
      samples: values, min: -2, median: 1, p95: 7, max: 7,
    });
    expect(report.summarizeSamples(values, 'image', { upperMedian: true }).median).toBe(3);
    expect(values).toEqual([7, -2, 3, 1]);
    expect(report.summarizeSamples([7, 1, 3], 'odd').median).toBe(3);
    expect(() => report.summarizeSamples([], 'empty')).toThrow(/finite samples/u);
    expect(() => report.summarizeSamples([NaN], 'invalid')).toThrow(/finite samples/u);
    expect(report.hashText(new TextEncoder().encode('image'))).toBe(report.hashText('image'));
  });

  it('reads split JSON lines and stops idempotently', async () => {
    const probe = sampler(`process.stdout.write('{"epoch');
      setTimeout(() => process.stdout.write('Ms":1}\\n'), 20); setInterval(() => {}, 1000);`);
    try {
      await probe.ready();
      expect(probe.samples).toEqual([{ epochMs: 1 }]);
    } finally { await probe.stop(); }
    await probe.stop();
  });

  it('rejects early sampler exit with stderr instead of waiting for a sample forever', async () => {
    const probe = sampler('process.stderr.write("native sampler failed"); process.exit(2);');
    try { await expect(probe.ready()).rejects.toThrow(/native sampler failed/u); }
    finally { await probe.stop(); }
  });

  it('rejects process spawn failure and still completes cleanup', async () => {
    const probe = samplerRuntime.startFootprintSampler(process.pid, {
      executable: '/__patch_map_missing_sampler__', args: [], startupTimeoutMs: 100,
    });
    try { await expect(probe.ready()).rejects.toThrow(/ENOENT/u); }
    finally { await probe.stop(); }
  });

  it('bounds silent startup and kills a child that ignores termination', async () => {
    const probe = sampler('process.on("SIGTERM", () => {}); setInterval(() => {}, 1000);', 200);
    try { await expect(probe.ready()).rejects.toThrow(/timed out/u); }
    finally { await probe.stop(); }
  });

  it('reports malformed sampler output without an unhandled stream exception', async () => {
    const probe = sampler('console.log("invalid JSON"); setInterval(() => {}, 1000);');
    try { await expect(probe.ready()).rejects.toThrow(/sampler failed/u); }
    finally { await probe.stop(); }
  });

  it('detects sampler failure after startup rather than accepting truncated measurements', async () => {
    const probe = sampler('console.log("{}"); setTimeout(() => process.exit(2), 100);');
    try {
      await probe.ready();
      await expect.poll(() => {
        try { probe.assertRunning(); return false; } catch { return true; }
      }).toBe(true);
    } finally { await probe.stop(); }
  });
});
