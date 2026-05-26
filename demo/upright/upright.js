import { Patchmap } from '../../dist/index.esm.js';

const ANGLES = [0, 90, 180, 270];

const state = {
  rotation: 0,
  flipX: false,
  flipY: false,
  contentOrientation: 'upright',
  viewMode: 'number',
};

const cells = {
  single: [[1]],
  twoByFour: [
    [1, 1, 1, 1],
    [1, 1, 1, 1],
  ],
  twoByThree: [
    [1, 1, 1],
    [1, 1, 1],
  ],
  twoBySeven: [
    [1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1],
  ],
  twoByEight: [
    [1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1],
  ],
  twoByTen: [
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 0, 1, 1, 1, 1, 1, 1, 1],
  ],
  twoByTenFull: [
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  ],
  fourByThirty: [
    [
      1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
      1, 1, 1, 1, 1,
    ],
    [
      1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1,
      1, 1, 1, 1, 1,
    ],
    [
      1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
      1, 1, 1, 1, 1,
    ],
    [
      1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
      1, 1, 1, 1, 1,
    ],
  ],
};

const gridSpecs = [
  [
    '727cc58d-ec36-42a9-b69c-08adffd4bc0a',
    'PG72',
    'twoByFour',
    999.34,
    372.33,
    38,
  ],
  ['b2b9b5a5-f303-4f15-a3c8-5a3bfa5d8e98', 'PGB2', 'twoByTen', 818, 594, 38],
  ['55f6b7b5-fcc3-4b86-b525-eda4021e29b9', 'PGB9', 'twoByTen', 564, 926, 38],
  ['d9c60e1b-7828-42e7-baa1-a81c5fb8bdc1', 'PGC1', 'twoByTen', 320, 1258, 38],
  ['6ae70b27-dc68-4e06-902e-0a7cadfd5cda', 'PGDA', 'twoByTen', 69, 1590, 38],
  [
    '47c2cd6b-16f3-49dc-96dd-761382c79080',
    'PG80',
    'twoByTenFull',
    -178,
    1922,
    38,
  ],
  ['11cb5464-b2e6-4639-a2d0-5dcfdd08df27', 'PG27', 'twoByTen', -407, 2254, 38],
  ['9947c420-ea32-4ec0-961b-a1e31e879913', 'PG13', 'twoByTen', -679, 2586, 38],
  ['3ebbcc1d-4309-4fa5-8116-d825816779fb', 'PG3E', 'twoBySeven', 1436, 792, 38],
  [
    '2eb41114-40e3-41cf-87f0-d631dedb6d19',
    'PG19',
    'twoBySeven',
    1173,
    1143,
    38,
  ],
  ['48e67614-3b9d-4dea-94a5-166f26945e4b', 'PG4B', 'twoBySeven', 915, 1480, 38],
  ['45ce5832-386c-4b83-8912-03dd1af76547', 'PG45', 'twoByThree', 820, 1930, 38],
  ['4c834990-efc8-4aaf-8b9f-c627eedcf3af', 'PGAF', 'twoByThree', 568, 2255, 38],
  ['518b9152-d44a-4b78-b8f1-b89846230a26', 'PG26', 'twoByThree', 319, 2571, 38],
  ['33e6f7de-80d7-4b19-8eab-18b7ad9675d0', 'PGD0', 'twoByThree', 61, 2898, 38],
  [
    '82fd6803-0a49-47c1-892f-e565d1ae12d6',
    'PG82',
    'twoByEight',
    1183,
    2203,
    38,
  ],
  ['c67a154f-bfed-4985-80c8-77e2fa0ddfe1', 'PGE1', 'twoByEight', 923, 2547, 38],
  ['2d57d84e-2663-480e-bb6c-f52e05f9a306', 'PG06', 'twoByEight', 683, 2867, 38],
  ['2cf398a7-dbc7-4e28-88fa-d94ba9a1cd46', 'PG46', 'twoByEight', 424, 3180, 38],
  [
    'ecde2815-473e-4cdf-8ac8-62efde6b289c',
    'PGEC',
    'fourByThirty',
    -993,
    2919,
    38,
  ],
  ['1bc1aacc-8abf-4428-a903-50dd03dd4520', 'PG1B', 'single', 772, 819, 128],
  ['10041a9e-266d-444b-98b3-518aea49d943', 'PG43', 'single', 1080, 1063, 128],
  ['ac6440c0-d833-4937-9423-7b987dc8686d', 'PG6D', 'single', 878, 902, 128],
  ['5fcbcc4e-23a7-4819-b058-b625dde632ae', 'PGAE', 'single', 979, 982, 128],
  ['4cf4698b-4099-4bea-ba76-da5d0a3216e7', 'PGE7', 'single', 519, 1152, 128],
  ['69576c03-d21a-4754-8b2d-85a3fc107bee', 'PGEE', 'single', 727, 1314, 128],
  ['98b9d94d-8289-4ab4-b970-21eddf923ada', 'PGDA', 'single', 826, 1394, 128],
  ['f057c950-fdd6-4e08-b095-fb0943ad2b42', 'PG42', 'single', 622, 1234, 128],
  ['1396ae8e-47ee-4838-9d48-df4b030084e3', 'PGE3', 'single', 276, 1487, 128],
  ['8a99d6bf-bc32-45a5-a78c-a3b43bf4bea7', 'PGA7', 'single', 375, 1564, 128],
  ['d4327f2d-18be-49e1-a36b-7e51d6c7ad75', 'PG75', 'single', 481, 1645, 128],
  ['ba6172f4-4b4d-4b78-a2b3-98b440b02f97', 'PG97', 'single', 585, 1726, 128],
  ['79c4f975-f576-4828-b69f-be02da246bb5', 'PGB5', 'single', 24, 1814, 128],
  ['ee23274c-29a0-409d-85ce-f5ebad0ff215', 'PG15', 'single', 122, 1893, 128],
  ['17da4d5e-3cf3-42e4-8939-8d81115b69ee', 'PGEE', 'single', 225, 1974, 128],
  ['9ebb24fd-1c9a-4247-b974-5f0d06d2e279', 'PG79', 'single', 332, 2056, 128],
  ['eae6d36d-7a8e-418c-82a4-69304ab7e4e3', 'PGE3', 'single', -452, 2477, 128],
  ['f7ba5f20-9822-4935-98c9-77609315ac77', 'PG77', 'single', -724, 2810, 128],
  ['f03476aa-7c07-4b96-9a5e-b84b9970d5c8', 'PGC8', 'single', -347, 2561, 128],
  ['e267d764-4a50-4940-93cf-8b19741447e2', 'PGE2', 'single', -249, 2638, 128],
  ['c8ad3918-4906-4327-b5f4-fb168ae52813', 'PG13', 'single', -143, 2721, 128],
  ['1f079e1e-fa68-41d1-b757-9468667cab00', 'PG00', 'single', -620, 2892, 128],
  ['548ca64e-1e56-461d-83b2-8d97645aa03d', 'PG3D', 'single', -515, 2975, 128],
  ['37b1deae-913e-440b-97ed-314e35d0db1d', 'PG1D', 'single', -414, 3052, 128],
  ['2d1f9f02-6af8-4c10-a064-bc44282e993c', 'PG3C', 'single', 1582, 1168, 128],
  ['154a4855-ec1d-4d9b-b6b4-9750dddf148a', 'PG8A', 'single', 1392, 1020, 128],
  ['3162f389-c0d8-458a-9c90-feac6edf622d', 'PG2D', 'single', 1488, 1092, 128],
  ['f6bf6e75-81fa-4ad6-9d1a-c520b734f6e7', 'PGE7', 'single', 1126, 1368, 128],
  ['f230588b-7cd2-478e-af7e-6a7c0532807b', 'PG7B', 'single', 1220, 1442, 128],
  ['d1cfa289-06bb-47f6-b2ff-d8193960ed3b', 'PG3B', 'single', 1318, 1515, 128],
  ['2a801a3b-3b1d-427b-abe6-8eaad67ee7d7', 'PGD7', 'single', 870, 1708, 128],
  ['819b4648-9e60-4af6-bee5-ccd78a7dd178', 'PG78', 'single', 966, 1781, 128],
  ['9782274d-245d-4391-840c-866a7efd356b', 'PG6B', 'single', 1060, 1856, 128],
  ['c75b1f71-1408-4c89-9deb-7f40e019d5c6', 'PGC6', 'single', 775, 2152, 128],
  ['67c8d0a5-e4cc-4f86-96a7-3991ea595476', 'PG76', 'single', 523, 2483, 128],
  ['7e2d481f-22ca-4fcd-9b79-c6c75c72eb9e', 'PG9E', 'single', 276, 2797, 128],
  ['a0377c5a-6a24-44e7-b459-1bee211e076c', 'PG6C', 'single', 17, 3127, 128],
  ['3762c0ee-1442-4f60-b5a2-82a7de171192', 'PG92', 'single', 879, 2774, 128],
  ['e0613ee3-72b3-43dc-bde5-88a59641c5a8', 'PGA8', 'single', 1254, 2514, 128],
  ['99f7eaa3-3805-4179-943c-8ae9f8b7c067', 'PG67', 'single', 1369, 2609, 128],
  ['40f121ee-780a-412c-9d75-7491eedea04f', 'PG4F', 'single', 1138, 2429, 128],
  ['dabc4a50-e13c-4b0d-8476-5f5c23f086b6', 'PGB6', 'single', 995, 2864, 128],
  ['6f2b3ba8-e31b-4c1d-be3b-ca24ffd4dbff', 'PGFF', 'single', 1105, 2952, 128],
  ['d42e0574-b5da-4ef2-8190-0946352a1277', 'PG77', 'single', 1559, 2747, 128],
  ['f2833c2d-8341-4f11-9e22-3dcc059e8438', 'PG38', 'single', 637, 3094, 128],
  ['83763688-fc4f-4139-81db-d71bccb63d66', 'PG66', 'single', 755, 3183, 128],
  ['4738e9db-9c9e-449f-98b2-cb0ed174f703', 'PG03', 'single', 871, 3276, 128],
  ['bd2d1bdf-fd27-411c-83e0-141c3303b0e7', 'PGE7', 'single', 379, 3404, 128],
  ['fd2f0e01-407e-4072-b4ce-6dce4fd429c3', 'PGC3', 'single', 493, 3494, 128],
  ['11e9d706-d1bb-4002-ab3b-3d5b08857808', 'PG08', 'single', 609, 3584, 128],
];

const inverterSpecs = [
  ['08351c8e-e002-49da-b261-a6e1f32b90d1', '인버터 #1', -908, 2645],
  ['286947a5-43f2-444f-9a6e-067e91327e27', '인버터 #2', -864, 2602],
  ['da942ba2-b1f3-42cc-9586-098082e28c61', '인버터 #3', -820, 2558],
  ['eddf1527-188b-43d4-8454-ea87061cab0a', '인버터 #4', -776, 2514],
  ['d33c1f43-ebca-427f-9768-b794f3ea7596', '인버터 #5', -733, 2470],
  ['e1ec1b3c-bced-4c1a-9cec-fe01b1bf8e2f', '인버터 #6', -690, 2427],
  ['9382bc83-8d4e-4bb4-b2be-b8de40a907ee', '인버터 #7', -646, 2383],
];

const sourceData = [
  ...gridSpecs.map(([id, label, cellKey, x, y, angle]) =>
    createPanelGrid({ id, label, cells: cells[cellKey], x, y, angle }),
  ),
  ...inverterSpecs.map(([id, label, x, y]) =>
    createInverter({ id, label, x, y }),
  ),
];

const mapElement = document.querySelector('#map');
const statusElement = document.querySelector('#status');
const rotationControls = document.querySelector('#rotationControls');
const flipXInput = document.querySelector('#flipX');
const flipYInput = document.querySelector('#flipY');
const itemOrientationSelect = document.querySelector('#itemOrientation');
const redrawButton = document.querySelector('#redraw');
const chartUpdateButton = document.querySelector('#chartUpdate');

const patchmap = new Patchmap();

await patchmap.init(mapElement, {
  app: { background: '#e7edf4' },
  viewport: {
    plugins: {
      decelerate: { disabled: true },
    },
  },
  theme: {
    primary: {
      default: '#2563eb',
      dark: '#1d4ed8',
      accent: '#e11d48',
    },
    gray: {
      light: '#dbeafe',
      default: '#cbd5e1',
      dark: '#475569',
    },
  },
});

patchmap.on('patchmap:draw', () => {
  patchmap.fit(null, { padding: 160 });
});

createRotationControls();
bindControls();
draw();
applyViewTransform();
renderStatus();

function createRotationControls() {
  for (const angle of ANGLES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.angle = String(angle);
    button.textContent = `${angle}°`;
    button.setAttribute('aria-pressed', String(angle === state.rotation));
    rotationControls.appendChild(button);
  }
}

function bindControls() {
  rotationControls.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-angle]');
    if (!button) return;
    state.rotation = Number(button.dataset.angle);
    applyViewTransform();
    renderStatus();
  });

  flipXInput.addEventListener('input', () => {
    state.flipX = flipXInput.checked;
    applyViewTransform();
    renderStatus();
  });

  flipYInput.addEventListener('input', () => {
    state.flipY = flipYInput.checked;
    applyViewTransform();
    renderStatus();
  });

  itemOrientationSelect.addEventListener('input', () => {
    state.contentOrientation = itemOrientationSelect.value;
    draw();
    applyViewTransform();
    renderStatus();
  });

  chartUpdateButton.addEventListener('click', () => {
    applyChartUpdate();
    renderStatus('chart update applied through patchmap.update');
  });

  redrawButton.addEventListener('click', () => {
    draw();
    applyViewTransform();
    renderStatus('number view redrawn from source data');
  });
}

function draw() {
  state.viewMode = 'number';
  patchmap.draw(createNumberViewData());
}

function createNumberViewData() {
  return sourceData.map((element) => {
    if (element.type === 'grid') {
      return {
        ...element,
        item: {
          ...element.item,
          contentOrientation: state.contentOrientation,
          components: createNumberComponents(element.item.components),
        },
      };
    }

    if (element.type === 'item') {
      return {
        ...element,
        contentOrientation: state.contentOrientation,
        components: createNumberComponents(element.components),
      };
    }

    return element;
  });
}

function createNumberComponents(components) {
  const next = components.map((component) => {
    if (component.type === 'bar') {
      return {
        ...component,
        show: true,
        size: '100%',
        tint: 'primary.default',
        animation: false,
      };
    }

    if (component.type === 'icon') {
      return {
        ...component,
        show: false,
      };
    }

    if (component.type === 'text') {
      return createNumberText(component);
    }

    return component;
  });

  if (!next.some((component) => component.type === 'text')) {
    next.push(createNumberText());
  }

  return next;
}

function createNumberText(component = {}) {
  return {
    ...component,
    type: 'text',
    show: true,
    text: '72\nW',
    placement: 'center',
    style: {
      fontSize: 12,
      fontWeight: '700',
      fill: 'white',
      align: 'center',
    },
  };
}

function applyChartUpdate() {
  state.viewMode = 'chart';
  const items = patchmap.selector('$..[?(@.type=="item")]');

  for (const item of items) {
    patchmap.update({
      elements: item,
      changes: {
        components: [
          {
            type: 'bar',
            show: true,
            source: {
              type: 'rect',
              radius: 3,
              fill: 'white',
            },
            size: { height: '100%' },
            tint: 'primary.default',
            animation: true,
          },
          { type: 'icon', show: false },
          { type: 'text', show: false },
        ],
      },
      validateSchema: false,
      emit: false,
    });
  }

  patchmap.selector('$..[?(@.type=="item")]');
}

function getRuntimeStats() {
  const items = patchmap.selector('$..[?(@.type=="item")]');
  const itemBars = items
    .map((item) => ({
      item,
      bar: item.children?.find((child) => child.type === 'bar'),
    }))
    .filter(({ bar }) => bar);
  const gridItemBars = itemBars.filter(
    ({ item }) => item.parent?.type === 'grid',
  );

  return {
    items: items.length,
    bars: itemBars.length,
    aggregateBars: itemBars.filter(
      ({ bar }) => bar._patchmapUseAggregateBar === true,
    ).length,
    gridBars: gridItemBars.length,
    gridAggregateBars: gridItemBars.filter(
      ({ bar }) => bar._patchmapUseAggregateBar === true,
    ).length,
    visibleTexts: items.filter((item) =>
      item.children?.some(
        (child) => child.type === 'text' && child.props?.show !== false,
      ),
    ).length,
  };
}

function describeRendererPath(stats) {
  if (state.viewMode === 'number') {
    return `number view: ${stats.visibleTexts} visible text components keep bars on the regular renderer`;
  }

  return `chart update: ${stats.gridAggregateBars}/${stats.gridBars} rotated grid bars, ${stats.aggregateBars}/${stats.bars} total bars using aggregate renderer`;
}

function describeBarSize() {
  return state.viewMode === 'number'
    ? 'number bar: size 100%, text visible'
    : 'chart bar: size { height: 100% }, icon/text hidden';
}

function applyViewTransform() {
  patchmap.rotation.value = state.rotation;
  patchmap.flip.set({ x: state.flipX, y: state.flipY });

  for (const button of rotationControls.querySelectorAll('button')) {
    button.setAttribute(
      'aria-pressed',
      String(Number(button.dataset.angle) === state.rotation),
    );
  }
}

function renderStatus(note = '') {
  const stats = getRuntimeStats();
  statusElement.innerHTML = [
    `view: ${state.viewMode}`,
    `world: rotate ${state.rotation}°, flipX ${state.flipX ? 'on' : 'off'}, flipY ${state.flipY ? 'on' : 'off'}`,
    `contentOrientation: ${state.contentOrientation}`,
    `data: ${gridSpecs.length} grids, ${inverterSpecs.length} items`,
    describeBarSize(),
    'chart update payload: bar show true + icon/text show false via patchmap.update',
    describeRendererPath(stats),
    note,
  ]
    .filter(Boolean)
    .map((line) => `<div>${line}</div>`)
    .join('');
}

window.patchmap = patchmap;

function createPanelGrid({ id, label, cells, x, y, angle }) {
  return {
    type: 'grid',
    id,
    label,
    cells,
    gap: 4,
    item: {
      padding: 3,
      size: { width: 45.36, height: 98.6 },
      components: [
        {
          type: 'background',
          source: {
            type: 'rect',
            fill: 'white',
            borderWidth: 2,
            borderColor: 'primary.dark',
            radius: 6,
          },
        },
        {
          type: 'bar',
          show: false,
          size: '100%',
          source: {
            type: 'rect',
            radius: 3,
            fill: 'white',
          },
          tint: 'primary.default',
        },
      ],
    },
    attrs: { x, y, angle, display: 'panelGroup' },
  };
}

function createInverter({ id, label, x, y }) {
  return {
    type: 'item',
    id,
    label,
    size: 40,
    components: [
      {
        type: 'background',
        source: {
          type: 'rect',
          fill: 'white',
          borderWidth: 2,
          borderColor: 'primary.default',
          radius: 6,
        },
      },
      {
        type: 'icon',
        source: 'inverter',
        size: 24,
        tint: 'primary.default',
        placement: 'center',
      },
      {
        type: 'bar',
        show: false,
        size: '100%',
        source: {
          type: 'rect',
          radius: 3,
          fill: 'white',
        },
        tint: 'primary.default',
      },
    ],
    attrs: {
      x,
      y,
      metadata: {},
      display: 'inverter',
      zIndex: 10,
    },
  };
}
