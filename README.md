# PATCH MAP
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/Conalog/patch-map)

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
  - [stateManager](#statemanager)  
  - [SelectionState](#selectionstate)
  - [Transformer](#transformer)
- [undoRedoManager](#undoredomanager)
  - [execute(command, options)](#executecommand-options)
  - [undo()](#undo)
  - [redo()](#redo)
  - [canUndo()](#canundo)
  - [canRedo()](#canredo)
  - [clear()](#clear)
- [📢 Full List of Available Events](#-full-list-of-available-events)
- [🧑‍💻 Development](#-development)
  - [Setting up the development environment](#setting-up-the-development-environment)
  - [VSCode Integration](#vscode-integration)
- [📄 License](#license)
- [🔤 Fira Code](#fira-code)

<br/>

## 🚀 Getting Started

### Install
#### NPM
```sh
npm install @conalog/patch-map
```

#### CDN
```html
<script src="https://cdn.jsdelivr.net/npm/pixi.js@latest/dist/pixi.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@conalog/patch-map@latest/dist/index.umd.js"></script>
```

### Usage
Here's a quick example to get you started: [Example](https://codesandbox.io/p/sandbox/yvjrpx)
```js
import { Patchmap } from '@conalog/patch-map';

const data = [
  {
    type: 'group',
    id: 'group-id-1',
    label: 'group-label-1',
    children: [{
      type: 'grid',
      id: 'grid-1',
      label: 'grid-label-1',
      cells: [ [1, 0, 1], [1, 1, 1] ],
      gap: 4,
      item: {
        size: { width: 40, height: 80 },
        components: [
          {
            type: 'background',
            source: {
              type: 'rect',
              fill: 'white',
              borderWidth: 2,
              borderColor: 'primary.dark',
              radius: 4,
            }
          },
          { type: 'icon', source: 'loading', tint: 'black', size: 16 },
        ]
      },
    }],
    attrs: { x: 100, y: 100, },
  }
];

const patchmap = new Patchmap();

await patchmap.init(document.body);

patchmap.draw(data);
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
  - `pixi.js Application options` ([Docs](https://pixijs.download/release/docs/app.ApplicationOptions.html))  

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
    children: [{
      type: 'grid',
      id: 'grid-1',
      label: 'grid-label-1',
      cells: [ [1, 0, 1], [1, 1, 1] ],
      gap: 4,
      item: {
        size: { width: 40, height: 80 },
        components: [
          {
            type: 'background',
            source: {
              type: 'rect',
              fill: 'white',
              borderWidth: 2,
              borderColor: 'primary.dark',
              radius: 4,
            }
          },
          { type: 'icon', source: 'loading', tint: 'black', size: 16 },
        ]
      },
    }],
    attrs: { x: 100, y: 100, },
  }
];
patchmap.draw(data);
```

**Data Schema**

The **data structure** required by draw method.  
For **detailed type definitions**, refer to the [data.d.ts](src/display/data-schema/data.d.ts) file.


<br/>

### `update(options)`
Updates the properties of objects rendered on the canvas. By default, only the changed properties are applied, but you can precisely control the update behavior using the `refresh` or `mergeStrategy` options.

#### **`Options`**
- `path` (optional, string) - Selector for the object to which the event will be applied, following [jsonpath](https://github.com/JSONPath-Plus/JSONPath) syntax.
- `elements` (optional, object \| array) - Direct references to one or more objects to update. Accepts a single object or an array. (Objects returned from [selector](#selectorpath), etc.).
- `changes` (optional, object) - New properties to apply (e.g., color, text visibility). If the `refresh` option is set to `true`, this can be omitted.
- `history` (optional, boolean \| string) - Determines whether to record changes made by this `update` method in the `undoRedoManager`. If a string that matches the historyId of a previously saved record is provided, the two records will be merged into a single undo/redo step.
- `relativeTransform` (optional, boolean) - Determines whether to use relative values for `position`, `rotation`, and `angle`. If `true`, the provided values will be added to the object's values.
- `mergeStrategy` (optional, string) - Determines how to apply the `changes` object to the existing properties. The default is `'merge'`.
  - `'merge'` (default): Deep merges the `changes` object into the existing properties. Individual properties within objects are updated.
  - `'replace'`: Replaces the top-level properties specified in `changes` entirely. This is useful for undo operations or for completely resetting a complex property like `style` or `components` to a specific state.
- `refresh` (optional, boolean) - If set to `true`, all property handlers are forcibly re-executed and the object is "refreshed" even if the values in `changes` are the same as before. This is useful when child objects need to be recalculated due to changes in the parent. Default is `false`.


```js
// Apply changes to objects with the label "grid-label-1"
patchmap.update({
  path: `$..children[?(@.label=="grid-label-1")]`,
  changes: {
    item: {
      components: [{ type: 'icon', source: 'wifi' }],
    },
  },
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
    item: {
      components: [{ type: 'icon', tint: 'red' }],
    },
  },
});

// Force a full property update (refresh) for all objects of type "relations" using refresh: true
patchmap.update({
  path: `$..children[?(@.type==="relations")]`,
  refresh: true
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
- Refer to [pixi.js Assets](https://pixijs.download/release/docs/assets.Assets.html) for information about assets.

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

### `stateManager`
A `StateManager` instance that manages the event state of the `patchmap` instance. You can define your own states by extending the `State` class and register them with the `stateManager`. This allows for systematic management of complex user interactions.

When `patchmap.draw()` is executed, a `SelectionState` named `selection` is registered by default.

```js
// Activates the 'selection' state to use object selection and drag-selection features.
patchmap.stateManager.setState('selection', {
  draggable: true,
  selectUnit: 'grid',
  filter: (obj) => obj.type !== 'relations',
  onClick: (obj, event) => {
    console.log('Selected:', obj);
    // Assign the selected object to the transformer
    if (patchmap.transformer) {
      patchmap.transformer.elements = obj;
    }
  },
  onDrag: (objs, event) => {
    console.log('Drag Selected:', objs);
    if (patchmap.transformer) {
      patchmap.transformer.elements = objs;
    }
  },
});
```

#### Creating Custom States

You can create a new state class by extending `State` and use it by registering it with the `stateManager`.

```js
import { State, PROPAGATE_EVENT } from '@conalog/patch-map';

// 1. Define a new state class
class CustomState extends State {
  // Define the events this state will handle as a static property.
  static handledEvents = ['onpointerdown', 'onkeydown'];

  enter(context, customOptions) {
    super.enter(context);
    console.log('CustomState has started.', customOptions);
  }

  exit() {
    console.log('CustomState has ended.');
    super.exit();
  }

  onpointerdown(event) {
    console.log('Pointer down in CustomState');
    // Handle the event here and stop its propagation.
  }

  onkeydown(event) {
    if (event.key === 'Escape') {
      // Switch to the 'selection' state (the default state).
      this.context.stateManager.setState('selection');
    }
    // Return PROPAGATE_EVENT to propagate the event to the next state in the stack.
    return PROPAGATE_EVENT;
  }
}

// 2. Register with the StateManager
patchmap.stateManager.register('custom', CustomState);

// 3. Switch states when needed
patchmap.stateManager.setState('custom', { message: 'Hello World' });
```

<br/>

### `SelectionState`

The default state that handles user selection and drag events. It is automatically registered with the `stateManager` under the name 'selection' when `patchmap.draw()` is executed. You can activate it and pass configuration by calling `stateManager.setState('selection', options)`.

- `draggable` (optional, boolean): Determines whether to enable multi-selection via dragging.
- `selectUnit` (optional, string): Specifies the logical unit to be returned upon selection. The default is `'entity'`.
  - `'entity'`: Selects the individual object.
  - `'closestGroup'`: Selects the nearest parent group of the selected object.
  - `'highestGroup'`: Selects the topmost parent group of the selected object.
  - `'grid'`: Selects the grid to which the selected object belongs.
- `filter` (optional, function): A function to filter selectable objects based on a condition.
- `selectionBoxStyle` (optional, object): Specifies the style of the selection box displayed during drag-selection.
  - `fill` (object): The fill style. Default: `{ color: '#9FD6FF', alpha: 0.2 }`.
  - `stroke` (object): The stroke style. Default: `{ width: 2, color: '#1099FF' }`.

#### Event Callbacks

- `onDown` (optional, function): Callback fired immediately on `pointerdown`. Used to implement 'Select-on-Down' UX (instant selection feedback).
- `onUp` (optional, function): Callback fired on `pointerup` if it was not a drag operation.
- `onClick` (optional, function): Callback fired when a complete 'click' is detected. This will not fire if `onDoubleClick` fires.
- `onDoubleClick` (optional, function): Callback fired when a complete 'double-click' is detected. Based on `e.detail === 2`.
- `onDragStart` (optional, function): Callback fired *once* when a drag operation (for multi-selection) begins (after moving beyond a threshold).
- `onDrag` (optional, function): Callback fired repeatedly *during* a drag operation.
- `onDragEnd` (optional, function): Callback fired when the drag operation *ends* (`pointerup`).
- `onOver` (optional, function): Callback fired on `pointerover` when the pointer enters a new object (and not dragging).

```js
patchmap.stateManager.setState('selection', {
  draggable: true,
  selectUnit: 'grid',
  filter: (obj) => obj.type !== 'relations',

  // Confirms selection on 'click' completion.
  onClick: (target, event) => {
    console.log('Clicked:', target?.id);
    if (patchmap.transformer) {
      patchmap.transformer.elements = target ? [target] : [];
    }
  },

  // Performs another action on 'double-click'. (onClick will not be called in this case)
  onDoubleClick: (target, event) => {
    console.log('Double Clicked:', target?.id);
    // e.g., patchmap.stateManager.setState('textEdit', target);
  },

  // Confirms the final selection when the drag ends.
  onDragEnd: (selected, event) => {
    console.log('Drag Selected:', selected.map(s => s.id));
    if (patchmap.transformer) {
      patchmap.transformer.elements = selected;
    }
  },
  
  // onDown: (target) => {
  //   if (patchmap.transformer) {
  //     patchmap.transformer.elements = target ? [target] : [];
  //   }
  // },
  // onDragStart: () => {
  //   if (patchmap.transformer) {
  //     patchmap.transformer.elements = [];
  //   }
  // },
});
```

<br/>

### `Transformer`

A visual tool for displaying an outline around selected elements and performing transformations such as resizing or rotating. It is activated by creating a `Transformer` instance and assigning it to `patchmap.transformer`.

#### new Transformer(options)

You can control the behavior by passing the following options when creating a `Transformer` instance.

  - `elements` (optional, Array<PIXI.DisplayObject>): An array of elements to display an outline for initially.
  - `wireframeStyle` (optional, object): Specifies the style of the outline.
      - `thickness` (number): The thickness of the line (default: `1.5`).
      - `color` (string): The color of the line (default: `'#1099FF'`).
  - `boundsDisplayMode` (optional, string): Determines the unit for displaying the outline (default: `'all'`).
      - `'all'`: Displays both the overall outline of a group and the outlines of individual elements within it.
      - `'groupOnly'`: Displays only the overall outline of the group.
      - `'elementOnly'`: Displays only the outlines of individual elements within the group.
      - `'none'`: Does not display any outline.

<!-- end list -->

```js
import { Patchmap, Transformer } from '@conalog/patch-map';

const patchmap = new Patchmap();
await patchmap.init(element);
patchmap.draw(data);

// 1. Create and assign a Transformer instance
const transformer = new Transformer({
  wireframeStyle: {
    thickness: 2,
    color: '#FF00FF',
  },
  boundsDisplayMode: 'groupOnly',
});
patchmap.transformer = transformer;

// 2. Assign the selected object to the transformer's elements property to display the outline
const selectedObject = patchmap.selector('$..[?(@.id=="group-id-1")]')[0];
patchmap.transformer.elements = [selectedObject];

// To deselect
patchmap.transformer.elements = [];
```

#### transformer.selection

An instance of `SelectionModel` for dedicated management of the `Transformer`'s selection state. This allows you to programmatically control the selected elements.

```js
// Add, remove, and replace selected elements
transformer.selection.add(item1);
transformer.selection.remove(item1);
transformer.selection.set([item2]);

// Subscribe to selection change events
transformer.on('update_elements', ({ current, added, removed }) => {
  console.log('Current selection:', current);
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

<br/>

## 📢 Full List of Available Events

This is the list of events that can be subscribed to with this update. You can subscribe using `.on(eventName, callback)`.

#### `Patchmap`

  * `patchmap:initialized`: Fired when `patchmap.init()` completes successfully.
  * `patchmap:draw`: Fired when new data is rendered via `patchmap.draw()`.
  * `patchmap:updated`: Fired when elements are updated via `patchmap.update()`.
  * `patchmap:destroyed`: Fired when the instance is destroyed by calling `patchmap.destroy()`.

#### `UndoRedoManager`

  * `history:executed`: Fired when a new command is added to the execution stack.
  * `history:undone`: Fired when `undo()` is executed.
  * `history:redone`: Fired when `redo()` is executed.
  * `history:cleared`: Fired when all history is deleted with `clear()`.
  * `history:destroyed`: Fired when `destroy()` is called.
  * `history:*`: Subscribes to all of the above `history:` namespace events.

#### `StateManager`

  * `state:pushed`: Fired when a new state is added to the stack.
  * `state:popped`: Fired when the current state is removed from the stack.
  * `state:set`: Fired when the state stack is reset and a new state is set via `setState()`.
  * `state:reset`: Fired when all states are removed with `resetState()`.
  * `state:destroyed`: Fired when `destroy()` is called.
  * `modifier:activated`: Fired when a modifier state is activated.
  * `modifier:deactivated`: Fired when a modifier state is deactivated.
  * `state:*`: Subscribes to all of the above `state:` namespace events.
  * `modifier:*`: Subscribes to all of the above `modifier:` namespace events.

#### `Transformer`

  * `update_elements`: Fired when the content of `transformer.elements` or `transformer.selection` changes.

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