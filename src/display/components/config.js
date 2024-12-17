import { THEME_CONFIG } from '../../configs/theme';

export const ICON_COMPONENT_CONFIG = {
  label: null,
  x: 0,
  y: 0,
  color: 'black',
  zIndex: 20,
  size: 16,
  frame: null,
  parent: null,
};

export const FRAME_COMPONENT_CONFIG = {
  label: null,
  x: 0,
  y: 0,
  width: null,
  height: null,
  parent: null,
};

export const BAR_COMPONENT_CONFIG = {
  label: null,
  color: 'black',
  minPercentHeight: 0,
  percentWidth: 1,
  percentHeight: 1,
  zIndex: 10,
  parent: null,
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
