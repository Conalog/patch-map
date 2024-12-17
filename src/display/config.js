export const DRAW_DEFAULT_OPTIONS = {
  updateMode: 'merge', // merge, replace
  mapData: null,
  grids: {
    show: true,
    frame: 'base',
    // [{id: '123', value: 123}]
    data: null,
    components: {
      bar: {
        show: false,
        name: 'base',
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
      },
    },
  },
  strings: {
    show: false,
    data: null,
  },
  inverters: {
    show: true,
    frame: 'icon',
    data: null,
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
    data: null,
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
    data: null,
    components: {
      icon: {
        show: true,
        name: 'edge',
        color: 'primary.default',
      },
    },
  },
};
