const themeStore = () => {
  let _theme = {
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

  const set = (value) => {
    _theme = value;
  };

  const get = () => _theme;

  return { set, get };
};

export const theme = themeStore();
