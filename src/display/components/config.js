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
    fontFamily: "'Fira Code'",
    fill: THEME_CONFIG.black,
    fontSize: 16,
    fontWeight: '600',
    align: 'center',
  },
  label: null,
  zIndex: 20,
};
