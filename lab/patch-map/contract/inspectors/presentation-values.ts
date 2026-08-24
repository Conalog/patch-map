export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function observedValue(value: unknown): string {
  if (value === undefined) return '정보 없음';
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return String(value);
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '정보 없음';
  try {
    return JSON.stringify(value);
  } catch {
    return '정보 없음';
  }
}

export function setText(target: Element | null, value: string): void {
  if (target) target.textContent = value;
}

export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function recordAt(
  value: Readonly<Record<string, unknown>>,
  key: string,
): Readonly<Record<string, unknown>> | null {
  const nested = value[key];
  return isRecord(nested) ? nested : null;
}

export function stringField(
  value: Readonly<Record<string, unknown>> | null,
  key: string,
): string {
  return value && typeof value[key] === 'string' ? value[key] : '정보 없음';
}

export function numberField(
  value: Readonly<Record<string, unknown>> | null,
  key: string,
): string {
  return value && typeof value[key] === 'number' && Number.isFinite(value[key])
    ? String(value[key])
    : '정보 없음';
}
