const SVG_OPEN = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"',
  ' fill="none" stroke="#fff" stroke-width="2.5"',
  ' stroke-linecap="round" stroke-linejoin="round">',
].join('');

function glyph(body: string): string {
  return `${SVG_OPEN}${body}</svg>`;
}

/**
 * Package-owned monochrome glyphs. White artwork keeps Pixi Sprite.tint
 * multiplicative, while the transparent canvas preserves each icon's
 * silhouette instead of painting a fallback tile behind it.
 */
export const BUILTIN_IMAGE_SVGS = Object.freeze({
  object: glyph([
    '<path d="M5.5 10.5 16 5l10.5 5.5v11L16 27 5.5 21.5Z"/>',
    '<path d="m5.5 10.5 10.5 5 10.5-5M16 15.5V27"/>',
  ].join('')),
  inverter: glyph([
    '<rect x="5" y="3.5" width="22" height="25" rx="3.5"/>',
    '<path d="M9 15c1.7-4.5 3.8-4.5 5.5 0s3.8 4.5 5.5 0 3.8-4.5 5.5 0"/>',
    '<path d="M10 23.5h12"/>',
    '<circle cx="10" cy="8.5" r="1" fill="#fff" stroke="none"/>',
  ].join('')),
  combiner: glyph([
    '<rect x="5" y="4" width="22" height="24" rx="3"/>',
    '<path d="M9 9v4l7 4M16 8v9M23 9v4l-7 4M16 17v6"/>',
    '<circle cx="9" cy="8" r="1.5" fill="#fff" stroke="none"/>',
    '<circle cx="16" cy="7" r="1.5" fill="#fff" stroke="none"/>',
    '<circle cx="23" cy="8" r="1.5" fill="#fff" stroke="none"/>',
    '<circle cx="16" cy="24.5" r="1.5" fill="#fff" stroke="none"/>',
  ].join('')),
  device: glyph([
    '<rect x="4" y="5" width="24" height="17" rx="2.5"/>',
    '<path d="M11 27h10M16 22v5"/>',
    '<path d="m9 15 4-4M19 17l4-4"/>',
  ].join('')),
  edge: glyph([
    '<circle cx="7" cy="16" r="3.5"/>',
    '<circle cx="25" cy="8" r="3.5"/>',
    '<circle cx="25" cy="24" r="3.5"/>',
    '<path d="m10.5 14.5 11-5M10.5 17.5l11 5"/>',
  ].join('')),
  loading: glyph([
    '<path d="M16 4a12 12 0 0 1 11.3 8"/>',
    '<path d="M28 16a12 12 0 0 1-8 11.3" opacity=".8"/>',
    '<path d="M16 28a12 12 0 0 1-11.3-8" opacity=".55"/>',
    '<path d="M4 16a12 12 0 0 1 8-11.3" opacity=".3"/>',
  ].join('')),
  warning: glyph([
    '<path d="M16 4 29 27H3Z"/>',
    '<path d="M16 11v8"/>',
    '<circle cx="16" cy="23" r="1.4" fill="#fff" stroke="none"/>',
  ].join('')),
  wifi: glyph([
    '<path d="M4.5 12.5a17.2 17.2 0 0 1 23 0"/>',
    '<path d="M8.5 17a11.2 11.2 0 0 1 15 0"/>',
    '<path d="M12.5 21.5a5.3 5.3 0 0 1 7 0"/>',
    '<circle cx="16" cy="26" r="1.8" fill="#fff" stroke="none"/>',
  ].join('')),
});

export type BuiltinImageAlias = keyof typeof BUILTIN_IMAGE_SVGS;

export function builtinImageSvg(alias: BuiltinImageAlias): string {
  return BUILTIN_IMAGE_SVGS[alias];
}
