const FIRA_CODE_URL = new URL('../resources/fonts/FiraCode-VF.woff2', import.meta.url).href;

export function builtinFiraCodeUrl(): string {
  return FIRA_CODE_URL;
}
