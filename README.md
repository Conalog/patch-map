# PATCH MAP
English | [한국어](./README_KR.md)

PATCH MAP is an optimized canvas library built on pixijs and pixi-viewport, tailored to meet the requirements of PATCH services.
It enables flexible and fast creation of 2D content.

- **[PixiJS](https://github.com/pixijs/pixijs)**  
- **[Pixi-Viewport](https://github.com/pixi-viewport/pixi-viewport)**  

<br/>

## 📚 Table of Contents

- [🚀 Getting Started](#-getting-started)
  - [Install](#install)
  - [Usage](#usage)
- [🛠 API Overview](#-api-overview)
  - [init(el, options)](#initel-options)
  - [draw(data)](#drawdata)
  - [update(options)](#updateoptions)
  - [event](#event)
  - [asset](#asset)
  - [focus(id)](#focusid)
  - [fit(id)](#fitid)
  - [selector(path)](#selectorpath)
- [🧑‍💻 Development](#-development)
  - [Setting up the development environment](#setting-up-the-development-environment)
  - [VSCode Integration](#vscode-integration)
- [📄 License](#license)
- [🔤 Fira Code](#fira-code)

<br/>

## 🚀 Getting Started

### Install
Install `@conalog/patch-map` using npm:
```sh
npm install @conalog/patch-map
```

### Usage
Here’s a quick example to get you started:
[example](https://codesandbox.io/p/devbox/patch-map-basic-usage-mzp42y?embed=1)
```js
(async () => {
  import { PatchMap } from '@conalog/patch-map';

  const data = [
    {
      type: 'group',
      id: 'group-id-1',
      label: 'group-label-1',
      items: [{
        type: 'grid',
        id: 'grid-1',
        label: 'grid-label-1',
        cells: [ [1, 0, 1], [1, 1, 1] ],
        position: { x: 0, y: 0 },
        size: { width: 40, height: 80 },
        components: [
          { type: 'background', texture: 'base' },
          { type: 'icon', texture: 'loading', size: 16 }
        ]
      }]
    }
  ];

  const patchMap = new PatchMap();

  await patchMap.init(document.body);
  
  patchMap.draw(data);
})()
```

<br/>

## 🛠 API Overview

### `init(el, options)`
Initialize PATCH MAP with options.  

```js
await patchMap.init(el, {
  app: { background: '#CCCCCC' },
  viewport: {
    plugins: { decelerate: { disabled: true } }
  },
  theme: {
    primary: { default: '#c2410c' }
  }
});
```

#### **Options**
Customize the rendering behavior using the following options:

- `app`
  - `PixiJS Application options` ([Docs](https://pixijs.download/release/docs/app.ApplicationOptions.html))  

  Default:
  ```js
  {
    background: '#FAFAFA',
    antialias: true,
    autoDensity: true,
    resolution: 2,
  }
  ```

- `viewport`
  - `Viewport options` ([Docs](https://pixi-viewport.github.io/pixi-viewport/jsdoc/Viewport.html#Viewport))  
  - `plugins` - Plugins to enhance or modify the viewport's behavior. You can add new plugins or disable default ones.  
  
  Default:
  ```js
  {
    passiveWheel: false,
    plugins: {
      clampZoom: { minScale: 0.5, maxScale: 30 },
      drag: {},
      wheel: {},
      decelerate: {},
    },
  }
  ```

- `theme` - Theme options  
  Default:
  ```js
  {
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
  }
  ```

<br/>

### `draw(data)`
Render map data on the canvas.  

```js
const data = [
  {
    type: 'group',
    id: 'group-id-1',
    label: 'group-label-1',
    items: [{
      type: 'grid',
      id: 'grid-1',
      label: 'grid-label-1',
      cells: [ [1, 0, 1], [1, 1, 1] ],
      position: { x: 0, y: 0 },
      size: { width: 40, height: 80 },
      components: [
        { type: 'background', texture: 'base' },
        { type: 'icon', texture: 'loading', size: 16 }
      ]
    }]
  }
];
patchMap.draw(data);
```

**Data Schema**

The **data structure** required by draw method.  
For **detailed type definitions**, refer to the [data.d.ts](src/display/data-schema/data.d.ts) file.


<br/>

### `update(options)`
Updates the state of specific objects on the canvas. Use this to change properties like color or text visibility for already rendered objects.

#### **`Options`**
- `path`(required, string) - Selector for the object to which the event will be applied, following [jsonpath](https://github.com/JSONPath-Plus/JSONPath) syntax.
- `changes`(required, object) - New properties to apply (e.g., color, text visibility).

```js
// Apply changes to objects with the label "grid-label-1"
patchMap.update({
  path: `$..children[?(@.label=="grid-label-1")]`,
  changes: {
    components: [
      { type: 'icon', texture: 'wifi' }
    ]
  }
});

// Apply changes to objects of type "group"
patchMap.update({
  path: `$..children[?(@.type=="group")]`,
  changes: { 
    show: false
  }
});

// Apply changes to objects of type "grid" within objects of type "group"
patchMap.update({
  path: `$..children[?(@.type=="group")].children[?(@.type=="grid")]`,
  changes: {
    components: [
      { type: 'icon', color: 'black' }
    ]
  }
});
```

<br/>

### `event`
Manages events for the canvas and various components.  
If you want to learn about multiple event actions such as double-click, refer to the [addEventListener documentation](https://pixijs.download/release/docs/scene.Container.html#addEventListener).

#### add(options)
- `id` (optional, string) - A unique identifier for the event. Useful for managing the event later.
- `path` (required, string) - Selector for the object to which the event will be applied, following [jsonpath](https://github.com/JSONPath-Plus/JSONPath) syntax.
- `action` (required, string) - Specifies the type of event. For example, 'click', 'pointerdown', etc.
- `fn` (required, function) - The callback function to execute when the event is triggered. Receives the event object as a parameter.

```js
const id = patchMap.event.add({
  path: '$',
  action: 'click tap',
  fn: (e) => {
    console.log(e.target.id)
  }
});

patchMap.event.add({
  id: 'pointerdown-event',
  path: '$..[?(@.label=="group-label-1")]',
  action: 'pointerdown',
  fn: (e) => {
    console.log(e.target.type);
  }
});

patchMap.event.add({
  id: 'double-click',
  path: '$',
  action: 'click',
  fn: (e) => {
    if (e.detail === 2 && e.target.type === 'canvas') {
      console.log('Double click detected on canvas');
    }
  }
});
```
```js
// Activate 'pointerdown-event' & 'double-click' events.
patchMap.event.on('pointerdown-event double-click');

// Deactivate 'pointerdown-event' & 'double-click' events.
patchMap.event.off('pointerdown-event double-click');

// Remove 'pointerdown-event' & 'double-click' events.
patchMap.event.remove('pointerdown-event');

// Get the registered 'double-click' event.
const event = patchMap.event.get('double-click');

// Get all registered events.
const events = patchMap.event.getAll();
```

<br/>

### `asset`

#### `add(assets)`
- Adds assets to the PixiJS Assets manager. See the [pixiJS add method](https://pixijs.download/release/docs/assets.Assets.html#add) for more information.
- If you want to specify the icon resolution, you can add the `data: { resolution: <your_value> }` option.
- To add an **icon asset**, make sure to prefix the `alias` with `icons-`.
```js
patchMap.asset.add({
  alias: 'icons-expand',
  src: '/expand.svg',
  data: { resolution: 3 }
});
```


#### `load(urls, onProgress)`: Promise\<any>
- Loads assets from the specified URLs. Refer to the [pixiJS load method](https://pixijs.download/release/docs/assets.Assets.html#load) for more information.
```js
await patchMap.asset.load('icons-expand');

await patchMap.asset.load({
  alias: 'icons-plus',
  src: '/plus.svg',
  data: { resolution: 2 }
});
```

#### `get(keys)`
- Retrieves assets using the specified keys. Check the [pixiJS get method](https://pixijs.download/release/docs/assets.Assets.html#get) for more information.

#### `addBundle(bundleId, assets)`
- Adds a bundle of assets to the PixiJS Assets manager. More information can be found in the [pixiJS addBundle method](https://pixijs.download/release/docs/assets.Assets.html#addBundle).

#### `loadBundle(bundleIds, onProgress)`: Promise\<any>
- Loads a bundle of assets based on the provided bundle IDs. See the [pixiJS loadBundle method](https://pixijs.download/release/docs/assets.Assets.html#loadBundle) for more information.


<br/>

### `focus(id)`
```js
 // Focus on the entire canvas object
patchMap.focus()

// Focus on the object with id 'group-id-1'
patchMap.focus('group-id-1')

// Focus on the object with id 'grid-1'
patchMap.focus('grid-1')
```

### `fit(id)`
```js
// Fit to the entire canvas object
patchMap.fit()

// Fit to the object with id 'group-id-1'
patchMap.fit('group-id-1')

// Fit to the object with id 'grid-1'
patchMap.fit('grid-1')
```

### `selector(path)`
Object explorer following [jsonpath](https://github.com/JSONPath-Plus/JSONPath) syntax.

```js
  const result = patchMap.selector('$..[?(@.label=="group-label-1")]')
```

<br/>

## 🧑‍💻 Development

### Setting up the development environment
```sh
npm install      # Install dependencies
npm run dev      # Start development server
npm run build    # Build the library
npm run lint:fix # Fix code formatting
```

### VSCode Integration
Make sure Biome is set up for consistent code formatting.
1.	Install the [Biome extension](https://biomejs.dev/reference/vscode/).
2.	Update your VSCode settings:
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "biomejs.biome",
  "editor.codeActionsOnSave": {
    "quickfix.biome": "explicit"
  },
}
```
3. If Biome does not format certain file types  
For specific extensions, add their settings individually:
```json
{
  ...
  "[javascript]": {
    "editor.defaultFormatter": "biomejs.biome"
  },
  "[json]": {
    "editor.defaultFormatter": "biomejs.biome"
  }
}
```

## License
- [MIT](./LICENSE)

## Fira Code
This project incorporates the [Fira Code](https://github.com/tonsky/FiraCode) font to enhance code readability.  
Fira Code is distributed under the [SIL Open Font License, Version 1.1](https://scripts.sil.org/OFL), and a copy of the license is provided in [OFL-1.1.txt](./src/assets/fonts/OFL-1.1.txt).