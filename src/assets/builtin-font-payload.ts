const FIRA_CODE_URLS = Object.freeze({
  300: new URL('../resources/fonts/FiraCode-Light.woff2', import.meta.url).href,
  400: new URL('../resources/fonts/FiraCode-Regular.woff2', import.meta.url).href,
  500: new URL('../resources/fonts/FiraCode-Medium.woff2', import.meta.url).href,
  600: new URL('../resources/fonts/FiraCode-SemiBold.woff2', import.meta.url).href,
  700: new URL('../resources/fonts/FiraCode-Bold.woff2', import.meta.url).href,
});

export function builtinFiraCodeUrl(fontWeight: 300 | 400 | 500 | 600 | 700): string {
  return FIRA_CODE_URLS[fontWeight];
}
