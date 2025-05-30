# PATCH MAP
English | [한국어](./README_KR.md)

PATCH MAP is an optimized canvas library built on pixi.js and pixi-viewport, tailored to meet the requirements of PATCH services.
<br/>
Therefore, to use this, an understanding of the following two libraries is essential.

- **[pixi.js](https://github.com/pixijs/pixijs)**  
- **[pixi-viewport](https://github.com/pixi-viewport/pixi-viewport)**  

<br/>

## 📚 Table of Contents

- [🚀 Getting Started](#-getting-started)
  - [Install](#install)
  - [Usage](#usage)
- [Patchmap](#patchmap)
  - [init(el, options)](#initel-options)
  - [destroy()](#destroy)
  - [draw(data)](#drawdata)
  - [update(options)](#updateoptions)
  - [event](#event)
  - [viewport](#viewport)
  - [asset](#asset)
  - [focus(ids)](#focusids)
  - [fit(ids)](#fitids)
  - [selector(path)](#selectorpath)
  - [select(options)](#selectoptions)
- [undoRedoManager](#undoredomanager)
  - [execute(command, options)](#executecommand-options)
  - [undo()](#undo)
  - [redo()](#redo)
  - [canUndo()](#canundo)
  - [canRedo()](#canredo)
  - [clear()](#clear)
  - [subscribe(listener)](#subscribelistener)  
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
Here's a quick example to get you started: [Example](https://codesandbox.io/p/sandbox/yvjrpx)
```js
(async () => {
  import { Patchmap } from '@conalog/patch-map';

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
        itemSize: { width: 40, height: 80 },
        components: [
          {
            type: 'background',
            texture: {
              type: 'rect',
              fill: 'white',
              borderWidth: 2,
              borderColor: 'primary.dark',
              radius: 4,
            },
          }
          { type: 'icon', asset: 'loading', size: 16 }
        ]
      }]
    }
  ];

  const patchmap = new Patchmap();

  await patchmap.init(document.body);
  
  patchmap.draw(data);
})()
```

<br/>

## Patchmap

### `init(el, options)`
Initialize PATCH MAP with options.  

```js
await patchmap.init(el, {
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
  - `Viewport options` ([Docs](https://viewport.pixijs.io/jsdoc/Viewport.html))  
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

### `destroy()`
Destroys registered assets and the application to prevent memory leaks.

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
      itemSize: { width: 40, height: 80 },
      components: [
        {
          type: 'background',
          texture: {
            type: 'rect',
            fill: 'white',
            borderWidth: 2,
            borderColor: 'primary.dark',
            radius: 4,
          },
        },
        { type: 'icon', asset: 'loading', size: 16 }
      ]
    }]
  }
];
patchmap.draw(data);
```

**Data Schema**

The **data structure** required by draw method.  
For **detailed type definitions**, refer to the [data.d.ts](src/display/data-schema/data.d.ts) file.


<br/>

### `update(options)`
Updates the state of specific objects on the canvas. Use this to change properties like color or text visibility for already rendered objects.

#### **`Options`**
- `path`(optional, string) - Selector for the object to which the event will be applied, following [jsonpath](https://github.com/JSONPath-Plus/JSONPath) syntax.
- `elements`(optional, object \| array) - Direct references to one or more objects to update. Accepts a single object or an array. (Objects returned from [selector](#selectorpath), etc.).
- `changes`(required, object) - New properties to apply (e.g., color, text visibility).
- `saveToHistory`(optional, boolean \| string) - Determines whether to record changes made by this `update` method in the `undoRedoManager`. If a string that matches the historyId of a previously saved record is provided, the two records will be merged into a single undo/redo step.
- `relativeTransform`(optional, boolean) - Determines whether to use relative values for `position`, `rotation`, and `angle`. If `true`, the provided values will be added to the object's values.

```js
// Apply changes to objects with the label "grid-label-1"
patchmap.update({
  path: `$..children[?(@.label=="grid-label-1")]`,
  changes: {
    components: [
      { type: 'icon', asset: 'wifi' }
    ]
  }
});

// Apply changes to objects of type "group"
patchmap.update({
  path: `$..children[?(@.type=="group")]`,
  changes: { 
    show: false
  }
});

// Apply changes to objects of type "grid" within objects of type "group"
patchmap.update({
  path: `$..children[?(@.type=="group")].children[?(@.type=="grid")]`,
  changes: {
    components: [
      { type: 'icon', tint: 'black' }
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
const id = patchmap.event.add({
  path: '$',
  action: 'click tap',
  fn: (e) => {
    console.log(e.target.id)
  }
});

patchmap.event.add({
  id: 'pointerdown-event',
  path: '$..[?(@.label=="group-label-1")]',
  action: 'pointerdown',
  fn: (e) => {
    console.log(e.target.type);
  }
});

patchmap.event.add({
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
patchmap.event.on('pointerdown-event double-click');

// Deactivate 'pointerdown-event' & 'double-click' events.
patchmap.event.off('pointerdown-event double-click');

// Remove 'pointerdown-event' & 'double-click' events.
patchmap.event.remove('pointerdown-event');

// Get the registered 'double-click' event.
const event = patchmap.event.get('double-click');

// Get all registered events.
const events = patchmap.event.getAll();
```

<br/>


### `viewport`
- For detailed information on the viewport plugin, refer to [pixi-viewport](https://viewport.pixijs.io/jsdoc/Viewport.html)
```js
patchmap.viewport.plugin.add({
  mouseEdges: { speed: 16, distance: 20, allowButtons: true },
});

patchmap.viewport.plugin.stop('mouse-edges');

patchmap.viewport.plugin.start('mouse-edges');

patchmap.viewport.plugin.remove('mouse-edges');
```
<br/>

### `asset`
- Refer to [pixiJS Assets](https://pixijs.download/release/docs/assets.Assets.html) for information about assets.

<br/>

### `focus(ids)`
- `ids` (optional, string \| string[]) - The string or string array representing the object ID to focus on. If not specified, the entire canvas object is the target.
```js
 // Focus on the entire canvas object
patchmap.focus()

// Focus on the object with id 'group-id-1'
patchmap.focus('group-id-1')

// Focus on the object with id 'grid-1'
patchmap.focus('grid-1')

// Focus on objects with ids 'item-1' and 'item-2'
patchmap.focus(['item-1', 'item-2'])
```

<br/>

### `fit(ids)`
- `ids` (optional, string \| string[]) - The string or string array representing the object ID to fit. If not specified, the entire canvas object is the target.
```js
// Fit to the entire canvas object
patchmap.fit()

// Fit to the object with id 'group-id-1'
patchmap.fit('group-id-1')

// Fit to the object with id 'grid-1'
patchmap.fit('grid-1')

// Fit on objects with ids 'item-1' and 'item-2'
patchmap.fit(['item-1', 'item-2'])
```

<br/>

### `selector(path)`
Object explorer following [jsonpath](https://github.com/JSONPath-Plus/JSONPath) syntax.

```js
  const result = patchmap.selector('$..[?(@.label=="group-label-1")]')
```

<br/>

### `select(options)`
The selection event is activated to detect objects that the user selects on the screen and pass them to a callback function.
This should be executed after the `draw` method.
- `enabled` (optional, boolean): Determines whether the selection event is enabled.
- `draggable` (optional, boolean): Determines whether dragging is enabled.
- `isSelectGroup` (optional, boolean): Decides whether to select group objects.
- `isSelectGrid` (optional, boolean): Decides whether to select grid objects.
- `filter` (optional, function): A function that filters the target objects based on specific conditions.
- `onSelect` (optional, function): The callback function that is called when a selection occurs.
- `onOver` (optional, function): The callback function that is called when a pointer-over event occurs.
- `onDragSelect` (optional, function): The callback function that is called when a drag event occurs.

```js
patchmap.select({
  enabled: true,
  draggable: true,
  isSelectGroup: false,
  isSelectGrid: true,
  filter: (obj) => obj.type !== 'relations',
  onSelect: (obj) => {
    console.log(obj);
  },
  onOver: (obj) => {
    console.log(obj);
  },
  onDragSelect: (objs) => {
    console.log(objs);
  }
});
```

<br/>

## undoRedoManager
An instance of the `UndoRedoManager` class. This manager records executed commands, allowing for undo and redo functionality.

### method

#### `execute(command, options)`
Executes the given command and records it. You can set the `historyId` through the `options` object.

#### `undo()`
Cancels the last executed command.
```js
undoRedoManager.undo();
```

#### `redo()`
Re-executes the last canceled command.
```js
undoRedoManager.redo();
```

#### `canUndo()`
Returns whether undo is possible.

#### `canRedo()`
Returns whether redo is possible.

#### `clear()`
Clears all command history.

#### `subscribe(listener)`
Subscribes a listener that will be called when command-related changes occur. You can call the returned function to unsubscribe.
```js
let canUndo = false;
let canRedo = false;

const unsubscribe = undoRedoManager.subscribe((manager) => {
  canUndo = manager.canUndo();
  canRedo = manager.canRedo();
});
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

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

### Third-party Code

The file `src/utils/zod-deep-strict-partial.js` contains code originally licensed under Apache License 2.0. The original copyright notice and license terms are preserved in the file.

## Fira Code
This project incorporates the [Fira Code](https://github.com/tonsky/FiraCode) font to enhance code readability.  
Fira Code is distributed under the [SIL Open Font License, Version 1.1](https://scripts.sil.org/OFL), and a copy of the license is provided in [OFL-1.1.txt](./src/assets/fonts/OFL-1.1.txt).