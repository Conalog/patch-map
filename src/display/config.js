export const GRID_OBJECT_CONFIG = {
  margin: 4,
};

export const GROUP_DEFAULT_CONFIG = {
  show: true,
};

export const DRAW_DEFAULT_OPTIONS = {
  updateMode: 'merge', // merge, replace
  mapData: null,
  panelGroups: {
    show: true,
    frame: 'base',
    zIndex: 10,
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
};
