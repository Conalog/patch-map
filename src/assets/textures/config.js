import { THEME_CONFIG } from '../../config/theme';

export const FRAME_CONFIG = {
  size: {
    width: 40,
    height: 40,
  },
  options: {
    fill: THEME_CONFIG.white,
    borderWidth: 2,
    borderColor: THEME_CONFIG.black,
    radius: 6,
    defaultWidth: 40,
    defaultHeight: 40,
  },
};

export const BAR_CONFIG = {
  options: {
    fill: THEME_CONFIG.white,
    borderWidth: 0,
    borderColor: THEME_CONFIG.black,
    radius: 3,
    defaultWidth: 40,
    defaultHeight: 40,
  },
};
