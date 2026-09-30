const FIRA_CODE_URL = new URL('../resources/fonts/FiraCode-VF.woff2', import.meta.url).href;
let resolvedFiraCodeUrl: Promise<string> | undefined;

export function builtinFiraCodeUrl(): Promise<string> {
  resolvedFiraCodeUrl ??= resolveFiraCodeUrl();
  return resolvedFiraCodeUrl;
}

async function resolveFiraCodeUrl(): Promise<string> {
  if (typeof fetch === 'function') {
    try {
      const response = await fetch(FIRA_CODE_URL, {
        headers: { Range: 'bytes=0-0' },
        credentials: 'omit',
      });
      const mediaType = response.headers.get('content-type')?.split(';', 1)[0]?.trim();
      await response.arrayBuffer();
      if (
        response.ok
        && !response.redirected
        && mediaType?.startsWith('font/') === true
      ) return FIRA_CODE_URL;
    } catch {
      // A relocated module URL falls through to the package-owned data module.
    }
  }
  try {
    const fallback = await import('patch-map-builtin-font-data');
    return fallback.default;
  } catch {
    return FIRA_CODE_URL;
  }
}
