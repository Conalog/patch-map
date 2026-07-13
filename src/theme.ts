export interface PatchmapTheme {
  primary: {
    default: string;
    dark: string;
    accent: string;
  };
  gray: {
    light: string;
    default: string;
    dark: string;
  };
  white: string;
  black: string;
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export const DEFAULT_THEME: Readonly<PatchmapTheme> = Object.freeze({
  primary: Object.freeze({
    default: '#0C73BF',
    dark: '#083967',
    accent: '#EF4444',
  }),
  gray: Object.freeze({
    light: '#9EB3C3',
    default: '#D9D9D9',
    dark: '#71717A',
  }),
  white: '#FFFFFF',
  black: '#1A1A1A',
});

export const materializeTheme = (
  partial: DeepPartial<PatchmapTheme> = {},
): PatchmapTheme => ({
  primary: {
    ...DEFAULT_THEME.primary,
    ...partial.primary,
  },
  gray: {
    ...DEFAULT_THEME.gray,
    ...partial.gray,
  },
  white: partial.white ?? DEFAULT_THEME.white,
  black: partial.black ?? DEFAULT_THEME.black,
});
