# PATCH MAP

PATCH MAP is an optimized canvas library built on pixijs and pixi-viewport, tailored to meet the requirements of PATCH services.
It enables flexible and fast creation of 2D content.

- **[PixiJS](https://github.com/pixijs/pixijs)**  
- **[Pixi-Viewport](https://github.com/pixi-viewport/pixi-viewport)**  

<br/>


## 📚 Table of Contents

- [🚀 Getting Started](#-getting-started)
  - [Install](#install)
  - [Usage](#usage)
    - [Svelte Example](#svelte-example)
- [🛠 API Overview](#-api-overview)
  - [init(el, options)](#initel-options)
    - [Options](#options)
    - [Example](#example)
  - [draw(options)](#drawoptions)
    - [Options](#options-1)
    - [Component Options](#component-options)
    - [Example](#example-1)
  - [update(options)](#updateoptions)
    - [Options](#options-2)
    - [Example](#example-2)
  - [event()](#event)
    - [Methods](#methods)
      - [add(type, action, fn, options)](#addtype-action-fn-options)
      - [remove(eventId)](#removeeventid)
      - [on(eventId)](#oneventid)
      - [off(eventId)](#offeventid)
      - [get(eventId)](#geteventid)
      - [getAll()](#getall)
    - [Special Use Cases](#special-use-cases)
      - [Canvas Events](#canvas-events)
      - [Double Click Handling](#double-click-handling)
      - [Multiple Actions](#multiple-actions)
  - [asset()](#asset)
    - [Methods](#methods-1)
      - [add(assets)](#addassets)
      - [load(urls, onProgress)](#loadurls-onprogress-promiseany)
      - [get(keys)](#getkeys)
      - [addBundle(bundleId, assets)](#addbundlebundleid-assets)
      - [loadBundle(bundleIds, onProgress)](#loadbundlebundleids-onprogress-promiseany)
- [🧑‍💻 Development](#-development)
  - [Setting up the development environment](#setting-up-the-development-environment)
  - [VSCode Integration](#vscode-integration)

<br/>

## 🚀 Getting Started

### Install
Install `@conalog/patch-map` using npm:
```sh
npm install @conalog/patch-map
```

### Usage
Here’s a quick example to get you started:
```js
import { PatchMap } from '@conalog/patch-map';

(async () => {
  const body = document.body;

  // Create a new PatchMap instance
  const patchMap = new PatchMap();

  // Initialize the map
  await patchMap.init(body);

  // Render the map with data
  patchMap.draw({ mapData: data });
})();
```
<details>
  <summary>Svelte Example</summary>

```html
<script>
  import { onMount } from 'svelte';
  import { PatchMap } from '@conalog/patch-map';

  onMount(async () => {
    const data = await fetchMapData();

    const patchMap = new PatchMap();
    await patchMap.init(document.getElementById('patchmap'));
    patchMap.draw({ mapData: data });
  });

  async function fetchMapData() {
    const res = await fetch('panelmap.json');
    return res.json();
  }
</script>

<main style="height: 100vh">
	<div id="patchmap" style="height: 100%;"></div>
</main>
```
</details>

<br/>

## 🛠 API Overview

### `init(el, options)`
Initialize PATCH MAP with options.  

#### **`Options`**
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
    },
    gray: {
      light: '#9EB3C3',
      default: '#D9D9D9',
      dark: '#71717A',
    },
    red: {
      default: '#EF4444',
    },
    white: '#FFFFFF',
    black: '#1A1A1A',
  }
  ```

#### **Example:**
```js
init(el, {
  app: {
    background: '#CCCCCC'
  },
  viewport: {
    plugins: {
      decelerate: { disabled: true }
    }
  },
  theme: {
    primary: { default: '#c2410c' }
  }
})
```

<br/>

### `draw(options)`
Render map data on the canvas.  
Supports customization for various map elements such as panelGroups, inverters, combines, and edges.

#### **`Options`**
- `mapData` - The primary data used for rendering the map.  
  - If you are using the legacy panel map data schema, it is essential to insert the converted data using the `convertLegacyData` method.
- `panelGroups`, `strings`, `inverters`, `combines`, `edges` - Configuration for individual map elements.  
  - **Note:** This is where you specify the `group` for logical grouping of objects as defined in the Object Schema below.  
  - `show` - Toggle visibility of the element.  
  - `frame` - Specifies the frame to use for the element.  
    (default frames include: ***`base`***, ***`base-selected`***, ***`icon`***, ***`icon-selected`***)
  - `components` - Defines the components to display for each element,  
  including: `bar`, `icon`, `text`

#### **Component Options**
Here are the options available for components:  
- `show` - Use this to toggle the visibility of the component as needed.  
- `zIndex` - This determines the stacking order of the component in relation to others.  

Specific Options:  
- `name` (bar, icon only) - Asset name used for the component.  
  (default bars include: ***`base`***)  
  (default icons include: ***`inverter`***, ***`combine`***, ***`edge`***, ***`device`***, ***`loading`***, ***`warning`***, ***`wifi`***)
- `color` (bar, icon only) - Specifies the color of the component using the theme key, such as `'white'`, `'black'`, `'primary.default'`, or `'gray.light'`.
- `size` (icon only) - Defines the dimensions of the icon, allowing customization of its visual appearance. 

#### **mapData Schema Definition**

##### ***Root Schema***
| Key | Type | Description | Required |
|-----|------|-------------|----------|
| `objects` | `Array<Object>` | List of objects to render. Each object must follow the structure defined below. | Yes |

##### ***Object Schema***
| Key | Type | Description | Required |
|-----|------|-------------|----------|
| `type` | `string` | The type of the object. Must be either `grid` or `each`. | Yes |
| `group` | `string` | Group identifier for logical grouping of objects. | Yes |
| `id` | `string` | Unique identifier for the object. | Yes |
| `name` | `string` | Human-readable name for the object. | No |
| `layout` | `Array<Array<number>>` | 2D array defining the object's layout (only applicable to `type: grid`). | Yes |
| `transform` | `Object` | Defines the position, rotation, and dimensions of the object. | Yes |
| `metadata` | `Object` | Additional metadata for the object. Example: custom properties or user data. | No |

##### ***Transform Schema***
| Key | Type | Description | Required |
|-----|------|-------------|----------|
| `x` | `number` | X-coordinate of the object. | Yes |
| `y` | `number` | Y-coordinate of the object. | Yes |
| `width` | `number` | Width of the object. | No |
| `height` | `number` | Height of the object. | No |
| `rotation` | `number` | Rotation of the object in degrees. (only applicable to `type: grid`). | No |


#### ***Example:***
```js
draw({
  mapData: data,
  panelGroups: {
    components: {
      bar: { show: true, name: 'base', color: 'primary.default' },
      icon: { show: true, name: 'loading', color: 'red.default' },
      text: { show: false },
    },
  },
});
```

<br/>

### `update(options)`
Updates the state of specific objects on the canvas. Use this to change properties like color or text visibility for already rendered objects.

#### **`Options`**
- `ids`(required, string | string[]) - The ID or list of IDs of the objects to update.
- `changes`(required, object) - The new properties to apply (e.g., color, text.show).

#### **Example:**

##### ***Single ID***
```js
update({
  ids: 'objectId1',
  changes: { frame: 'base-selected' }
})
```

##### ***Multiple IDs***
```js
update({
  ids: ['objectId1', 'objectId2'],
  changes: { components: { bar: { color: 'red.default' } } }
})
```

<br/>

### `event()`
Add interactivity with events for different components such as `panelGroups`, `inverters`, `edges`, and even the canvas itself.

#### **Methods**

##### `add(type, action, fn, options)`
Registers an event for a specific component type.
- `type` - Specifies the target for the event (e.g., `'panelGroups'`, `'inverters'`, `'edges'`, or `'canvas'`).  
- `action` - The event type to listen for (e.g., `'click'`, `'pointerdown'`, `'rightclick'`). Multiple actions can be registered simultaneously using a space-separated string. (e.g., `'click tap'`)
- `fn` - The callback function to execute when the event is triggered. Receives the event object as a parameter.  
- `options` (optional) - Additional options for event configuration.
  - `eventId` - A unique identifier for the event, useful for managing it later.  
  - Other options are passed to [AddEventListenerOptions](https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener#options).
```js
event().add('panelGroups', 'click', (e) => {
  console.log('panelGroup clicked: ', e.target.id);
}, { eventId: 'panelGroup-click' });
```


##### `remove(eventId)`
Remove an event:
```js
event().remove('panelGroup-click');
```


##### `on(eventId)`
Enables a previously registered event.

##### `off(eventId)`
Disables a previously registered event.

##### `get(eventId)`
Gets an event by its eventId.

##### `getAll()`
Gets all registered events.


#### **Special Use Cases**

##### ***Canvas Events***
To register events on the canvas itself, use the type 'canvas'.
```js
event().add('canvas', 'click', (e) => {
  if (e.target.constructor.name === '_Canvas') {
    console.log('canvas clicked');
  }
});
```

##### ***Double Click Handling***
PixiJS supports detecting multiple clicks using the detail property of events. Refer to the pixijs [addEventListener documentation](https://pixijs.download/release/docs/scene.Container.html#addEventListener) for more details.
```js
event().add('panelGroups', 'click', (e) => {
  if (e.detail === 2) {
    console.log('Double click detected on panelGroup:', e.target.id);
  }
});
```

##### ***Multiple Actions***
You can register multiple actions in one call by separating them with a space.
```js
patchMap.event().add('panelGroups', 'click pointerdown', (e) => {
  console.log('panelGroup event: ', e.target.id);
});
```

<br/>

### `asset()`

#### **Methods**

##### `add(assets)`
- Adds assets to the PixiJS Assets manager. See the [pixiJS add method](https://pixijs.download/release/docs/assets.Assets.html#add) for more information.
- If you want to specify the icon resolution, you can add the `data: { resolution: <your_value> }` option.
- To add an **icon asset**, make sure to prefix the `alias` with `icons-`.
```js
patchMap.asset().add({
  alias: 'icons-home',
  src: '/path/to/home.svg',
  data: { resolution: 2 }
})
```


##### `load(urls, onProgress)`: Promise\<any>
- Loads assets from the specified URLs. Refer to the [pixiJS load method](https://pixijs.download/release/docs/assets.Assets.html#load) for more information.
```js
await patchMap.asset().load({
  alias: 'icons-expand-less',
  src: '/path/to/expand-less.svg',
  data: { resolution: 3 }
})

patchMap.draw({
  panelGroups: {
    components: {
      icon: { name: 'expand-less' }
    }
  }
});
```

##### `get(keys)`
- Retrieves assets using the specified keys. Check the [pixiJS get method](https://pixijs.download/release/docs/assets.Assets.html#get) for more information.

##### `addBundle(bundleId, assets)`
- Adds a bundle of assets to the PixiJS Assets manager. More information can be found in the [pixiJS addBundle method](https://pixijs.download/release/docs/assets.Assets.html#addBundle).

##### `loadBundle(bundleIds, onProgress)`: Promise\<any>
- Loads a bundle of assets based on the provided bundle IDs. See the [pixiJS loadBundle method](https://pixijs.download/release/docs/assets.Assets.html#loadBundle) for more information.


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