import { THEME_CONFIG } from '../../config/theme';

export const ICON_COMPONENT_CONFIG = {
  x: 0,
  y: 0,
  zIndex: 20,
  size: 16,
  color: 'black',
};

export const FRAME_COMPONENT_CONFIG = {
  x: 0,
  y: 0,
  width: null,
  height: null,
};

export const BAR_COMPONENT_CONFIG = {
  color: 'black',
  minPercentHeight: 0.1,
  percentWidth: 1,
  percentHeight: 1,
  zIndex: 10,
};

export const TEXT_COMPONENT_CONFIG = {
  style: {
    fontFamily: 'Fira Code',
    fontWeight: 400,
    fill: THEME_CONFIG.black,
    fontSize: 16,
  },
  zIndex: 20,
  split: 4,
};

export const FONT_WEIGHT = {
  100: 'Thin',
  200: 'ExtraLight',
  300: 'Light',
  400: 'Regular',
  500: 'Medium',
  600: 'SemiBold',
  700: 'Bold',
  800: 'Extra-Bold',
  900: 'Black',
  thin: 'Thin',
  extralight: 'ExtraLight',
  light: 'Light',
  regular: 'Regular',
  medium: 'Medium',
  semibold: 'SemiBold',
  bold: 'Bold',
  extrabold: 'Extra-Bold',
  black: 'Black',
};
