export const DRAW_DEFAULT_OPTIONS = {
  updateMode: 'merge', // merge, replace
  mapData: null,
  grids: {
    show: true,
    frame: 'base',
    components: {
      bar: {
        show: false,
        name: 'base',
        color: 'black',
        minPercentHeight: 0.1,
        percentHeight: 0,
      },
      icon: {
        show: true,
        name: 'loading',
        color: 'black',
      },
      text: {
        show: false,
        color: 'black',
      },
    },
  },
  strings: {
    show: false,
  },
  inverters: {
    show: true,
    frame: 'icon',
    components: {
      icon: {
        show: true,
        name: 'inverter',
        color: 'primary.default',
      },
    },
  },
  combines: {
    show: true,
    frame: 'icon',
    components: {
      icon: {
        show: true,
        name: 'combine',
        color: 'primary.default',
      },
    },
  },
  edges: {
    show: true,
    frame: 'icon',
    components: {
      icon: {
        show: true,
        name: 'edge',
        color: 'primary.default',
      },
    },
  },
};
