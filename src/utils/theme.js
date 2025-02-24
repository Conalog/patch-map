let theme = {
  primary: {
    default: '#0C73BF',
    dark: '#083967',
    accent: '#EF4444',
  },
  gray: {
    light: '#9EB3C3',
    default: '#D9D9D9',
    dark: '#71717A',
  },
  white: '#FFFFFF',
  black: '#1A1A1A',
};

export const getTheme = () => theme;
export const setTheme = (newValue) => {
  theme = newValue;
};
