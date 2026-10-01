import type { FrameDriver } from './contracts';

export function browserFrameDriver(): FrameDriver {
  const fallback = fallbackFrameDriver();
  const request = globalThis.requestAnimationFrame;
  const cancel = globalThis.cancelAnimationFrame;
  if (typeof request !== 'function' || typeof cancel !== 'function') return fallback;
  return {
    now: () => globalThis.performance?.now() ?? Date.now(),
    request: (callback) => request(callback),
    cancel: (handle) => cancel(handle),
  };
}

function fallbackFrameDriver(): FrameDriver {
  let nextHandle = 1;
  const timers = new Map<number, ReturnType<typeof setTimeout>>();
  return {
    now: () => globalThis.performance?.now() ?? Date.now(),
    request: (callback) => {
      const handle = nextHandle++;
      const timer = setTimeout(() => {
        timers.delete(handle);
        callback(globalThis.performance?.now() ?? Date.now());
      }, 16);
      timers.set(handle, timer);
      return handle;
    },
    cancel: (handle) => {
      const timer = timers.get(handle);
      if (timer) clearTimeout(timer);
      timers.delete(handle);
    },
  };
}
