export function createLongTaskObserver(
  durations: number[],
): PerformanceObserver | null {
  if (typeof PerformanceObserver !== 'function') return null;
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) durations.push(entry.duration);
    });
    observer.observe({ entryTypes: ['longtask'] });
    return observer;
  } catch {
    return null;
  }
}

export async function forceGc(): Promise<void> {
  window.gc?.();
  await Promise.resolve();
  window.gc?.();
}

export function usedHeap(): number {
  const memory = (
    performance as Performance & {
      memory?: Readonly<{ usedJSHeapSize: number }>;
    }
  ).memory;
  return memory?.usedJSHeapSize ?? 0;
}

export function heapMethod(): string {
  return typeof window.gc === 'function' && usedHeap() > 0
    ? 'performance.memory after exposed GC'
    : 'unavailable';
}

export function nextAnimationFrame(): Promise<number> {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

export function requiredElement<ElementType extends HTMLElement>(
  id: string,
): ElementType {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing benchmark element #${id}`);
  }
  return element as ElementType;
}

export function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}
