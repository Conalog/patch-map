export const UPDATE_STAGES = Object.freeze({
  RENDER: 0,
  CHILD_RENDER: 10,
  VISUAL: 20,
  ANIMATION: 25,
  SIZE: 30,
  WORLD_TRANSFORM: 35,
  LAYOUT: 40,
});

export const ROTATION_THRESHOLD = {
  MIN: 90,
  MAX: 270,
};

export const FONT_WEIGHT = {
  STRING: {
    100: 'thin',
    200: 'extralight',
    300: 'light',
    400: 'regular',
    500: 'medium',
    600: 'semibold',
    700: 'bold',
    800: 'extrabold',
    900: 'black',
    thin: 'thin',
    extralight: 'extralight',
    light: 'light',
    regular: 'regular',
    medium: 'medium',
    semibold: 'semibold',
    bold: 'bold',
    extrabold: 'extrabold',
    black: 'black',
  },
  NUMBER: {
    100: '100',
    200: '200',
    300: '300',
    400: '400',
    500: '500',
    600: '600',
    700: '700',
    800: '800',
    900: '900',
    thin: '100',
    extralight: '200',
    light: '300',
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    extrabold: '800',
    black: '900',
  },
};

export const ZERO_MARGIN = Object.freeze({
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
});

export const DEFAULT_AUTO_FONT_RANGE = { min: 1, max: 100 };

export const DEFAULT_TEXTSTYLE = {
  fontFamily: 'FiraCode',
  fill: 'black',
  fontWeight: 400,
};

export const DEFAULT_PATHSTYLE = { color: 'black' };
